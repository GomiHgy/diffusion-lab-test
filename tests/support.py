"""Small, local-only static host used by build and browser tests."""
from __future__ import annotations
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit


class SiteHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def translate_path(self, path: str) -> str:
        # Mount the same deployment at / and at a repository-like URL prefix.
        parsed = urlsplit(path)
        route = parsed.path
        if route == "/diffusion-lab":
            route = "/"
        elif route.startswith("/diffusion-lab/"):
            route = route[len("/diffusion-lab"):]
        if parsed.query:
            route += "?" + parsed.query
        return super().translate_path(route)


class LocalSite:
    def __init__(self, directory: Path):
        handler = partial(SiteHandler, directory=str(directory))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.url = f"http://127.0.0.1:{self.server.server_port}/"
        self.started = False

    def start(self) -> "LocalSite":
        if not self.started:
            self.thread.start()
            self.started = True
        return self

    def close(self) -> None:
        if self.started:
            self.server.shutdown()
            self.thread.join(timeout=5)
            self.started = False
        self.server.server_close()

    def __enter__(self) -> "LocalSite":
        return self.start()

    def __exit__(self, *_args) -> None:
        self.close()
