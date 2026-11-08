#!/usr/bin/env python3
"""Storybook Card Studio sync bridge.

Lets card-builder.html (file:// or localhost) read and write /storybook/cards.json
directly with zero prompts.

  GET  http://127.0.0.1:8787/api/cards  -> current cards.json
  POST http://127.0.0.1:8787/api/cards  -> overwrite cards.json with request body

Run:  python3 scripts/storybook_sync_bridge.py
"""
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST, PORT = "127.0.0.1", 8787
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_PATH = os.path.join(REPO_ROOT, "storybook", "cards.json")


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Allow file:// / public pages to reach this private-network endpoint (Chrome PNA)
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if self.path.split("?")[0] != "/api/cards":
            return self._send(404, b'{"error":"not found"}')
        try:
            with open(CARDS_PATH, "rb") as f:
                self._send(200, f.read())
        except FileNotFoundError:
            self._send(404, b'{"error":"cards.json missing"}')

    def do_POST(self):
        if self.path.split("?")[0] != "/api/cards":
            return self._send(404, b'{"error":"not found"}')
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict) or not isinstance(payload.get("cards"), list):
                raise ValueError("payload must be an object with a 'cards' array")
        except Exception as e:  # noqa: BLE001
            return self._send(400, json.dumps({"error": str(e)}).encode())

        # Atomic write so a crash mid-save can never corrupt cards.json
        text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(CARDS_PATH), suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, CARDS_PATH)
        print(f"[sync] wrote {len(payload['cards'])} cards -> {CARDS_PATH}", flush=True)
        self._send(200, b'{"ok":true}')

    def log_message(self, fmt, *args):  # quiet default request logging
        pass


if __name__ == "__main__":
    print(f"Storybook sync bridge on http://{HOST}:{PORT}/api/cards -> {CARDS_PATH}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
