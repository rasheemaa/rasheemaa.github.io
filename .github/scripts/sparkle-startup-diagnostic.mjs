import { chromium } from 'playwright';

const SITE = `https://thesheemaedit.com/what-do-i-say/?sparkle_startup_diag=${Date.now()}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Sparkle-Startup-Diagnostic/1.0 Chrome'
});

await context.addInitScript(() => {
  try {
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => 2 });
    localStorage.removeItem('wdis_trial_started_at_v2');
    localStorage.removeItem('wdis_history_v1');
    localStorage.setItem('wdis_sparkle_profile_v1', JSON.stringify({
      profile: 'Sparkle Compatible',
      backend: 'wasm',
      at: Date.now()
    }));
  } catch (_) {}
});

const page = await context.newPage();
const failures = [];
const thirdPartyAnalytics = [];

page.on('request', (request) => {
  const url = request.url();
  if (/googletagmanager|google-analytics|analytics\.google\.com|segment\.com|mixpanel|amplitude/i.test(url)) {
    thirdPartyAnalytics.push(url);
  }
});
page.on('requestfailed', (request) => {
  const detail = `${request.resourceType()} ${request.url()} :: ${request.failure()?.errorText || 'unknown failure'}`;
  failures.push(detail);
  console.log('REQUEST_FAILED', detail);
});
page.on('console', (message) => console.log(`BROWSER_${message.type().toUpperCase()}`, message.text()));
page.on('pageerror', (error) => console.log('PAGE_ERROR', error.message));
page.on('worker', (worker) => {
  console.log('WORKER_CREATED', worker.url());
  worker.on('close', () => console.log('WORKER_CLOSED', worker.url()));
});

try {
  const response = await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('PAGE_STATUS', response?.status());
  await page.waitForFunction(() => Boolean(window.Sparkle?.load), null, { timeout: 30_000 });

  const runtime = await page.evaluate(() => ({
    sparkle: document.querySelector('script[src*="sparkle.js"]')?.getAttribute('src') || '',
    app: document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '',
    hasGtag: typeof window.gtag === 'function',
    scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean)
  }));
  console.log('RUNTIME', JSON.stringify(runtime));

  try {
    const result = await page.evaluate(async () => {
      try {
        const loaded = await window.Sparkle.load();
        return { ok: true, loaded };
      } catch (error) {
        return {
          ok: false,
          name: error?.name || '',
          code: error?.code || '',
          message: error?.message || String(error),
          stack: error?.stack || ''
        };
      }
    });
    console.log('SPARKLE_LOAD_RESULT', JSON.stringify(result));
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    console.log('EVALUATE_ERROR', error?.stack || error);
    process.exitCode = 3;
  }

  console.log('ANALYTICS_REQUESTS', JSON.stringify(thirdPartyAnalytics));
  console.log('REQUEST_FAILURES', JSON.stringify(failures));
  if (thirdPartyAnalytics.length) process.exitCode = 4;
} catch (error) {
  console.error('DIAGNOSTIC_FATAL', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
