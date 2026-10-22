import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from import_ryze import sync_articles


class RyzeImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "blog/data").mkdir(parents=True)
        (self.root / "_edits").mkdir()
        self.data = {
            "slug": "a-gentle-pause", "title": 'A pause: "your own pace"',
            "body_html": "<h2>A moment for you</h2><p>A small, optional reflection.</p>",
            "meta_title": "A gentle pause", "meta_description": 'Space for you & your "real life".',
            "published_at": "2026-10-22T12:00:00Z", "status": "published",
        }

    def write_source(self):
        source = self.root / "blog/data/a-gentle-pause.json"
        source.write_text(json.dumps(self.data), encoding="utf-8")
        return source

    def output(self):
        return (self.root / "_edits/ryze-a-gentle-pause.md").read_text()

    def test_route_metadata_and_idempotent_updates(self):
        self.write_source()
        self.assertEqual(sync_articles(self.root), (1, 1))
        self.assertIn('permalink: "/a-gentle-pause/"', self.output())
        self.assertIn('seo_title: "A gentle pause"', self.output())
        self.assertIn("<h2>A moment for you</h2>", self.output())
        self.assertEqual(sync_articles(self.root), (1, 0))

    def test_does_not_execute_imported_html_or_liquid(self):
        self.data["body_html"] = '<p onclick="bad()">Hello {{ site.title }} {% include secret %}</p><script>bad()</script><a href="javascript:bad()">link</a><img src="https://example.com/cover.jpg" onerror="bad()" alt="A pause">'
        self.write_source()
        sync_articles(self.root)
        result = self.output()
        for text in ("<script", "onclick", "onerror", "javascript:", "{{", "{%"):
            self.assertNotIn(text, result)
        self.assertIn('alt="A pause"', result)

    def test_rejects_slug_mismatch_and_reserved_routes(self):
        self.data["slug"] = "../about"
        self.write_source()
        with self.assertRaises(ValueError):
            sync_articles(self.root)
        self.data["slug"] = "a-gentle-pause"
        self.write_source()
        (self.root / "a-gentle-pause.html").write_text("Existing page")
        with self.assertRaises(ValueError):
            sync_articles(self.root)

    def test_invalid_batch_leaves_existing_pages_unchanged(self):
        self.write_source()
        sync_articles(self.root)
        before = self.output()
        self.data["title"] = "Changed"
        self.write_source()
        (self.root / "blog/data/z-broken.json").write_text("{")
        with self.assertRaises(ValueError):
            sync_articles(self.root)
        self.assertEqual(self.output(), before)

    def test_unpublish_removes_only_managed_pages(self):
        source = self.write_source()
        personal = self.root / "_edits/ryze-personal.md"
        personal.write_text("A personal edit")
        sync_articles(self.root)
        source.unlink()
        self.assertEqual(sync_articles(self.root), (0, 1))
        self.assertTrue(personal.exists())

    def test_refuses_to_overwrite_a_personal_edit(self):
        self.write_source()
        (self.root / "_edits/ryze-a-gentle-pause.md").write_text("Personal writing")
        with self.assertRaises(ValueError):
            sync_articles(self.root)

    def test_drafts_are_not_published(self):
        self.data["status"] = "draft"
        self.write_source()
        self.assertEqual(sync_articles(self.root), (0, 0))


if __name__ == "__main__":
    unittest.main()
