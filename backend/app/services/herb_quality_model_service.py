import os
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
from PIL import Image

_lock = Lock()
_model = None
_last_load_error: str | None = None
_model_path: str | None = None


def _model_dir() -> Path:
    raw = (os.environ.get("HERB_QUALITY_MODEL_DIR") or "").strip()
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parents[1] / "ml" / "herb_quality_model"


def _find_model_path() -> Path | None:
    d = _model_dir()
    if not d.exists():
        return None

    direct = d / "herb_quality_model.h5"
    if direct.exists() and direct.is_file():
        return direct

    candidates = [p for p in d.rglob("*.h5") if p.is_file()]
    if not candidates:
        return None
    return sorted(candidates, key=lambda p: p.name.lower())[0]


def _load_model() -> Any:
    global _model, _last_load_error, _model_path
    if _model is not None:
        return _model

    with _lock:
        if _model is not None:
            return _model

        path = _find_model_path()
        _model_path = str(path) if path else None
        if path is None:
            _last_load_error = "Model file herb_quality_model.h5 not found"
            return None

        keras = None
        try:
            import keras as _k  # type: ignore

            keras = _k
        except Exception:
            try:
                from tensorflow import keras as _tk  # type: ignore

                keras = _tk
            except Exception as e:
                _last_load_error = f"Keras import failed: {e!s}"
                return None

        try:
            _model = keras.models.load_model(str(path), compile=False)
            _last_load_error = None
            return _model
        except Exception as e:
            try:
                import tf_keras as tfk  # type: ignore

                _model = tfk.models.load_model(str(path), compile=False)
                _last_load_error = None
                return _model
            except Exception as e2:
                _last_load_error = f"load_model(h5) failed: {e!s} | legacy tf-keras failed: {e2!s}"
                return None


def is_quality_model_available() -> bool:
    return _load_model() is not None


def get_quality_model_status() -> dict:
    ok = _load_model() is not None
    return {
        "available": ok,
        "model_path": _model_path,
        "last_error": _last_load_error,
    }


def _preprocess(image_bytes: bytes, size: int = 224) -> np.ndarray:
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img = img.resize((size, size))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    return arr


def classify_image_quality(image_bytes: bytes) -> dict:
    """
    Returns:
      {
        "ok": bool,
        "quality": "good" | "bad" | None,
        "confidence": float,
        "scores": {"good": float, "bad": float}
      }
    """
    model = _load_model()
    if model is None:
        return {"ok": False, "quality": None, "confidence": 0.0, "scores": {}}

    try:
        x = _preprocess(image_bytes)
        y = model.predict(x, verbose=0)
    except Exception:
        return {"ok": False, "quality": None, "confidence": 0.0, "scores": {}}

    scores = np.asarray(y).reshape(-1).astype(np.float32)
    if scores.size == 1:
        # Single-neuron sigmoid output: value ~ probability of "good".
        p_good = float(np.clip(scores[0], 0.0, 1.0))
        p_bad = float(1.0 - p_good)
    elif scores.size == 2:
        s = float(np.sum(scores))
        if 0.98 <= s <= 1.02 and np.all(scores >= -1e-6) and np.all(scores <= 1.0 + 1e-6):
            probs = np.clip(scores, 0.0, 1.0)
            probs = probs / float(np.sum(probs) or 1.0)
        else:
            exp = np.exp(scores - np.max(scores))
            probs = exp / np.sum(exp)
        p_good = float(probs[0])
        p_bad = float(probs[1])
    else:
        return {"ok": False, "quality": None, "confidence": 0.0, "scores": {}}

    if p_good >= p_bad:
        return {
            "ok": True,
            "quality": "good",
            "confidence": p_good,
            "scores": {"good": p_good, "bad": p_bad},
        }
    return {
        "ok": True,
        "quality": "bad",
        "confidence": p_bad,
        "scores": {"good": p_good, "bad": p_bad},
    }
