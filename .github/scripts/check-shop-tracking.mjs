import {chromium} from 'playwright';
import fs from 'node:fs';
const origin='https://thesheemaedit.com';
for(let i=0;i<48;i++){
 const t=await(await fetch(origin+'/assets/js/main.js?verify='+Date.now())).text();
 if(t.includes('checkout_click'))break;
 if(i===47)throw Error('Updated tracking not deployed');
 await new Promise(r=>setTimeout(r,10000));
}
const browser=await chromium.launch();
const ctx=await browser.newContext({serviceWorkers:'block'});
// Prevent all test data from reaching analytics. Inspect the actual event queue instead.
await ctx.route(/googletagmanager\.com|google-analytics\.com/,route=>route.fulfill({status:200,body:''}));
const page=await ctx.newPage();const results=[];
for(const path of ['/shop/','/shop/reflection-journal-product.html','/shop/gentle-weekly-planner.html','/shop/reset-bundle.html']){
 await page.goto(origin+path+'?tracking_check=1',{waitUntil:'networkidle'});
 const queued=await page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x)));
 if(path==='/shop/'&&queued.filter(x=>x[0]==='event'&&x[1]==='shop_view').length!==1)throw Error('Shop view missing or duplicate');
 const buttons=page.locator('a[href^="https://payhip.com/b/"]');const count=await buttons.count();
 if(!count)throw Error('No checkout destination on '+path);
 await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a[href^="https://payhip.com/b/"]'))e.preventDefault()},true));
 for(let i=0;i<count;i++)await buttons.nth(i).click();
 const events=await page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='checkout_click'));
 if(events.length!==count)throw Error('Checkout count mismatch '+path);
 if(events.some(x=>!x[2].checkout_destination.startsWith('https://payhip.com/b/')))throw Error('Wrong destination');
 results.push({path,checkoutButtons:count,checkoutEvents:events.length,shopView:path==='/shop/'});
}
await page.goto(origin+'/?tracking_check=1',{waitUntil:'networkidle'});
await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a[href="/shop/"]'))e.preventDefault()},true));
await page.locator('a[href="/shop/"]').first().click();
const shopEntries=await page.evaluate(()=>Array.from(window.dataLayer||[],x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='shop_entry_click').length);
if(shopEntries!==1)throw Error('Shop entry missing or duplicate');
await browser.close();fs.mkdirSync('.github/reports',{recursive:true});
fs.writeFileSync('.github/reports/shop-tracking.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:true,testAnalyticsBlocked:true,shopEntries,results},null,2));
console.log(JSON.stringify(results));
