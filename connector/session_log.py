from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, TextIO


class SessionLog:
    """Append-only JSONL log for debugging and end-of-session reconciliation."""

    def __init__(self, log_dir: Path) -> None:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        log_dir.mkdir(parents=True, exist_ok=True)
        self.path = log_dir / f"session-{timestamp}.jsonl"
        self._file: TextIO | None = self.path.open("a", encoding="utf-8", buffering=1)

    def write(self, kind: str, payload: dict[str, Any] | None = None) -> None:
        if self._file is None:
            return
        record = {
            "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
            "kind": kind,
            **(payload or {}),
        }
        try:
            self._file.write(json.dumps(record, ensure_ascii=False) + "\n")
        except OSError as exc:
            logging.getLogger("studio").warning("Gagal menulis log sesi: %s", exc)

    def close(self) -> None:
        if self._file is not None:
            self._file.close()
            self._file = None
