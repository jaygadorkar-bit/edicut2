"""Render film narration with the configured Google AI Studio voice.

Uses Google's documented Gemini speech API. Credentials are supplied through
GEMINI_API_KEY and are never written to output files or printed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import urllib.error
import urllib.request
import wave
from datetime import datetime, timezone
from pathlib import Path


def generate(api_key: str, config_path: Path, output_dir: Path, source_name: str = "affiliate-ludo-source.wav") -> dict:
    config = json.loads(config_path.read_text(encoding="utf-8-sig"))
    if Path(source_name).name != source_name or not source_name.lower().endswith(".wav"):
        raise ValueError("Source name must be a WAV filename without directories.")
    source_path = output_dir / source_name
    report_path = output_dir / "google-generation-report.json"
    if source_path.exists() or report_path.exists():
        raise FileExistsError("A recording or report already exists; choose a new output directory for a new take.")
    transcript = "\n\n".join(" <short pause> ".join(cue["text"] for cue in scene["cues"]) for scene in config["scenes"])
    payload = {
        "model": config["model"],
        "input": [{"type": "user_input", "content": [{
            "type": "text", "text": transcript,
            "annotations": [{"type": "speech_metadata", "style": config["style"]}],
        }]}],
        "response_format": {"type": "audio", "mime_type": "audio/wav", "sample_rate": 24000},
        "generation_config": {"speech_config": [{"voice": config["voice"]}]},
    }
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        data=json.dumps(payload).encode(), method="POST",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        details = error.read(4000).decode("utf-8", errors="replace").replace(api_key, "[redacted]")
        raise RuntimeError(f"Google speech API returned HTTP {error.code}: {details}") from None
    audio = [item for step in result.get("steps", []) if step.get("type") == "model_output"
             for item in step.get("content", []) if item.get("type") == "audio" and item.get("data")]
    if not audio:
        raise RuntimeError("Google returned no audio output; no source file was written.")
    data = base64.b64decode(audio[-1]["data"], validate=True)
    if not data.startswith(b"RIFF"):
        raise ValueError("Google did not return the requested WAV format.")
    with wave.open(io.BytesIO(data), "rb") as recording:
        rate = recording.getframerate()
        duration = recording.getnframes() / rate
        if recording.getnchannels() != 1 or recording.getsampwidth() != 2 or rate != 24000:
            raise ValueError("Expected mono, 16-bit PCM at 24 kHz.")
        if not 15 <= duration <= 120:
            raise ValueError(f"Unexpected narration length: {duration:.3f} seconds.")
    output_dir.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also protects against two agents choosing the same take.
    with source_path.open("xb") as source_file:
        source_file.write(data)
    report = {
        "provider": "Google Gemini API / Google AI Studio voice library",
        "model": config["model"], "voice": config["voice"], "style": config["style"],
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source": str(source_path), "source_sha256": hashlib.sha256(data).hexdigest(),
        "sample_rate_hz": rate, "channels": 1, "bit_depth": 16,
        "duration_seconds": duration, "bytes": len(data),
        "transcript": transcript,
    }
    with report_path.open("x", encoding="utf-8") as report_file:
        report_file.write(json.dumps(report, indent=2) + "\n")
    return {key: report[key] for key in ("provider", "voice", "source", "duration_seconds", "bytes", "source_sha256")}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("scripts/data/affiliate-ludo-voiceover.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("media/audio/affiliate-ludo"))
    parser.add_argument("--source-name", default="affiliate-ludo-source.wav")
    arguments = parser.parse_args()
    credential = os.environ.get("GEMINI_API_KEY", "")
    if not credential:
        raise SystemExit("Set GEMINI_API_KEY in your shell environment; do not put it in source control.")
    print(json.dumps(generate(credential, arguments.config, arguments.output_dir, arguments.source_name), indent=2))
