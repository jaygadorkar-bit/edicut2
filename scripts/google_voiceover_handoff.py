"""One-session localhost handoff for an existing, authorized Gemini API key.

The key is accepted in a password form, kept in process memory, sent only to
Google's speech API, and never printed or written to a file. No keys or billing
settings are created or changed. See docs/VIDEO_CREATION_GUIDE.md.
"""
from __future__ import annotations

import argparse
import html
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

from generate_google_affiliate_voice import generate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("scripts/data/affiliate-ludo-voiceover.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("media/audio/affiliate-ludo"))
    parser.add_argument("--source-name", default="affiliate-ludo-source.wav")
    parser.add_argument("--idle-timeout", type=float, default=600, help="Seconds to wait for submission before closing the local form.")
    args = parser.parse_args()
    if args.idle_timeout <= 0:
        parser.error("Idle timeout must be positive.")
    if not args.config.is_file():
        parser.error("Voiceover config was not found. Run from the repository root or use an absolute path.")
    if Path(args.source_name).name != args.source_name or not args.source_name.lower().endswith(".wav"):
        parser.error("Source name must be a WAV filename without directories.")
    if (args.output_dir / args.source_name).exists() or (args.output_dir / "google-generation-report.json").exists():
        parser.error("Choose a fresh output directory to preserve existing recordings and reports.")

    token = secrets.token_urlsafe(32)
    state = {"status": "ready", "message": "Use an existing authorized Google Gemini key for the requested narration."}
    state_lock = threading.Lock()

    def render(api_key: str) -> None:
        try:
            result = generate(api_key, args.config, args.output_dir, args.source_name)
            state.update(status="complete", message=json.dumps(result, indent=2))
            print(json.dumps(result), flush=True)
        except Exception as error:
            message = str(error).replace(api_key, "[redacted]")
            state.update(status="failed", message=message)
            print(message, flush=True)
        finally:
            api_key = ""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_: object) -> None:
            pass

        def page(self, body: str, refresh: bool = False) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            refresh_tag = '<meta http-equiv="refresh" content="2">' if refresh else ""
            document = (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google voice render</title>{refresh_tag}</head>'
                        '<body style="font:16px system-ui;max-width:680px;margin:60px auto;padding:24px"><h1>Google voice render</h1>'
                        + body + '</body></html>')
            self.wfile.write(document.encode())

        def do_GET(self) -> None:
            if self.path != f"/{token}":
                self.send_error(404)
                return
            if state["status"] == "ready":
                self.page('<p>The existing key stays in memory and is sent only to Google for this recording.</p>'
                          '<form method="post" autocomplete="off"><label>Gemini API key <input name="api_key" type="password" required autocomplete="off" maxlength="200"></label>'
                          '<button type="submit">Generate Google narration</button></form>')
            else:
                self.page(f'<p>Status: {html.escape(state["status"])}</p><pre style="white-space:pre-wrap">{html.escape(state["message"])}</pre>', state["status"] == "generating")

        def do_POST(self) -> None:
            if self.path != f"/{token}" or self.headers.get("Origin") != origin:
                self.send_error(403)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_error(400)
                return
            if not 0 < length < 8192:
                self.send_error(400)
                return
            form = parse_qs(self.rfile.read(length).decode("utf-8", errors="replace"))
            api_key = form.pop("api_key", [""])[0].strip()
            if not api_key.startswith("AIza") or len(api_key) > 200:
                self.send_error(400, "Invalid key format")
                return
            with state_lock:
                if state["status"] != "ready":
                    self.send_error(409)
                    return
                state.update(status="generating", message="Google is rendering the requested narration.")
            threading.Thread(target=render, args=(api_key,), daemon=True).start()
            api_key = ""
            self.send_response(303)
            self.send_header("Location", f"/{token}")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    origin = f"http://127.0.0.1:{server.server_port}"
    print(f"Session URL: {origin}/{token}", flush=True)
    print("The key is not printed or persisted. The server closes shortly after the job finishes.", flush=True)
    server.timeout = 1
    started_at = time.monotonic()
    try:
        while state["status"] not in ("complete", "failed"):
            if state["status"] == "ready" and time.monotonic() - started_at >= args.idle_timeout:
                print("Local handoff expired without a submission.", flush=True)
                return
            server.handle_request()
        for _ in range(15):
            server.handle_request()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
