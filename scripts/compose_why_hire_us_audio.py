"""Compose an original instrumental bed and mix it under EdiCut's approved WAV.

Requires Python 3.10+, numpy and scipy. No network, API keys or sampled music.
The source is read only. All timing is derived from its actual sample count.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import wave
from pathlib import Path

import numpy as np
import scipy
from scipy.signal import lfilter, resample_poly


def read_voice(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as source:
        if source.getsampwidth() != 2 or source.getcomptype() != "NONE":
            raise ValueError("Narration must be an uncompressed 16-bit PCM WAV.")
        channels = source.getnchannels()
        rate = source.getframerate()
        data = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2")
    if channels != 1:
        raise ValueError("This mix is configured for the approved mono narration.")
    if not len(data):
        raise ValueError("Narration is empty.")
    return data.astype(np.float64) / 32768, rate


def db(value: float) -> float:
    return float(20 * np.log10(max(value, 1e-12)))


def rms(signal: np.ndarray) -> float:
    return float(np.sqrt(np.mean(signal ** 2)))


def frequency(midi: int) -> float:
    return 440 * 2 ** ((midi - 69) / 12)


def place(target: np.ndarray, sound: np.ndarray, at: float, rate: int,
          pan: float = 0.0, gain: float = 1.0) -> None:
    start = max(0, round(at * rate))
    length = min(len(sound), len(target) - start)
    if length <= 0:
        return
    # Equal-power panning; mono playback remains compatible.
    angle = (pan + 1) * np.pi / 4
    target[start:start + length, 0] += sound[:length] * np.cos(angle) * gain
    target[start:start + length, 1] += sound[:length] * np.sin(angle) * gain


def compose(length: int, rate: int, bpm: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    music = np.zeros((length, 2), dtype=np.float64)
    beat = 60 / bpm
    bar = 4 * beat
    # Dmaj9, Bm7, Gmaj9, Asus2, Gmaj9, Dmaj9. Two bars per chord.
    chords = [[50, 54, 57, 61, 64], [47, 50, 54, 57],
              [43, 47, 50, 54, 57], [45, 47, 52, 57],
              [43, 47, 50, 54, 57], [50, 54, 57, 61, 64]]
    duration = length / rate
    for index, at in enumerate(np.arange(0, duration, 2 * bar)):
        chord = chords[index % len(chords)]
        t = np.arange(round((2 * bar + .5) * rate)) / rate
        envelope = np.minimum(t / .55, 1) * np.minimum(np.maximum(2 * bar + .5 - t, 0) / .65, 1)
        for note_index, note in enumerate(chord):
            f = frequency(note)
            phase = rng.uniform(0, 2 * np.pi)
            pad = (np.sin(2 * np.pi * f * t + phase)
                   + .18 * np.sin(2 * np.pi * 2 * f * t + phase)
                   + .08 * np.sin(2 * np.pi * f * 1.002 * t)) * envelope
            place(music, pad, at, rate, (note_index / (len(chord) - 1) - .5) * .9, .10)
        bass = np.sin(2 * np.pi * frequency(chord[0] - 12) * t) * envelope
        place(music, bass, at, rate, gain=.09)

    # A sparse, soft electric-piano motif; no lead competing with the voice.
    motifs = [[66, 69], [66, 62], [64, 62], [64, 69], [62, 66], [69, 66]]
    for index, at in enumerate(np.arange(0, duration - 1.1, bar)):
        for offset, note in zip([.5 * beat, 2.5 * beat], motifs[(index // 2) % 6]):
            t = np.arange(round(1.45 * rate)) / rate
            envelope = np.minimum(t / .012, 1) * np.exp(-t * 3.8)
            f = frequency(note)
            pluck = (np.sin(2 * np.pi * f * t)
                     + .22 * np.sin(2 * np.pi * 2 * f * t)
                     + .04 * np.sin(2 * np.pi * 3 * f * t)) * envelope
            pan = -.35 if offset < beat else .35
            place(music, pluck, at + offset, rate, pan, .15)
            place(music, pluck, at + offset + .24, rate, -pan, .035)

    for at in np.arange(0, duration - 1.5, 2 * beat):
        t = np.arange(round(.22 * rate)) / rate
        kick = np.sin(2 * np.pi * (48 * t + 22 * (.025 * (1 - np.exp(-t / .025)))))
        kick *= np.minimum(t / .006, 1) * np.exp(-t * 24)
        place(music, kick, at, rate, gain=.09)
    for index, at in enumerate(np.arange(beat / 2, duration - 1.5, beat / 2)):
        t = np.arange(round(.055 * rate)) / rate
        noise = rng.normal(0, 1, len(t))
        shaker = lfilter([1, -1], [1], noise)
        shaker *= np.minimum(t / .006, 1) * np.exp(-t * 85)
        place(music, shaker, at, rate, -.45 if index % 2 else .45, .004)

    # Gentle ambience from the composed instruments, with no extra tail.
    dry = music.copy()
    for delay, gain in [(.071, .11), (.113, .09), (.173, .065), (.239, .04)]:
        shift = round(delay * rate)
        if shift < length:
            music[shift:] += dry[:-shift, ::-1] * gain
    t = np.arange(length) / rate
    fade = np.minimum(t / .7, 1) * np.clip((duration - t) / 1.35, 0, 1)
    music *= fade[:, None]
    music *= 10 ** (-22 / 20) / rms(music)
    return music


def ducking(voice: np.ndarray, rate: int) -> np.ndarray:
    block = max(1, round(.02 * rate))
    starts = np.arange(0, len(voice), block)
    levels = np.array([rms(voice[start:start + block]) for start in starts])
    activity = np.clip((levels - .004) / .024, 0, 1)
    # Audible underneath speech; a gentle 2.5 dB dip keeps the words clear.
    target = .72 * (1 - .25 * activity)  # 20% above the previous 0.60 base gain.
    gains = np.empty(len(target))
    previous = target[0]
    for index, value in enumerate(target):
        seconds = .04 if value < previous else .30
        coefficient = np.exp(-.02 / seconds)
        previous = coefficient * previous + (1 - coefficient) * value
        gains[index] = previous
    return np.interp(np.arange(len(voice)), starts, gains)


def write_wav(path: Path, signal: np.ndarray, rate: int) -> np.ndarray:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.rint(np.clip(signal, -1, 32767 / 32768) * 32768).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(signal.shape[1] if signal.ndim == 2 else 1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm.tobytes())
    return pcm.astype(np.float64) / 32768


def metrics(signal: np.ndarray, rate: int) -> dict:
    return {
        "duration_seconds": round(len(signal) / rate, 5),
        "sample_rate_hz": rate,
        "channels": signal.shape[1] if signal.ndim == 2 else 1,
        "sample_peak_dbfs": round(db(float(np.max(np.abs(signal)))), 3),
        "estimated_true_peak_dbtp_4x": round(db(float(np.max(np.abs(resample_poly(signal, 4, 1, axis=0))))), 3),
        "rms_dbfs": round(db(rms(signal)), 3),
        "clipped_samples": int(np.count_nonzero(np.abs(signal) >= 32767 / 32768)),
        "finite": bool(np.isfinite(signal).all()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--narration", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("media/audio"))
    parser.add_argument("--public-dir", type=Path)
    parser.add_argument("--bpm", type=float, default=80)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--lead-in", type=float, default=1.0,
                        help="Seconds of music-only intro before the narration starts.")
    args = parser.parse_args()
    if not 40 <= args.bpm <= 180:
        parser.error("BPM must be between 40 and 180.")
    if args.lead_in < 0:
        parser.error("Lead-in must be zero or greater.")
    source_hash = hashlib.sha256(args.narration.read_bytes()).hexdigest()
    voice, rate = read_voice(args.narration)
    lead_samples = round(args.lead_in * rate)
    timeline_voice = np.pad(voice, (lead_samples, 0))
    music = compose(len(timeline_voice), rate, args.bpm, args.seed)
    bed = music * ducking(timeline_voice, rate)[:, None]
    mix = timeline_voice[:, None] + bed
    true_peak = float(np.max(np.abs(resample_poly(mix, 4, 1, axis=0))))
    master_gain = min(1.0, 10 ** (-1.5 / 20) / true_peak)
    mix *= master_gain
    music_path = args.output_dir / "edicut-why-hire-us-music.wav"
    mix_path = args.output_dir / "edicut-why-hire-us-mix.wav"
    for output in [music_path, mix_path]:
        if output.resolve() == args.narration.resolve():
            parser.error("An output path would overwrite the narration.")
    rendered_music = write_wav(music_path, music, rate)
    rendered_mix = write_wav(mix_path, mix, rate)
    mix_hash = hashlib.sha256(mix_path.read_bytes()).hexdigest()
    report = {
        "source": str(args.narration), "source_sha256": source_hash,
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__},
        "output_encoding": "16-bit PCM WAV",
        "music_method": "Original deterministic NumPy/SciPy synthesis; no samples or generative music service",
        "bpm": args.bpm, "key": "D major", "seed": args.seed,
        "lead_in_seconds": args.lead_in,
        "narration_starts_at_seconds": args.lead_in,
        "music_target_rms_dbfs": -22, "bed_gain_range": [.54, .72],
        "duck_attack_seconds": .04, "duck_release_seconds": .30,
        "master_gain_db": round(db(master_gain), 3),
        "source_metrics": metrics(voice, rate),
        "music_metrics": metrics(rendered_music, rate),
        "mix_metrics": metrics(rendered_mix, rate),
        "mixed_music_rms_dbfs": round(db(rms(bed * master_gain)), 3),
        "music_below_voice_db": round(db(rms(timeline_voice * master_gain)) - db(rms(bed * master_gain)), 3),
        "mix_sha256": mix_hash,
        "source_unchanged": hashlib.sha256(args.narration.read_bytes()).hexdigest() == source_hash,
    }
    if args.public_dir:
        args.public_dir.mkdir(parents=True, exist_ok=True)
        public_path = args.public_dir / mix_path.name
        if public_path.resolve() == args.narration.resolve():
            parser.error("Public output would overwrite the narration.")
        public_path.write_bytes(mix_path.read_bytes())
        versioned_public_path = args.public_dir / f"{mix_path.stem}-{mix_hash[:8]}{mix_path.suffix}"
        versioned_public_path.write_bytes(mix_path.read_bytes())
        report["public_asset"] = str(public_path)
        report["versioned_public_asset"] = str(versioned_public_path)
    report_path = args.output_dir / "edicut-why-hire-us-mix-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not report["source_unchanged"] or report["mix_metrics"]["clipped_samples"]:
        raise RuntimeError("Mix validation failed; see the report.")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
