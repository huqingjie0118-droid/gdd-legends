/**
 * sets.js — 套装联动（Set Synergy）纯逻辑模块
 * 双模式：Node 测试（module.exports）/ 浏览器（window.Sets）
 *
 * 设计来源：《战斗系统深化设计.md》P2「套装协同」+《经济系统设计.md》词缀/重铸构筑闭环
 * 核心思路：装备按槽位归属某一套装，集齐 2/4 件触发递增增益，
 *           增益跨「元素增伤 / 属性乘区 / 属性加区 / 战斗 proc」四类，
 *           直接打通「重铸词缀 → 装备构筑 → 战斗流派」。
 */
(function (root) {
  'use strict';

  // 套装定义：每套含 2 件 / 4 件两档增益
  // bonus.kind:
  //   'elemMult' 元素增伤      → { element:'fire|ice|spirit|earth', value:0.18 }
  //   'statMult' 属性乘区      → { stat:'def|atk|matk|hp|moveSpeed|atkSpeed', value:0.20 }
  //   'statAdd'  属性加区      → { stat:'lifesteal', value:0.12 }
  //   'proc'     战斗触发      → { proc:'burn|slow|execute|chain|reflect|dash', value:number }
  const SETS = {
    flame: {
      id: 'flame', name: '烈焰套装', color: '#ff6a2a',
      bonuses: [
        { need: 2, kind: 'elemMult', element: 'fire', value: 0.18, desc: '2 件：火属性伤害 +18%' },
        { need: 4, kind: 'proc', proc: 'burn', value: 3, desc: '4 件：火系命中附加【燃烧】(3 秒)' },
      ],
    },
    frost: {
      id: 'frost', name: '寒霜套装', color: '#5cc8ff',
      bonuses: [
        { need: 2, kind: 'elemMult', element: 'ice', value: 0.18, desc: '2 件：冰属性伤害 +18%' },
        { need: 4, kind: 'proc', proc: 'slow', value: 1.5, desc: '4 件：冰系命中附加【减速】(1.5 秒)' },
      ],
    },
    thunder: {
      id: 'thunder', name: '雷霆套装', color: '#c08bff',
      bonuses: [
        { need: 2, kind: 'elemMult', element: 'spirit', value: 0.18, desc: '2 件：雷属性伤害 +18%' },
        { need: 4, kind: 'proc', proc: 'chain', value: 0.5, desc: '4 件：雷系命中触发【连锁】(50% 伤害弹射)' },
      ],
    },
    earth: {
      id: 'earth', name: '磐石套装', color: '#c9a86a',
      bonuses: [
        { need: 2, kind: 'statMult', stat: 'def', value: 0.20, desc: '2 件：防御 +20%' },
        { need: 4, kind: 'proc', proc: 'reflect', value: 0.30, desc: '4 件：受击时【反伤】30%' },
      ],
    },
    blood: {
      id: 'blood', name: '嗜血套装', color: '#ff4d6d',
      bonuses: [
        { need: 2, kind: 'statAdd', stat: 'lifesteal', value: 0.12, desc: '2 件：吸血 +12%' },
        { need: 4, kind: 'proc', proc: 'execute', value: 0.50, desc: '4 件：对生命 <20% 敌人【处决】额外 +50% 伤害' },
      ],
    },
    swift: {
      id: 'swift', name: '疾风套装', color: '#7cffb2',
      bonuses: [
        { need: 2, kind: 'statMult', stat: 'moveSpeed', value: 0.15, desc: '2 件：移动速度 +15%' },
        { need: 2, kind: 'statMult', stat: 'atkSpeed', value: 0.10, desc: '2 件：攻击速度 +10%' },
        { need: 4, kind: 'proc', proc: 'dash', value: 0.6, desc: '4 件：击杀触发【疾风】短暂增速' },
      ],
    },
  };

  const ELEMENTS = ['fire', 'ice', 'spirit', 'earth'];

  // 统计已穿戴各套装件数（兼容数组 / slotKey->equip 对象两种入参）
  function equippedSets(playerEquipment) {
    const eqs = Array.isArray(playerEquipment) ? playerEquipment
      : (playerEquipment ? Object.values(playerEquipment) : []);
    const counts = {};
    for (const k in SETS) counts[k] = 0;
    for (const eq of eqs) {
      if (eq && eq.set && SETS[eq.set]) counts[eq.set] += 1;
    }
    return counts;
  }

  // 聚合当前激活的全部套装增益（纯函数，供 calcPlayerStats 与战斗结算读取）
  // 返回：{ counts, elemMult:{fire,ice,spirit,earth}, statPct:{}, statAdd:{}, procs:{} }
  function activeSetBonuses(playerEquipment) {
    const counts = equippedSets(playerEquipment);
    const b = {
      counts: {},
      elemMult: { fire: 1, ice: 1, spirit: 1, earth: 1 }, // 键名必须与 combat.js / MONSTER_RESIST 一致：spirit

      statPct: {},
      statAdd: {},
      procs: {},
    };
    for (const id in SETS) {
      const set = SETS[id];
      const c = counts[id] || 0;
      b.counts[id] = c;
      for (const bonus of set.bonuses) {
        if (c < bonus.need) continue; // 未集齐，跳过该档
        if (bonus.kind === 'elemMult') {
          b.elemMult[bonus.element] = (b.elemMult[bonus.element] || 1) * (1 + bonus.value);
        } else if (bonus.kind === 'statMult') {
          b.statPct[bonus.stat] = (b.statPct[bonus.stat] || 1) * (1 + bonus.value);
        } else if (bonus.kind === 'statAdd') {
          b.statAdd[bonus.stat] = (b.statAdd[bonus.stat] || 0) + bonus.value;
        } else if (bonus.kind === 'proc') {
          b.procs[bonus.proc] = Math.max(b.procs[bonus.proc] || 0, bonus.value);
        }
      }
    }
    return b;
  }

  // 套装图鉴（供 UI 展示收集进度与激活状态）
  function setCollection(playerEquipment) {
    const counts = equippedSets(playerEquipment);
    const out = [];
    for (const id in SETS) {
      const set = SETS[id];
      const have = counts[id] || 0;
      const bonuses = set.bonuses.map(bo => ({
        need: bo.need,
        kind: bo.kind,
        desc: bo.desc,
        active: have >= bo.need,
      }));
      out.push({ id, name: set.name, color: set.color, have, bonuses });
    }
    return out;
  }

  // 给定一件装备，约 prob 概率将其归入随机套装（装备生成时调用）
  function rollSetForEquip(prob, rng) {
    const r = (typeof rng === 'function') ? rng : Math.random;
    if (typeof prob !== 'number') prob = 0.42;
    if (r() < prob) {
      const ids = Object.keys(SETS);
      return ids[Math.floor(r() * ids.length)];
    }
    return null;
  }

  const api = {
    SETS, ELEMENTS,
    equippedSets, activeSetBonuses, setCollection, rollSetForEquip,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Sets = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
