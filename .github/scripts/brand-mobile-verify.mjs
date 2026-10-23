import {chromium, webkit} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Check the proposed build on a standard public-repository runner, with no paid APIs.
const origin = 'http://127.0.0.1:4173';
const output = '.github/reports/brand-mobile';
fs.mkdirSync(path.join(output, 'previews'), {recursive: true});
const results = [], failures = [], screenshots = [];
const routes = [
  ['home', '/'],
  ['edit', '/posts/im-allowed-to-be-happy-before-im-okay.html'],
  ['guide', '/best-printable-weekly-planners-for-busy-moms/'],
  ['about', '/about.html'], ['shop', '/shop/'],
  ['journal', '/shop/reflection-journal-product.html'],
  ['planner', '/shop/gentle-weekly-planner.html'],
  ['bundle', '/shop/reset-bundle.html'],
  ['thanks', '/thank-you/'], ['offline', '/offline.html'], ['404', '/404.html'],
];
const check = (condition, message) => { if (!condition) failures.push(message); };
async function save(page, name, fullPage = false) {
  const relative = `previews/${name}.png`;
  await page.screenshot({path: path.join(output, relative), fullPage});
  screenshots.push(relative);
}

for (let attempt = 0; attempt < 20; attempt++) {
  try { if ((await fetch(origin)).ok) break; } catch {}
  if (attempt === 19) throw new Error('The Jekyll preview server did not start.');
  await new Promise(resolve => setTimeout(resolve, 250));
}

for (const [engine, runtime] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await runtime.launch();
  try {
    for (const width of [360, 375, 390, 430, 1280, 1440]) {
      const phone = width < 721;
      const context = await browser.newContext({
        viewport: {width, height: 844}, deviceScaleFactor: 1,
        isMobile: phone, hasTouch: phone, serviceWorkers: 'block',
      });
      // These checks must not inflate Sheema's visitor analytics.
      await context.route(/https:\/\/(www\.)?(googletagmanager|google-analytics)\.com\//, route => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const selectedRoutes = phone ? routes : routes.filter(([name]) => ['home', 'edit', 'about', 'shop'].includes(name));
      for (const [name, route] of selectedRoutes) {
        const label = `${engine} ${name} ${width}`;
        try {
          const response = await page.goto(origin + route, {waitUntil: 'load', timeout: 45000});
          await page.evaluate(() => document.fonts.ready);
          const state = await page.evaluate(() => ({
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            h1: document.querySelector('h1')?.textContent.trim(),
            headings: document.querySelectorAll('h1').length,
            imageErrors: [...document.images].filter(image => {
              const rect = image.getBoundingClientRect();
              return rect.top < innerHeight && rect.bottom > 0 && image.complete && !image.naturalWidth;
            }).map(image => image.getAttribute('src')),
          }));
          check(response?.status() === 200, `${label}: HTTP ${response?.status()}`);
          check(state.scrollWidth <= width + 1, `${label}: horizontal overflow ${state.scrollWidth}`);
          check(state.headings === 1, `${label}: expected one main heading, found ${state.headings}`);
          check(state.imageErrors.length === 0, `${label}: broken visible images ${state.imageErrors.join(', ')}`);

          if (name === 'home') {
            const home = await page.evaluate(() => {
              const button = document.querySelector('.editorial-feature-copy .button');
              const rect = button.getBoundingClientRect();
              return {
                feature: button.getAttribute('href'),
                firstStory: document.querySelector('#latest .post-card h3 a').getAttribute('href'),
                button: {bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height},
                storyCount: document.querySelectorAll('#latest .post-card').length,
                guideCount: document.querySelectorAll('#guides .guide-card').length,
                guideDestination: document.querySelector('a[href="#guides"]')?.getAttribute('href'),
                coverStyles: [...document.querySelectorAll('#latest .post-art')].map(element => {
                  const style = getComputedStyle(element);
                  return {repeat: style.backgroundRepeat, size: style.backgroundSize};
                }),
                columns: getComputedStyle(document.querySelector('.editorial-feature-inner')).gridTemplateColumns.split(' ').length,
              };
            });
            Object.assign(state, home);
            check(home.feature.startsWith('/posts/'), `${label}: the feature must lead to a personal essay`);
            check(home.feature === home.firstStory, `${label}: feature and first personal story differ`);
            check(home.guideCount > 0 && home.guideDestination === '#guides', `${label}: guides are not discoverable`);
            check(home.columns === (phone ? 1 : 2), `${label}: wrong hero column count ${home.columns}`);
            check(home.button.height >= 44 && home.button.left >= 0 && home.button.right <= width, `${label}: reading button is clipped or too small`);
            if (phone) check(home.button.bottom <= 844, `${label}: reading button is below the first screen (${home.button.bottom})`);
            check(home.coverStyles.every(style => style.repeat.split(',').every(value => value.trim() === 'no-repeat') && parseFloat(style.size) <= 80), `${label}: cover artwork repeats or is oversized`);

            if (phone) {
              await save(page, `home-${engine}-${width}`);
              if (width === 390) await save(page, `home-full-${engine}-${width}`, true);
              for (const key of ['mind', 'motherhood', 'chronic', 'lifestyle', 'all']) {
                const filter = page.locator(`[data-filter="${key}"]`);
                await filter.click();
                check(await filter.getAttribute('aria-pressed') === 'true', `${label}: ${key} filter did not select`);
                const visible = await page.locator('#latest .post-card:visible').evaluateAll(cards => cards.map(card => card.dataset.category));
                check(visible.length > 0, `${label}: ${key} filter returned no stories`);
                check(key === 'all' || visible.every(category => category === key), `${label}: ${key} filter contains another topic`);
                check(await page.locator('#guides .guide-card:visible').count() === home.guideCount, `${label}: a story filter hid guides`);
              }
              await page.getByRole('button', {name: 'Open navigation menu', exact: true}).click();
              check(await page.locator('.site-nav').isVisible(), `${label}: phone menu did not open`);
              check(await page.getByRole('button', {name: 'Close navigation menu', exact: true}).getAttribute('aria-expanded') === 'true', `${label}: menu state is inaccessible`);
              if (width === 390) await save(page, `menu-${engine}-${width}`);
              await page.keyboard.press('Escape');
              check(!await page.locator('.site-nav').isVisible(), `${label}: Escape did not close the phone menu`);
              await page.getByRole('button', {name: 'Open navigation menu', exact: true}).click();
              await page.locator('.site-nav').getByRole('link', {name: 'The edits', exact: true}).click();
              check(!await page.locator('.site-nav').isVisible(), `${label}: choosing a page did not close the menu`);
            } else if (width === 1440) {
              await save(page, `home-${engine}-${width}`);
            }
          } else if (name === 'guide' || name === 'edit') {
            const article = await page.evaluate(() => ({
              back: document.querySelector('.back-link').getAttribute('href'),
              more: document.querySelector('.article-end .button').getAttribute('href'),
              readingWidth: document.querySelector('.article-layout').getBoundingClientRect().width,
            }));
            Object.assign(state, article);
            const destination = name === 'guide' ? '/#guides' : '/#latest';
            check(article.back === destination && article.more === destination, `${label}: article returns to the wrong section`);
            check(article.readingWidth <= 760, `${label}: reading column is too wide`);
          }
          if (phone && width === 390 && ['edit', 'guide', 'about', 'shop', 'journal', 'planner', 'bundle'].includes(name)) {
            await save(page, `${name}-${engine}-${width}`);
          }
          results.push({engine, name, width, status: response?.status(), ...state});
        } catch (error) {
          failures.push(`${label}: ${error.message}`);
          await save(page, `failure-${name}-${engine}-${width}`).catch(() => {});
        }
      }
      await context.close();
    }
  } finally { await browser.close(); }
}

const report = {checkedAt: new Date().toISOString(), revision: process.env.GITHUB_SHA || null, results, failures, screenshots};
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({checks: results.length, screenshots: screenshots.length, failures}, null, 2));
if (failures.length) process.exitCode = 1;
