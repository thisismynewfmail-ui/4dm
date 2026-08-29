// Shared Playwright harness for the 4D-MC suites.
//
//   python3 -m http.server 8123 &
//   node test/functional.mjs
//
// Override CHROME_PATH and BASE_URL if your setup differs.

// Resolve Playwright from the project, or from a global install via
// PLAYWRIGHT_PATH (ESM ignores NODE_PATH, so this has to be explicit). ESM has
// no directory imports either, so point it at the entry file:
//   PLAYWRIGHT_PATH=/usr/lib/node_modules/playwright/index.mjs
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  const alt = process.env.PLAYWRIGHT_PATH;
  if (!alt) {
    console.error('playwright not found. Run `npm install`, or point PLAYWRIGHT_PATH at a global\n  install\'s index.mjs.');
    process.exit(2);
  }
  ({ chromium } = await import(alt));
}

export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8123/index.html';
const CHROME_PATH = process.env.CHROME_PATH || undefined;

export async function launch(viewport = { width: 1280, height: 760 }) {
  const errors = [];
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    args: [
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
  return { browser, page, errors };
}

/** Boot the menu, create a fresh world with `seed`, and wait for it to load. */
export async function newWorld(page, seed, name = 'Test World', waitMs = 22000) {
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.click('text=SINGLEPLAYER');
  await page.waitForTimeout(400);
  await page.click('text=CREATE NEW WORLD');
  await page.waitForTimeout(400);
  await page.fill('#cw-seed', seed);
  await page.fill('#cw-name', name);
  await page.click('text=CREATE AND PLAY');
  await page.waitForTimeout(waitMs);
}

export function reporter() {
  const rows = [];
  return {
    rows,
    ok(name, cond, extra) {
      rows.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + extra : ''}`);
    },
    finish(errors) {
      console.log(rows.join('\n'));
      const failed = rows.filter((r) => r.startsWith('FAIL'));
      console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
      if (errors && errors.length) console.log('\nBROWSER ERRORS:\n' + errors.join('\n'));
      return failed.length === 0 && (!errors || errors.length === 0);
    },
  };
}
