// 自动化测试：env.js 环境互动逻辑（正常 / 边界 / 异常）
const Env = require('./env.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ` (得到 ${a}, 期望 ${b})`); }
function approx(a, b, eps, msg) { ok(Math.abs(a - b) <= (eps || 1e-9), msg + ` (得到 ${a}, 期望≈${b})`); }

// ── §1 实例化 ─────────────────────────────────────────────
(function () {
  const m0 = Env.makeObjects(0);
  eq(m0.length, 4, 'map0 应有 4 个对象');
  ok(m0.some(o => o.type === 'barrel'), 'map0 含炸药桶');
  ok(m0.some(o => o.type === 'lava'), 'map0 含熔岩');
  ok(m0.some(o => o.type === 'icePillar'), 'map0 含冰柱');
  const allAlive = m0.every(o => o.alive === true && o.fuse === 0 && o.frozenUntil === 0);
  ok(allAlive, '新实例全部 alive 且计时器归零');
  eq(Env.makeObjects(99).length, 0, '越界地图应返回空数组');
})();

// ── §2 炸药桶（fire/spirit 点燃，phys 无效）──────────────
(function () {
  const barrel = Env.makeObjects(0).find(o => o.type === 'barrel');
  const r1 = Env.onElementHit(barrel, 'fire', 1000);
  eq(r1.event, 'armed', '火命中炸药桶 → armed');
  ok(barrel.fuse > 1000, '引信时间戳被推后');
  // 重复命中不叠加
  const f0 = barrel.fuse;
  Env.onElementHit(barrel, 'fire', 1100);
  eq(barrel.fuse, f0, '重复点火不刷新引信');

  const b2 = Env.makeObjects(0).find(o => o.type === 'barrel');
  eq(Env.onElementHit(b2, 'phys', 1000).event, 'none', '物理命中炸药桶无反应');
  eq(Env.onElementHit(b2, 'ice', 1000).event, 'none', '冰命中炸药桶无反应');
  ok(b2.fuse === 0, '物理/冰不点燃引信');
})();

// ── §3 熔岩（ice 冻结，fire 无效）──────────────────────
(function () {
  const lava = Env.makeObjects(0).find(o => o.type === 'lava');
  const r = Env.onElementHit(lava, 'ice', 5000);
  eq(r.event, 'freeze', '冰命中熔岩 → freeze');
  ok(Env.lavaSafe(lava, 6000), '冻结窗口内为安全');
  ok(!Env.lavaSafe(lava, 5000 + Env.LAVA_FREEZE_MS + 1), '冻结窗口外不再安全');
  const l2 = Env.makeObjects(0).find(o => o.type === 'lava');
  eq(Env.onElementHit(l2, 'fire', 1000).event, 'none', '火命中熔岩无反应');
  ok(!Env.lavaSafe(l2, 1001), '未冻结熔岩不安全');
})();

// ── §4 冰柱（fire/spirit 击碎，ice 无效）────────────────
(function () {
  const ice = Env.makeObjects(0).find(o => o.type === 'icePillar');
  const r = Env.onElementHit(ice, 'fire', 2000);
  eq(r.event, 'shatter', '火命中冰柱 → shatter');
  ok(ice.alive === false, '冰柱击碎后 alive=false');
  approx(r.radius, ice.r * Env.ICE_SHATTER_RADIUS_MULT, 1e-9, '碎裂半径 = r*4');
  ok(r.frozenUntil > 2000, '返回冻结截止时间戳');
  const i2 = Env.makeObjects(0).find(o => o.type === 'icePillar');
  eq(Env.onElementHit(i2, 'ice', 1000).event, 'none', '冰命中冰柱无反应');
  ok(i2.alive === true, '冰柱未被冰破坏');
})();

// ── §5 tick：引信到达 → 爆炸 ─────────────────────────────
(function () {
  const barrel = Env.makeObjects(0).find(o => o.type === 'barrel');
  Env.onElementHit(barrel, 'fire', 1000);
  eq(Env.tick(barrel, 0.016, 1100).event, 'none', '引信未到不爆炸');
  const ex = Env.tick(barrel, 0.016, 1000 + Env.BARREL_FUSE_MS + 1);
  eq(ex.event, 'explode', '引信到达 → explode');
  approx(ex.radius, barrel.r * Env.BARREL_RADIUS_MULT, 1e-9, '爆炸半径 = r*4.5');
  ok(barrel.alive === false, '爆炸后 alive=false');
  // 已毁对象不再 tick
  eq(Env.tick(barrel, 0.016, 99999).event, 'none', '已爆炸对象不再产生事件');
})();

// ── §6 边界 / 异常 ───────────────────────────────────────
(function () {
  eq(Env.onElementHit(null, 'fire', 1000).event, 'none', 'null 对象安全返回 none');
  eq(Env.onElementHit(undefined, 'fire', 1000).event, 'none', 'undefined 对象安全返回 none');
  const dead = Env.makeObjects(0).find(o => o.type === 'barrel');
  dead.alive = false;
  eq(Env.onElementHit(dead, 'fire', 1000).event, 'none', '已毁炸药桶不响应');
  eq(Env.tick(null, 0.016, 1000).event, 'none', 'tick null 安全返回 none');
  // 未知类型
  const weird = { type: 'chest', alive: true, x: 0, y: 0, r: 10 };
  eq(Env.onElementHit(weird, 'fire', 1000).event, 'none', '未知类型无反应');
  // now 缺省不崩
  const b = Env.makeObjects(0).find(o => o.type === 'barrel');
  ok(Env.onElementHit(b, 'fire').event === 'armed', 'now 缺省仍可点燃');
})();

console.log(`\n环境互动测试：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
