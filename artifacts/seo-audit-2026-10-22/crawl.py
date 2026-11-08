"""Read-only public SEO evidence collection; no authentication or mutations."""
import concurrent.futures
import gzip
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, deque
from html.parser import HTMLParser
from pathlib import Path

OUT = Path(__file__).resolve().parent


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.headings = []
        self.links = []
        self.images = []
        self.jsonld = []
        self.text = []
        self.in_title = False
        self.title = ''
        self.heading = None
        self.skip = 0
        self.ld = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append({'tag': tag, **a})
        if tag == 'title': self.in_title = True
        if re.fullmatch(r'h[1-6]', tag): self.heading = [tag, '']
        if tag == 'a' and 'href' in a: self.links.append(a['href'])
        if tag == 'img': self.images.append(a)
        if tag in ('script', 'style'): self.skip += 1
        if tag == 'script' and a.get('type') == 'application/ld+json': self.ld = ''

    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if self.heading and self.heading[0] == tag:
            self.headings.append(self.heading)
            self.heading = None
        if tag == 'script' and self.ld is not None:
            try: self.jsonld.append(json.loads(self.ld))
            except ValueError: self.jsonld.append({'parseError': True})
            self.ld = None
        if tag in ('script', 'style'): self.skip = max(0, self.skip - 1)

    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.heading: self.heading[1] += data
        if self.ld is not None: self.ld += data
        if not self.skip: self.text.append(data)


def fetch(url):
    start = time.monotonic()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'EdiCut-public-SEO-audit/1.0', 'Accept-Encoding': 'gzip'})
        try: res = urllib.request.urlopen(req, timeout=40)
        except urllib.error.HTTPError as e: res = e
        data = res.read()
        if res.headers.get('Content-Encoding') == 'gzip': data = gzip.decompress(data)
        result = {'requested': url, 'url': res.geturl(), 'status': res.status,
                  'headers': dict(res.headers), 'seconds': round(time.monotonic()-start, 3), 'bytes': len(data)}
        body = data.decode('utf-8', errors='replace')
        if 'text/html' in res.headers.get('Content-Type', ''):
            p = Page(); p.feed(body)
            result.update(title=p.title.strip(), headings=p.headings,
                          meta=[a for a in p.tags if a['tag'] == 'meta'],
                          canonical=[a.get('href') for a in p.tags if a['tag'] == 'link' and a.get('rel') == 'canonical'],
                          links=p.links, images=p.images, jsonld=p.jsonld,
                          htmlLang=next((a.get('lang') for a in p.tags if a['tag'] == 'html'), None),
                          text=re.sub(r'\s+', ' ', ' '.join(p.text)).strip())
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', url.split('://', 1)[-1]).strip('_')
        (OUT / f'{safe}.body').write_bytes(data)
        if url.endswith(('robots.txt', 'sitemap.xml')): result['body'] = body
        return result
    except Exception as e:
        return {'requested': url, 'error': str(e)}


sitemap = fetch('https://edicut.com/sitemap.xml')
urls = [node.text for node in ET.fromstring(sitemap['body']).iter() if node.tag.endswith('}loc')]
checks = [
    'https://edicut.com/robots.txt',
    'http://edicut.com/', 'http://www.edicut.com/', 'https://www.edicut.com/',
    'https://edicut.com/services/youtube-video-editing/',
    'https://edicut.com/services/youtube-video-editing?utm_source=seo-audit',
    'https://edicut.com/seo-audit-missing-page-2026-10-22',
    'https://edicut.com/services/seo-audit-missing-service',
    'https://edicut.com/pricing/seo-audit-missing-plan',
    'https://edicut.com/login', 'https://edicut.com/dashboard',
    'https://edicut.com/favicon.ico', 'https://edicut.com/favicon.svg',
    'https://edicut.com/favicon.png', 'https://edicut.com/images/edicut-social.png',
    'http://localhost:3002/',
]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    pages = list(pool.map(fetch, list(dict.fromkeys(urls + checks))))
report = {'recordedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          'sitemap': sitemap, 'sitemapUrls': urls, 'pages': pages}
(OUT / 'crawl.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
for p in pages:
    metas = {m.get('name'): m.get('content') for m in p.get('meta', [])}
    print(json.dumps({k:v for k,v in {'url':p['requested'], 'final':p.get('url'), 'status':p.get('status'),
          'error':p.get('error'), 'title':p.get('title'), 'h1':[h[1] for h in p.get('headings', []) if h[0]=='h1'],
          'robots':metas.get('robots'), 'canonical':p.get('canonical'), 'description':metas.get('description')}.items() if v is not None}))
