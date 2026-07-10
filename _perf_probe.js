const puppeteer = require('C:/Users/hu397/.workbuddy/binaries/node/workspace/node_modules/puppeteer');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1280,720'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const logs = [];
  page.on('console', m => logs.push('[console] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));

  console.log('goto...');
  await page.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 注入独立 FPS 计 + 异常捕获
  await page.evaluate(() => {
    window.__perf = { frames: 0, lastT: performance.now(), fps: 0 };
    function loop() {
      window.__perf.frames++;
      const now = performance.now();
      if (now - window.__perf.lastT >= 1000) {
        window.__perf.fps = Math.round(window.__perf.frames * 1000 / (now - window.__perf.lastT));
        window.__perf.frames = 0;
        window.__perf.lastT = now;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });

  // 离线开局
  await page.evaluate(() => {
    try { if (window.Account && Account.offlinePlay) Account.offlinePlay(); } catch (e) { console.log('offlineErr ' + e.message); }
  });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => {
    try { if (window.selectProfession) selectProfession('warrior'); } catch (e) { console.log('selectErr ' + e.message); }
  });
  await new Promise(r => setTimeout(r, 800));

  const started = await page.evaluate(() => !!(window.__game && window.__game.player));
  console.log('GAME_STARTED=' + started);

  const samples = [];
  const N = 55;
  for (let i = 0; i < N; i++) {
    await new Promise(r => setTimeout(r, 2000));
    let s;
    try {
      s = await page.evaluate(() => {
        const g = window.__game; const p = g.player;
        let parts = 'n/a';
        try { parts = (typeof particles !== 'undefined') ? particles.length : 'n/a'; } catch (e) {}
        let fts = 'n/a';
        try { fts = (typeof floatTexts !== 'undefined') ? floatTexts.length : 'n/a'; } catch (e) {}
        return {
          fps: window.__perf.fps,
          level: g.playerLevel,
          exp: p ? p.exp : null,
          expToNext: p ? p.expToNext : null,
          enemies: g.enemies.length,
          particles: parts,
          floatTexts: fts,
          gameOver: g.gameOver,
          pState: p ? p.state : null,
          hp: p ? Math.round(p.hp) : null,
          maxHp: p ? Math.round(p.maxHp) : null,
          autoTarget: p ? (p.autoTarget ? 'set' : 'null') : null,
        };
      });
    } catch (e) { s = { err: e.message }; }
    samples.push(s);
    const tag = (s.err ? 'ERR ' + s.err : `fps=${s.fps} Lv=${s.level} exp=${s.exp}/${s.expToNext} enm=${s.enemies} part=${s.particles} ft=${s.floatTexts} hp=${s.hp}/${s.maxHp} st=${s.pState} auto=${s.autoTarget} over=${s.gameOver}`);
    console.log(`#${i} t=${(i + 1) * 2}s ${tag}`);
  }

  console.log('=== LAST 25 LOGS ===');
  logs.slice(-25).forEach(l => console.log(l));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
