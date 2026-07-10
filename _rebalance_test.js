// Monster rebalance verification (Task #214)
// Boots the game in a headless browser, drives it via window.__game / window.__dbg,
// and asserts: no runtime errors, normal/elite/boss bulk HP multipliers, elite enrage, boss nova.
const puppeteer = require('C:/Users/hu397/.workbuddy/binaries/node/workspace/node_modules/puppeteer');

const URL = 'http://localhost:8099/';

// Balance constants replicated from index.html (passed into the page as args)
const CONST = {
  MON_LEVEL_FLOOR: 0.78, MON_LEVEL_SCALE: 0.070, MON_LEVEL_CAP: 3.3,
  MAP_DIFF_STEP: 0.05, ELITE_HP: 1.8,
  REB: {
    normal: { slime:3.0, goblin:3.0, skeleton:3.4, zombie:3.4, orc:4.0, darkmage:4.0, fireElemental:4.0, tiger:4.5, iceWolf:4.5, dragonWhelp:5.0 },
    elite: 6.0, boss: 6.5,
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],
  });
  const page = await browser.newPage();
  // Real JS errors only
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // HTTP failures (ignore favicon 404)
  page.on('response', r => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', r => { if (!/favicon/i.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  // Ignore generic "Failed to load resource" console noise (already covered by response)

  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });

  const C = CONST; // alias for evaluate closures

  try {
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => { if (window.__dbg) window.__dbg.clearSave(); });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => window.__game && window.__dbg, { timeout: 10000 });
    await page.evaluate(() => { if (typeof selectProfession === 'function') selectProfession('warrior'); });
    await sleep(400);

    // ---------- A. Boot clean ----------
    check('A.boot-no-error', errors.length === 0, errors.length ? errors.join(' | ') : 'no page/console errors at boot');

    // ---------- B. Normal monster bulk (map 0, tier0 => no elites) ----------
    const normal = await page.evaluate((C) => {
      window.__dbg.setLevel(1);
      window.__dbg.setMap(0);
      const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
      const pl = window.__game.playerLevel, tier = window.__game.mapIndex;
      const baseS = clamp(C.MON_LEVEL_FLOOR + (pl-1)*C.MON_LEVEL_SCALE, C.MON_LEVEL_FLOOR, C.MON_LEVEL_CAP) * (1 + tier*C.MAP_DIFF_STEP);
      const dHp = 1.0;
      return window.__game.enemies
        .filter(e => !e.isElite && !e.isBoss)
        .map(e => {
          const oldMax = e.defData.hp * baseS * dHp;
          const oldAtk = e.defData.atk * baseS * dHp;
          return { id: e.defData.id, maxHp: e.maxHp, bulkHp: +(e.maxHp/oldMax).toFixed(3), bulkAtk: +(e.atk/oldAtk).toFixed(3) };
        });
    }, C);
    const hpOk = normal.length > 0 && normal.every(n => n.bulkHp >= 2.9 && n.bulkHp <= 5.1);
    const atkOk = normal.length > 0 && normal.every(n => n.bulkAtk >= 1.28 && n.bulkAtk <= 1.52);
    check('B.normal-hp-3to5x', hpOk, JSON.stringify(normal));
    check('B.normal-atk-1.3to1.5x', atkOk, normal.map(n=>n.bulkAtk).join(','));

    // ---------- C. Elite bulk (find an elite on a higher-tier map) ----------
    const elite = await page.evaluate((C) => {
      const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
      for (let i=0;i<14;i++){
        const tier = (i%2===0)?1:3;
        window.__dbg.setMap(tier);
        const pl = window.__game.playerLevel, t = window.__game.mapIndex;
        const baseS = clamp(C.MON_LEVEL_FLOOR + (pl-1)*C.MON_LEVEL_SCALE, C.MON_LEVEL_FLOOR, C.MON_LEVEL_CAP) * (1 + t*C.MAP_DIFF_STEP);
        const dHp = 1.0;
        const found = window.__game.enemies.find(e => e.isElite && !e.isBoss);
        if (found) {
          const oldMax = found.defData.hp * baseS * C.ELITE_HP * dHp;
          return { id: found.defData.id, tier: t, maxHp: found.maxHp, bulkHp: +(found.maxHp/oldMax).toFixed(3) };
        }
      }
      return null;
    }, C);
    check('C.elite-found', !!elite, elite ? JSON.stringify(elite) : 'no elite spawned in 14 tries');
    if (elite) check('C.elite-hp-6x', Math.abs(elite.bulkHp - 6.0) < 0.06, 'bulkHp=' + elite.bulkHp);

    // ---------- D. Boss bulk + berserk phase structure ----------
    const boss = await page.evaluate((C) => {
      window.__dbg.setLevel(1);
      window.__dbg.setMap(0);
      window.__dbg.spawnBoss();
      const b = window.__game.enemies.find(e => e.isBoss);
      if (!b) return null;
      const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
      const pl = window.__game.playerLevel, tier = window.__game.mapIndex;
      const baseS = clamp(C.MON_LEVEL_FLOOR + (pl-1)*C.MON_LEVEL_SCALE, C.MON_LEVEL_FLOOR, C.MON_LEVEL_CAP) * (1 + tier*C.MAP_DIFF_STEP);
      const dHp = 1.0;
      const oldMax = b.defData.hp * baseS * dHp;
      const phases = b.phases || [];
      const last = phases[phases.length-1];
      return {
        id: b.defData.id, maxHp: b.maxHp, bulkHp: +(b.maxHp/oldMax).toFixed(3),
        phaseCount: phases.length, lastPhaseName: last ? last.name : null,
        lastPhaseHasNova: last ? last.patterns.includes('nova') : false,
      };
    }, C);
    check('D.boss-found', !!boss, boss ? JSON.stringify(boss) : 'boss not spawned');
    if (boss) {
      check('D.boss-hp-6.5x', Math.abs(boss.bulkHp - 6.5) < 0.07, 'bulkHp=' + boss.bulkHp);
      check('D.boss-berserk-phase', boss.phaseCount >= 3 && /狂怒/.test(boss.lastPhaseName||''), `phases=${boss.phaseCount} last="${boss.lastPhaseName}"`);
      check('D.boss-nova-pattern', boss.lastPhaseHasNova === true, 'last phase includes nova');
    }

    // ---------- E. Elite enrage logic ----------
    const enrage = await page.evaluate(async () => {
      window.__dbg.setLevel(1);
      window.__dbg.setMap(1);
      let e = window.__game.enemies.find(x => !x.isBoss);
      if (!e) return { ok:false, reason:'no enemy' };
      e.isElite = true; e.eliteEnraged = false; e.eliteSlamCd = 0.01;
      e.hp = e.maxHp * 0.4;
      const before = e.eliteEnraged;
      const t0 = performance.now();
      await new Promise(r => { const iv = setInterval(()=>{ if (e.eliteEnraged || performance.now()-t0>1500){ clearInterval(iv); r(); } }, 50); });
      return { ok:true, before, after: e.eliteEnraged, slamCdAfter: e.eliteSlamCd };
    });
    check('E.elite-enrage-triggers', enrage.ok && enrage.before === false && enrage.after === true, JSON.stringify(enrage));
    check('E.elite-slam-fires', enrage.ok && enrage.slamCdAfter > 0, 'eliteSlamCd reset=' + (enrage.ok?enrage.slamCdAfter:'-'));

    // ---------- F. Boss nova executes & damages player ----------
    const nova = await page.evaluate(async () => {
      window.__dbg.setLevel(1);
      window.__dbg.setMap(0);
      window.__dbg.spawnBoss();
      const b = window.__game.enemies.find(e => e.isBoss);
      if (!b) return { ok:false, reason:'no boss' };
      b.hp = b.maxHp * 0.1;
      const last = b.phases[b.phases.length-1];
      last.patterns = ['nova'];
      b.bossAtkTimer = 0; b.bossCasting = false;
      const P = window.__game.player;
      P.hp = P.maxHp; P.state = 'alive';
      P.x = b.x; P.y = b.y;
      const hpBefore = P.hp;
      const t0 = performance.now();
      await new Promise(r => { const iv = setInterval(()=>{ if (b.bossPhase === b.phases.length-1 && (P.hp < hpBefore || performance.now()-t0>2000)){ clearInterval(iv); r(); } }, 50); });
      return { ok:true, bossPhase: b.bossPhase, finalPhase: b.phases.length-1, hpBefore, hpAfter: P.hp };
    });
    check('F.boss-reaches-berserk', nova.ok && nova.bossPhase === nova.finalPhase, JSON.stringify(nova));
    check('F.nova-damages-player', nova.ok && nova.hpAfter < nova.hpBefore, `hp ${nova.hpBefore} -> ${nova.hpAfter}`);

    check('Z.no-errors-during-tests', errors.length === 0, errors.length ? errors.join(' | ') : 'clean');
  } catch (e) {
    check('FATAL', false, e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n'));
  } finally {
    await browser.close();
  }

  let pass = 0, fail = 0;
  for (const r of results) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ::  ${r.detail}`); r.pass ? pass++ : fail++; }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
})();
