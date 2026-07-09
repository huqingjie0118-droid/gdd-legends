var mt = require('./mount.js');
var assert = require('assert');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS: ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL: ' + name + ' - ' + e.message);
  }
}

console.log('=== mount.js 测试 ===\n');

// 1-3: 常量测试
test('MOUNTS 包含5种坐骑', function() {
  var keys = Object.keys(mt.MOUNTS);
  assert.strictEqual(keys.length, 5);
  assert.ok(keys.indexOf('whiteHorse') !== -1);
  assert.ok(keys.indexOf('wolf') !== -1);
  assert.ok(keys.indexOf('dragon') !== -1);
  assert.ok(keys.indexOf('phoenix') !== -1);
  assert.ok(keys.indexOf('warHorse') !== -1);
});

test('MOUNTS 各坐骑属性正确', function() {
  assert.strictEqual(mt.MOUNTS.whiteHorse.speedBonus, 0.20);
  assert.strictEqual(mt.MOUNTS.whiteHorse.rarity, 'common');
  assert.strictEqual(mt.MOUNTS.phoenix.speedBonus, 0.70);
  assert.strictEqual(mt.MOUNTS.phoenix.rarity, 'legendary');
});

test('OUTLOOKS 包含5种外观', function() {
  var keys = Object.keys(mt.OUTLOOKS);
  assert.strictEqual(keys.length, 5);
  assert.ok(keys.indexOf('default') !== -1);
  assert.ok(keys.indexOf('flame') !== -1);
  assert.ok(keys.indexOf('frost') !== -1);
  assert.ok(keys.indexOf('shadow') !== -1);
  assert.ok(keys.indexOf('holy') !== -1);
});

// 4-5: makeMountCollection 测试
test('makeMountCollection 初始空集合', function() {
  var col = mt.makeMountCollection();
  assert.deepStrictEqual(col.owned, {});
  assert.strictEqual(col.active, null);
});

test('makeMountCollection 每次返回新对象', function() {
  var a = mt.makeMountCollection();
  var b = mt.makeMountCollection();
  assert.notStrictEqual(a, b);
});

// 6-9: playerMountSpeed 测试
test('playerMountSpeed 无坐骑返回1', function() {
  var col = mt.makeMountCollection();
  assert.strictEqual(mt.playerMountSpeed(col), 1);
});

test('playerMountSpeed 空参数返回1', function() {
  assert.strictEqual(mt.playerMountSpeed(null), 1);
});

test('playerMountSpeed 装备白马加速1.2x', function() {
  var col = mt.makeMountCollection();
  col.owned.whiteHorse = true;
  col.active = 'whiteHorse';
  assert.strictEqual(mt.playerMountSpeed(col), 1.20);
});

test('playerMountSpeed 装备凤凰加速1.7x', function() {
  var col = mt.makeMountCollection();
  col.owned.phoenix = true;
  col.active = 'phoenix';
  assert.strictEqual(mt.playerMountSpeed(col), 1.70);
});

// 10-15: canAffordMount 测试
test('canAffordMount 足够金币', function() {
  var state = { gold: 10000, items: {}, guildLevel: 0 };
  assert.strictEqual(mt.canAffordMount('whiteHorse', state), true);
});

test('canAffordMount 金币不足', function() {
  var state = { gold: 1000, items: {}, guildLevel: 0 };
  assert.strictEqual(mt.canAffordMount('whiteHorse', state), false);
});

test('canAffordMount 需要物品但持有', function() {
  var state = { gold: 20000, items: { wolfFang: 1 }, guildLevel: 0 };
  assert.strictEqual(mt.canAffordMount('wolf', state), true);
});

test('canAffordMount 需要物品但缺少', function() {
  var state = { gold: 20000, items: {}, guildLevel: 0 };
  assert.strictEqual(mt.canAffordMount('wolf', state), false);
});

test('canAffordMount 需要公会等级但不够', function() {
  var state = { gold: 10000, items: {}, guildLevel: 1 };
  assert.strictEqual(mt.canAffordMount('warHorse', state), false);
});

test('canAffordMount 无效坐骑ID', function() {
  var state = { gold: 10000, items: {}, guildLevel: 0 };
  assert.strictEqual(mt.canAffordMount('invalid', state), false);
});

// 16-20: purchaseMount 测试
test('purchaseMount 成功购买', function() {
  var col = mt.makeMountCollection();
  var state = { gold: 10000, items: {}, guildLevel: 0 };
  var result = mt.purchaseMount(col, 'whiteHorse', state);
  assert.strictEqual(result, true);
  assert.strictEqual(col.owned.whiteHorse, true);
  assert.strictEqual(state.gold, 5000);
});

test('purchaseMount 金币不足失败', function() {
  var col = mt.makeMountCollection();
  var state = { gold: 1000, items: {}, guildLevel: 0 };
  var result = mt.purchaseMount(col, 'whiteHorse', state);
  assert.strictEqual(result, false);
});

test('purchaseMount 重复购买失败', function() {
  var col = mt.makeMountCollection();
  var state = { gold: 50000, items: {}, guildLevel: 0 };
  mt.purchaseMount(col, 'whiteHorse', state);
  var result = mt.purchaseMount(col, 'whiteHorse', state);
  assert.strictEqual(result, false);
});

test('purchaseMount 物品消耗', function() {
  var col = mt.makeMountCollection();
  var state = { gold: 50000, items: { dragonEgg: 1 }, guildLevel: 0 };
  var result = mt.purchaseMount(col, 'dragon', state);
  assert.strictEqual(result, true);
  assert.strictEqual(state.items.dragonEgg, 0);
});

test('purchaseMount 空collection', function() {
  assert.strictEqual(mt.purchaseMount(null, 'whiteHorse', {}), false);
});

// 21-24: equipMount / unequipMount 测试
test('equipMount 装备已有坐骑', function() {
  var col = mt.makeMountCollection();
  col.owned.wolf = true;
  var result = mt.equipMount(col, 'wolf');
  assert.strictEqual(result, true);
  assert.strictEqual(col.active, 'wolf');
});

test('equipMount 装备未拥有坐骑失败', function() {
  var col = mt.makeMountCollection();
  var result = mt.equipMount(col, 'dragon');
  assert.strictEqual(result, false);
  assert.strictEqual(col.active, null);
});

test('unequipMount 取消装备', function() {
  var col = mt.makeMountCollection();
  col.owned.wolf = true;
  mt.equipMount(col, 'wolf');
  var result = mt.unequipMount(col);
  assert.strictEqual(result, true);
  assert.strictEqual(col.active, null);
});

test('unequipMount 无装备时失败', function() {
  var col = mt.makeMountCollection();
  var result = mt.unequipMount(col);
  assert.strictEqual(result, false);
});

// 25-29: purchaseOutlook 测试
test('purchaseOutlook 成功购买烈焰', function() {
  var owned = {};
  var result = mt.purchaseOutlook(owned, 'flame', 30000);
  assert.strictEqual(result, true);
  assert.strictEqual(owned.flame, true);
});

test('purchaseOutlook 金币不足', function() {
  var owned = {};
  var result = mt.purchaseOutlook(owned, 'flame', 5000);
  assert.strictEqual(result, false);
});

test('purchaseOutlook 重复购买失败', function() {
  var owned = { flame: true };
  var result = mt.purchaseOutlook(owned, 'flame', 50000);
  assert.strictEqual(result, false);
});

test('purchaseOutlook default不可购买', function() {
  var owned = {};
  var result = mt.purchaseOutlook(owned, 'default', 50000);
  assert.strictEqual(result, false);
});

test('purchaseOutlook 无效ID', function() {
  var owned = {};
  var result = mt.purchaseOutlook(owned, 'invalid', 50000);
  assert.strictEqual(result, false);
});

// 30-32: getActiveSkin 测试
test('getActiveSkin 无皮肤返回默认', function() {
  var skin = mt.getActiveSkin({});
  assert.strictEqual(skin.name, '默认');
  assert.strictEqual(skin.color, '#aaa');
});

test('getActiveSkin 购买后返回对应皮肤', function() {
  var owned = {};
  mt.purchaseOutlook(owned, 'shadow', 50000);
  var skin = mt.getActiveSkin(owned);
  assert.strictEqual(skin.name, '暗影');
  assert.strictEqual(skin.color, '#86e');
});

test('getActiveSkin 空参数返回默认', function() {
  var skin = mt.getActiveSkin(null);
  assert.strictEqual(skin.name, '默认');
  assert.strictEqual(skin.color, '#aaa');
});

console.log('\n=== 测试完成: ' + passed + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed > 0 ? 1 : 0);
