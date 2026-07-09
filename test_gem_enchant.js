/**
 * test_gem_enchant.js — 镶嵌附魔系统测试
 * 使用 assertion + count 模式运行
 * 共 30+ 测试用例
 */
var assert = require('assert');
var GemEnchant = require('./gem_enchant.js');

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

console.log('\n=== 宝石模块测试 ===\n');

// ---- GEM_TYPES ----
test('GEM_TYPES 定义正确', function () {
  assert.equal(Object.keys(GemEnchant.GEM_TYPES).length, 5);
  assert.equal(GemEnchant.GEM_TYPES.ruby.stat, 'atk');
  assert.equal(GemEnchant.GEM_TYPES.sapphire.stat, 'matk');
  assert.equal(GemEnchant.GEM_TYPES.topaz.stat, 'critRate');
  assert.equal(GemEnchant.GEM_TYPES.emerald.stat, 'def');
  assert.equal(GemEnchant.GEM_TYPES.amethyst.stat, 'maxHp');
});

// ---- makeGem ----
test('makeGem: 普通红宝石', function () {
  var gem = GemEnchant.makeGem('ruby', 'common');
  assert.equal(gem.type, 'ruby');
  assert.equal(gem.quality, 'common');
  assert.equal(gem.stat, 'atk');
  assert.equal(gem.value, 5);
});

test('makeGem: 稀有蓝宝石', function () {
  var gem = GemEnchant.makeGem('sapphire', 'rare');
  assert.equal(gem.value, 10);
  assert.equal(gem.quality, 'rare');
});

test('makeGem: 史诗黄玉', function () {
  var gem = GemEnchant.makeGem('topaz', 'epic');
  assert.equal(gem.value, 0.08); // 0.02 * 4
  assert.equal(gem.quality, 'epic');
});

test('makeGem: 翡翠缺省品质', function () {
  var gem = GemEnchant.makeGem('emerald');
  assert.equal(gem.quality, 'common');
  assert.equal(gem.value, 4);
});

test('makeGem: 紫晶稀有', function () {
  var gem = GemEnchant.makeGem('amethyst', 'rare');
  assert.equal(gem.value, 60);
});

test('makeGem: 无效类型返回 null', function () {
  var gem = GemEnchant.makeGem('nonexistent', 'common');
  assert.equal(gem, null);
});

test('makeGem: 无效品质返回 null', function () {
  var gem = GemEnchant.makeGem('ruby', 'invalid');
  assert.equal(gem, null);
});

test('makeGem: 5种宝石类型都可创建', function () {
  var types = ['ruby', 'sapphire', 'topaz', 'emerald', 'amethyst'];
  types.forEach(function (t) {
    var gem = GemEnchant.makeGem(t, 'common');
    assert.equal(gem.type, t);
  });
});

// ---- gemStat ----
test('gemStat: 返回 stat/value 对象', function () {
  var gem = GemEnchant.makeGem('ruby', 'epic');
  var s = GemEnchant.gemStat(gem);
  assert.equal(s.stat, 'atk');
  assert.equal(s.value, 20);
});

test('gemStat: null 返回 null', function () {
  assert.equal(GemEnchant.gemStat(null), null);
});

test('gemStat: 无效对象返回 null', function () {
  assert.equal(GemEnchant.gemStat({}), null);
});

// ---- Socket ----
test('MAX_SOCKETS = 3', function () {
  assert.equal(GemEnchant.MAX_SOCKETS, 3);
});

test('SOCKET_COST 数组正确', function () {
  assertDeepEqual(GemEnchant.SOCKET_COST, [2000, 5000, 15000]);
});

test('canAddSocket: 0槽可加', function () {
  var equip = {};
  assert.equal(GemEnchant.canAddSocket(equip, 0), true);
});

test('canAddSocket: 3槽不可加', function () {
  var equip = { sockets: [1, 2, 3] };
  assert.equal(GemEnchant.canAddSocket(equip, 3), false);
});

test('canAddSocket: null 返回 false', function () {
  assert.equal(GemEnchant.canAddSocket(null), false);
});

test('addSocket: 增加槽位', function () {
  var equip = { sockets: [] };
  GemEnchant.addSocket(equip);
  assert.equal(equip.sockets.length, 1);
});

test('addSocket: 不超过最大', function () {
  var equip = { sockets: [1, 2, 3] };
  GemEnchant.addSocket(equip);
  assert.equal(equip.sockets.length, 3);
});

test('addSocket: null 返回 null', function () {
  assert.equal(GemEnchant.addSocket(null), null);
});

test('socketGem: 镶嵌成功', function () {
  var equip = { sockets: [null, null, null] };
  var gem = GemEnchant.makeGem('ruby', 'common');
  GemEnchant.socketGem(equip, gem, 0);
  assert.equal(equip.sockets[0], gem);
});

test('socketGem: 无效索引返回 null', function () {
  var equip = { sockets: [] };
  assert.equal(GemEnchant.socketGem(equip, {}, 5), null);
});

test('socketGem: 无 sockets 属性时初始化', function () {
  var equip = {};
  var gem = GemEnchant.makeGem('ruby', 'common');
  GemEnchant.socketGem(equip, gem, 0);
  assert.equal(equip.sockets.length, 1);
  assert.equal(equip.sockets[0], gem);
});

test('removeGem: 移除成功', function () {
  var gem = GemEnchant.makeGem('ruby', 'common');
  var equip = { sockets: [gem, null, null] };
  var removed = GemEnchant.removeGem(equip, 0);
  assert.equal(removed, gem);
  assert.equal(equip.sockets[0], null);
});

test('removeGem: 空槽返回 null', function () {
  var equip = { sockets: [null, null] };
  assert.equal(GemEnchant.removeGem(equip, 0), null);
});

test('removeGem: 无 sockets 返回 null', function () {
  assert.equal(GemEnchant.removeGem({}, 0), null);
});

// ---- calcGemBonuses ----
test('calcGemBonuses: 空装备返回空对象', function () {
  assertDeepEqual(GemEnchant.calcGemBonuses({}), {});
});

test('calcGemBonuses: null 返回空', function () {
  assertDeepEqual(GemEnchant.calcGemBonuses(null), {});
});

test('calcGemBonuses: 单宝石加成', function () {
  var equip = { sockets: [GemEnchant.makeGem('ruby', 'common'), null, null] };
  var b = GemEnchant.calcGemBonuses(equip);
  assert.equal(b.atk, 5);
});

test('calcGemBonuses: 多宝石累加', function () {
  var equip = {
    sockets: [
      GemEnchant.makeGem('ruby', 'common'),
      GemEnchant.makeGem('ruby', 'epic'),
      GemEnchant.makeGem('sapphire', 'rare')
    ]
  };
  var b = GemEnchant.calcGemBonuses(equip);
  assert.equal(b.atk, 25); // 5 + 20
  assert.equal(b.matk, 10); // 5 * 2
});

// ---- Enchant ----
test('ENCHANT_TYPES 定义正确', function () {
  assert.equal(GemEnchant.ENCHANT_TYPES.length, 7);
});

test('randomEnchant 返回有效结构', function () {
  var ench = GemEnchant.randomEnchant();
  assert.notEqual(GemEnchant.ENCHANT_TYPES.indexOf(ench.type), -1);
  assert.ok(ench.value >= 0.05 && ench.value <= 0.15);
});

test('randomEnchant 多次调用覆盖多种类型', function () {
  var types = {};
  for (var i = 0; i < 100; i++) {
    var ench = GemEnchant.randomEnchant();
    types[ench.type] = true;
  }
  assert.ok(Object.keys(types).length >= 3, '应该覆盖至少3种类型');
});

test('applyEnchant: 应用附魔', function () {
  var equip = {};
  GemEnchant.applyEnchant(equip);
  assert.equal(equip.enchants.length, 1);
  assert.ok(equip.enchants[0].type);
  assert.ok(equip.enchants[0].value);
});

test('applyEnchant: 不超过最大附魔数', function () {
  var equip = { enchants: [{ type: 'atk', value: 0.1 }, { type: 'def', value: 0.1 }, { type: 'hp', value: 0.1 }] };
  GemEnchant.applyEnchant(equip);
  assert.equal(equip.enchants.length, 3);
});

test('applyEnchant: null 返回 null', function () {
  assert.equal(GemEnchant.applyEnchant(null), null);
});

test('enchantCost: 0附魔消耗', function () {
  assert.equal(GemEnchant.enchantCost({ enchants: [] }), 2000);
});

test('enchantCost: 1附魔消耗', function () {
  assert.equal(GemEnchant.enchantCost({ enchants: [{}] }), 3000);
});

test('enchantCost: 2附魔消耗', function () {
  var cost = GemEnchant.enchantCost({ enchants: [{}, {}] });
  assert.equal(cost, Math.floor(2000 + 1000 * Math.pow(2, 1.5)));
});

test('enchantCost: null 返回 0', function () {
  assert.equal(GemEnchant.enchantCost(null), 0);
});

test('enchantCost: 无 enchants 属性返回 2000', function () {
  assert.equal(GemEnchant.enchantCost({}), 2000);
});

console.log('\n=== 测试结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('全部通过!');
}
