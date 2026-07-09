/**
 * test_refine.js — 洗练系统测试
 * 使用 assertion + count 模式运行
 * 共 25+ 测试用例
 */
var assert = require('assert');
var Refine = require('./refine.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL: ' + name + ' - ' + e.message);
  }
}

function assertDeepEqual(a, b, msg) {
  try {
    assert.deepStrictEqual(a, b);
  } catch (e) {
    throw new Error(msg || 'Expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
}

console.log('\n=== 洗练系统测试 ===\n');

// ---- REFINE_CATEGORIES ----
test('REFINE_CATEGORIES 定义正确', function () {
  assert.equal(Refine.REFINE_CATEGORIES.length, 6);
  assertDeepEqual(Refine.REFINE_CATEGORIES, ['atk', 'def', 'hp', 'crit', 'spd', 'special']);
});

// ---- REFINE_POOL ----
test('REFINE_POOL 含6个分类', function () {
  assert.equal(Object.keys(Refine.REFINE_POOL).length, 6);
});

test('REFINE_POOL.atk 含3条词缀', function () {
  assert.equal(Refine.REFINE_POOL.atk.length, 3);
});

test('REFINE_POOL.def 含3条词缀', function () {
  assert.equal(Refine.REFINE_POOL.def.length, 3);
});

test('REFINE_POOL.hp 含3条词缀', function () {
  assert.equal(Refine.REFINE_POOL.hp.length, 3);
});

test('REFINE_POOL.crit 含2条词缀', function () {
  assert.equal(Refine.REFINE_POOL.crit.length, 2);
});

test('REFINE_POOL.spd 含3条词缀', function () {
  assert.equal(Refine.REFINE_POOL.spd.length, 3);
});

test('REFINE_POOL.special 含3条词缀', function () {
  assert.equal(Refine.REFINE_POOL.special.length, 3);
});

// ---- QUALITY_COST ----
test('QUALITY_COST 定义正确', function () {
  assert.equal(Refine.QUALITY_COST.common, 500);
  assert.equal(Refine.QUALITY_COST.good, 1000);
  assert.equal(Refine.QUALITY_COST.rare, 2000);
  assert.equal(Refine.QUALITY_COST.epic, 4000);
  assert.equal(Refine.QUALITY_COST.legendary, 8000);
  assert.equal(Refine.QUALITY_COST.mythic, 16000);
});

// ---- refineCost ----
test('refineCost: 普通品质无锁定', function () {
  assert.equal(Refine.refineCost('common'), 500);
});

test('refineCost: 史诗品质无锁定', function () {
  assert.equal(Refine.refineCost('epic'), 4000);
});

test('refineCost: 传说品质3锁定', function () {
  assert.equal(Refine.refineCost('legendary', 3), 8000 + 3 * 2000);
});

test('refineCost: 神话品质2锁定', function () {
  assert.equal(Refine.refineCost('mythic', 2), 16000 + 2 * 2000);
});

test('refineCost: 无效品质返回0', function () {
  assert.equal(Refine.refineCost('invalid'), 0);
});

test('refineCost: LOCK_COST_PER_AFFIX 定义正确', function () {
  assert.equal(Refine.LOCK_COST_PER_AFFIX, 2000);
});

// ---- rollRefine ----
test('rollRefine: 返回有效结构', function () {
  var affix = Refine.rollRefine('atk', 'common');
  assert.ok(affix.stat);
  assert.ok(typeof affix.value === 'number');
  assert.ok(affix.category === 'atk');
});

test('rollRefine: 百分比词缀 value 为小数', function () {
  // Run multiple times to cover armorPen
  var foundPct = false;
  for (var i = 0; i < 50; i++) {
    var affix = Refine.rollRefine('atk', 'common');
    if (affix.pct) {
      foundPct = true;
      assert.ok(affix.value < 1, '百分比值应小于1');
    }
  }
  assert.ok(foundPct, '应该至少出现一次百分比词缀');
});

test('rollRefine: 各分类都可成功生成', function () {
  var cats = ['atk', 'def', 'hp', 'crit', 'spd', 'special'];
  cats.forEach(function (cat) {
    var affix = Refine.rollRefine(cat, 'common');
    assert.ok(affix.stat);
    assert.equal(affix.category, cat);
  });
});

test('rollRefine: 无效分类返回 null', function () {
  assert.equal(Refine.rollRefine('invalid'), null);
});

test('rollRefine: 高品质乘数生效', function () {
  // Verify that mythic quality has higher multiplier (2.2) than common (1.0)
  var valuesCommon = [];
  var valuesMythic = [];
  for (var i = 0; i < 100; i++) {
    valuesCommon.push(Refine.rollRefine('atk', 'common').value);
    valuesMythic.push(Refine.rollRefine('atk', 'mythic').value);
  }
  var avgCommon = valuesCommon.reduce(function (a, b) { return a + b; }) / valuesCommon.length;
  var avgMythic = valuesMythic.reduce(function (a, b) { return a + b; }) / valuesMythic.length;
  assert.ok(avgMythic > avgCommon * 1.5, '神话品质均值应该显著高于普通 (' + avgMythic + ' vs ' + avgCommon + ')');
});

test('rollRefine: def 分类词缀范围正确', function () {
  for (var i = 0; i < 30; i++) {
    var affix = Refine.rollRefine('def', 'common');
    if (affix.stat === 'def' || affix.stat === 'mdef') {
      assert.ok(affix.value >= 2 && affix.value <= 10);
    }
  }
});

// ---- canRefine ----
test('canRefine: 有效装备返回 true', function () {
  assert.equal(Refine.canRefine({ affixes: ['a', 'b'] }), true);
});

test('canRefine: null 返回 false', function () {
  assert.equal(Refine.canRefine(null), false);
});

test('canRefine: 无 affixes 返回 false', function () {
  assert.equal(Refine.canRefine({}), false);
});

test('canRefine: 空 affixes 返回 false', function () {
  assert.equal(Refine.canRefine({ affixes: [] }), false);
});

// ---- lockAffix ----
test('lockAffix: 锁定词缀', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }] };
  Refine.lockAffix(equip, 0);
  assertDeepEqual(equip.lockedAffixes, [0]);
});

test('lockAffix: 重复锁定不会重复添加', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }], lockedAffixes: [0] };
  Refine.lockAffix(equip, 0);
  assert.equal(equip.lockedAffixes.length, 1);
});

test('lockAffix: 无效索引不报错', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }] };
  Refine.lockAffix(equip, 10);
  assert.ok(!equip.lockedAffixes || equip.lockedAffixes.length === 0);
});

test('lockAffix: null 返回 null', function () {
  assert.equal(Refine.lockAffix(null, 0), null);
});

// ---- unlockAffix ----
test('unlockAffix: 解锁词缀', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }], lockedAffixes: [0] };
  Refine.unlockAffix(equip, 0);
  assert.equal(equip.lockedAffixes.length, 0);
});

test('unlockAffix: 解锁不存在的锁不报错', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }] };
  var result = Refine.unlockAffix(equip, 0);
  assert.ok(result === equip);
});

test('unlockAffix: null 返回 null', function () {
  assert.equal(Refine.unlockAffix(null, 0), null);
});

test('锁-解-锁 流程正确', function () {
  var equip = { affixes: [{ stat: 'atk', value: 5 }, { stat: 'def', value: 3 }] };
  Refine.lockAffix(equip, 0);
  Refine.lockAffix(equip, 1);
  assert.equal(equip.lockedAffixes.length, 2);
  Refine.unlockAffix(equip, 0);
  assert.equal(equip.lockedAffixes.length, 1);
  Refine.unlockAffix(equip, 1);
  assert.equal(equip.lockedAffixes.length, 0);
});

console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('全部通过!');
}
