from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _int_env(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} harus berupa angka, bukan {raw!r}") from exc
    if value < minimum:
        raise ValueError(f"{name} minimal {minimum}")
    return value


def _normalize_username(value: str) -> str:
    username = value.strip()
    if username.startswith("@"):
        username = username[1:]
    return username


@dataclass(frozen=True)
class ConnectorConfig:
    username: str
    sign_api_key: str
    ws_host: str
    ws_port: int
    target_coins: int
    log_dir: Path
    reconnect_base_seconds: int
    reconnect_max_seconds: int
    overlay_origin: str

    @classmethod
    def from_env(cls, username_override: str | None = None) -> "ConnectorConfig":
        username = _normalize_username(
            username_override or os.getenv("TIKTOK_USERNAME", "")
        )
        sign_api_key = (
            os.getenv("SIGN_API_KEY", "").strip()
            or os.getenv("EULER_API_KEY", "").strip()
        )
        ws_host = os.getenv("WS_HOST", "127.0.0.1").strip() or "127.0.0.1"
        if ws_host not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError(
                "WS_HOST harus localhost (127.0.0.1, localhost, atau ::1). "
                "Jembatan data tidak boleh terbuka ke jaringan luar."
            )

        log_dir = Path(os.getenv("LOG_DIR", "logs")).expanduser()
        if not log_dir.is_absolute():
            log_dir = PROJECT_ROOT / log_dir

        return cls(
            username=username,
            sign_api_key=sign_api_key,
            ws_host=ws_host,
            ws_port=_int_env("WS_PORT", 8080),
            target_coins=_int_env("TARGET_COINS", 500),
            log_dir=log_dir,
            reconnect_base_seconds=_int_env("RECONNECT_BASE_SECONDS", 5),
            reconnect_max_seconds=_int_env("RECONNECT_MAX_SECONDS", 30),
            overlay_origin=os.getenv("OVERLAY_ORIGIN", "http://127.0.0.1:5173").rstrip(
                "/"
            ),
        )
