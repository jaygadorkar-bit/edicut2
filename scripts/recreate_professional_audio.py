import os
import asyncio
import edge_tts

# Professional voiceover script tailored for authentic cadence and natural breathing pauses
SCENES = [
    {
        "id": "scene1",
        "phase": "01",
        "tag": "Footage Ingest",
        "title": "Private Cloud Footage Handoff",
        "script": "Phase one: Footage Intake. Say goodbye to expired transfer links. Simply connect your private Google Drive, Dropbox, or Frame.io folder directly to your EdiCut workspace—zero upload drag, complete NDA security.",
        "subtitle": "Phase 1: Share raw footage via private cloud storage directly to your EdiCut workspace. Zero upload drag.",
    },
    {
        "id": "scene2",
        "phase": "02",
        "tag": "Style DNA",
        "title": "Channel DNA & Style Sync",
        "script": "Phase two: Channel DNA Sync. Before touching the timeline, your dedicated editor analyzes your audience retention curve, hook pacing, and signature brand style.",
        "subtitle": "Phase 2: Your dedicated editor synchronizes with your channel's pacing, typography, and humor profile.",
    },
    {
        "id": "scene3",
        "phase": "03",
        "tag": "Rough Cut",
        "title": "Narrative Assembly & Trimming",
        "script": "Phase three: The Narrative Cut. We eliminate dead air, filler words, and awkward pauses, sculpting a tight, high-retention story spine with seamless multicam flow.",
        "subtitle": "Phase 3: Dead air and filler words removed. Pacing optimized for maximum YouTube audience retention.",
    },
    {
        "id": "scene4",
        "phase": "04",
        "tag": "Audio & VFX",
        "title": "Kinetic Captions & Sound Mastering",
        "script": "Phase four: Studio Polish. Next comes kinetic typography, punchy sound design, cinematic color grading, and broadcast audio mastering calibrated to YouTube loudness standards.",
        "subtitle": "Phase 4: Kinetic captions, custom sound effects, color grading, and broadcast LUFS audio mastering.",
    },
    {
        "id": "scene5",
        "phase": "05",
        "tag": "Studio QA",
        "title": "Creative Director Quality Gate",
        "script": "Phase five: Director Pre-Flight QA. Before you ever see a cut, our senior creative director scrutinizes every single frame for pacing, typos, and audio balance.",
        "subtitle": "Phase 5: Internal Creative Director inspection. Every cut is vetted against your brand rules before delivery.",
    },
    {
        "id": "scene6",
        "phase": "06",
        "tag": "Delivery",
        "title": "48h Delivery, Shorts & Thumbnails",
        "script": "Phase six: Guaranteed 48-Hour Delivery. Your first cut arrives in your workspace right on schedule—ready to review, complete with vertical Shorts and high-CTR thumbnails.",
        "subtitle": "Phase 6: Guaranteed 48-hour delivery. 4K export delivered alongside vertical Shorts and custom thumbnails.",
    },
]

OUTPUT_DIR = os.path.join("apps", "web", "public", "audio", "workflow")
VOICE = "en-US-BrianMultilingualNeural"
RATE = "+0%"  # Natural human conversational tempo

async def generate():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating professional voiceover using voice: {VOICE} at rate {RATE}")
    for scene in SCENES:
        out_path = os.path.join(OUTPUT_DIR, f"{scene['id']}.mp3")
        print(f"\nProcessing {scene['id']}...")
        print(f"Text: \"{scene['script']}\"")
        comm = edge_tts.Communicate(scene["script"], voice=VOICE, rate=RATE)
        await comm.save(out_path)
        size = os.path.getsize(out_path)
        print(f"Successfully generated {out_path} ({size} bytes)")

if __name__ == "__main__":
    asyncio.run(generate())
