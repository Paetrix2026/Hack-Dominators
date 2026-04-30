import os
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import numpy as np
from PIL import Image

_lock = Lock()
_model = None
_labels = ["Aloevera", "Betel", "Brahmi", "Neem", "Tulsi", "Mint"]
_labels_loaded = False
_last_load_error: str | None = None
_last_assets: dict | None = None


def _load_labels_once() -> list[str]:
    """
    Load class labels in the correct output order.
    Priority:
      1) env HERB_MODEL_CLASSES="Aloevera,Betel,Brahmi,Neem,Tulsi,Mint"
      2) labels.json in model folder: {"classes": ["..."]}
      3) default hardcoded list
    """
    global _labels_loaded, _labels
    if _labels_loaded:
        return _labels

    with _lock:
        if _labels_loaded:
            return _labels

        raw = (os.environ.get("HERB_MODEL_CLASSES") or "").strip()
        if raw:
            parts = [p.strip() for p in raw.split(",") if p.strip()]
            if len(parts) >= 2:
                _labels = parts
                _labels_loaded = True
                return _labels

        # labels.json next to assets (supports your nested folder)
        assets = _locate_assets()
        base = None
        if assets.get("keras"):
            base = Path(assets["keras"]).parent
        elif assets.get("config"):
            base = Path(assets["config"]).parent
        if base:
            lj = base / "labels.json"
            if lj.exists():
                try:
                    import json

                    payload = json.loads(lj.read_text(encoding="utf-8"))
                    classes = payload.get("classes") or payload.get("labels")
                    if isinstance(classes, list) and len(classes) >= 2:
                        _labels = [str(x) for x in classes]
                        _labels_loaded = True
                        return _labels
                except Exception:
                    pass

        _labels_loaded = True
        return _labels


def _model_dir() -> Path:
    # Default path inside repo (user will copy files here)
    raw = (os.environ.get("HERB_MODEL_DIR") or "").strip()
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parents[1] / "ml" / "herb_model"

def _locate_assets() -> dict:
    """
    Locate model assets in a flexible way.
    Supports:
      - <dir>/herb_model.keras
      - <dir>/**/herb_model.keras
      - <dir>/config.json + <dir>/model.weights.h5
      - <dir>/**/config.json + <dir>/**/model.weights.h5 (same folder)
    """
    d = _model_dir()
    if not d.exists():
        return {}

    # Prefer H5 model if present (most compatible)
    h5_direct = d / "herb_model.h5"
    if h5_direct.exists() and h5_direct.is_file():
        return {"h5": h5_direct}
    h5_candidates = [p for p in d.rglob("*.h5") if p.is_file()]
    if h5_candidates:
        return {"h5": sorted(h5_candidates, key=lambda p: p.name.lower())[0]}

    # 0) prefer any actual .keras file in folder (including generated archives)
    file_candidates = [p for p in d.rglob("*.keras") if p.is_file()]
    if file_candidates:
        exact = [p for p in file_candidates if p.name.lower() == "herb_model.keras"]
        preferred = exact[0] if exact else sorted(file_candidates, key=lambda p: p.name.lower())[0]
        return {"keras": preferred}

    # 1) direct keras file
    keras_path = d / "herb_model.keras"
    if keras_path.exists():
        if keras_path.is_file():
            return {"keras": keras_path}
        # Some exports create a folder named *.keras containing config + weights
        if keras_path.is_dir():
            cfg = keras_path / "config.json"
            w = keras_path / "model.weights.h5"
            if cfg.exists() and w.exists():
                return {"keras_dir": keras_path, "config": cfg, "weights": w}

    # 2) any *.keras directory (nested folder)
    candidates = [p for p in d.rglob("*.keras") if p.is_dir()]
    if candidates:
        # Prefer exact name match if present
        exact = [p for p in candidates if p.name.lower() == "herb_model.keras"]
        chosen = (exact[0] if exact else candidates[0])
        if chosen.is_dir():
            cfg = chosen / "config.json"
            w = chosen / "model.weights.h5"
            if cfg.exists() and w.exists():
                return {"keras_dir": chosen, "config": cfg, "weights": w}

    # 3) config + weights in dir or nested
    for cfg in d.rglob("config.json"):
        w = cfg.parent / "model.weights.h5"
        if w.exists():
            return {"config": cfg, "weights": w}

    return {}


def _load_model() -> Any:
    """
    Loads a Keras model if present.
    Supports:
    - herb_model.keras (preferred)
    - config.json + model.weights.h5 (fallback)
    """
    global _model
    global _last_load_error, _last_assets
    if _model is not None:
        return _model

    with _lock:
        if _model is not None:
            return _model

        assets = _locate_assets()
        _last_assets = {k: str(v) for k, v in assets.items()}
        h5_path = assets.get("h5")
        keras_path = assets.get("keras")
        keras_dir = assets.get("keras_dir")
        config_path = assets.get("config")
        weights_path = assets.get("weights")

        if not h5_path and not keras_path and not keras_dir and not (config_path and weights_path):
            _last_load_error = "Model assets not found"
            _model = None
            return None

        # Prefer standalone Keras 3 (supports `.keras` saving API). Fallback to TF Keras.
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
                _model = None
                return None

        if h5_path:
            try:
                _model = keras.models.load_model(str(h5_path), compile=False)
                _last_load_error = None
                return _model
            except Exception as e:
                # Keras 3 sometimes cannot rebuild older Sequential graphs from H5.
                # Try legacy tf-keras package as a fallback.
                try:
                    import tf_keras as tfk  # type: ignore

                    _model = tfk.models.load_model(str(h5_path), compile=False)
                    _last_load_error = None
                    return _model
                except Exception as e2:
                    _last_load_error = f"load_model(h5) failed: {e!s} | legacy tf-keras failed: {e2!s}"
                    _model = None
                    return None

        if keras_path:
            try:
                # Compatible across TF/Keras versions
                _model = keras.models.load_model(str(keras_path))
                _last_load_error = None
                return _model
            except Exception as e:
                # If load fails, disable model and allow fallback path
                _last_load_error = f"load_model failed: {e!s}"
                _model = None
                return None

        # Keras v3 directory export (folder named *.keras)
        if keras_dir:
            try:
                _model = keras.models.load_model(str(keras_dir))
                _last_load_error = None
                return _model
            except Exception as e:
                _last_load_error = f"load_model(dir) failed: {e!s}"
                _model = None
                # fall through to json/weights attempt (some builds only support that)

        # config.json + weights.h5 fallback
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = f.read()
            m = keras.models.model_from_json(cfg)
            m.load_weights(str(weights_path))
            _model = m
            _last_load_error = None
            return _model
        except Exception as e:
            _last_load_error = f"model_from_json/load_weights failed: {e!s}"
            _model = None
            return None


def is_model_available() -> bool:
    return _load_model() is not None


def get_model_status() -> dict:
    """
    Lightweight status for debugging.
    """
    ok = _load_model() is not None
    labels = _load_labels_once()
    return {
        "available": ok,
        "assets": _last_assets or {},
        "labels": labels,
        "last_error": _last_load_error,
    }


def _preprocess(image_bytes: bytes, size: int = 224) -> np.ndarray:
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img = img.resize((size, size))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    return arr


def classify_herb_image(image_bytes: bytes) -> dict:
    """
    Returns:
      {
        "ok": bool,                # model available + image decodable
        "label": str | None,       # predicted label
        "confidence": float,       # 0..1
        "probs": {label: float}    # per-class probabilities (if available)
      }
    """
    model = _load_model()
    if model is None:
        return {"ok": False, "label": None, "confidence": 0.0, "probs": {}}

    labels = _load_labels_once()

    try:
        x = _preprocess(image_bytes)
    except Exception:
        # If image cannot be decoded, treat as model-unusable.
        return {"ok": False, "label": None, "confidence": 0.0, "probs": {}}

    try:
        y = model.predict(x, verbose=0)
    except Exception:
        # If model inference fails for any reason, fail open to fallback classifier.
        return {"ok": False, "label": None, "confidence": 0.0, "probs": {}}
    # y can be (1, n)
    scores = np.asarray(y).reshape(-1)
    if scores.size != len(labels):
        # unexpected head shape
        return {"ok": True, "label": None, "confidence": 0.0, "probs": {}}

    probs = scores.astype(np.float32)
    # Some models output probabilities already. If not, convert logits -> softmax.
    s = float(np.sum(probs))
    if 0.98 <= s <= 1.02 and np.all(probs >= -1e-6) and np.all(probs <= 1.0 + 1e-6):
        soft = np.clip(probs, 0.0, 1.0)
        soft = soft / float(np.sum(soft) or 1.0)
    else:
        exp = np.exp(probs - np.max(probs))
        soft = exp / np.sum(exp)

    idx = int(np.argmax(soft))
    conf = float(soft[idx])
    label = labels[idx]
    return {
        "ok": True,
        "label": label,
        "confidence": conf,
        "probs": {lab: float(soft[i]) for i, lab in enumerate(labels)},
    }

