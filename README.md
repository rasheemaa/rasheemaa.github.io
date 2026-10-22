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

Edit imported articles in Ryze, not in their generated Markdown. Source JSON is excluded from the public site. Imports retain article titles, descriptions, dates, and images, and remove executable HTML and Liquid from article bodies.

Check the importer locally with `python3 -m unittest discover -s .github/scripts -p test_ryze_import.py`. A manual run is also available in GitHub Actions. The separate Ryze hosted copy is hidden from search engines through Blog Studio's SEO settings.
