import {chromium} from 'playwright';
import fs from 'node:fs';
const origin='https://thesheemaedit.com';
fs.mkdirSync('assets/design-previews',{recursive:true});fs.mkdirSync('.github/reports',{recursive:true});
const browser=await chromium.launch();const results=[];let failures=[];
const routes=[['home','/'],['edit','/posts/im-allowed-to-be-happy-before-im-okay.html'],['about','/about.html'],['shop','/shop/'],['journal','/shop/reflection-journal-product.html'],['planner','/shop/gentle-weekly-planner.html'],['bundle','/shop/reset-bundle.html'],['thanks','/thank-you/'],['offline','/offline.html'],['not-found','/404.html'],['privacy','/what-do-i-say/privacy/']];
// Wait for the newly consolidated public homepage rather than testing a stale deployment.
for(let i=0;i<36;i++){const t=await (await fetch(origin+'/?deploy='+Date.now(),{cache:'no-store'})).text();if(t.includes('home-editorial.css')&&!t.includes('Sparkle ✨'))break;if(i===35)throw new Error('Newest design not deployed');await new Promise(r=>setTimeout(r,10000));}
for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',deviceScaleFactor:1});const page=await context.newPage();
 for(const [name,path] of routes){
 try{
 const response=await page.goto(origin+path+'?design='+Date.now(),{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bg:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily,title:document.querySelector('h1')?.textContent,headingFont:document.querySelector('h1')?getComputedStyle(document.querySelector('h1')).fontFamily:null,oldStyles:[...document.querySelectorAll('link[rel=stylesheet]')].map(e=>e.href).filter(s=>/home-y2k|app-polish|assets\/css\/styles/.test(s)),analytics:!!document.querySelector('script[src*="googletagmanager"]'),canonical:document.querySelector('link[rel=canonical]')?.href}));
 if(state.scrollWidth>width+1)failures.push(`${name} ${width}: horizontal overflow ${state.scrollWidth}`);
 if(state.bg!=='rgb(250, 245, 240)')failures.push(`${name} ${width}: wrong background ${state.bg}`);
 if(state.oldStyles.length)failures.push(`${name}: obsolete stylesheet`);
 if(!state.font.includes('DM Sans'))failures.push(`${name}: wrong body font`);
 if(['home','edit','about','shop'].includes(name))await page.screenshot({path:`assets/design-previews/${name}-${width}.png`,fullPage:true});
 if(name==='home'){
 const featured=await page.locator('.editorial-feature-copy .button').getAttribute('href');state.featured=featured;
 const first=await page.locator('.post-card h3 a').first().getAttribute('href');if(featured!==first)failures.push('Featured edit is not newest card');
 state.filters=[];for(const key of ['mind','motherhood','chronic','lifestyle','all']){await page.locator(`[data-filter="${key}"]`).click();state.filters.push({key,pressed:await page.locator(`[data-filter="${key}"]`).getAttribute('aria-pressed'),visible:await page.locator('.post-card:visible').count()});}
 if(width===390){await page.locator('.menu-toggle').click();state.menu=await page.locator('.site-nav').isVisible();if(!state.menu)failures.push('Mobile menu did not open');await page.screenshot({path:'assets/design-previews/mobile-menu.png'});await page.keyboard.press('Escape');if(await page.locator('.site-nav').isVisible())failures.push('Escape did not close menu');}
 }
 if(['journal','planner','bundle'].includes(name))state.checkout=await page.locator('a[href*="payhip"],a[href*="stripe"]').evaluateAll(els=>els.map(e=>e.href));
 if(name==='shop')state.sparkle=await page.locator('a[href*="sparkle.rasheema-abdullah.workers.dev"]').first().getAttribute('href');
 results.push({name,path,width,status:response.status(),...state});
 }catch(e){failures.push(`${name} ${width}: ${e.message}`)}
 }
 await context.close();
}
await browser.close();fs.writeFileSync('.github/reports/editorial.json',JSON.stringify({checkedAt:new Date().toISOString(),results,failures},null,2));console.log(JSON.stringify({results:results.length,failures}));if(failures.length)process.exitCode=1;
