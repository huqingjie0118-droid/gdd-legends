/*
 * guild.js — 公会系统模块
 * 双模式：浏览器 <script> 挂载 window.Guild；Node 下 module.exports（供测试）。
 * 功能：公会创建、成员管理、贡献、等级、Mock 数据
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Guild = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 常量 ──
  const MAX_MEMBERS = 30;
  const CREATE_COST = 5000; // 创建公会所需金币

  let _nextId = 1001;

  function _nextGuildId() {
    return 'g' + (_nextId++);
  }

  // ── 创建公会 ──
  function makeGuild(name, founder) {
    if (!name || !founder) return null;
    const now = Date.now();
    return {
      id: _nextGuildId(),
      name: name,
      leader: founder,
      level: 1,
      exp: 0,
      members: [{
        name: founder,
        role: 'leader',
        contribution: 0,
        joinTime: now,
      }],
      announcements: '',
      createdAt: now,
    };
  }

  // ── 公会升级所需经验 ──
  function guildExpForLevel(level) {
    if (level < 1) return 0;
    return Math.round(200 * Math.pow(level, 1.5));
  }

  // ── 添加成员 ──
  function addMember(guild, name) {
    if (!guild || !name) return '无效的公会或角色名';
    if (guild.members.length >= MAX_MEMBERS) return '公会成员已满';
    for (let i = 0; i < guild.members.length; i++) {
      if (guild.members[i].name === name) return '该角色已在公会中';
    }
    guild.members.push({
      name: name,
      role: 'member',
      contribution: 0,
      joinTime: Date.now(),
    });
    return 'ok';
  }

  // ── 移除成员 ──
  function removeMember(guild, name) {
    if (!guild || !name) return '无效的公会或角色名';
    if (guild.leader === name) return '无法移除会长';
    const idx = guild.members.findIndex(function (m) { return m.name === name; });
    if (idx === -1) return '未找到该成员';
    guild.members.splice(idx, 1);
    return 'ok';
  }

  // ── 成员贡献（公会活动贡献点） ──
  function contribute(guild, name, amount) {
    if (!guild || !name || amount <= 0) return '无效参数';
    const member = guild.members.find(function (m) { return m.name === name; });
    if (!member) return '未找到该成员';
    member.contribution += amount;
    guild.exp += Math.round(amount / 2);
    return 'ok';
  }

  // ── 捐献金币 ──
  function donateGold(guild, name, gold) {
    if (!guild || !name || gold <= 0) return '无效参数';
    const member = guild.members.find(function (m) { return m.name === name; });
    if (!member) return '未找到该成员';
    // 实际游戏中应扣减玩家金币，此处仅记录
    member.contribution += Math.round(gold / 2);
    guild.exp += Math.round(gold / 2);
    return 'ok';
  }

  // ── 获取成员数量 ──
  function getMemberCount(guild) {
    if (!guild || !guild.members) return 0;
    return guild.members.length;
  }

  // ── 根据经验计算公会等级 ──
  function guildLevel(guild) {
    if (!guild) return 0;
    let lv = guild.level || 1;
    let exp = guild.exp || 0;
    // 从当前等级开始检查升级
    while (exp >= guildExpForLevel(lv)) {
      exp -= guildExpForLevel(lv);
      lv++;
    }
    return lv;
  }

  // ── 更新公会等级（根据当前经验重新计算并应用） ──
  function updateLevel(guild) {
    if (!guild) return;
    const newLevel = guildLevel(guild);
    guild.level = newLevel;
  }

  // ── 等级加成 ──
  function levelBonuses(level) {
    level = Math.max(0, level);
    return {
      atkPct: level * 0.02,
      hpPct: level * 0.03,
      defPct: level * 0.01,
    };
  }

  // ── 检查是否可以创建公会 ──
  function canCreate(playerGold, existingGuild) {
    if (playerGold < CREATE_COST) return { ok: false, reason: '金币不足，需要 ' + CREATE_COST + ' 金币' };
    if (existingGuild) return { ok: false, reason: '已加入公会' };
    return { ok: true, reason: '' };
  }

  // ── 生成 Mock 公会数据 ──
  function makeMockGuilds() {
    const guilds = [];
    const guildDefs = [
      { name: '天下会',  leader: '赵天龙' },
      { name: '龙魂殿',  leader: '钱飞龙' },
      { name: '剑阁',    leader: '孙剑心' },
      { name: '烟雨楼',  leader: '李慕白' },
      { name: '青云门',  leader: '周逸仙' },
    ];

    for (let i = 0; i < guildDefs.length; i++) {
      const def = guildDefs[i];
      const g = makeGuild(def.name, def.leader);
      // 给一些初始经验
      g.exp = Math.round(200 * Math.pow(i + 1, 1.5) * (0.8 + Math.random() * 0.4));
      updateLevel(g);

      // 添加一些成员
      const memberNames = [
        '王啸天', '李凌云', '张傲世', '陈星宇', '刘皓月',
        '杨无双', '黄至尊', '吴绝世', '许非凡', '何卓越',
      ];
      const count = 3 + i * 2;
      for (let j = 0; j < Math.min(count, MAX_MEMBERS - 1); j++) {
        addMember(g, memberNames[j % memberNames.length] + (j >= memberNames.length ? '_' + j : ''));
      }
      guilds.push(g);
    }
    return guilds;
  }

  // ── 工具 ──
  function getCreateCost() { return CREATE_COST; }
  function getMaxMembers() { return MAX_MEMBERS; }

  return {
    MAX_MEMBERS: MAX_MEMBERS,
    CREATE_COST: CREATE_COST,
    makeGuild: makeGuild,
    guildExpForLevel: guildExpForLevel,
    addMember: addMember,
    removeMember: removeMember,
    contribute: contribute,
    donateGold: donateGold,
    getMemberCount: getMemberCount,
    guildLevel: guildLevel,
    updateLevel: updateLevel,
    levelBonuses: levelBonuses,
    canCreate: canCreate,
    makeMockGuilds: makeMockGuilds,
    getCreateCost: getCreateCost,
    getMaxMembers: getMaxMembers,
  };
});
