/**
 * test_rank.js — 排行榜系统单元测试
 * 独立运行：node test_rank.js
 * 覆盖：常量、生成、查询、格式化、颜色
 */
const Rank = require('./rank.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL:', msg, '— expected:', JSON.stringify(expected), 'actual:', JSON.stringify(actual));
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL:', msg, '— expected:', e, 'actual:', a);
  }
}

// ── Test Suite ──
console.log('=== Rank System Tests ===');

// 1. 常量
assert(Array.isArray(Rank.RANK_TYPES), 'RANK_TYPES is array');
assertEqual(Rank.RANK_TYPES.length, 5, 'RANK_TYPES has 5 entries');
assertEqual(Rank.RANK_TYPES[0], 'level', 'RANK_TYPES[0] = level');
assertEqual(Rank.RANK_TYPES[1], 'power', 'RANK_TYPES[1] = power');
assertEqual(Rank.RANK_TYPES[2], 'bossKills', 'RANK_TYPES[2] = bossKills');
assertEqual(Rank.RANK_TYPES[3], 'guild', 'RANK_TYPES[3] = guild');
assertEqual(Rank.RANK_TYPES[4], 'reincarnation', 'RANK_TYPES[4] = reincarnation');

// 2. makeRankings
var rankings = Rank.makeRankings();
assert(rankings !== null && typeof rankings === 'object', 'makeRankings returns object');
assert(Array.isArray(rankings.level), 'rankings.level is array');
assertEqual(rankings.level.length, 20, 'rankings.level has 20 entries');
assertEqual(rankings.power.length, 20, 'rankings.power has 20 entries');
assertEqual(rankings.bossKills.length, 20, 'rankings.bossKills has 20 entries');
assertEqual(rankings.guild.length, 20, 'rankings.guild has 20 entries');
assertEqual(rankings.reincarnation.length, 20, 'rankings.reincarnation has 20 entries');

// 3. 排名条目格式
var entry = rankings.level[0];
assert(entry.rank !== undefined, 'entry has rank');
assert(entry.name !== undefined, 'entry has name');
assert(entry.value !== undefined, 'entry has value');
assert(entry.extra !== undefined, 'entry has extra');
assertEqual(entry.rank, 1, 'first entry rank = 1');

// 4. getRanking
var levelRank = Rank.getRanking('level');
assertEqual(levelRank.length, 20, 'getRanking(level) returns 20 entries');
var badRank = Rank.getRanking('invalid');
assertEqual(badRank.length, 0, 'getRanking(invalid) returns []');

// 5. findPlayerRank
var firstPlayer = rankings.level[0].name;
var found = Rank.findPlayerRank(rankings.level, firstPlayer);
assert(found !== null, 'findPlayerRank finds existing player');
assertEqual(found.name, firstPlayer, 'findPlayerRank correct name');

var notFound = Rank.findPlayerRank(rankings.level, '不存在的人');
assert(notFound === null, 'findPlayerRank returns null for missing player');

var nullResult = Rank.findPlayerRank(null, 'test');
assert(nullResult === null, 'findPlayerRank(null) returns null');

var emptyResult = Rank.findPlayerRank([], 'test');
assert(emptyResult === null, 'findPlayerRank([]) returns null');

// 6. formatRankValue
assertEqual(Rank.formatRankValue('level', 50), 'Lv.50', 'formatRankValue level 50');
assertEqual(Rank.formatRankValue('level', 1), 'Lv.1', 'formatRankValue level 1');
assertEqual(Rank.formatRankValue('power', 12345), '12,345', 'formatRankValue power 12345');
assertEqual(Rank.formatRankValue('power', 1000), '1,000', 'formatRankValue power 1000');
assertEqual(Rank.formatRankValue('bossKills', 1234), '1,234', 'formatRankValue bossKills 1234');
assertEqual(Rank.formatRankValue('guild', '天下会'), '天下会', 'formatRankValue guild');
assertEqual(Rank.formatRankValue('reincarnation', 1), '一转', 'formatRankValue reincarnation 1');
assertEqual(Rank.formatRankValue('reincarnation', 3), '三转', 'formatRankValue reincarnation 3');
assertEqual(Rank.formatRankValue('reincarnation', 10), '十转', 'formatRankValue reincarnation 10');

// 7. rankColor
assertEqual(Rank.rankColor(1), '#FFD700', 'rankColor 1 = gold');
assertEqual(Rank.rankColor(2), '#C0C0C0', 'rankColor 2 = silver');
assertEqual(Rank.rankColor(3), '#CD7F32', 'rankColor 3 = bronze');
assertEqual(Rank.rankColor(4), '#FFFFFF', 'rankColor 4 = white');
assertEqual(Rank.rankColor(20), '#FFFFFF', 'rankColor 20 = white');
assertEqual(Rank.rankColor(0), '#FFFFFF', 'rankColor 0 = white');
assertEqual(Rank.rankColor(-1), '#FFFFFF', 'rankColor -1 = white');

// 8. REINCARN_NAMES 常量
assertEqual(Rank.REINCARN_NAMES.length, 10, 'REINCARN_NAMES has 10 entries');
assertEqual(Rank.REINCARN_NAMES[0], '一转', 'REINCARN_NAMES[0]');

// 9. resetCache 测试
Rank.resetCache();
var afterReset = Rank.getRanking('level');
assertEqual(afterReset.length, 20, 'getRanking after resetCache works');

// ── 排名合理性 ──
assert(rankings.level[0].value > rankings.level[19].value, 'level ranking descending');
assert(rankings.power[0].value > rankings.power[19].value, 'power ranking descending');
assert(rankings.bossKills[0].value > rankings.bossKills[19].value, 'bossKills ranking descending');

// ── 汇总 ──
console.log('');
console.log('Total: ' + (passed + failed) + '  Passed: ' + passed + '  Failed: ' + failed);

if (failed > 0) {
  process.exit(1);
}
