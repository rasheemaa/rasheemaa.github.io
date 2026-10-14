#!/usr/bin/env python3
"""Download and verify the *exact* Pocket TTS files used by Sparkle Voice PR #9.

Run only in an isolated GitHub Actions runner; never commit model weights.
The runner cache is separate from website visitors' browser Cache Storage.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

LANGUAGE = "english_2026-04"
MODEL_BASE = "https://huggingface.co/vlapky/pocket-tts-onnx/resolve/main/onnx"
CACHE_DIR = Path(os.environ.get("SPARKLE_MODEL_CACHE_DIR", ".cache/sparkle-pocket-tts")) / LANGUAGE
MAX_FILE_BYTES = 1200 * 1024 * 1024
MAX_ATTEMPTS = 3
MANIFEST_PATH = CACHE_DIR / "sha256-manifest.json"

# Must exactly match the quantized:true, fullPrecisionAudio:true and
# voiceCloning:true settings in what-do-i-say/voice-beta/lab.js.
MODEL_FILENAMES = [
    "mimi_encoder_int8.onnx",
    "text_conditioner_int8.onnx",
    "flow_lm_main_int8.onnx",
    "flow_lm_flow.onnx",
    "mimi_decoder.onnx",
]

def check_filename(name):
    if not isinstance(name, str) or not name or Path(name).name != name:
        raise ValueError(f"Untrusted filename in model bundle: {name!r}")
    if name in (".", "..") or "/" in name or chr(92) in name:
        raise ValueError(f"Unsafe filename: {name!r}")
    return name

def download(name, known):
    check_filename(name)
    destination = CACHE_DIR / name
    previous = known.get(name)
    if destination.is_file() and previous:
        checksum = hashlib.sha256()
        with destination.open("rb") as cached:
            for block in iter(lambda: cached.read(1024 * 1024), b""):
                checksum.update(block)
        if (destination.stat().st_size == previous["bytes"]
                and checksum.hexdigest() == previous["sha256"]):
            print(f"CACHE HIT {name}: {destination.stat().st_size} bytes, SHA256 verified", flush=True)
            return previous
        print(f"INVALID CACHE {name}: re-downloading", flush=True)

    url = f"{MODEL_BASE}/{LANGUAGE}/{quote(name)}"
    temp = destination.with_name(destination.name + ".partial")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        checksum = hashlib.sha256()
        size = 0
        temp.unlink(missing_ok=True)
        try:
            request = Request(url, headers={"User-Agent": "Sparkle-Voice-CI/1.0", "Accept-Encoding": "identity"})
            with urlopen(request, timeout=120) as response, temp.open("wb") as out:
                host = urlsplit(response.url).hostname
                print(f"DOWNLOAD {name}: HTTP {response.status}; final host {host}", flush=True)
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status} for {name}")
                header_length = response.headers.get("Content-Length")
                if header_length and int(header_length) > MAX_FILE_BYTES:
                    raise RuntimeError(f"{name} too large ({header_length} bytes)")
                while True:
                    block = response.read(1024 * 1024)
                    if not block:
                        break
                    size += len(block)
                    if size > MAX_FILE_BYTES:
                        raise RuntimeError(f"{name} exceeds size limit")
                    checksum.update(block)
                    out.write(block)
                if header_length and int(header_length) != size:
                    raise RuntimeError(f"Truncated {name}: {size} versus {header_length}")
                if not size:
                    raise RuntimeError(f"Empty downloaded asset {name}")
                if name.endswith(".onnx") and size < 1024:
                    raise RuntimeError(f"Suspiciously small ONNX asset {name} ({size} bytes)")
                if name.endswith(".onnx") and (response.headers.get("Content-Type") or "").lower().startswith("text/html"):
                    raise RuntimeError(f"HTML response served instead of ONNX for {name}")
            temp.replace(destination)
            result = {"bytes": size, "sha256": checksum.hexdigest()}
            print(f"VERIFIED {name}: {size} bytes; SHA256 {result['sha256']}", flush=True)
            return result
        except (OSError, HTTPError, URLError, ValueError, RuntimeError) as error:
            temp.unlink(missing_ok=True)
            print(f"ATTEMPT {attempt}/{MAX_ATTEMPTS} failed for {name}: {type(error).__name__}: {error}", flush=True)
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(2 * attempt)

def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"MODEL SOURCE: {MODEL_BASE}/{LANGUAGE}/", flush=True)
    for host in ("huggingface.co", "cdn.jsdelivr.net"):
        try:
            addr = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            print(f"DNS {host}: resolved ({len(addr)} addresses)", flush=True)
        except OSError as error:
            print(f"DNS {host}: FAILED: {error}", flush=True)
            raise
    try:
        known = json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else {}
    except (ValueError, OSError):
        known = {}
    if not isinstance(known, dict):
        known = {}

    names = ["bundle.json"]
    bundle_record = download("bundle.json", known)
    known["bundle.json"] = bundle_record
    try:
        bundle = json.loads((CACHE_DIR / "bundle.json").read_text())
        names.append(check_filename(bundle["tokenizer_file"]))
        if bundle.get("bos_before_voice_file"):
            names.append(check_filename(bundle["bos_before_voice_file"]))
    except (KeyError, ValueError, UnicodeDecodeError) as error:
        raise RuntimeError(f"Invalid Pocket TTS bundle metadata: {error}") from error
    names.extend(MODEL_FILENAMES)
    for name in dict.fromkeys(names[1:]):
        known[name] = download(name, known)
        # Persist verified files independently for next runs if still in the cache.
        MANIFEST_PATH.write_text(json.dumps(known, indent=2, sort_keys=True) + "\n")
    print(f"SUCCESS: {len(set(names))} required files are downloaded and checksum-verified.", flush=True)
    print("NOTE: caching is runner-local and does not itself verify real speech or iPhone compatibility.", flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"POCKET TTS HOST / WEIGHTS CHECK FAILED: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
