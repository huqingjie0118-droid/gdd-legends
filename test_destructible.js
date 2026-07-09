var ds = require('./destructible.js');
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

console.log('=== destructible.js 测试 ===\n');

// 1-4: 常量测试
test('DEST_TYPES 包含5种类型', function() {
  assert.strictEqual(ds.DEST_TYPES.length, 5);
  assert.deepStrictEqual(ds.DEST_TYPES, ['crate','vase','mushroom','ore','herb']);
});

test('DEST_PROPS 每种类型都有hp', function() {
  assert.strictEqual(ds.DEST_PROPS.crate.hp, 30);
  assert.strictEqual(ds.DEST_PROPS.vase.hp, 20);
  assert.strictEqual(ds.DEST_PROPS.mushroom.hp, 10);
  assert.strictEqual(ds.DEST_PROPS.ore.hp, 60);
  assert.strictEqual(ds.DEST_PROPS.herb.hp, 15);
});

test('RESPAWN_TIME 为30秒', function() {
  assert.strictEqual(ds.RESPAWN_TIME, 30);
});

test('DEST_NAMES 中文翻译正确', function() {
  assert.strictEqual(ds.DEST_NAMES.crate, '木箱');
  assert.strictEqual(ds.DEST_NAMES.vase, '花瓶');
  assert.strictEqual(ds.DEST_NAMES.mushroom, '蘑菇');
  assert.strictEqual(ds.DEST_NAMES.ore, '矿石');
  assert.strictEqual(ds.DEST_NAMES.herb, '药草');
});

// 5-9: makeDestructible 测试
test('makeDestructible crate', function() {
  var obj = ds.makeDestructible('crate', 100, 200);
  assert.strictEqual(obj.type, 'crate');
  assert.strictEqual(obj.x, 100);
  assert.strictEqual(obj.y, 200);
  assert.strictEqual(obj.hp, 30);
  assert.strictEqual(obj.maxHp, 30);
  assert.strictEqual(obj.state, 'alive');
  assert.strictEqual(obj.respawnTimer, 0);
  assert.ok(obj.id > 0);
});

test('makeDestructible 默认坐标0', function() {
  var obj = ds.makeDestructible('vase');
  assert.strictEqual(obj.x, 0);
  assert.strictEqual(obj.y, 0);
});

test('makeDestructible 无效类型回退crate', function() {
  var obj = ds.makeDestructible('unknown', 50, 50);
  assert.strictEqual(obj.type, 'crate');
  assert.strictEqual(obj.hp, 30);
});

test('makeDestructible 每种类型ID唯一', function() {
  var a = ds.makeDestructible('crate', 0, 0);
  var b = ds.makeDestructible('vase', 0, 0);
  assert.notStrictEqual(a.id, b.id);
});

test('makeDestructible 初始化各类型hp', function() {
  assert.strictEqual(ds.makeDestructible('ore', 0, 0).hp, 60);
  assert.strictEqual(ds.makeDestructible('herb', 0, 0).hp, 15);
  assert.strictEqual(ds.makeDestructible('mushroom', 0, 0).hp, 10);
});

// 10-14: hitDestructible 测试
test('hitDestructible 正常伤害', function() {
  var obj = ds.makeDestructible('crate', 0, 0);
  var res = ds.hitDestructible(obj, 10);
  assert.strictEqual(res.destroyed, false);
  assert.strictEqual(res.drops, null);
  assert.strictEqual(obj.hp, 20);
});

test('hitDestructible 摧毁对象', function() {
  var obj = ds.makeDestructible('crate', 0, 0);
  var res = ds.hitDestructible(obj, 30);
  assert.strictEqual(res.destroyed, true);
  assert.ok(res.drops !== null);
  assert.strictEqual(obj.state, 'destroyed');
  assert.strictEqual(obj.respawnTimer, ds.RESPAWN_TIME);
});

test('hitDestructible 已摧毁对象无效果', function() {
  var obj = ds.makeDestructible('vase', 0, 0);
  ds.hitDestructible(obj, 999);
  var res = ds.hitDestructible(obj, 10);
  assert.strictEqual(res.destroyed, false);
  assert.strictEqual(res.drops, null);
});

test('hitDestructible 伤害超出', function() {
  var obj = ds.makeDestructible('mushroom', 0, 0);
  var res = ds.hitDestructible(obj, 100);
  assert.strictEqual(res.destroyed, true);
  assert.strictEqual(obj.hp, 0);
});

test('hitDestructible 空参数', function() {
  var res = ds.hitDestructible(null, 10);
  assert.strictEqual(res.destroyed, false);
  assert.strictEqual(res.drops, null);
});

// 15-19: tickRespawn 测试
test('tickRespawn 存活对象返回false', function() {
  var obj = ds.makeDestructible('ore', 0, 0);
  assert.strictEqual(ds.tickRespawn(obj, 5), false);
});

test('tickRespawn 倒计时未结束返回false', function() {
  var obj = ds.makeDestructible('ore', 0, 0);
  ds.hitDestructible(obj, 999);
  assert.strictEqual(ds.tickRespawn(obj, 10), false);
});

test('tickRespawn 倒计时结束重生', function() {
  var obj = ds.makeDestructible('ore', 0, 0);
  ds.hitDestructible(obj, 999);
  assert.strictEqual(ds.tickRespawn(obj, 30), true);
  assert.strictEqual(obj.state, 'alive');
  assert.strictEqual(obj.hp, 60);
  assert.strictEqual(obj.respawnTimer, 0);
});

test('tickRespawn 多次累计', function() {
  var obj = ds.makeDestructible('herb', 0, 0);
  ds.hitDestructible(obj, 999);
  ds.tickRespawn(obj, 20);
  assert.strictEqual(obj.state, 'destroyed');
  ds.tickRespawn(obj, 10);
  assert.strictEqual(obj.state, 'alive');
});

test('tickRespawn 空参数返回false', function() {
  assert.strictEqual(ds.tickRespawn(null, 10), false);
});

// 20-23: getDrop 测试
test('getDrop crate返回金币', function() {
  var obj = ds.makeDestructible('crate', 0, 0);
  var drop = ds.getDrop(obj);
  assert.ok(drop.gold >= 5 && drop.gold <= 15);
});

test('getDrop herb返回物品和回血', function() {
  var obj = ds.makeDestructible('herb', 0, 0);
  var drop = ds.getDrop(obj);
  assert.strictEqual(drop.item, 'material');
  assert.strictEqual(drop.heal, 10);
});

test('getDrop ore返回金币和stone', function() {
  var obj = ds.makeDestructible('ore', 0, 0);
  var drop = ds.getDrop(obj);
  assert.ok(drop.gold >= 10 && drop.gold <= 30);
  assert.strictEqual(drop.item, 'stone');
});

test('getDrop 空参数返回null', function() {
  assert.strictEqual(ds.getDrop(null), null);
});

// 24-25: physicsFeedback 测试
test('physicsFeedback 结构正确', function() {
  var fb = ds.physicsFeedback();
  assert.strictEqual(fb.shake, 3);
  assert.deepStrictEqual(fb.particles, ['debris']);
  assert.strictEqual(fb.sound, 'smash');
});

test('physicsFeedback 返回值不变', function() {
  var fb1 = ds.physicsFeedback();
  var fb2 = ds.physicsFeedback();
  assert.deepStrictEqual(fb1, fb2);
});

console.log('\n=== 测试完成: ' + passed + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed > 0 ? 1 : 0);
