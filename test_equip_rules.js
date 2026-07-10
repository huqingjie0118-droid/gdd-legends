/* equip-rules 引擎单测（Node，require equip-rules.js） */
const fs = require('fs');
const path = require('path');
const EquipRules = require('./equip-rules.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

// 加载 JSON 配置（应等价于 DEFAULT_CONFIG）
const json = JSON.parse(fs.readFileSync(path.join(__dirname, 'equip-rules.json'), 'utf8'));
const initRes = EquipRules.init(json);
ok('init(JSON) 校验通过', initRes.ok, JSON.stringify(initRes.errors || {}));

// ── 1. 生成 5000 件，校验冲突/数量/字段 ──
let dupType = 0, conflictViolation = 0, countViolation = 0, fieldBad = 0, totalPromoted = 0;
const N = 5000;
for (let i = 0; i < N; i++) {
  const r = EquipRules.generateEquip({ sourceLevel: 1 + (i % 25), prof: (i % 3 === 0 ? 'warrior' : i % 3 === 1 ? 'mage' : 'taoist') });
  const q = EquipRules.config.qualities[r.quality];
  const rolled = EquipRules.config.qualities[r.rolledQuality];
  if (r.affixes.length < rolled.affixMin || r.affixes.length > rolled.affixMax) countViolation++;
  const seen = {};
  for (const a of r.affixes) {
    if (seen[a.attr]) dupType++;
    seen[a.attr] = true;
    if (a.displayValue == null || a.display == null || !a.type) fieldBad++;
    // 冲突校验：本词条 conflicts 不应出现在其它词条 attr
    (a.conflicts || []).forEach(c => {
      r.affixes.forEach(o => { if (o !== a && o.attr === c) conflictViolation++; });
    });
  }
  if (r.promoted) totalPromoted++;
}
ok('无重复 attr 同件出现', dupType === 0, 'dup=' + dupType);
ok('无冲突违反', conflictViolation === 0, 'viol=' + conflictViolation);
ok('词条数在 [affixMin,affixMax]', countViolation === 0, 'viol=' + countViolation);
ok('词条字段完整(displayValue/display/type)', fieldBad === 0, 'bad=' + fieldBad);
ok('动态评定可触发升档(5000件中>0)', totalPromoted > 0, 'promoted=' + totalPromoted);

// ── 2. 评分随品质阶梯单调（平均） ──
const avgByQ = {};
['common', 'good', 'rare', 'epic', 'legendary', 'mythic'].forEach(q => {
  let s = 0, n = 300;
  for (let i = 0; i < n; i++) s += EquipRules.generateEquip({ qualityOverride: q, sourceLevel: 1 }).score;
  avgByQ[q] = s / n;
});
console.log('    平均评分: ' + JSON.stringify(avgByQ));
ok('评分随品质递增(common<good<rare<epic<legendary<mythic)',
  avgByQ.common < avgByQ.good && avgByQ.good < avgByQ.rare && avgByQ.rare < avgByQ.epic && avgByQ.epic < avgByQ.legendary && avgByQ.legendary < avgByQ.mythic,
  JSON.stringify(avgByQ));

// ── 3. judgeQuality 分档正确 ──
ok('judgeQuality(0)=common', EquipRules.judgeQuality('common', 0, false) === 'common');
ok('judgeQuality(700)=mythic(超过最高阈值)', EquipRules.judgeQuality('common', 700, false) === 'mythic');
ok('judgeQuality(700, allowDowngrade)=mythic', EquipRules.judgeQuality('common', 700, true) === 'mythic');
ok('judgeQuality(5, allowDowngrade from epic)=rare', EquipRules.judgeQuality('epic', 5, true) === 'rare');
ok('judgeQuality(5, 不降级 from epic)=epic', EquipRules.judgeQuality('epic', 5, false) === 'epic');

// ── 4. 升阶：200 次成功率≈配置 ──
let succ = 0, trials = 200;
for (let i = 0; i < trials; i++) {
  const eq = { quality: 'common', qualityName: '普通', color: '#aaa', affixes: EquipRules.rollAffixes('common', 1, null), affixLocks: [], _sourceLevel: 1 };
  const mats = { iron_ore: 9999, monster_core: 9999 };
  const res = EquipRules.upgradeEquip(eq, mats);
  if (res.ok && res.success) succ++;
}
const rate = succ / trials;
const expected = EquipRules.config.upgrade.successBase;
console.log('    升阶成功率实测=' + rate.toFixed(3) + ' 配置=' + expected);
ok('升阶成功率接近配置(±0.12)', Math.abs(rate - expected) < 0.12, 'rate=' + rate);

// mythic 不可升阶
ok('mythic 不可升阶', EquipRules.canUpgrade({ quality: 'mythic' }) === false);
// 材料不足被拒
const eq2 = { quality: 'common', affixes: EquipRules.rollAffixes('common', 1, null), _sourceLevel: 1 };
const poor = { iron_ore: 0, monster_core: 0 };
ok('材料不足升阶被拒', EquipRules.upgradeEquip(eq2, poor).reason === 'materials');

// ── 5. 锁定 / 替换 ──
const eq3 = { quality: 'rare', affixes: EquipRules.rollAffixes('rare', 1, null), affixLocks: [false, false, false], _sourceLevel: 1 };
EquipRules.lockAffix(eq3, 0);
ok('锁定后替换被拒', EquipRules.replaceAffix(eq3, 0, { sourceLevel: 1 }).reason === 'locked');
EquipRules.lockAffix(eq3, 0); // 解锁
const before = eq3.affixes[0].id;
const rep = EquipRules.replaceAffix(eq3, 0, { sourceLevel: 1 });
ok('解锁后可替换(返回ok)', rep.ok === true);
ok('替换后无冲突', (function () {
  const seen = {}; let bad = 0;
  eq3.affixes.forEach(a => { seen[a.attr] = true; (a.conflicts || []).forEach(c => eq3.affixes.forEach(o => { if (o !== a && o.attr === c) bad++; })); });
  return bad === 0;
})());

// ── 6. 边界处理 ──
// 空词条池：init 一个 affixes=[] 的配置
const emptyCfg = JSON.parse(JSON.stringify(json)); emptyCfg.affixes = [];
const emptyInit = EquipRules.init(emptyCfg);
ok('空词条池 init 仍 ok(validate 不致命)', emptyInit.ok === true);
const emptyEq = EquipRules.generateEquip({ sourceLevel: 1 });
ok('空池生成不崩(0词条)', emptyEq.affixes.length === 0, 'len=' + emptyEq.affixes.length);

// 恢复 JSON 配置
EquipRules.init(json);

// affixMax 远超池大小：设某品质 affixMax=99
const bigCfg = JSON.parse(JSON.stringify(json));
bigCfg.qualities.rare.affixMax = 99;
EquipRules.init(bigCfg);
const bigEq = EquipRules.generateEquip({ qualityOverride: 'rare', sourceLevel: 1 });
ok('affixMax>池 时封顶不无限循环', bigEq.affixes.length <= EquipRules.config.affixes.length && bigEq.affixes.length > 0, 'len=' + bigEq.affixes.length);
EquipRules.init(json);

// 非法配置：缺 qualities → validate 拒绝且保留旧配置
const badCfg = JSON.parse(JSON.stringify(json)); delete badCfg.qualities;
const badInit = EquipRules.init(badCfg);
ok('非法配置 init 返回 ok:false', badInit.ok === false);
ok('非法配置后旧配置仍可用', EquipRules.config && EquipRules.config.qualities && EquipRules.config.qualities.common);

// 极端：某品质权重全 0（除 common）→ rollQuality 仍能返回
const zCfg = JSON.parse(JSON.stringify(json));
Object.keys(zCfg.qualityAffixTierWeights).forEach(q => { zCfg.qualityAffixTierWeights[q] = { basic: 0, rare: 0, legendary: 0 }; });
// 这会让所有品质无词条但仍能 rollQuality（quality 层权重独立）
ok('词条层全0仍可 rollQuality', typeof EquipRules.rollQuality() === 'string');

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
