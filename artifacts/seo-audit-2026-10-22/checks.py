import concurrent.futures
import csv
import json
import re
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
out = Path(__file__).resolve().parent
crawl = json.loads((out / 'crawl.json').read_text(encoding='utf-8'))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): return None

opener = urllib.request.build_opener(NoRedirect)
urls = ['http://edicut.com/', 'http://www.edicut.com/', 'https://www.edicut.com/',
        'https://edicut.com/services/youtube-video-editing/', 'https://edicut.com/about',
        'https://edicut.com/custom-quote', 'https://edicut.com/signin',
        'https://edicut.com/checkout/single-creator', 'https://edicut.com/?seo_audit=20261022']
def check(url):
    try:
        req = urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        try: r = opener.open(req, timeout=25)
        except urllib.error.HTTPError as e: r = e
        body = r.read().decode('utf-8',errors='replace')
        return {'url':url,'status':r.status,'location':r.headers.get('Location'),
                'cache':r.headers.get('CF-Cache-Status'),'xRobots':r.headers.get('X-Robots-Tag'),
                'robots':re.findall(r'<meta name="robots" content="([^"]+)"',body),
                'prerenderLocalhost':bool(re.search(r'appUrl.{0,20}http://localhost:3002',body))}
    except Exception as e: return {'url':url,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: results=list(pool.map(check,urls))
(out/'checks.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
with (out/'pages.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.writer(f); w.writerow(['URL','Status','Title','Description','Robots','Canonical','H1','JSON-LD blocks'])
    for p in crawl['pages']:
        if p['requested'] not in crawl['sitemapUrls']: continue
        meta={m.get('name'):m.get('content') for m in p['meta']}
        w.writerow([p['requested'],p['status'],p['title'],meta.get('description'),meta.get('robots'),'; '.join(p['canonical']),'; '.join(h[1] for h in p['headings'] if h[0]=='h1'),len(p['jsonld'])])
ico=(out/'edicut_com_favicon_ico.body').read_bytes()
num=struct.unpack_from('<H',ico,4)[0]
print('ICO',[(ico[6+i*16] or 256,ico[7+i*16] or 256) for i in range(num)])
png=(out/'edicut_com_favicon_png.body').read_bytes(); print('PNG',struct.unpack('>II',png[16:24]))
social=(out/'edicut_com_images_edicut-social_png.body').read_bytes(); print('SOCIAL',struct.unpack('>II',social[16:24]))
