const { chromium } = require('playwright');
const URL = process.env.AGENTFLOW_URL || 'http://localhost:4173/';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERR '+e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.btn-example', { timeout: 10000 });
  await page.click('.btn-example');
  await page.waitForTimeout(1000);
  const info = await page.evaluate(() => {
    const mods = Array.from(document.querySelectorAll('.module'));
    return {
      moduleCount: mods.length,
      labels: mods.map(m => m.querySelector('.module-label')?.textContent),
      rfNodeCount: document.querySelectorAll('.react-flow__node').length,
    };
  });
  console.log('console errors:', errs.slice(0,5));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
