import { chromium } from 'playwright';

const wavPath = process.argv[2] || './fake_pastor.wav';
const role = process.argv[3] || 'pastor';
const token = process.argv[4] || 'dev-token';
const durationMs = parseInt(process.argv[5] || '8000', 10);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavPath}`,
  ],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:8090/harness.html');
const ok = await page.evaluate(
  ([role, token]) => window.startBroadcast('ws://localhost:9000', role, token),
  [role, token]
);
console.log('startBroadcast ->', ok);

await page.waitForTimeout(durationMs);

await page.evaluate(() => window.stopBroadcast());
await page.waitForTimeout(500);
await browser.close();
console.log('done');
