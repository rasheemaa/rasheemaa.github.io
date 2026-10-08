import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const SITE = 'https://thesheemaedit.com/community/';
const sha = process.env.GITHUB_SHA || 'manual';
let ready = false;
for (let attempt = 0; attempt < 28; attempt++) {
  try {
    const res = await fetch(SITE + '?visual_ci=' + sha + '&attempt=' + attempt, { cache: 'no-store' });
    const html = await res.text();
    if (res.ok && html.includes('community-reference.css?v=4') &&
        html.includes('community-reference.js?v=4') && html.includes('reference-bottom-nav')) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 10000));
}
assert(ready, 'The updated Community UI has not reached GitHub Pages');
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1, isMobile:true,hasTouch:true,serviceWorkers:'block'});
const errors = [];
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.goto(SITE + '?visual_ci=' + sha, {waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#community-preview-list .member-post-card', {timeout:45000});
await page.waitForTimeout(1600);
assert.equal(await page.locator('#community-preview-list .member-post-card').count(), 3, 'Public guests only preview three posts');
assert(await page.locator('.reference-app-header').isVisible(), 'Compact Community app header renders');
assert(await page.locator('.reference-stories').isVisible(), 'Story bubbles render');
assert(await page.locator('.reference-bottom-nav').isVisible(), 'Fixed bottom navigation renders on mobile');
assert.equal(await page.locator('#profile-avatar-input').count(), 1, 'Member avatar photo selector is present');
assert.equal(await page.locator('#reference-follower-count').count(), 1, 'Real follower counter is present');
assert.equal(await page.locator('#community-profile-form').count(), 1, 'Existing verified profile edit form retained');
const header = await page.locator('.reference-app-header').boundingBox();
const story = await page.locator('.reference-stories').boundingBox();
const bottom = await page.locator('.reference-bottom-nav').boundingBox();
const media = await page.locator('#community-preview-list .sparkle-seed-media-file').first().boundingBox();
assert(header && header.height < 90 && header.y <= 5, 'Mobile header is compact');
assert(story && story.height > 65, 'Story circles occupy visible space');
assert(bottom && bottom.y > 700 && bottom.height < 140, 'Bottom nav stays at foot of screen');
assert(media && media.width >= 290 && media.height >= 170, 'Dog post displays as a proper image-first card');
const actions = await page.locator('#community-preview-list .member-post-actions').first().boundingBox();
assert(actions && actions.y + actions.height < bottom.y, 'Reactions remain visible above fixed mobile navigation');
assert.equal(await page.locator('#member-feed-section').isVisible(), false, 'Full member feed remains gated');
assert.equal(errors.length, 0, 'No runtime page errors: ' + errors.join('; '));
const screenshot = await page.screenshot({animations:'disabled'});
console.log('COMMUNITY_MOBILE_SCREENSHOT_START');
console.log(screenshot.toString('base64'));
console.log('COMMUNITY_MOBILE_SCREENSHOT_END');
console.log(JSON.stringify({status:'passed',header,story,bottom,media,previewCount:3,pageErrors:errors}));
await page.getByRole('button',{name:'My Profile'}).last().click();
await assert.doesNotReject(async()=>await page.locator('#community-auth-dialog').waitFor({state:'visible',timeout:10000}));
console.log('Guest profile action correctly requests sign-in.');
await browser.close();
