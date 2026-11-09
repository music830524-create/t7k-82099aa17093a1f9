"""Local static server and a phone-sized Chrome page for the PWA."""
import socket
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHROME = "/usr/local/bin/google-chrome"


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class _Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        return


@pytest.fixture(scope="session")
def base_url():
    httpd = ThreadingHTTPServer(("127.0.0.1", _free_port()), _Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield "http://127.0.0.1:%d/" % httpd.server_address[1]
    httpd.shutdown()


@pytest.fixture
def page(base_url):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            locale="zh-TW",
            service_workers="block",
        )
        pg = ctx.new_page()
        pg.goto(base_url)
        pg.wait_for_selector("[data-testid=grammar-entry]")
        yield pg
        browser.close()
