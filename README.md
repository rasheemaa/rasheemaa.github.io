# The Sheema Edit

Official website: https://thesheemaedit.com/

The Sheema Edit is an independent personal blog created by Rasheema Abdullah, also known as Sheema. It covers mental wellness, unmasking, motherhood, chronic illness, lifestyle, beauty, family life, and funny real life stories.

## Creator

Rasheema Abdullah, known online as Sheema, is the creator of The Sheema Edit.

Official profiles:

* TikTok: https://www.tiktok.com/@_rasheemaa
* Instagram: https://www.instagram.com/_rasheemaa/

## What the website includes

* Personal essays called “Edits”
* Stories about mental wellness, unmasking, motherhood, chronic illness, lifestyle, beauty, family life, and humor
* A digital shop called Shop The Edit
* The Sheema Edit Reflection Journal
* Gentle Weekly Planner
* Reset Bundle
* A one time “Support The Edit” option
* RSS feed and XML sitemap
* Responsive mobile design

## Official pages

* Home: https://thesheemaedit.com/
* About: https://thesheemaedit.com/about.html
* Shop: https://thesheemaedit.com/shop/
* RSS: https://thesheemaedit.com/feed.xml
* Sitemap: https://thesheemaedit.com/sitemap.xml

## Publishing

The site is published from this public GitHub repository through GitHub Pages. New Edits are added to the site and included in the RSS feed and sitemap.

## Ownership

The canonical identity relationship is: Rasheema Abdullah = Sheema = creator of The Sheema Edit at thesheemaedit.com.

All writing, branding, and original visual assets are copyright Rasheema Abdullah / Sheema. All rights reserved.

## Ryze article publishing

Ryze publishes JSON files to `blog/data` on `main`. Its Blog URL and the publishing override are both `https://thesheemaedit.com`. The Publish Ryze articles workflow validates those files and creates managed collection entries at `_edits/ryze-<slug>.md`, with public URLs at `/<slug>/`. GitHub Pages redirects the extensionless link Ryze displays to that address. Existing personal Edits keep their `/posts/<name>.html` addresses.

The workflow explicitly requests a Pages rebuild after committing generated pages because commits made with GITHUB_TOKEN do not trigger a Pages build automatically. Republish an article in Ryze to update its existing JSON file and page. Removing a JSON file or changing its status away from published removes only the managed page; personal Edits are preserved. Scheduled entries are omitted from the homepage, RSS feed, and sitemap until their dates.

The homepage feature and The latest edits section lead with personal essays. Imported articles use their existing `ryze_source` field to appear in The little life guides section, linked near the top of the homepage. New guide publications do not displace Sheema's personal writing. Both kinds of article remain in the RSS feed and sitemap.

Until the canceled Ryze access ends, Ryze may still update JSON files. After that, edit imported articles in `blog/data/*.json` using GitHub; never edit their generated Markdown directly. Run `python3 .github/scripts/import_ryze.py` to regenerate pages. Source JSON is excluded from the public site. Imports retain article titles, descriptions, dates, and locally hosted images, and remove executable HTML and Liquid from article bodies.

Check the importer locally with `python3 -m unittest discover -s .github/scripts -p test_ryze_import.py`. A manual run is also available in GitHub Actions. The separate Ryze hosted copy is hidden from search engines through Blog Studio's SEO settings.

## Visual identity

Keep the established editorial page structure and readable Playfair Display and DM Sans typography. The Sheema Edit's personal identity comes through in cream, pink and lilac surfaces, plum text, small sparkle details and the handwritten With Love, Sheema signature. Shared styles live in `assets/css/editorial.css`; homepage refinements live in `assets/css/home-editorial.css`. Update stylesheet versions and the service worker cache together when changing the presentation.

## Free website operation

The public site uses GitHub Pages and static files. Writing and publishing personal Edits does not require Ryze, a paid CMS, or a paid API: add Markdown with front matter to `_edits` using GitHub, or use the existing editor. Ryze is an optional external authoring service; the site and already published articles continue working without it. Its subscription is separate from hosting.

Keep `thesheemaedit.com`, as requested by Sheema. Custom domain registration and renewal remain separate from the free hosting. This repository's layout checks use standard `ubuntu-latest` runners for a public repository, open source browser tests and one-day diagnostic artifacts. Do not add paid testing services, larger runners, paid AI APIs or new subscriptions.

## Free SEO maintenance after canceling Ryze

The eight already published Ryze articles and their 16 images are retained in this GitHub repository. Their image URLs point to `assets/images/ryze`, not the former Ryze Supabase storage. The image manifest at `.github/reports/ryze-image-archive.json` contains SHA-256 hashes and the original public image URLs. `archive_ryze_images.py` can archive any further published Ryze images before access ends; the free scheduled workflow also checks for updates.

The original seven keyword estimates and one known referring backlink are documented in `.github/reports/ryze-seo-baseline-20261023.json`. Weekly `Free SEO health checks` inspect the publicly available sitemap, articles, metadata, images and the reported referring backlink. A missing third-party backlink generates a warning, not an artificial replacement or a paid outreach purchase. Check Google Search Console directly for actual Google searches, indexing, and performance; this independent Google account is not part of the Ryze subscription.

The planned Ryze publishing calendar is not equivalent to published site content. Nothing in these checks automatically generates the remaining unpublished articles. Existing GitHub Pages hosting continues to be free within GitHub's applicable public-repository limits; custom domain registration/renewal remains a separate cost.
