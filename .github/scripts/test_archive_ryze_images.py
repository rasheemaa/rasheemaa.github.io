"""Offline contract tests for the image archive and URL rewrite."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import unittest

from archive_ryze_images import PREFIX, archive, verify


class ImageArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "blog/data").mkdir(parents=True)
        (self.root / "_edits").mkdir()
        self.urls = []
        for number in range(8):
            slug = f"guide-{number}"
            image_id = f"{number + 1:08x}-aaaa-bbbb-cccc-dddddddddddd"
            featured = f"{PREFIX}{image_id}/featured.jpg"
            inline = f"{PREFIX}{image_id}/body-{number:032x}.jpg"
            self.urls.extend((featured, inline))
            source = {
                "slug": slug, "title": f"Guide {number}",
                "status": "published", "published_at": "2026-10-22T12:00:00Z",
                "body_html": f'<h2>Guide</h2><p>Useful words <img src="{inline}" alt="Illustration"></p>',
                "body_markdown": f"![Illustration]({inline})",
                "image": {"url": featured, "alt": "Cover"},
            }
            (self.root / "blog/data" / f"{slug}.json").write_text(json.dumps(source))

    @staticmethod
    def fake_download(url):
        return b"\xff\xd8" + url.encode("utf-8") + b"\xff\xd9"

    def test_archive_is_complete_and_idempotent(self):
        self.assertEqual(archive(self.root, downloader=self.fake_download), 16)
        self.assertEqual(verify(self.root), 16)
        for source in (self.root / "blog/data").glob("*.json"):
            self.assertNotIn(PREFIX, source.read_text())
            self.assertIn("/assets/images/ryze/", source.read_text())
        self.assertEqual(len(list((self.root / "assets/images/ryze").rglob("*.jpg"))), 16)

        def should_not_download(_url):
            raise AssertionError("An archived image was downloaded again")
        self.assertEqual(archive(self.root, downloader=should_not_download), 16)

    def test_invalid_download_does_not_change_source_files(self):
        first = self.root / "blog/data/guide-0.json"
        before = first.read_text()
        with self.assertRaises(ValueError):
            archive(self.root, downloader=lambda _url: b"<html>error</html>")
        self.assertEqual(first.read_text(), before)
        self.assertFalse((self.root / ".github/reports/ryze-image-archive.json").exists())


if __name__ == "__main__":
    unittest.main()
