import { chromium } from 'playwright';

const SITE = `https://thesheemaedit.com/what-do-i-say/?sparkle_startup_diag=${Date.now()}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 SparkleStartupDiagnostic/2.0'
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

  const NativeWorker = window.Worker;
  window.Worker = class DiagnosticWorker extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      console.log('[sparkle-diag] WORKER_CONSTRUCTED', String(url), JSON.stringify(options || {}));
      this.addEventListener('error', (event) => {
        console.error('[sparkle-diag] WORKER_ERROR', JSON.stringify({
          message: event.message || '',
          filename: event.filename || '',
          lineno: event.lineno || 0,
          colno: event.colno || 0
        }));
      });
      this.addEventListener('messageerror', () => console.error('[sparkle-diag] WORKER_MESSAGE_ERROR'));
    }
  };
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
page.on('response', (response) => {
  const url = response.url();
  if (/sparkle-worker|jsdelivr|huggingface|hf\.co/i.test(url)) {
    console.log('RESOURCE', response.status(), response.request().resourceType(), url);
  }
});
page.on('requestfailed', (request) => {
  const detail = `${request.resourceType()} ${request.url()} :: ${request.failure()?.errorText || 'unknown failure'}`;
  failures.push(detail);
  console.log('REQUEST_FAILED', detail);
});
page.on('console', (message) => console.log(`BROWSER_${message.type().toUpperCase()}`, message.text()));
page.on('pageerror', (error) => console.log('PAGE_ERROR', error.message));

try {
  const response = await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('PAGE_STATUS', response?.status());
  await page.waitForFunction(() => Boolean(window.Sparkle?.generate), null, { timeout: 30_000 });

  const runtime = await page.evaluate(() => ({
    sparkle: document.querySelector('script[src*="sparkle.js"]')?.getAttribute('src') || '',
    app: document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '',
    hasGtag: typeof window.gtag === 'function',
    scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean)
  }));
  console.log('RUNTIME', JSON.stringify(runtime));

  await page.locator('#prompt').fill('Tell Priya I need Friday off for a personal matter and ask her to confirm she received this.');
  await page.locator('#generate').click();

  await page.waitForFunction(() => {
    const errorBox = document.querySelector('#ai-error');
    const status = document.querySelector('#sparkle-status-text')?.textContent || '';
    const output = document.querySelector('#result')?.textContent || '';
    return (errorBox && !errorBox.hidden)
      || /finished|ready|checking|writing|downloading|loading/i.test(status)
      || (output && !output.includes('Sparkle message will appear here'));
  }, null, { timeout: 60_000 });

  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    status: document.querySelector('#sparkle-status-text')?.textContent?.trim() || '',
    errorVisible: !document.querySelector('#ai-error')?.hidden,
    error: document.querySelector('#ai-error-message')?.textContent?.trim() || '',
    busy: document.querySelector('#message-form')?.getAttribute('aria-busy') || '',
    output: document.querySelector('#result')?.textContent?.trim() || ''
  }));
  console.log('STATE', JSON.stringify(state));
  console.log('ANALYTICS_REQUESTS', JSON.stringify(thirdPartyAnalytics));
  console.log('REQUEST_FAILURES', JSON.stringify(failures));

  if (state.errorVisible || thirdPartyAnalytics.length) process.exitCode = 2;
} catch (error) {
  console.error('DIAGNOSTIC_FATAL', error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
