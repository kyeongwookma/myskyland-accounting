#!/usr/bin/env python3
"""하늘땅 급여 프로그램용 localhost 서버.

정적 파일을 제공하고 원본자료/YYYY-MM 폴더의 급여 파일만 읽기 전용으로 노출한다.
외부 주소에는 바인딩하지 않는다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import threading
import urllib.parse
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = PROJECT_DIR / "원본자료"
MONTH_PATTERN = re.compile(r"^20\d{2}-(0[1-9]|1[0-2])$")
ALLOWED_EXTENSIONS = {".xlsx", ".csv", ".tsv", ".txt"}


def source_file(month: str, name: str) -> Path | None:
    if not MONTH_PATTERN.fullmatch(month) or Path(name).name != name:
        return None
    candidate = (SOURCE_DIR / month / name).resolve()
    folder = (SOURCE_DIR / month).resolve()
    if candidate.parent != folder or candidate.suffix.lower() not in ALLOWED_EXTENSIONS:
        return None
    return candidate if candidate.is_file() else None


def file_signature(path: Path) -> str:
    stat = path.stat()
    material = f"{path.name}\0{stat.st_size}\0{stat.st_mtime_ns}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()[:20]


class PayrollHandler(SimpleHTTPRequestHandler):
    server_version = "MySkylandLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_DIR), **kwargs)

    def send_json(self, status: int, value: object) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 - http.server API name
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json(200, {"localSourceFolder": True})
            return
        if parsed.path == "/api/source-files":
            query = urllib.parse.parse_qs(parsed.query)
            month = query.get("month", [""])[0]
            if not MONTH_PATTERN.fullmatch(month):
                self.send_json(400, {"error": "급여월 형식이 올바르지 않습니다."})
                return
            folder = SOURCE_DIR / month
            files = []
            if folder.is_dir():
                for path in sorted(folder.iterdir(), key=lambda item: item.name):
                    if not path.is_file() or path.name.startswith(".") or path.suffix.lower() not in ALLOWED_EXTENSIONS:
                        continue
                    stat = path.stat()
                    files.append({
                        "name": path.name,
                        "size": stat.st_size,
                        "modified": int(stat.st_mtime * 1000),
                        "signature": file_signature(path),
                        "url": f"/api/source-file?{urllib.parse.urlencode({'month': month, 'name': path.name})}",
                    })
            self.send_json(200, {"month": month, "folder": f"원본자료/{month}", "files": files})
            return
        if parsed.path == "/api/source-file":
            query = urllib.parse.parse_qs(parsed.query)
            path = source_file(query.get("month", [""])[0], query.get("name", [""])[0])
            if path is None:
                self.send_error(404)
                return
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(path.stat().st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with path.open("rb") as source:
                while chunk := source.read(1024 * 1024):
                    self.wfile.write(chunk)
            return
        if parsed.path.startswith(("/원본자료", "/.git", "/.codepresso")):
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, format: str, *args) -> None:
        print(f"[하늘땅] {self.address_string()} - {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="하늘땅 급여 프로그램 로컬 서버")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--open", action="store_true", help="브라우저를 자동으로 연다")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PayrollHandler)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"하늘땅 급여 프로그램: {url}")
    print("종료하려면 이 창에서 Ctrl+C를 누르세요.")
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n프로그램을 종료합니다.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
