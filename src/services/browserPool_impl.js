const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

let browser = null;
let maxConcurrency = parseInt(process.env.POOL_MAX_CONCURRENCY || '2', 10);
let running = 0;
const queue = [];

async function ensureBrowser() {
  if (browser) return browser;
  const launchOptions = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  // Require an executable path when using puppeteer-core. Provide a clear error if missing.
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  } else {
    // Attempt to auto-detect common Chrome/Chromium locations on Windows, WSL and Linux so
    // developers don't always have to manually export PUPPETEER_EXECUTABLE_PATH.
    const candidates = [
      // Windows common install paths (Git Bash/WSL-friendly forward slashes)
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      // WSL / mounted Windows path
      '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
      '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      // Linux common paths
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      // macOS (rare for dev on Windows but harmless to include)
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          launchOptions.executablePath = c;
          break;
        }
      } catch (e) {}
    }
    if (!launchOptions.executablePath) {
      // Prefer throwing a controlled error that routes can catch instead of letting puppeteer assert and
      // potentially surface an uncaught exception. This returns a descriptive error for easier debugging.
      throw new Error('PUPPETEER_EXECUTABLE_PATH is not set. Set it to your Chrome/Chromium binary path (e.g. /c/Program Files/Google/Chrome/Application/chrome.exe)');
    }
  }

  try {
    browser = await puppeteer.launch(launchOptions);
    return browser;
  } catch (err) {
    // Wrap error with more context for logs
    const e = new Error(`Failed to launch Puppeteer at '${launchOptions.executablePath}': ${err && err.message ? err.message : err}`);
    e.stack = err && err.stack ? err.stack : e.stack;
    throw e;
  }
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
