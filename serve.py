#!/usr/bin/env python3
"""Serve this project over HTTP and open the default browser."""

from __future__ import annotations

import argparse
import os
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Serve the Face Morphing Demo and open it in a browser."
    )
    parser.add_argument(
        "-p", "--port", type=int, default=8000, help="Port to listen on (default: 8000)"
    )
    parser.add_argument(
        "--no-open", action="store_true", help="Do not open a browser tab automatically."
    )
    args = parser.parse_args()

    os.chdir(ROOT)
    url = f"http://127.0.0.1:{args.port}/"

    server = ThreadingHTTPServer(("127.0.0.1", args.port), SimpleHTTPRequestHandler)

    if not args.no_open:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()

    print(f"Serving {ROOT}")
    print(f"URL: {url}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
