Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft David Desktop')
$s.Rate = 0
$s.SetOutputToWaveFile($args[0])
$s.Speak($args[1])
$s.Dispose()
