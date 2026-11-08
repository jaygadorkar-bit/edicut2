"""Reproducibly render the narrated EdiCut blog hero from local assets.

Requires Pillow, NumPy, fontTools (with Brotli), and imageio-ffmpeg. The script
converts the installed DM Sans WOFF2 to temporary static TTF instances, then
renders H.264/AAC video, audio-only AAC, poster, captions, and metadata. Source
artwork and the approved homepage narration/music mix are read-only inputs.
"""
from __future__ import annotations
import hashlib, json, math, subprocess, wave
from datetime import datetime, timezone
from pathlib import Path
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"apps/web/public/media/blog"
MIX=ROOT/"apps/web/public/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav"
W,H,FPS=1280,720,24
SCENES=[
 (0.0,9.54,"A dedicated creative team","Your editor and project manager keep the work moving.","youtube-editing-service.webp"),
 (9.54,16.82,"Story, shaped with care","From the first cut to captions, color, sound and studio review.","video-editing-brief.webp"),
 (16.82,24.50,"A clear place to get started","Share your brief and footage, then follow project progress.","video-editing-brief.webp"),
 (24.50,30.04,"Feedback stays in the flow","Talk with your team and download finished videos.","youtube-to-shorts.webp"),
 (30.04,34.24,"Choose what fits your channel","Start with one video or choose a monthly plan.","youtube-editing-service.webp"),
 (34.24,37.64,"You create.","We handle the edit.","youtube-to-shorts.webp"),
]
BG,INK,MUTED,RED="#edf2f6","#17202a","#667381","#c90f20"
FONT_CACHE={}
def font(n,b=False):
 key=(n,b)
 if key not in FONT_CACHE:
  source=ROOT/"apps/web/public/fonts/dm-sans-latin-normal.woff2"
  target=ROOT/"artifacts/blog-hero-media"/("dm-sans-700.ttf" if b else "dm-sans-400.ttf")
  target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists():
   variable=TTFont(source)
   instance=instantiateVariableFont(variable,{"wght":700 if b else 400},inplace=True)
   instance.flavor=None;instance.save(target)
  FONT_CACHE[key]=ImageFont.truetype(str(target),n)
 return FONT_CACHE[key]
def crop(im,size):
 w,h=size;s=max(w/im.width,h/im.height);im=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
 x,y=(im.width-w)//2,(im.height-h)//2;return im.crop((x,y,x+w,y+h))
def wrap_text(draw,text,typeface,max_width=450):
 words=text.split();lines=[];current=""
 for word in words:
  candidate=f"{current} {word}".strip()
  if current and draw.textlength(candidate,font=typeface)>max_width:
   lines.append(current);current=word
  else:current=candidate
 if current:lines.append(current)
 if len(lines)>2:raise ValueError(f"Description exceeds two lines at the configured width: {text}")
 return lines
def render(t,duration,covers):
 i=next((j for j,s in enumerate(SCENES) if s[0]<=t<s[1]),5); start,end,title,desc,_=SCENES[i];local=(t-start)/(end-start)
 base=Image.new("RGBA",(W,H),BG);glow=Image.new("RGBA",(W,H),(0,0,0,0));g=ImageDraw.Draw(glow)
 g.ellipse((850+int(15*math.sin(t*.5)),-170,1460,430),fill=(255,255,255,145));g.ellipse((-240,430,360,1020),fill=(255,255,255,100))
 base=Image.alpha_composite(base,glow.filter(ImageFilter.GaussianBlur(34)));d=ImageDraw.Draw(base)
 d.rounded_rectangle((86,72,1194,648),radius=34,fill="#e1e8ee");d.rounded_rectangle((80,64,1188,636),radius=34,fill="white",outline="#e3eaf0",width=2)
 d.text((126,105),"EdiCut",font=font(27,True),fill=RED)
 d.text((232,113),"/  THE STUDIO",font=font(17,True),fill=INK);d.text((1081,116),f"0{i+1}  /  06",font=font(15,True),fill=MUTED)
 iw,ih,x,y=488,330,620,184;im=crop(covers[i],(int(iw*(1+.018*local)),int(ih*(1+.018*local))))
 im=im.crop(((im.width-iw)//2,(im.height-ih)//2,(im.width+iw)//2,(im.height+ih)//2))
 d.rounded_rectangle((x-7,y-7,x+iw+7,y+ih+7),radius=25,fill="#edf2f6");mask=Image.new("L",(iw,ih));ImageDraw.Draw(mask).rounded_rectangle((0,0,iw,ih),radius=20,fill=255);base.paste(im,(x,y),mask)
 d=ImageDraw.Draw(base);d.rounded_rectangle((128,219,180,224),radius=3,fill=RED)
 d.text((128,247),"A BETTER CREATIVE WORKFLOW",font=font(15,True),fill=RED)
 if i==0: lines=["Your editor.","Your project manager."]
 elif i==1: lines=["Thoughtful edits.","Studio-level polish."]
 elif i==2: lines=["Start with a clear", "brief and your footage."]
 elif i==3: lines=["Review, respond,", "and keep moving."]
 elif i==4: lines=["One video or", "a monthly plan."]
 else: lines=["You create.","We handle the edit."]
 ty=292
 for line in lines:d.text((124,ty),line,font=font(39,True),fill=INK);ty+=49
 desc_font=font(18)
 for line_number,line in enumerate(wrap_text(d,desc,desc_font)):
  d.text((128,ty+11+line_number*25),line,font=desc_font,fill=MUTED)
 d.rounded_rectangle((128,548,1128,554),radius=3,fill="#eef2f5");d.rounded_rectangle((128,548,128+int(1000*t/duration),554),radius=3,fill=RED)
 d.text((108,581),"EdiCut",font=font(12,True),fill="#8995a0");d.text((1080,577),"edicut.com",font=font(13),fill="#8995a0")
 return base.convert("RGB")
def ts(s):
 n=round(s*1000);h,n=divmod(n,3600000);m,n=divmod(n,60000);sec,n=divmod(n,1000);return f"{h:02}:{m:02}:{sec:02}.{n:03}"
def main():
 if not MIX.exists():raise FileNotFoundError(f"Approved audio mix is missing: {MIX}")
 OUT.mkdir(parents=True,exist_ok=True);ff=imageio_ffmpeg.get_ffmpeg_exe()
 digest=hashlib.sha256(MIX.read_bytes()).hexdigest()
 with wave.open(str(MIX),"rb") as wf: duration=wf.getnframes()/wf.getframerate();channels=wf.getnchannels();rate=wf.getframerate()
 if digest!="f39072477122e7c06d0da070769b57afa8834ad47c3feaace415982dda364f96":raise RuntimeError("Approved mix hash changed; refusing to render against an unreviewed audio source")
 covers=[Image.open(ROOT/"apps/web/public/images/blog"/s[4]).convert("RGB") for s in SCENES]
 poster=render(1.3,duration,covers);poster.save(OUT/"edicut-blog-intro-poster.webp","WEBP",quality=84,method=6)
 dest=OUT/"edicut-blog-intro.mp4";frames=round(duration*FPS)
 cmd=[ff,"-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-i",str(MIX),"-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","slow","-crf","25","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-ar","48000","-ac","2","-movflags","+faststart","-shortest",str(dest)]
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 for i in range(frames):proc.stdin.write(np.asarray(render(i/FPS,duration,covers),dtype=np.uint8).tobytes())
 proc.stdin.close();err=proc.stderr.read().decode(errors="replace");code=proc.wait()
 if code:raise RuntimeError("ffmpeg encode failed: "+err[-2500:])
 audio_dest=OUT/"edicut-blog-intro-audio.m4a"
 subprocess.run([ff,"-y","-i",str(MIX),"-c:a","aac","-b:a","128k","-ar","48000","-ac","2","-movflags","+faststart",str(audio_dest)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 decoded=ROOT/"artifacts/blog-hero-media"/"encoded-audio-check.wav"
 subprocess.run([ff,"-y","-i",str(audio_dest),"-ar","48000","-ac","2","-c:a","pcm_s16le",str(decoded)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 with wave.open(str(decoded),"rb") as wf: decoded_pcm=np.frombuffer(wf.readframes(wf.getnframes()),dtype="<i2")
 decoded_peak=int(np.max(np.abs(decoded_pcm)))
 transcript=["At EdiCut, you get a dedicated editor who understands your style, and a project manager who keeps your videos on track.","We handle storytelling, captions, color, and sound, with studio review before your draft reaches you.","Your dashboard keeps everything in one place. Start a project, share your brief and footage, and track progress.","Communicate with your team, leave feedback on edits, and download your finished videos.","Choose a single video or a monthly plan that fits your channel.","EdiCut. You create. We handle the edit."]
 cues=[f"{ts(0)} --> {ts(1)}\n[Soft instrumental music]"]
 for i,s in enumerate(SCENES):
  a=max(s[0],1.0);b=s[1]
  if a<b:cues.append(f"{ts(a)} --> {ts(b)}\n{transcript[i]}")
 (OUT/"edicut-blog-intro-en.vtt").write_text("WEBVTT\n\n"+"\n\n".join(cues)+"\n",encoding="utf-8")
 report={"generated_at":datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z"),"transcript":" ".join(transcript),"voice":"Approved existing homepage Google AI Studio Nika narration; no new synthesis","audio_source":str(MIX.relative_to(ROOT)).replace('\\','/'),"audio_sha256":digest,"music":"Existing approved original local NumPy/SciPy composition mixed under narration; preserved unchanged","captions_note":"VTT identifies the one-second music-only lead-in; instrumental music continues quietly beneath narration.","visual_sources":sorted(set(s[4] for s in SCENES)),"video":{"path":str(dest.relative_to(ROOT)).replace('\\','/'),"duration_seconds":37.64,"dimensions":[W,H],"fps":FPS,"codec":"H.264 yuv420p + AAC stereo 128 kb/s, 48 kHz, faststart","bytes":dest.stat().st_size},"audio_only":{"path":str(audio_dest.relative_to(ROOT)).replace('\\','/'),"duration_seconds":37.64,"codec":"AAC stereo 128 kb/s, 48 kHz, faststart","bytes":audio_dest.stat().st_size,"decoded_pcm_sample_peak_dbfs":round(20*math.log10(max(decoded_peak,1)/32768),3),"decoded_pcm_clipped_samples":int(np.count_nonzero(np.abs(decoded_pcm)>=32767))},"source_audio":{"sample_rate_hz":rate,"channels":channels},"poster":"edicut-blog-intro-poster.webp","captions":"edicut-blog-intro-en.vtt"}
 (OUT/"edicut-blog-intro-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,indent=2))
if __name__=="__main__":main()
