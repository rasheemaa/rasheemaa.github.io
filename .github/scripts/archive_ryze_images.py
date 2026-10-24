"""Archive Ryze's public article images into the GitHub Pages site.

This is a one-time migration and an idempotent catch-up utility for articles
Ryze might still publish before the canceled subscription expires. No keys,
paid APIs, or Ryze account access are needed.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from import_ryze import sync_articles

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = "https://gwvckixiegkllthleuyt.supabase.co"
PREFIX = ORIGIN + "/storage/v1/object/public/workspace-article-images-public/"
IMAGE_RE = re.compile(
    re.escape(PREFIX)
    + r"(?P<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/"
    + r"(?P<name>(?:featured|body-[0-9a-f]{32})\.jpg)"
)
SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
REPORT = Path(".github/reports/ryze-image-archive.json")
MAX_IMAGE_BYTES = 8_000_000


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_image(data: bytes) -> None:
    if not (4 <= len(data) <= MAX_IMAGE_BYTES):
        raise ValueError("Image is empty or exceeds the 8 MB limit")
    if not (data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9")):
        raise ValueError("Downloaded object is not a complete JPEG")


def fetch_image(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "TheSheemaEdit-ImageArchive/1.0"})
    with urlopen(request, timeout=45) as response:
        final = urlsplit(response.geturl())
        if final.scheme != "https" or final.hostname != "gwvckixiegkllthleuyt.supabase.co":
            raise ValueError("Unexpected image redirect destination")
        mime = response.headers.get_content_type()
        if mime not in {"image/jpeg", "image/jpg", "application/octet-stream"}:
            raise ValueError(f"Unexpected image media type: {mime}")
        body = response.read(MAX_IMAGE_BYTES + 1)
    validate_image(body)
    return body


def read_manifest(root: Path) -> dict:
    path = root / REPORT
    if not path.exists():
        return {"images": {}}
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded.get("images"), dict):
        raise ValueError("Invalid existing image manifest")
    return loaded


def verify(root: Path = ROOT) -> int:
    root = Path(root)
    manifest = read_manifest(root)
    images = manifest["images"]
    if len(images) < 16:
        raise ValueError(f"Expected at least 16 archived images; found {len(images)}")
    for url, item in images.items():
        if not IMAGE_RE.fullmatch(url):
            raise ValueError(f"Unexpected URL in archive: {url}")
        local = item["path"]
        if not local.startswith("/assets/images/ryze/") or ".." in Path(local).parts:
            raise ValueError(f"Unsafe archived image path: {local}")
        file = root / local.lstrip("/")
        data = file.read_bytes()
        validate_image(data)
        if checksum(data) != item["sha256"] or len(data) != item["bytes"]:
            raise ValueError(f"Archived image integrity mismatch: {local}")
    sources = list((root / "blog/data").glob("*.json"))
    generated = list((root / "_edits").glob("ryze-*.md"))
    if len(sources) < 8 or len(generated) < 8:
        raise ValueError("Published article sources or generated pages are missing")
    for file in sources + generated:
        if PREFIX in file.read_text(encoding="utf-8"):
            raise ValueError(f"Still contains Ryze-hosted images: {file.relative_to(root)}")
    print(f"Verified {len(images)} locally hosted, checksummed JPEGs; no Ryze image references remain.")
    return len(images)


def archive(root: Path = ROOT, downloader=fetch_image) -> int:
    root = Path(root)
    manifest = read_manifest(root)
    images = dict(manifest["images"])
    article_sources = sorted((root / "blog/data").glob("*.json"))
    updates: dict[Path, str] = {}
    pending: dict[Path, bytes] = {}

    for source in article_sources:
        raw = source.read_text(encoding="utf-8")
        article = json.loads(raw)
        if article.get("status") != "published":
            continue
        slug = article.get("slug")
        if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
            raise ValueError(f"Unsafe article slug in {source.name}")
        for match in set(IMAGE_RE.finditer(raw)):
            url = match.group(0)
            filename = match.group("name")
            relative = f"/assets/images/ryze/{slug}/{filename}"
            destination = root / relative.lstrip("/")
            if url in images and images[url]["path"] != relative:
                raise ValueError("An archived URL has conflicting local destinations")
            if not destination.exists() and destination not in pending:
                data = downloader(url)
                validate_image(data)
                pending[destination] = data
            else:
                data = pending.get(destination, destination.read_bytes() if destination.exists() else b"")
                validate_image(data)
            images[url] = {"path": relative, "bytes": len(data), "sha256": checksum(data)}
            raw = raw.replace(url, relative)
        if raw != source.read_text(encoding="utf-8"):
            updates[source] = raw

    if not images:
        raise ValueError("No Ryze images found to archive")
    if len(images) < 16:
        raise ValueError(f"Expected 16 baseline images; found only {len(images)}")
    for target, data in pending.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    for source, replacement in updates.items():
        source.write_text(replacement, encoding="utf-8")
    if updates or not (root / REPORT).exists():
        manifest = {
            "source": "Ryze public Supabase article images",
            "recorded_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "images": dict(sorted(images.items())),
        }
        (root / REPORT).parent.mkdir(parents=True, exist_ok=True)
        (root / REPORT).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    count, changes = sync_articles(root)
    print(f"Updated {len(updates)} JSON sources; regenerated {changes} of {count} published pages.")
    verify(root)
    return len(images)


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"archive", "verify"}:
        sys.exit("Usage: archive_ryze_images.py [archive|verify]")
    {"archive": archive, "verify": verify}[sys.argv[1]]()
