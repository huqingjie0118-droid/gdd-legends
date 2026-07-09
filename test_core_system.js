/**
 * test_core_system.js — 四象核心系统测试
 * 使用 assertion + count 模式运行
 * 共 30+ 测试用例
 */
var assert = require('assert');
var CoreSystem = require('./core_system.js');

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

console.log('\n=== 四象核心系统测试 ===\n');

// ---- CORES ----
test('CORES 定义4种核心', function () {
  assert.equal(Object.keys(CoreSystem.CORES).length, 4);
  assert.ok(CoreSystem.CORES.azure);
  assert.ok(CoreSystem.CORES.white);
  assert.ok(CoreSystem.CORES.vermilion);
  assert.ok(CoreSystem.CORES.black);
});

test('CORES 各属性正确', function () {
  assert.equal(CoreSystem.CORES.azure.name, '青龙');
  assert.equal(CoreSystem.CORES.azure.element, 'spirit');
  assert.equal(CoreSystem.CORES.white.name, '白虎');
  assert.equal(CoreSystem.CORES.white.element, 'phys');
  assert.equal(CoreSystem.CORES.vermilion.name, '朱雀');
  assert.equal(CoreSystem.CORES.vermilion.element, 'fire');
  assert.equal(CoreSystem.CORES.black.name, '玄武');
  assert.equal(CoreSystem.CORES.black.element, 'ice');
});

// ---- CORE_RANKS ----
test('CORE_RANKS 范围1-10', function () {
  assert.equal(CoreSystem.CORE_RANKS.min, 1);
  assert.equal(CoreSystem.CORE_RANKS.max, 10);
});

test('CORE_SLOTS = 4', function () {
  assert.equal(CoreSystem.CORE_SLOTS, 4);
});

// ---- makeCore ----
test('makeCore: 青龙1级', function () {
  var core = CoreSystem.makeCore('azure', 1);
  assert.equal(core.type, 'azure');
  assert.equal(core.name, '青龙');
  assert.equal(core.rank, 1);
  assert.equal(core.bonus.matk, 3);
  assert.equal(core.bonus.spiritDmg, 0.02);
});

test('makeCore: 白虎5级', function () {
  var core = CoreSystem.makeCore('white', 5);
  assert.equal(core.bonus.atk, 15);
  assert.equal(core.bonus.critRate, 0.075);
});

test('makeCore: 朱雀10级', function () {
  var core = CoreSystem.makeCore('vermilion', 10);
  assert.equal(core.bonus.fireDmg, 0.30);
  assert.equal(core.bonus.burnDmg, 20);
});

test('makeCore: 玄武8级', function () {
  var core = CoreSystem.makeCore('black', 8);
  assert.equal(core.bonus.def, 16);
  assert.equal(core.bonus.maxHp, 160);
  assert.equal(core.bonus.iceResist, 0.16);
});

test('makeCore: rank < 1 自动修正为1', function () {
  var core = CoreSystem.makeCore('azure', 0);
  assert.equal(core.rank, 1);
});

test('makeCore: rank > 10 自动修正为10', function () {
  var core = CoreSystem.makeCore('azure', 20);
  assert.equal(core.rank, 10);
});

test('makeCore: 缺省rank默认为1', function () {
  var core = CoreSystem.makeCore('azure');
  assert.equal(core.rank, 1);
});

test('makeCore: 无效类型返回 null', function () {
  assert.equal(CoreSystem.makeCore('invalid'), null);
});

// ---- coreBonuses ----
test('coreBonuses: 从核心对象获取属性', function () {
  var core = CoreSystem.makeCore('white', 5);
  var b = CoreSystem.coreBonuses(core);
  assert.equal(b.atk, 15);
  assert.equal(b.critRate, 0.075);
});

test('coreBonuses: null 返回空对象', function () {
  assertDeepEqual(CoreSystem.coreBonuses(null), {});
});

test('coreBonuses: 无type返回空', function () {
  assertDeepEqual(CoreSystem.coreBonuses({}), {});
});

// ---- equipCore / removeCore ----
test('equipCore: 装备核心到槽位', function () {
  var loadout = { cores: [null, null, null, null] };
  var core = CoreSystem.makeCore('azure', 3);
  CoreSystem.equipCore(loadout, core, 0);
  assert.ok(loadout.cores[0] !== null);
  assert.equal(loadout.cores[0].type, 'azure');
  assert.equal(loadout.cores[0].rank, 3);
});

test('equipCore: 自动扩展数组', function () {
  var loadout = {};
  var core = CoreSystem.makeCore('white', 2);
  CoreSystem.equipCore(loadout, core, 1);
  assert.equal(loadout.cores.length, 4);
  assert.ok(loadout.cores[1] !== null);
});

test('equipCore: 同类核心不能重复装备', function () {
  var loadout = { cores: [] };
  var core1 = CoreSystem.makeCore('azure', 1);
  var core2 = CoreSystem.makeCore('azure', 5);
  CoreSystem.equipCore(loadout, core1, 0);
  var result = CoreSystem.equipCore(loadout, core2, 1);
  assert.equal(result, null);
});

test('equipCore: 无效索引返回 null', function () {
  var loadout = { cores: [null, null, null, null] };
  assert.equal(CoreSystem.equipCore(loadout, {}, -1), null);
  assert.equal(CoreSystem.equipCore(loadout, {}, 4), null);
});

test('removeCore: 移除核心', function () {
  var loadout = { cores: [null, null, CoreSystem.makeCore('black', 6), null] };
  CoreSystem.removeCore(loadout, 2);
  assert.equal(loadout.cores[2], null);
});

test('removeCore: 无效索引不报错', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 1)] };
  assert.equal(CoreSystem.removeCore(loadout, 10), null);
});

test('removeCore: 无 cores 返回 null', function () {
  assert.equal(CoreSystem.removeCore({}, 0), null);
});

test('equip+remove 四种核心', function () {
  var loadout = {};
  var types = ['azure', 'white', 'vermilion', 'black'];
  types.forEach(function (t, i) {
    CoreSystem.equipCore(loadout, CoreSystem.makeCore(t, i + 1), i);
  });
  // Verify 4 cores equipped
  var count = 0;
  for (var i = 0; i < loadout.cores.length; i++) {
    if (loadout.cores[i]) count++;
  }
  assert.equal(count, 4);
  // Remove all
  types.forEach(function (t, i) {
    CoreSystem.removeCore(loadout, i);
  });
  var count2 = 0;
  for (var i = 0; i < loadout.cores.length; i++) {
    if (loadout.cores[i]) count2++;
  }
  assert.equal(count2, 0);
});

// ---- calcTotalBonuses ----
test('calcTotalBonuses: 空配装返回空', function () {
  assertDeepEqual(CoreSystem.calcTotalBonuses({}), {});
});

test('calcTotalBonuses: 单核心加成', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 5)] };
  var b = CoreSystem.calcTotalBonuses(loadout);
  assert.equal(b.matk, 15);
  assert.equal(b.spiritDmg, 0.10);
});

test('calcTotalBonuses: 多核心累加', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 5), CoreSystem.makeCore('white', 3), null, null] };
  var b = CoreSystem.calcTotalBonuses(loadout);
  assert.equal(b.matk, 15);
  assert.equal(b.atk, 9);
  assert.equal(b.critRate, 0.045);
});

// ---- coreUpgradeCost ----
test('coreUpgradeCost: 1级核心消耗', function () {
  var core = CoreSystem.makeCore('azure', 1);
  var cost = CoreSystem.coreUpgradeCost(core);
  assert.equal(cost.gold, Math.floor(500 * Math.pow(1, 1.8)));
  assert.equal(cost.coreFragments, 2);
});

test('coreUpgradeCost: 5级核心消耗', function () {
  var core = CoreSystem.makeCore('azure', 5);
  var cost = CoreSystem.coreUpgradeCost(core);
  assert.equal(cost.gold, Math.floor(500 * Math.pow(5, 1.8)));
  assert.equal(cost.coreFragments, 10);
});

test('coreUpgradeCost: 10级无消耗', function () {
  var core = CoreSystem.makeCore('azure', 10);
  var cost = CoreSystem.coreUpgradeCost(core);
  assert.equal(cost.gold, 0);
  assert.equal(cost.coreFragments, 0);
});

test('coreUpgradeCost: null 返回0', function () {
  var cost = CoreSystem.coreUpgradeCost(null);
  assert.equal(cost.gold, 0);
  assert.equal(cost.coreFragments, 0);
});

// ---- upgradeCore ----
test('upgradeCore: 升级成功', function () {
  var core = CoreSystem.makeCore('azure', 3);
  CoreSystem.upgradeCore(core);
  assert.equal(core.rank, 4);
  assert.equal(core.bonus.matk, 12);
});

test('upgradeCore: 10级无法升级', function () {
  var core = CoreSystem.makeCore('azure', 10);
  var result = CoreSystem.upgradeCore(core);
  assert.equal(result.rank, 10);
});

test('upgradeCore: null 返回 null', function () {
  assert.equal(CoreSystem.upgradeCore(null), null);
});

test('upgradeCore: 连续升级到满', function () {
  var core = CoreSystem.makeCore('white', 1);
  for (var i = 1; i < 10; i++) {
    CoreSystem.upgradeCore(core);
  }
  assert.equal(core.rank, 10);
  assert.equal(core.bonus.atk, 30);
  assert.equal(core.bonus.critRate, 0.15);
});

// ---- SET_BONUSES / checkSetBonus ----
test('SET_BONUSES 定义了3个等级', function () {
  assert.equal(Object.keys(CoreSystem.SET_BONUSES).length, 3);
  assert.ok(CoreSystem.SET_BONUSES[2]);
  assert.ok(CoreSystem.SET_BONUSES[3]);
  assert.ok(CoreSystem.SET_BONUSES[4]);
});

test('checkSetBonus: 无核心返回0级', function () {
  var result = CoreSystem.checkSetBonus({ cores: [] });
  assert.equal(result.level, 0);
  assert.equal(result.desc, '无套装效果');
});

test('checkSetBonus: null 返回0级', function () {
  var result = CoreSystem.checkSetBonus(null);
  assert.equal(result.level, 0);
});

test('checkSetBonus: 2种核心2级套装', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 5), CoreSystem.makeCore('white', 3), null, null] };
  var result = CoreSystem.checkSetBonus(loadout);
  assert.equal(result.level, 2);
  assert.equal(result.bonuses.allAtk, 0.05);
});

test('checkSetBonus: 3种核心3级套装', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 5), CoreSystem.makeCore('white', 3), CoreSystem.makeCore('vermilion', 7), null] };
  var result = CoreSystem.checkSetBonus(loadout);
  assert.equal(result.level, 3);
  assert.equal(result.bonuses.allAtk, 0.10);
  assert.equal(result.bonuses.critRate, 0.03);
});

test('checkSetBonus: 4种核心4级套装', function () {
  var loadout = { cores: [CoreSystem.makeCore('azure', 5), CoreSystem.makeCore('white', 3), CoreSystem.makeCore('vermilion', 7), CoreSystem.makeCore('black', 2)] };
  var result = CoreSystem.checkSetBonus(loadout);
  assert.equal(result.level, 4);
  assert.equal(result.bonuses.allAtk, 0.20);
  assert.equal(result.bonuses.critRate, 0.05);
  assert.equal(result.bonuses.dmgReduce, 0.05);
});

test('checkSetBonus: 重复核心不计入套件数', function () {
  // Two azure + one white = only 2 different types
  var loadout = { cores: [CoreSystem.makeCore('azure', 5), CoreSystem.makeCore('azure', 3), CoreSystem.makeCore('white', 2)] };
  var result = CoreSystem.checkSetBonus(loadout);
  assert.equal(result.level, 2); // Only 2 different types
});

console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('全部通过!');
}
