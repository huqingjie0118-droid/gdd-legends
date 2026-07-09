var bp = require('./body_part.js');
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

console.log('=== body_part.js 测试 ===\n');

// 1-5: 常量测试
test('BODY_PARTS 包含5个部位', function() {
  assert.strictEqual(bp.BODY_PARTS.length, 5);
  assert.deepStrictEqual(bp.BODY_PARTS, ['head','arms','torso','legs','wings']);
});

test('PART_MULTIPLIERS 定义正确', function() {
  assert.strictEqual(bp.PART_MULTIPLIERS.head, 0.25);
  assert.strictEqual(bp.PART_MULTIPLIERS.arms, 0.20);
  assert.strictEqual(bp.PART_MULTIPLIERS.torso, 0.35);
  assert.strictEqual(bp.PART_MULTIPLIERS.legs, 0.15);
  assert.strictEqual(bp.PART_MULTIPLIERS.wings, 0.10);
});

test('PART_REWARDS 包含所有部位', function() {
  var rewards = bp.PART_REWARDS;
  assert.ok(rewards.head);
  assert.ok(rewards.arms);
  assert.ok(rewards.torso);
  assert.ok(rewards.legs);
  assert.ok(rewards.wings);
});

test('PART_NAMES 中文翻译正确', function() {
  assert.strictEqual(bp.PART_NAMES.head, '头部');
  assert.strictEqual(bp.PART_NAMES.arms, '双臂');
  assert.strictEqual(bp.PART_NAMES.torso, '躯干');
  assert.strictEqual(bp.PART_NAMES.legs, '双腿');
  assert.strictEqual(bp.PART_NAMES.wings, '翅膀');
});

test('PART_NAMES 有5个条目', function() {
  assert.strictEqual(Object.keys(bp.PART_NAMES).length, 5);
});

// 6-10: makeParts 测试
test('makeParts 创建5个部位', function() {
  var parts = bp.makeParts(10000);
  var keys = Object.keys(parts);
  assert.strictEqual(keys.length, 5);
});

test('makeParts 各部位HP按比例分配', function() {
  var parts = bp.makeParts(10000);
  assert.strictEqual(parts.head.hp, 2500);
  assert.strictEqual(parts.arms.hp, 2000);
  assert.strictEqual(parts.torso.hp, 3500);
  assert.strictEqual(parts.legs.hp, 1500);
  assert.strictEqual(parts.wings.hp, 1000);
});

test('makeParts 默认maxHp为1000', function() {
  var parts = bp.makeParts();
  assert.strictEqual(parts.head.hp, 250);
});

test('makeParts 各部位初始状态正确', function() {
  var parts = bp.makeParts(5000);
  Object.keys(parts).forEach(function(k) {
    assert.strictEqual(parts[k].destroyed, false);
    assert.strictEqual(parts[k].rewardClaimed, false);
    assert.strictEqual(parts[k].hp, parts[k].maxHp);
  });
});

test('makeParts 处理负数maxHp', function() {
  var parts = bp.makeParts(-100);
  assert.ok(parts.head.hp > 0);
});

// 11-15: hitPart 测试
test('hitPart 正常伤害', function() {
  var parts = bp.makeParts(10000);
  var result = bp.hitPart(parts, 'head', 500);
  assert.strictEqual(result.destroyed, false);
  assert.strictEqual(result.reward, null);
  assert.strictEqual(parts.head.hp, 2000);
});

test('hitPart 摧毁部位并返回奖励', function() {
  var parts = bp.makeParts(10000);
  var result = bp.hitPart(parts, 'wings', 10000);
  assert.strictEqual(result.destroyed, true);
  assert.ok(result.reward !== null);
  assert.strictEqual(parts.wings.destroyed, true);
});

test('hitPart 对已摧毁部位无效果', function() {
  var parts = bp.makeParts(10000);
  bp.hitPart(parts, 'legs', 10000);
  var result = bp.hitPart(parts, 'legs', 100);
  assert.strictEqual(result.destroyed, false);
  assert.strictEqual(result.reward, null);
});

test('hitPart 无效部位名', function() {
  var parts = bp.makeParts(10000);
  var result = bp.hitPart(parts, 'tail', 100);
  assert.strictEqual(result.destroyed, false);
  assert.strictEqual(result.reward, null);
});

test('hitPart 空parts参数', function() {
  var result = bp.hitPart(null, 'head', 100);
  assert.strictEqual(result.destroyed, false);
  assert.strictEqual(result.reward, null);
});

// 16-20: destroyReward, getDestroyedCount, allDestroyed, partColor 测试
test('destroyReward 各部位奖励描述', function() {
  assert.ok(bp.destroyReward('head').length > 0);
  assert.ok(bp.destroyReward('arms').length > 0);
  assert.ok(bp.destroyReward('torso').length > 0);
  assert.ok(bp.destroyReward('legs').length > 0);
  assert.ok(bp.destroyReward('wings').length > 0);
});

test('destroyReward 未知部位返回默认', function() {
  assert.strictEqual(bp.destroyReward('unknown'), '未知奖励');
});

test('getDestroyedCount 初始为0', function() {
  var parts = bp.makeParts(10000);
  assert.strictEqual(bp.getDestroyedCount(parts), 0);
});

test('getDestroyedCount 摧毁后计数', function() {
  var parts = bp.makeParts(10000);
  bp.hitPart(parts, 'head', 99999);
  bp.hitPart(parts, 'wings', 99999);
  assert.strictEqual(bp.getDestroyedCount(parts), 2);
});

test('getDestroyedCount 空参数返回0', function() {
  assert.strictEqual(bp.getDestroyedCount(null), 0);
});

// 21-23: allDestroyed 测试
test('allDestroyed 初始为false', function() {
  var parts = bp.makeParts(5000);
  assert.strictEqual(bp.allDestroyed(parts), false);
});

test('allDestroyed 全部摧毁后为true', function() {
  var parts = bp.makeParts(5000);
  bp.BODY_PARTS.forEach(function(name) {
    bp.hitPart(parts, name, 99999);
  });
  assert.strictEqual(bp.allDestroyed(parts), true);
});

test('allDestroyed 部分摧毁为false', function() {
  var parts = bp.makeParts(5000);
  bp.hitPart(parts, 'head', 99999);
  bp.hitPart(parts, 'arms', 99999);
  assert.strictEqual(bp.allDestroyed(parts), false);
});

// 24-28: partColor 测试
test('partColor 存活为绿色', function() {
  var parts = bp.makeParts(10000);
  assert.strictEqual(bp.partColor('head', parts), '#4caf50');
});

test('partColor 摧毁为红色', function() {
  var parts = bp.makeParts(10000);
  bp.hitPart(parts, 'head', 99999);
  assert.strictEqual(bp.partColor('head', parts), '#f44336');
});

test('partColor 残血(<=25%)为黄色', function() {
  var parts = bp.makeParts(10000);
  bp.hitPart(parts, 'head', 1876);
  assert.strictEqual(bp.partColor('head', parts), '#ffeb3b');
});

test('partColor 无效名称返回灰色', function() {
  var parts = bp.makeParts(10000);
  assert.strictEqual(bp.partColor('tail', parts), '#888');
});

test('partColor 空parts返回灰色', function() {
  assert.strictEqual(bp.partColor('head', null), '#888');
});

console.log('\n=== 测试完成: ' + passed + ' 通过, ' + failed + ' 失败 ===');
process.exit(failed > 0 ? 1 : 0);
