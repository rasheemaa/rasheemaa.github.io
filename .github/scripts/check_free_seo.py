"""Free, read-only SEO health checks for The Sheema Edit.

Run "source" in pull requests and "live" after publishing. The referring
backlink is informational; another publisher may remove it at any time.
"""
from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from archive_ryze_images import verify as verify_images

ROOT = Path(__file__).resolve().parents[2]
SITE = "https://thesheemaedit.com"
BACKLINK = "https://trunutra.com/blogs/blog/can-stress-supplements-help-with-panic-attacks"


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.in_title = False
        self.description = None
        self.canonical = None
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        elif tag == "meta" and attrs.get("name") == "description":
            self.description = attrs.get("content")
        elif tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        elif tag == "img":
            self.images.append(attrs.get("src", ""))

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.append(dict(attrs).get("href", ""))


def published():
    results = []
    for path in sorted((ROOT / "blog/data").glob("*.json")):
        article = json.loads(path.read_text(encoding="utf-8"))
        if article.get("status") == "published":
            results.append((path, article))
    if len(results) < 8:
        raise AssertionError(f"Expected at least 8 published articles, found {len(results)}")
    return results


def check_source():
    count = verify_images(ROOT)
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    assert "Sitemap: https://thesheemaedit.com/sitemap.xml" in robots
    assert "Disallow: /" not in robots
    assert "site.edits" in sitemap and "edit.url" in sitemap
    for path, article in published():
        slug = article["slug"]
        output = ROOT / "_edits" / f"ryze-{slug}.md"
        assert output.exists(), f"Missing published page for {slug}"
        page = output.read_text(encoding="utf-8")
        assert f'permalink: "/{slug}/"' in page, slug
        assert article.get("meta_description"), f"Missing description: {slug}"
        image = article.get("image", {}).get("url")
        assert isinstance(image, str) and image.startswith("/assets/images/ryze/"), slug
        assert image in page, f"Image missing from generated page: {slug}"
        assert "gwvckixiegkllthleuyt.supabase.co" not in page, slug
    print(f"Source SEO checks passed for {len(published())} published articles and {count} local images.")


def fetch(url, max_bytes=4_000_000):
    req = Request(url, headers={"User-Agent": "TheSheemaEditFreeSEOCheck/1.0"})
    with urlopen(req, timeout=30) as response:
        if response.status != 200:
            raise AssertionError(f"HTTP {response.status} for {url}")
        body = response.read(max_bytes + 1)
        if len(body) > max_bytes:
            raise AssertionError(f"Response too large: {url}")
        return body


def check_live():
    robots = fetch(SITE + "/robots.txt").decode("utf-8")
    assert "Sitemap: " + SITE + "/sitemap.xml" in robots
    assert "Disallow: /" not in robots
    xml = ET.fromstring(fetch(SITE + "/sitemap.xml"))
    locs = {node.text for node in xml.iter() if node.tag.endswith("loc")}
    for _path, article in published():
        url = f"{SITE}/{article['slug']}/"
        assert url in locs, f"URL missing from sitemap: {url}"
        parser = Head()
        parser.feed(fetch(url).decode("utf-8"))
        assert parser.title.strip(), f"Missing title: {url}"
        assert parser.description and len(parser.description.strip()) > 25, url
        assert parser.canonical == url, f"Wrong canonical: {url}"
        featured = article["image"]["url"]
        assert featured in parser.images, f"Cover not local or missing: {url}"
        for image in parser.images:
            if image.startswith("/assets/images/ryze/"):
                data = fetch(SITE + image, 8_000_000)
                assert data.startswith(b"\xff\xd8"), f"Image is not a JPEG: {image}"
    print(f"Live SEO checks passed for {len(published())} pages, local images, robots and sitemap.")

    try:
        links = Links()
        links.feed(fetch(BACKLINK).decode("utf-8"))
        found = any(
            (urlsplit(href).hostname or "").lower() == "thesheemaedit.com"
            for href in links.hrefs
        )
        if found:
            print("BACKLINK: TruNutra still links to The Sheema Edit.")
        else:
            print("BACKLINK WARNING: No link to The Sheema Edit found on TruNutra.")
    except Exception as exc:
        print(f"BACKLINK WARNING: Publisher page could not be checked: {exc}")


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"source", "live"}:
        sys.exit("Usage: check_free_seo.py [source|live]")
    {"source": check_source, "live": check_live}[sys.argv[1]]()
