#!/usr/bin/env python3
"""Static server + PUT /comments/<name>.json writes to ./comments/."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re

PORT = 8000
COMMENTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "comments")
os.makedirs(COMMENTS_DIR, exist_ok=True)

SAFE_NAME = re.compile(r"^[A-Za-z0-9_\-]+\.json$")


class Handler(SimpleHTTPRequestHandler):
    def do_PUT(self):
        self._save()

    def do_POST(self):
        self._save()

    def _save(self):
        if not self.path.startswith("/comments/"):
            self.send_error(404)
            return
        name = os.path.basename(self.path)
        if not SAFE_NAME.match(name):
            self.send_error(400, "Bad filename")
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        try:
            json.loads(body.decode("utf-8"))
        except Exception:
            self.send_error(400, "Invalid JSON")
            return
        path = os.path.join(COMMENTS_DIR, name)
        with open(path, "wb") as f:
            f.write(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    with ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving on http://localhost:{PORT}")
        httpd.serve_forever()
