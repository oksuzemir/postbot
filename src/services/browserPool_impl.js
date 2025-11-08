const puppeteer = require('puppeteer-core');

let browser = null;
let maxConcurrency = parseInt(process.env.POOL_MAX_CONCURRENCY || '2', 10);
let running = 0;
const queue = [];

async function ensureBrowser() {
  if (browser) return browser;
  const launchOptions = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  browser = await puppeteer.launch(launchOptions);
  return browser;
}

async function acquirePage() {
  await ensureBrowser();
  if (running < maxConcurrency) {
    running++;
    const page = await browser.newPage();
    return page;
  }
  return await new Promise((resolve, reject) => {
    queue.push({ resolve, reject });
  });
}

async function releasePage(page) {
  try {
    await page.close();
  } catch (e) {}
  running--;
  if (queue.length > 0) {
    const waiter = queue.shift();
    running++;
    try {
      const p = await browser.newPage();
      waiter.resolve(p);
    } catch (e) {
      waiter.reject(e);
    }
  }
}

async function shutdown() {
  try {
    if (browser) await browser.close();
  } catch (e) {}
  browser = null;
}

module.exports = { acquirePage, releasePage, shutdown };
