// 端到端逻辑校验：加载真实 account.js（技能树全新实现），桩化浏览器全局
const fs = require('fs');
const vm = require('vm');

// ---- 桩化全局 ----
global.window = global;
global.playerProfession = 'warrior';
global.playerEquipment = {};
global.playerStats = {};
global.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
global.playerLevel = 1;
global.playerGold = 999999;
global.CFG = { PLAYER_SPEED: 140 };
global.SKILL_DEFS = {
  warrior: [
    { id: 'atk', name: '普攻', damageMult: 1.0 },
    { id: 'fire', name: '烈火剑法', damageMult: 1.9 },
    { id: 'cleave', name: '横扫千军', damageMult: 1.6 },
    { id: 'rage', name: '野蛮冲撞', damageMult: 1.0 },
    { id: 'berserk', name: '狂暴', damageMult: 0 },
  ],
};
let lastStats = null;
global.calcPlayerStats = function (prof, level, eq) {
  lastStats = { atk: 100, matk: 10, def: 25, mdef: 15, hp: 1000, mp: 120, critRate: 0.05, critDmg: 1.5, lifesteal: 0, dmgReduce: 0, cdr: 0, armorPen: 0, skillRange: 0, mpRegen: 0, spd: 140, maxHp: 1000, maxMp: 120 };
  return lastStats;
};
global.player = { atk: 100, hp: 1000, maxHp: 1000, mp: 120, maxMp: 120, x: 0, y: 0, speed: 140, state: 'idle' };
global.Sound = { levelup(){}, deny(){}, cast(){} };
global.updateTopBarUI = function () {};
global.addFloatText = function () {};
global.skillMultMap = {};

// ---- 加载真实 account.js ----
const code = fs.readFileSync('account.js', 'utf8');
vm.runInThisContext(code);

const A = global.Account;
const recomp = () => A.applyProfileToGame('warrior');
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); } }

// 初始化档案
A.myProfile = { class: 'warrior', level: 1, skillTree: {}, skillPoints: 0, skillResets: 0, advancement: 0 };
global.playerProfession = 'warrior';

console.log('\n[1] 初始状态');
recomp();
ok('初始无终极技', window.ultimateInfo === null);
ok('初始 extraBonuses 为空', Object.keys(window.extraBonuses).length === 0);
ok('初始 war_combat_t1 锁定', A.nodeStatus('war_combat_t1') === 'locked');

console.log('\n[2] 技能点不足时不可学');
ok('0 点时 war_combat_t1 不可升级', A.canUpgrade('war_combat_t1') === false);

console.log('\n[3] 给 10 点并学习第一层');
A.myProfile.skillPoints = 10;
ok('有 10 点 -> war_combat_t1 可解锁', A.canUpgrade('war_combat_t1') === true);
A.upgradeNode('war_combat_t1');
ok('war_combat_t1 已 1 级', A.myProfile.skillTree['war_combat_t1'] === 1);
ok('消耗 1 点 (剩 9)', A.myProfile.skillPoints === 9);
recomp();
ok('atkPct +3% 生效', Math.abs((window.extraBonuses.atkPct||0) - 0.03) < 1e-9, window.extraBonuses.atkPct);

console.log('\n[4] 前置依赖：未学 t1 则 t2 锁定');
ok('war_combat_t2 仍锁定(依赖t1≥1)?? 实际t1已学', A.canUpgrade('war_combat_t2') === true);
// 升满 combat 全分支验证总成本
console.log('\n[5] 单分支(战斗)满点成本 = 47');
global.playerLevel = 30; // combat_t6 需 Lv.30
A.myProfile.skillTree = {}; A.myProfile.skillPoints = 100; A.myProfile.skillResets = 0;
const combatNodes = Object.keys(window.SKILL_TREE_DEFS.warrior.nodes).filter(id => window.SKILL_TREE_DEFS.warrior.nodes[id].branch === 'combat');
let spentBefore = A.myProfile.skillPoints;
// 按顺序（按 tier）升级到满
const ordered = combatNodes.slice().sort((a,b)=>window.SKILL_TREE_DEFS.warrior.nodes[a].tier - window.SKILL_TREE_DEFS.warrior.nodes[b].tier);
for (const id of ordered) {
  const node = window.SKILL_TREE_DEFS.warrior.nodes[id];
  for (let i = 0; i < node.maxLevel; i++) {
    if (!A.canUpgrade(id)) break;
    A.upgradeNode(id);
  }
}
const combatCost = spentBefore - A.myProfile.skillPoints;
ok('战斗分支满点成本 = 47', combatCost === 47, '实际 ' + combatCost);

console.log('\n[6] 终极技信息 (combat_t6)');
A.myProfile.skillTree['war_combat_t6'] = 1;
global.playerLevel = 30;
recomp();
ok('终极技已解锁', !!window.ultimateInfo);
ok('终极技 atkPct = 0.40', Math.abs((window.ultimateInfo.atkPct||0) - 0.40) < 1e-9, window.ultimateInfo && window.ultimateInfo.atkPct);
ok('终极技 lifesteal = 0.15', Math.abs((window.ultimateInfo.lifesteal||0) - 0.15) < 1e-9);

console.log('\n[7] 增伤 map (烈火强化 fire)');
A.myProfile.skillTree = { 'war_combat_t2': 4 };
recomp();
ok('fire 增伤 +32%', Math.abs((window.skillMultMap.fire||0) - 0.32) < 1e-9, window.skillMultMap.fire);

console.log('\n[8] 洗点返还');
A.myProfile.skillTree = { 'war_combat_t1': 3, 'war_combat_t2': 2 }; // 花费 1+1+2 + 1+1 = 6
A.myProfile.skillPoints = 0; A.myProfile.skillResets = 0;
global.playerGold = 999999;
A.resetTree();
ok('洗点后技能树清空', Object.keys(A.myProfile.skillTree).length === 0);
ok('洗点返还 6 点', A.myProfile.skillPoints === 6, '实际 ' + A.myProfile.skillPoints);
ok('skillResets = 1', A.myProfile.skillResets === 1);

console.log('\n[9] 升级里程碑发放');
A.myProfile.skillPoints = 0;
global.playerLevel = 5; A.onLevelUp();
ok('Lv5 升级发 3 点(1+每5级2)', A.myProfile.skillPoints === 3, '实际 ' + A.myProfile.skillPoints);
A.myProfile.skillPoints = 0;
global.playerLevel = 10; A.onLevelUp();
ok('Lv10 升级发 6 点(1+2+3)', A.myProfile.skillPoints === 6, '实际 ' + A.myProfile.skillPoints);
A.myProfile.skillPoints = 0;
global.playerLevel = 7; A.onLevelUp();
ok('Lv7 升级发 1 点', A.myProfile.skillPoints === 1, '实际 ' + A.myProfile.skillPoints);

console.log('\n[10] 全职业节点数 = 18');
['warrior','mage','taoist'].forEach(p => {
  const n = Object.keys(window.SKILL_TREE_DEFS[p].nodes).length;
  ok(p + ' 节点数 = 18', n === 18, '实际 ' + n);
});

console.log('\n================ 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ================');
process.exit(fail ? 1 : 0);
