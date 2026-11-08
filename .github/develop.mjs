// his roll of twelve, developed (world/Camera.js). made on GitHub's machines when the town asks, never on the town's
// server (Sam, 24 Oct: "don't render it on the server"). the town as it is drawn on his site, opened at /photo in a
// browser with no graphics card (the drawing is done in software, slowly), given each shot as he took it (where he
// stood, what he aimed at, the light and the rain then) and taken, with the date in the corner the way a disposable
// camera stamps it. what the town asked for is develop.json: { roll, for, site }, and the shots are rolls/<roll>.json.
// `for` goes into what is made, which is how the town knows the prints are of the roll it sent
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ask = JSON.parse(await readFile(join(ROOT, 'develop.json'), 'utf8'))
const roll = JSON.parse(await readFile(join(ROOT, 'rolls', `${ask.roll}.json`), 'utf8'))
const OUT = join(ROOT, 'photos', ask.roll)
const SITE = String(ask.site || 'https://pinos.world').replace(/\/$/, '')
const two = (n) => String(n).padStart(2, '0')
// '26 10 28, in the camera's own order
const stampOf = (ms) => { const d = new Date(ms || Date.now()); return `'${two(d.getUTCFullYear() % 100)} ${two(d.getUTCMonth() + 1)} ${two(d.getUTCDate())}` }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.DEVELOP_CHROME ? { executablePath: process.env.DEVELOP_CHROME } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } })
  page.on('pageerror', (e) => console.log(`page error: ${e.message}`))
  await page.goto(`${SITE}/photo?gl=1`, { waitUntil: 'load', timeout: 180_000 })
  await page.waitForFunction(() => window.__photo?.ready, null, { timeout: 900_000, polling: 1000 })
  await mkdir(OUT, { recursive: true })
  const lab = await browser.newPage({ viewport: { width: 640, height: 480 } })
  const made = []
  const prints = []
  for (const shot of roll.shots) {
    await page.evaluate((s) => window.__photo.show(s), shot)
    await page.waitForFunction(() => window.__photo?.settled, null, { timeout: 180_000, polling: 500 })
    const raw = (await (await page.$('canvas')).screenshot({ type: 'png' })).toString('base64')
    // printed, with the date in the corner
    await lab.setContent(`<body style="margin:0;background:#000"><div style="position:relative;width:640px;height:480px"><img src="data:image/png;base64,${raw}" style="width:640px;height:480px;display:block;filter:contrast(1.06) saturate(1.1)"><div style="position:absolute;right:20px;bottom:16px;font:bold 22px monospace;letter-spacing:3px;color:#ff9a3c;text-shadow:0 0 6px #ff6a00">${stampOf(shot.at)}</div></div></body>`)
    const file = `${two(shot.n)}.png`
    const png = await lab.screenshot({ type: 'png' })
    await writeFile(join(OUT, file), png)
    prints.push(png.toString('base64'))
    made.push({ n: shot.n, file, of: shot.of?.label || null, why: shot.why || null, at: shot.at || null })
    console.log(`${file}: ${shot.of?.label || 'something'}`)
  }
  // the twelve on one sheet, four by three, in the order they were taken, for him to look at
  const sheet = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,320px);grid-template-rows:repeat(3,240px)">${prints.map((s) => `<img src="data:image/png;base64,${s}" style="width:316px;height:236px;margin:2px;display:block">`).join('')}</body>`)
  await sheet.screenshot({ path: join(OUT, 'sheet.png'), type: 'png' })
  await writeFile(join(OUT, 'done.json'), JSON.stringify({ for: ask.for ?? null, roll: ask.roll, at: new Date().toISOString(), photos: made, of: process.env.GITHUB_SHA || null }, null, 2))
  console.log(`roll ${ask.roll}: ${made.length} prints`)
} finally {
  await browser.close()
}
