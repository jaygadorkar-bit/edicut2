[CmdletBinding()]
param(
    [string]$ScriptPath = "scripts/data/affiliate-mark-voiceover.json",
    [string]$OutputDir = "media/audio/affiliate-mark",
    [string]$VoiceName = "Microsoft Mark"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$scriptFile = (Resolve-Path -LiteralPath $ScriptPath).Path
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDir))
$segmentsPath = Join-Path $outputPath "segments"
[System.IO.Directory]::CreateDirectory($segmentsPath) | Out-Null
$scriptData = Get-Content -LiteralPath $scriptFile -Raw | ConvertFrom-Json

Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    [int]$scriptData.sampleRateHz,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
)

function Read-PcmWave([string]$Path, [int]$ExpectedRate) {
    [byte[]]$bytes = [System.IO.File]::ReadAllBytes($Path)
    if ([System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "RIFF" -or
        [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne "WAVE") {
        throw "Not a RIFF/WAVE file: $Path"
    }

    $offset = 12
    $channels = 0
    $sampleRate = 0
    $bitsPerSample = 0
    $dataOffset = -1
    $dataLength = 0
    while ($offset + 8 -le $bytes.Length) {
        $chunk = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
        $length = [int][System.BitConverter]::ToUInt32($bytes, $offset + 4)
        $body = $offset + 8
        if ($body + $length -gt $bytes.Length) { throw "Invalid WAV chunk in $Path" }
        if ($chunk -eq "fmt ") {
            $formatCode = [System.BitConverter]::ToUInt16($bytes, $body)
            $channels = [System.BitConverter]::ToUInt16($bytes, $body + 2)
            $sampleRate = [int][System.BitConverter]::ToUInt32($bytes, $body + 4)
            $bitsPerSample = [System.BitConverter]::ToUInt16($bytes, $body + 14)
            if ($formatCode -ne 1) { throw "Expected PCM audio in $Path" }
        }
        elseif ($chunk -eq "data") {
            $dataOffset = $body
            $dataLength = $length
        }
        $offset = $body + $length + ($length % 2)
    }

    if ($channels -ne 1 -or $sampleRate -ne $ExpectedRate -or $bitsPerSample -ne 16 -or $dataOffset -lt 0) {
        throw "Expected mono, $ExpectedRate Hz, 16-bit PCM in $Path"
    }

    $frames = [int]($dataLength / 2)
    $first = -1
    $last = -1
    for ($index = 0; $index -lt $frames; $index++) {
        $sample = [System.BitConverter]::ToInt16($bytes, $dataOffset + ($index * 2))
        if ([Math]::Abs([int]$sample) -ge 64) {
            if ($first -lt 0) { $first = $index }
            $last = $index
        }
    }
    if ($first -lt 0) { throw "No speech was rendered in $Path" }

    $padding = [int][Math]::Round($ExpectedRate * 0.06)
    $startFrame = [Math]::Max(0, $first - $padding)
    $endFrame = [Math]::Min($frames, $last + $padding + 1)
    $trimmed = [byte[]]::new(($endFrame - $startFrame) * 2)
    [System.Buffer]::BlockCopy($bytes, $dataOffset + ($startFrame * 2), $trimmed, 0, $trimmed.Length)
    return @{ Pcm = $trimmed; SpeechOffsetSeconds = [double]($first / $ExpectedRate) }
}

$allPcm = [System.IO.MemoryStream]::new()
$sceneOutput = [System.Collections.Generic.List[object]]::new()
$globalCueIndex = 0
$totalCueCount = 0
foreach ($scene in $scriptData.scenes) { $totalCueCount += $scene.cues.Count }

try {
    $synth.SelectVoice($VoiceName)
    $synth.Rate = 0

    for ($sceneIndex = 0; $sceneIndex -lt $scriptData.scenes.Count; $sceneIndex++) {
        $scene = $scriptData.scenes[$sceneIndex]
        $sceneAt = [Math]::Round($allPcm.Length / 2.0 / $scriptData.sampleRateHz, 3)
        $cueOutput = [System.Collections.Generic.List[object]]::new()

        for ($cueIndex = 0; $cueIndex -lt $scene.cues.Count; $cueIndex++) {
            $cue = $scene.cues[$cueIndex]
            $globalCueIndex++
            $segmentName = "scene-{0:D2}-cue-{1:D2}.wav" -f ($sceneIndex + 1), ($cueIndex + 1)
            $segmentPath = Join-Path $segmentsPath $segmentName
            $synth.SetOutputToWaveFile($segmentPath, $format)
            $escaped = [System.Security.SecurityElement]::Escape([string]$cue.text)
            $escaped = $escaped.Replace("EdiCut", '<sub alias="Eddie Cut">EdiCut</sub>')
            $ratePercent = [int]$scriptData.ratePercent
            $ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="' + $ratePercent + '%">' + $escaped + '</prosody></speak>'
            $synth.SpeakSsml($ssml)
            $synth.SetOutputToNull()

            $segment = Read-PcmWave -Path $segmentPath -ExpectedRate ([int]$scriptData.sampleRateHz)
            $cueAt = [Math]::Round($allPcm.Length / 2.0 / $scriptData.sampleRateHz, 3)
            $cueOutput.Add(@{ at = [Math]::Round($cueAt + $segment.SpeechOffsetSeconds, 3); copy = [string]$cue.text })
            [byte[]]$segmentPcm = $segment.Pcm
            $allPcm.Write($segmentPcm, 0, $segmentPcm.Length)

            if ($globalCueIndex -lt $totalCueCount) {
                $isEndOfScene = $cueIndex -eq ($scene.cues.Count - 1)
                $pauseMs = if ($isEndOfScene) { [int]$scriptData.betweenScenesMs } else { [int]$scriptData.betweenCuesMs }
                $silenceBytes = [byte[]]::new([int][Math]::Round($scriptData.sampleRateHz * $pauseMs / 1000.0) * 2)
                $allPcm.Write($silenceBytes, 0, $silenceBytes.Length)
            }
        }

        $sceneOutput.Add(@{ at = $sceneAt; title = [string]$scene.title; cues = $cueOutput.ToArray() })
    }

    $pcm = $allPcm.ToArray()
    $wave = [System.IO.MemoryStream]::new()
    $writer = [System.IO.BinaryWriter]::new($wave)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
    $writer.Write([uint32](36 + $pcm.Length))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("WAVE"))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("fmt "))
    $writer.Write([uint32]16)
    $writer.Write([uint16]1)
    $writer.Write([uint16]1)
    $writer.Write([uint32]$scriptData.sampleRateHz)
    $writer.Write([uint32]($scriptData.sampleRateHz * 2))
    $writer.Write([uint16]2)
    $writer.Write([uint16]16)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
    $writer.Write([uint32]$pcm.Length)
    $writer.Write($pcm)
    $writer.Flush()

    $sourcePath = Join-Path $outputPath "affiliate-mark-source.wav"
    [System.IO.File]::WriteAllBytes($sourcePath, $wave.ToArray())
    $timeline = @{
        voice = [string]$scriptData.voice
        voiceDescription = [string]$scriptData.voiceDescription
        ratePercent = [int]$scriptData.ratePercent
        sampleRateHz = [int]$scriptData.sampleRateHz
        leadInSeconds = [double]$scriptData.leadInSeconds
        tailSeconds = [double]$scriptData.tailSeconds
        sourceDurationSeconds = [Math]::Round($pcm.Length / 2.0 / $scriptData.sampleRateHz, 3)
        scenes = $sceneOutput.ToArray()
    }
    $timelinePath = Join-Path $outputPath "affiliate-mark-cues.json"
    $timeline | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $timelinePath -Encoding utf8
    Write-Output ("Generated {0:N2}s of {1} narration at {2}." -f $timeline.sourceDurationSeconds, $VoiceName, $sourcePath)
    Write-Output ("Measured cue times: {0}" -f $timelinePath)
}
finally {
    $synth.Dispose()
    $allPcm.Dispose()
    if ($null -ne $writer) { $writer.Dispose() }
    if ($null -ne $wave) { $wave.Dispose() }
}
