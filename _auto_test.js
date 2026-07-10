const puppeteer = require('C:/Users/hu397/.workbuddy/binaries/node/workspace/node_modules/puppeteer');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,720']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  async function start() {
    await page.evaluate(() => { try { if (window.Account && Account.offlinePlay) Account.offlinePlay(); } catch (e) {} });
    await sleep(300);
    await page.evaluate(() => { try { if (window.selectProfession) selectProfession('warrior'); } catch (e) {} });
    await sleep(700);
  }
  async function bootFresh() {
    await page.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await start();
  }

  // ── clean slate ──
  await bootFresh();
  await page.evaluate(() => { window.__dbg.clearSave(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(500);
  await start();
  await sleep(300);

  // === A: auto-combat default ON + engages ===
  const a0 = await page.evaluate(() => ({ combat: window.__game.AUTO.combat, lvl: window.__game.playerLevel }));
  check('A1 AUTO.combat default true', a0.combat === true, 'combat=' + a0.combat);
  await sleep(6000);
  const a1 = await page.evaluate(() => ({
    lvl: window.__game.playerLevel,
    autoTarget: !!(window.__game.player && window.__game.player.autoTarget)
  }));
  check('A2 auto-combat engages (level up or autoTarget set)',
    a1.lvl > a0.lvl || a1.autoTarget, `lvl ${a0.lvl}->${a1.lvl}, autoTarget=${a1.autoTarget}`);

  // === B: manual move cancels auto-combat ===
  await page.keyboard.down('w');
  await sleep(150);
  await page.keyboard.up('w');
  await sleep(150);
  const b0 = await page.evaluate(() => {
    const sw = document.getElementById('sw-combat');
    return { combat: window.__game.AUTO.combat, swOn: sw ? sw.classList.contains('on') : null };
  });
  check('B1 manual move cancels AUTO.combat', b0.combat === false, 'combat=' + b0.combat);
  check('B2 switch visual reflects OFF', b0.swOn === false, 'swOn=' + b0.swOn);

  // === C: auto-pickup quality filter ===
  const c0 = await page.evaluate(() => {
    const g = window.__game;
    g.drops.length = 0;
    const p = g.player;
    g.drops.push({ x: p.x, y: p.y, equip: { quality: 'common', qualityName: '普通', color: '#aaa', name: 't-common' } });
    g.drops.push({ x: p.x, y: p.y, equip: { quality: 'epic', qualityName: '史诗', color: '#a0f', name: 't-epic' } });
    g.AUTO.pickup = true;
    g.AUTO.pickupMinQuality = 'rare';
    return { bpBefore: g.playerBackpack.length, dropsBefore: g.drops.length };
  });
  await sleep(500);
  const c1 = await page.evaluate(() => {
    const g = window.__game;
    return {
      bpAfter: g.playerBackpack.length,
      dropsAfter: g.drops.length,
      remaining: g.drops.map(d => d.equip.quality)
    };
  });
  check('C1 epic auto-picked into backpack', c1.bpAfter === c0.bpBefore + 1, `bp ${c0.bpBefore}->${c1.bpAfter}`);
  check('C2 common ignored (still in drops)', c1.remaining.includes('common') && !c1.remaining.includes('epic'),
    'remaining=' + JSON.stringify(c1.remaining));

  // === D: auto-skill releases when off CD & enemy in range ===
  const dPrep = await page.evaluate(() => {
    const g = window.__game;
    let alive = g.enemies.filter(e => e.state !== 'dead');
    if (!alive.length) { window.__dbg.setMap(0); alive = g.enemies.filter(e => e.state !== 'dead'); }
    const e = alive[0];
    g.player.x = e.x - 40; g.player.y = e.y; g.player.mp = 999;
    g.AUTO.combat = false;
    g.AUTO.skill = true;
    g.AUTO.skillList = { fire: 1 };
    if (g.skillCDs.fire) delete g.skillCDs.fire;
    return { hasEnemy: !!e, enemyState: e ? e.state : null };
  });
  check('D0 enemy present for skill test', dPrep.hasEnemy, 'enemyState=' + dPrep.enemyState);
  await sleep(1500);
  const d1 = await page.evaluate(() => ({ fireCD: window.__game.skillCDs.fire || 0, now: Date.now() }));
  check('D1 auto-skill fired (fire CD set)', d1.fireCD > d1.now, 'fireCD=' + d1.fireCD + ' now=' + d1.now);

  // === E: persistence across reload ===
  await page.evaluate(() => {
    const g = window.__game;
    g.AUTO.combat = true;
    g.AUTO.pickup = true;
    g.AUTO.pickupMinQuality = 'legendary';
    g.AUTO.skill = true;
    g.AUTO.skillList = { atk: 1, fire: 2 };
    window.__dbg.save();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(500);
  await start();
  await sleep(300);
  const e1 = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.AUTO)));
  check('E1 combat persisted', e1.combat === true, 'combat=' + e1.combat);
  check('E2 pickup persisted', e1.pickup === true, 'pickup=' + e1.pickup);
  check('E3 pickupMinQuality persisted', e1.pickupMinQuality === 'legendary', 'minQ=' + e1.pickupMinQuality);
  check('E4 skill persisted', e1.skill === true, 'skill=' + e1.skill);
  check('E5 skillList persisted', e1.skillList && e1.skillList.atk === 1 && e1.skillList.fire === 2, 'skillList=' + JSON.stringify(e1.skillList));
  const e2 = await page.evaluate(() => {
    const m = { combat: 'sw-combat', pickup: 'sw-pickup', skill: 'sw-skill' };
    const out = {};
    for (const k in m) { const el = document.getElementById(m[k]); out[k] = el ? el.classList.contains('on') : null; }
    return out;
  });
  check('E6 switches reflect persisted ON', e2.combat === true && e2.pickup === true && e2.skill === true, JSON.stringify(e2));

  // === errors ===
  check('Z no console/page errors', errors.length === 0, errors.slice(0, 8).join(' | '));

  const passed = results.filter(r => r.pass).length;
  console.log(`\n==== SUMMARY: ${passed}/${results.length} passed ====`);
  if (errors.length) { console.log('ERRORS:'); errors.slice(0, 15).forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(passed === results.length ? 0 : 2);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
