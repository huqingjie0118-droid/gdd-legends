/*
 * rank.js — 排行榜系统模块
 * 双模式：浏览器 <script> 挂载 window.Rank；Node 下 module.exports（供测试）。
 * 5 种排行类型：等级 / 战力 / Boss击杀 / 公会 / 转生
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Rank = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 常量 ──
  const RANK_TYPES = ['level', 'power', 'bossKills', 'guild', 'reincarnation'];

  // 中文姓名池
  const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳丰鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅'.split('');
  const GIVEN_2 = '天地人龙凤虎豹鹏飞云雪月星风火山水玉石金明光华辉煌耀辉宏图志成文武德才双全无敌至尊绝世卓越非凡星宇苍穹浩瀚凌天傲世逍遥纵横'.split('');

  const GUILD_NAMES = ['天下会', '龙魂殿', '剑阁', '烟雨楼', '青云门', '血影盟', '天道盟', '星辉堂', '风月轩', '凌霄阁'];

  // 转生阶位
  const REINCARN_NAMES = ['一转', '二转', '三转', '四转', '五转', '六转', '七转', '八转', '九转', '十转'];

  function randomName() {
    const s = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
    const g = GIVEN_2[Math.floor(Math.random() * GIVEN_2.length)];
    return s + g;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ── 生成 mock 排名数据 ──
  function makeRankings() {
    const data = {};

    // level: 玩家等级 Lv.1~120
    const levels = [];
    for (let i = 0; i < 20; i++) {
      levels.push({ rank: i + 1, name: randomName(), value: 121 - i * 6, extra: 'Lv.' + (121 - i * 6) });
    }
    data.level = levels;

    // power: 战力 1000~999999
    const powers = [];
    for (let i = 0; i < 20; i++) {
      const val = 999999 - i * 49900 + randomInt(0, 9999);
      powers.push({ rank: i + 1, name: randomName(), value: val, extra: val.toLocaleString() });
    }
    data.power = powers;

    // bossKills: Boss击杀数
    const bossKills = [];
    for (let i = 0; i < 20; i++) {
      const val = 9999 - i * 480 + randomInt(0, 99);
      bossKills.push({ rank: i + 1, name: randomName(), value: val, extra: val.toLocaleString() + ' 只' });
    }
    data.bossKills = bossKills;

    // guild: 公会排名（value 为公会名）
    const guilds = [];
    const usedGuilds = [];
    for (let i = 0; i < 20; i++) {
      let gName;
      do {
        gName = GUILD_NAMES[Math.floor(Math.random() * GUILD_NAMES.length)];
      } while (usedGuilds.includes(gName) && usedGuilds.length < GUILD_NAMES.length);
      usedGuilds.push(gName);
      const level = 20 - i;
      guilds.push({
        rank: i + 1,
        name: gName,
        value: level,
        extra: 'Lv.' + level + ' | 会长:' + randomName(),
      });
    }
    data.guild = guilds;

    // reincarnation: 转生排名
    const reinc = [];
    for (let i = 0; i < 20; i++) {
      const cycle = Math.max(1, 10 - Math.floor(i / 2));
      const reincIdx = Math.min(cycle - 1, REINCARN_NAMES.length - 1);
      reinc.push({
        rank: i + 1,
        name: randomName(),
        value: cycle,
        extra: REINCARN_NAMES[reincIdx],
      });
    }
    data.reincarnation = reinc;

    return data;
  }

  // 缓存一份 mock 数据
  let _cache = null;
  function _ensureCache() {
    if (!_cache) _cache = makeRankings();
    return _cache;
  }

  // ── 获取指定排行 ──
  function getRanking(type) {
    if (RANK_TYPES.indexOf(type) === -1) return [];
    const all = _ensureCache();
    return all[type] || [];
  }

  // ── 查找玩家排名 ──
  function findPlayerRank(rankings, playerName) {
    // rankings 是某个类型的数组
    if (!Array.isArray(rankings)) return null;
    for (let i = 0; i < rankings.length; i++) {
      if (rankings[i].name === playerName) return rankings[i];
    }
    return null;
  }

  // ── 格式化排名值 ──
  function formatRankValue(type, value) {
    switch (type) {
      case 'level':
        return 'Lv.' + value;
      case 'power':
        return Number(value).toLocaleString();
      case 'bossKills':
        return Number(value).toLocaleString();
      case 'guild':
        return String(value);
      case 'reincarnation':
        const idx = Math.min(Math.max(0, value - 1), REINCARN_NAMES.length - 1);
        return REINCARN_NAMES[idx];
      default:
        return String(value);
    }
  }

  // ── 排名颜色 ──
  const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze

  function rankColor(rank) {
    if (rank <= 0) return '#FFFFFF';
    if (rank <= 3) return RANK_COLORS[rank - 1];
    return '#FFFFFF';
  }

  // ── 重置缓存（用于测试） ──
  function resetCache() {
    _cache = null;
  }

  return {
    RANK_TYPES: RANK_TYPES.slice(),
    REINCARN_NAMES: REINCARN_NAMES.slice(),
    makeRankings: makeRankings,
    getRanking: getRanking,
    findPlayerRank: findPlayerRank,
    formatRankValue: formatRankValue,
    rankColor: rankColor,
    resetCache: resetCache,
  };
});
