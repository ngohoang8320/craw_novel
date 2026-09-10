"""Local HTTP server nhận nội dung chapter do browser extension capture lại.

Extension chỉ đọc DOM của trang bạn đang tự mở bằng trình duyệt thật (không tự
động hoá việc truy cập trang, không có vấn đề bot-detection nào ở đây) và gửi
về server này để lưu xuống đĩa, phục vụ build EPUB ở bước sau.

Chạy: python capture_server.py
"""
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PORT = int(os.getenv("CAPTURE_SERVER_PORT", "8765"))


def _chapter_file(novel_id: str, chapter_id: str) -> str:
    novel_dir = os.path.join(DATA_DIR, str(novel_id))
    os.makedirs(novel_dir, exist_ok=True)
    return os.path.join(novel_dir, f"{chapter_id}.json")


class CaptureHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/status":
            self._send_json(200, {"status": "ok", "data_dir": DATA_DIR})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/capture":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(400, {"error": f"invalid JSON: {exc}"})
            return

        novel_id = payload.get("novel_id")
        chapter_id = payload.get("chapter_id")
        paragraphs = payload.get("paragraphs")
        page = payload.get("page", 1)

        if not novel_id or not chapter_id or not isinstance(paragraphs, list):
            self._send_json(400, {"error": "thiếu novel_id/chapter_id/paragraphs"})
            return

        path = _chapter_file(novel_id, chapter_id)
        existing = {}
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                existing = json.load(f)

        pages = existing.get("pages", {})
        pages[str(page)] = paragraphs

        merged = {
            "novel_id": novel_id,
            "chapter_id": chapter_id,
            "title": payload.get("title") or existing.get("title", ""),
            "pages": pages,
            "is_complete": bool(payload.get("is_last_page")) or existing.get("is_complete", False),
            "captured_at": payload.get("captured_at") or datetime.now(timezone.utc).isoformat(),
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)

        total_paragraphs = sum(len(p) for p in pages.values())
        print(
            f"[capture] novel={novel_id} chapter={chapter_id} page={page} "
            f"paragraphs_trang_nay={len(paragraphs)} tong_paragraphs={total_paragraphs} "
            f"complete={merged['is_complete']}"
        )

        self._send_json(
            200, {"ok": True, "pages_captured": len(pages), "is_complete": merged["is_complete"]}
        )

    def log_message(self, format: str, *args) -> None:
        pass  # da tu in gon o do_POST, tat log mac dinh cua BaseHTTPRequestHandler


def main() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), CaptureHandler)
    print(f"Capture server đang chạy tại http://127.0.0.1:{PORT}")
    print(f"Dữ liệu sẽ được lưu vào: {DATA_DIR}")
    print("Nhấn Ctrl+C để dừng.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
