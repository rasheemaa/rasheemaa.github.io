"""Exercise the complete Ryze -> Jekyll -> public metadata path in CI."""
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

from import_ryze import sync_articles

ROOT = Path(__file__).resolve().parents[2]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.links, self.scripts = {}, {}, []
        self.current_script = None
        self.asides = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content")
        elif tag == "link":
            self.links[attrs.get("rel")] = attrs.get("href")
        elif tag == "script" and attrs.get("type") == "application/ld+json":
            self.current_script = ""
        elif tag == "aside":
            self.asides += 1

    def handle_data(self, text):
        if self.current_script is not None:
            self.current_script += text

    def handle_endtag(self, tag):
        if tag == "script" and self.current_script is not None:
            self.scripts.append(json.loads(self.current_script))
            self.current_script = None


def prepare():
    folder = ROOT / "blog/data"
    folder.mkdir(parents=True, exist_ok=True)
    data = {
        "slug": "ryze-integration-check", "title": "A small & gentle pause",
        "meta_title": "Reflection at your own pace",
        "meta_description": 'A little room for you & your "real life".',
        "body_html": "<h2>Take a breath</h2><p>A reflection at your own pace.</p>",
        "status": "published", "published_at": "2000-01-01T12:00:00Z",
        "updated_at": "2000-01-02T12:00:00Z",
        "image": {"url": "https://example.com/cover.jpg", "alt": "A quiet moment"},
    }
    (folder / (data["slug"] + ".json")).write_text(json.dumps(data))
    future = dict(data, slug="ryze-future-check", published_at="2999-01-01T12:00:00Z", updated_at="2999-01-01T12:00:00Z")
    (folder / (future["slug"] + ".json")).write_text(json.dumps(future))
    sync_articles(ROOT)


def verify():
    built = ROOT / "_site"
    html = (built / "ryze-integration-check/index.html").read_text()
    page = Page()
    page.feed(html)
    assert page.links["canonical"] == "https://thesheemaedit.com/ryze-integration-check/"
    assert page.meta["description"] == 'A little room for you & your "real life".'
    assert page.meta["og:image"] == "https://example.com/cover.jpg"
    assert page.meta["og:image:alt"] == "A quiet moment"
    assert page.scripts and page.asides == 0
    assert "Reflection at your own pace | The Sheema Edit" in html
    assert 'class="site-shell article-layout article-layout-solo"' in html
    assert 'alt="A quiet moment"' in html
    assert not (built / "blog/data/ryze-integration-check.json").exists()
    for name in ("index.html", "feed.xml", "sitemap.xml"):
        content = (built / name).read_text()
        assert "/ryze-integration-check/" in content, name
        assert "/ryze-future-check/" not in content, name
    ET.fromstring((built / "feed.xml").read_text().strip())
    sitemap = ET.fromstring((built / "sitemap.xml").read_text().strip())
    articles = [node for node in sitemap if any("ryze-integration-check" in (child.text or "") for child in node)]
    assert any(child.text == "2000-01-02" for child in articles[0])
    print("Complete Ryze publication, images, metadata, feed, sitemap and future-date checks passed.")


if __name__ == "__main__":
    {"prepare": prepare, "verify": verify}[sys.argv[1]]()
