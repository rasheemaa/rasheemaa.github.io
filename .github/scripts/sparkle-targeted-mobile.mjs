import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

async function waitForProductionAssets() {
  const paths = ['what-do-i-say/styles.css', 'what-do-i-say/sparkle.css'];
  const expected = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
  for (let attempt = 0; attempt < 24; attempt++) {
    const matches = await Promise.all(paths.map(async (path, index) => {
      try {
        const response = await fetch(`https://thesheemaedit.com/${path}?verify=${Date.now()}`, { cache: 'no-store' });
        return response.ok && (await response.text()).trim() === expected[index].trim();
      } catch (_) {
        return false;
      }
    }));
    if (matches.every(Boolean)) {
      console.log('PASS production CSS matches the targeted revision');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error('Pages has not deployed the targeted CSS revision');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await waitForProductionAssets();

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});

try {
  await page.goto(`https://thesheemaedit.com/what-do-i-say/?sparkle_mobile=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });

  const diagnostics = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          minWidth: style.minWidth,
          whiteSpace: style.whiteSpace,
          overflowX: style.overflowX
        };
      })
      .filter((item) => item.right > viewport + 1 || item.left < -1 || item.width > viewport + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 20);
    return {
      innerWidth: viewport,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders
    };
  });

  console.log(`MOBILE_DIAGNOSTICS ${JSON.stringify(diagnostics)}`);
  assert(diagnostics.innerWidth === 390, `Unexpected viewport width: ${diagnostics.innerWidth}`);
  assert(diagnostics.scrollWidth <= diagnostics.innerWidth + 2, `Mobile horizontal overflow remains: ${JSON.stringify(diagnostics)}`);
  assert(diagnostics.offenders.length === 0, `Viewport-crossing elements remain: ${JSON.stringify(diagnostics.offenders)}`);

  const relevantErrors = browserErrors.filter((line) => !/favicon|googletagmanager|google-analytics/i.test(line));
  assert(relevantErrors.length === 0, `Browser errors detected:\n${relevantErrors.join('\n')}`);
  console.log('SPARKLE_MOBILE_TEST_PASS');
} catch (error) {
  console.error('SPARKLE_MOBILE_TEST_FAIL');
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
