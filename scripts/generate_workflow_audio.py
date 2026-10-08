import os
import asyncio
import edge_tts

SCENES = [
    {
        "id": "scene1",
        "text": "Phase one: Footage Intake. You never have to deal with expired transfer links. Simply share a private Google Drive, Dropbox, or Frame.io folder directly into your EdiCut workspace.",
    },
    {
        "id": "scene2",
        "text": "Phase two: Channel DNA Alignment. Before touching the timeline, your dedicated editor reviews your hook target, pacing references, and channel branding guidelines.",
    },
    {
        "id": "scene3",
        "text": "Phase three: Story Cut. We eliminate dead air, filler words, and awkward pauses, building a high-retention narrative spine with dynamic multicam switching.",
    },
    {
        "id": "scene4",
        "text": "Phase four: Production Polish. We layer kinetic subtitles, sound effects, licensed background music, color grading, and broadcast-standard audio mastering.",
    },
    {
        "id": "scene5",
        "text": "Phase five: Two-Tier Quality Review. Our senior creative director scrutinizes every frame for pacing, typos, and audio balance before you ever receive the draft.",
    },
    {
        "id": "scene6",
        "text": "Phase six: Final Delivery. Your first cut arrives in your workspace within 48 hours. Leave timestamped notes or approve the export, complete with vertical Shorts and thumbnails.",
    },
]

OUTPUT_DIR = os.path.join("apps", "web", "public", "audio", "workflow")
VOICE = "en-US-AndrewMultilingualNeural"

async def generate_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for scene in SCENES:
        file_path = os.path.join(OUTPUT_DIR, f"{scene['id']}.mp3")
        print(f"Generating {file_path} with voice {VOICE}...")
        communicate = edge_tts.Communicate(scene["text"], voice=VOICE, rate="+2%")
        await communicate.save(file_path)
        size = os.path.getsize(file_path)
        print(f"Done: {file_path} ({size} bytes)")

if __name__ == "__main__":
    asyncio.run(generate_all())
