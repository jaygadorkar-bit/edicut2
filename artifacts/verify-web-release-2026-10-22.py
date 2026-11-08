"""Read-only production verification for the 22 October web release."""
import concurrent.futures
import hashlib
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ORIGIN = "https://edicut.com"
CLIENT = Path("apps/web/build/client")
HEADERS = {"User-Agent": "EdiCutReleaseCheck/1.0", "Accept": "*/*"}
SLUGS = ["how-to-choose-youtube-video-editing-service", "youtube-video-editing-brief-checklist", "repurpose-youtube-videos-into-shorts", "3-reasons-why-you-should-hire-edicut"]
NAMES = ["choose-editing-partner", "video-brief-checklist", "creator-video-to-shorts", "edicut-editing-team"]
PAGES = ["/", "/health", "/blog", "/pricing", "/portfolio", "/contact", "/affiliate-signup", "/sitemap.xml", "/robots.txt"] + ["/blog/" + slug for slug in SLUGS]
ASSETS = ["/images/blog/" + name + ext for name in NAMES for ext in (".svg", ".webp")] + ["/audio/why-hire-us/edicut-why-hire-us-mix-f3907247.wav", "/audio/affiliate/affiliate-program-275a0ee6.m4a"]


def check(path):
    request = urllib.request.Request(ORIGIN + path, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
        item = {"path": path, "status": response.status, "url": response.url, "type": response.headers.get("Content-Type"), "bytes": len(data)}
        assert response.status == 200, path
        if path in ASSETS:
            item["sha256"] = hashlib.sha256(data).hexdigest()
            item["matchesBuild"] = hashlib.sha256((CLIENT / path.lstrip("/")).read_bytes()).hexdigest() == item["sha256"]
            assert item["matchesBuild"], path + " differs from the build"
            expected_type = "image/svg+xml" if path.endswith(".svg") else "image/webp" if path.endswith(".webp") else "audio/"
            assert expected_type in item["type"], item
        elif path == "/health":
            item["health"] = json.loads(data)
            assert item["health"]["ok"] and item["health"]["database"] == "connected"
        elif path == "/sitemap.xml":
            assert all(ORIGIN + "/blog/" + slug in data.decode() for slug in SLUGS)
            item["allBlogPostsPresent"] = True
        elif path == "/robots.txt":
            assert "Sitemap: https://edicut.com/sitemap.xml" in data.decode()
        else:
            text = data.decode()
            item["h1Count"] = len(re.findall(r"<h1\b", text))
            if path.startswith("/blog"):
                assert item["h1Count"] == 1 and 'content="index, follow"' in text
                assert ORIGIN + path in text
                if path == "/blog":
                    assert all("/images/blog/" + name + ".svg" in text for name in NAMES)
                    assert "VideoObject" not in text
                    item["newCoversPresent"] = True
            if path == "/affiliate-signup":
                item["setupUnavailableNotice"] = "Affiliate applications are temporarily unavailable" in text
        return item


results = []
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for future in concurrent.futures.as_completed([pool.submit(check, path) for path in PAGES + ASSETS]):
        results.append(future.result())

www = urllib.request.Request("https://www.edicut.com/health", headers=HEADERS)
try:
    with urllib.request.urlopen(www, timeout=30) as response:
        assert response.status == 200 and response.url == ORIGIN + "/health"
        results.append({"path": "www health", "status": 200, "finalUrl": response.url})
except urllib.error.HTTPError as error:
    # Python 3.10 does not automatically follow every HTTP 308 response.
    assert error.code in (301, 302, 307, 308) and error.headers.get("Location") == ORIGIN + "/health"
    results.append({"path": "www health", "status": error.code, "location": error.headers["Location"], "apexHealthPassed": True})

report = {"checkedUtc": datetime.now(timezone.utc).isoformat(), "version": "35ff4752-260a-465e-b5b7-6f9c3db2e08a", "previousVersion": "57b30999-9b76-4922-8eaf-3f549d98bcd7", "worker": "edicut-web", "account": "f2c46bb116722bcb7dc4be44e500154b", "branch": "main", "checks": sorted(results, key=lambda item: item["path"])}
Path("artifacts/web-live-verification-2026-10-22.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"checksPassed": len(results), "assetsMatchingBuild": sum(item.get("matchesBuild", False) for item in results), "health": next(item["health"] for item in results if item["path"] == "/health"), "affiliateSetupUnavailable": next(item.get("setupUnavailableNotice") for item in results if item["path"] == "/affiliate-signup")}))
