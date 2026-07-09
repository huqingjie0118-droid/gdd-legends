/**
 * test_guild.js — 公会系统单元测试
 * 独立运行：node test_guild.js
 * 覆盖：常量、创建、成员管理、贡献、等级、加成、检查、Mock数据
 */
const Guild = require('./guild.js');

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

function assertApprox(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error('  FAIL:', msg, '— expected ~', expected, 'actual:', actual);
  }
}

// ── Test Suite ──
console.log('=== Guild System Tests ===');

// 1. 常量
assertEqual(Guild.MAX_MEMBERS, 30, 'MAX_MEMBERS = 30');
assertEqual(Guild.CREATE_COST, 5000, 'CREATE_COST = 5000');

// 2. makeGuild
var guild = Guild.makeGuild('天下会', '赵天龙');
assert(guild !== null, 'makeGuild returns object');
assertEqual(guild.name, '天下会', 'guild name');
assertEqual(guild.leader, '赵天龙', 'guild leader');
assertEqual(guild.level, 1, 'initial level = 1');
assertEqual(guild.exp, 0, 'initial exp = 0');
assert(guild.id !== undefined && guild.id !== null, 'guild has id');
assert(typeof guild.createdAt === 'number', 'createdAt is number');
assert(Array.isArray(guild.members), 'members is array');
assertEqual(guild.members.length, 1, 'initial members = 1');
assertEqual(guild.members[0].name, '赵天龙', 'first member is founder');
assertEqual(guild.members[0].role, 'leader', 'founder role = leader');
assertEqual(guild.members[0].contribution, 0, 'founder contribution = 0');

// 3. makeGuild with null/empty
var nullGuild = Guild.makeGuild(null, 'test');
assert(nullGuild === null, 'makeGuild(null, test) returns null');

var emptyName = Guild.makeGuild('', 'test');
assert(emptyName === null, 'makeGuild("", test) returns null');

var noFounder = Guild.makeGuild('test', null);
assert(noFounder === null, 'makeGuild(test, null) returns null');

// 4. guildExpForLevel
assertEqual(Guild.guildExpForLevel(1), 200, 'exp for level 1 = 200');
assertEqual(Guild.guildExpForLevel(2), Math.round(200 * Math.pow(2, 1.5)), 'exp for level 2');
assertEqual(Guild.guildExpForLevel(5), Math.round(200 * Math.pow(5, 1.5)), 'exp for level 5');
assertEqual(Guild.guildExpForLevel(0), 0, 'exp for level 0 = 0');
assertEqual(Guild.guildExpForLevel(-1), 0, 'exp for level -1 = 0');

// 5. addMember
var result1 = Guild.addMember(guild, '李凌云');
assertEqual(result1, 'ok', 'addMember success');
assertEqual(guild.members.length, 2, 'members count after add');
assertEqual(guild.members[1].name, '李凌云', 'added member name');
assertEqual(guild.members[1].role, 'member', 'added member role = member');
assertEqual(guild.members[1].contribution, 0, 'added member contrib = 0');

// 6. addMember duplicate
var dup = Guild.addMember(guild, '李凌云');
assertEqual(dup, '该角色已在公会中', 'addMember duplicate detected');

// 7. addMember invalid
var invalidGuild = Guild.addMember(null, 'test');
assertEqual(invalidGuild, '无效的公会或角色名', 'addMember null guild');
var invalidName = Guild.addMember(guild, null);
assertEqual(invalidName, '无效的公会或角色名', 'addMember null name');

// 8. removeMember
var rm = Guild.removeMember(guild, '李凌云');
assertEqual(rm, 'ok', 'removeMember success');
assertEqual(guild.members.length, 1, 'members after remove');

// 9. removeMember not found
var rmNotFound = Guild.removeMember(guild, '不存在');
assertEqual(rmNotFound, '未找到该成员', 'removeMember not found');

// 10. removeMember leader
var rmLeader = Guild.removeMember(guild, '赵天龙');
assertEqual(rmLeader, '无法移除会长', 'removeMember leader blocked');

// 11. removeMember invalid
var rmNull = Guild.removeMember(null, 'test');
assertEqual(rmNull, '无效的公会或角色名', 'removeMember null guild');
var rmNullName = Guild.removeMember(guild, null);
assertEqual(rmNullName, '无效的公会或角色名', 'removeMember null name');

// 12. contribute
Guild.addMember(guild, '王啸天');
var cont = Guild.contribute(guild, '王啸天', 1000);
assertEqual(cont, 'ok', 'contribute success');
assertEqual(guild.members[1].contribution, 1000, 'member contrib after contribute');
assert(guild.exp >= 500, 'guild exp gained from contribute'); // exp += amount/2

// 13. contribute invalid
var contBad = Guild.contribute(guild, '不存在', 100);
assertEqual(contBad, '未找到该成员', 'contribute member not found');
var contNeg = Guild.contribute(guild, '王啸天', 0);
assertEqual(contNeg, '无效参数', 'contribute zero amount');
var contNull = Guild.contribute(null, 'test', 100);
assertEqual(contNull, '无效参数', 'contribute null guild');

// 14. donateGold
var expBefore = guild.exp;
var don = Guild.donateGold(guild, '王啸天', 2000);
assertEqual(don, 'ok', 'donateGold success');
assertEqual(guild.members[1].contribution, 1000 + 1000, 'member contrib after donate');
assertEqual(guild.exp, expBefore + 1000, 'guild exp after donate');

// 15. donateGold invalid
var donBad = Guild.donateGold(guild, '不存在', 100);
assertEqual(donBad, '未找到该成员', 'donateGold member not found');
var donZero = Guild.donateGold(guild, '王啸天', 0);
assertEqual(donZero, '无效参数', 'donateGold zero');
var donNull = Guild.donateGold(null, 'test', 100);
assertEqual(donNull, '无效参数', 'donateGold null guild');

// 16. getMemberCount
assertEqual(Guild.getMemberCount(guild), 2, 'getMemberCount = 2');
assertEqual(Guild.getMemberCount(null), 0, 'getMemberCount null = 0');
assertEqual(Guild.getMemberCount({}), 0, 'getMemberCount no members = 0');

// 17. guildLevel
var freshGuild = Guild.makeGuild('新手村', '张三');
assertEqual(Guild.guildLevel(freshGuild), 1, 'fresh guild level = 1');

// 18. guildLevel with exp
var expGuild = Guild.makeGuild('经验公会', '李四');
expGuild.exp = 500; // enough for level 2 (200) but not level 3 (200*2^1.5 ≈ 566)
assertEqual(Guild.guildLevel(expGuild), 2, 'guildLevel with 500 exp = 2');

expGuild.exp = 200 + Math.round(200 * Math.pow(2, 1.5)); // exactly enough for level 3
assertEqual(Guild.guildLevel(expGuild), 3, 'guildLevel enough for level 3');

// 19. guildLevel null/undefined
assertEqual(Guild.guildLevel(null), 0, 'guildLevel null = 0');
assertEqual(Guild.guildLevel({}), 1, 'guildLevel empty obj = 1');

// 20. levelBonuses
var b1 = Guild.levelBonuses(1);
assertEqual(b1.atkPct, 0.02, 'level 1 atkPct');
assertEqual(b1.hpPct, 0.03, 'level 1 hpPct');
assertEqual(b1.defPct, 0.01, 'level 1 defPct');

var b5 = Guild.levelBonuses(5);
assertEqual(b5.atkPct, 0.10, 'level 5 atkPct');
assertEqual(b5.hpPct, 0.15, 'level 5 hpPct');
assertEqual(b5.defPct, 0.05, 'level 5 defPct');

var b0 = Guild.levelBonuses(0);
assertEqual(b0.atkPct, 0, 'level 0 atkPct');
assertEqual(b0.hpPct, 0, 'level 0 hpPct');
assertEqual(b0.defPct, 0, 'level 0 defPct');

var bNeg = Guild.levelBonuses(-1);
assertEqual(bNeg.atkPct, 0, 'level -1 atkPct clamped');

// 21. canCreate
var cc1 = Guild.canCreate(10000, null);
assert(cc1.ok === true, 'canCreate sufficient gold, no guild');

var cc2 = Guild.canCreate(1000, null);
assert(cc2.ok === false, 'canCreate insufficient gold');
assert(cc2.reason.indexOf('金币') !== -1, 'canCreate reason mentions gold');

var cc3 = Guild.canCreate(10000, freshGuild);
assert(cc3.ok === false, 'canCreate already in guild');
assert(cc3.reason.indexOf('公会') !== -1, 'canCreate reason mentions guild');

// 22. makeMockGuilds
var mockGuilds = Guild.makeMockGuilds();
assert(Array.isArray(mockGuilds), 'makeMockGuilds returns array');
assertEqual(mockGuilds.length, 5, '5 mock guilds');

// 23. mock guild structure
var firstMock = mockGuilds[0];
assert(firstMock.name !== undefined, 'mock guild has name');
assert(firstMock.leader !== undefined, 'mock guild has leader');
assert(firstMock.level >= 1, 'mock guild level >= 1');
assert(firstMock.members.length >= 1, 'mock guild has members');

// 24. mock guild members include leader
var hasLeader = firstMock.members.some(function (m) { return m.name === firstMock.leader; });
assert(hasLeader, 'mock guild leader is in members');

// 25. updateLevel
var updGuild = Guild.makeGuild('升级测试', '张三');
updGuild.exp = 500;
Guild.updateLevel(updGuild);
assertEqual(updGuild.level, 2, 'updateLevel set level to 2');

// 26. getCreateCost / getMaxMembers helpers
assertEqual(Guild.getCreateCost(), 5000, 'getCreateCost');
assertEqual(Guild.getMaxMembers(), 30, 'getMaxMembers');

// 27. addMember full guild
var fullGuild = Guild.makeGuild('人满', '会长');
for (var i = 0; i < 29; i++) {
  Guild.addMember(fullGuild, '成员' + i);
}
assertEqual(fullGuild.members.length, 30, 'full guild has 30 members');
var fullResult = Guild.addMember(fullGuild, '进不来');
assertEqual(fullResult, '公会成员已满', 'addMember to full guild rejected');

// ── 汇总 ──
console.log('');
console.log('Total: ' + (passed + failed) + '  Passed: ' + passed + '  Failed: ' + failed);

if (failed > 0) {
  process.exit(1);
}
