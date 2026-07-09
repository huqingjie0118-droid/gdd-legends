// ============================================================================
// env.js — 环境互动系统（元素反应放大器）
// 设计来源：《战斗系统深化设计.md》环境互动章节（炸药桶 / 熔岩 / 冰柱）
// 逻辑与渲染分离：本文件只维护「世界对象状态机 + 元素命中反应映射」，
// 纯函数为主，便于 Node 自动化测试；实际伤害/粒子由 index.html 游戏层执行。
// 双模式：Node (module.exports) + 浏览器 (window.Env)
// ============================================================================
(function (root) {
  'use strict';

  // 世界对象静态定义（type / map / x / y / r）
  // 坐标落在玩家出生点(1200,800)附近，开局即可接触，符合新手引导节奏。
  const WORLD_OBJECTS = [
    // —— 比奇城郊 map0 ——
    { id: 'b0a', type: 'barrel',    map: 0, x: 1050, y: 700, r: 18 },
    { id: 'b0b', type: 'barrel',    map: 0, x: 1360, y: 900, r: 18 },
    { id: 'l0',  type: 'lava',      map: 0, x: 1100, y: 960, r: 55 },
    { id: 'i0',  type: 'icePillar', map: 0, x: 1300, y: 700, r: 16 },
    // —— 僵尸洞窟 map1 ——
    { id: 'b1',  type: 'barrel',    map: 1, x: 1120, y: 760, r: 18 },
    { id: 'i1',  type: 'icePillar', map: 1, x: 1260, y: 860, r: 16 },
    { id: 'l1',  type: 'lava',      map: 1, x: 1180, y: 900, r: 55 },
    // —— 烈焰火山 map2（多熔岩）——
    { id: 'l2a', type: 'lava',      map: 2, x: 1080, y: 760, r: 65 },
    { id: 'l2b', type: 'lava',      map: 2, x: 1320, y: 880, r: 65 },
    { id: 'b2',  type: 'barrel',    map: 2, x: 1200, y: 800, r: 18 },
    // —— 冰封雪原 map3（多冰柱）——
    { id: 'i3a', type: 'icePillar', map: 3, x: 1100, y: 780, r: 16 },
    { id: 'i3b', type: 'icePillar', map: 3, x: 1300, y: 820, r: 16 },
    { id: 'b3',  type: 'barrel',    map: 3, x: 1200, y: 700, r: 18 },
    // —— 魔龙深渊 map4 ——
    { id: 'b4a', type: 'barrel',    map: 4, x: 1150, y: 760, r: 18 },
    { id: 'b4b', type: 'barrel',    map: 4, x: 1250, y: 840, r: 18 },
    { id: 'l4',  type: 'lava',      map: 4, x: 1200, y: 900, r: 60 },
    { id: 'i4',  type: 'icePillar', map: 4, x: 1100, y: 850, r: 16 },
  ];

  const BARREL_FUSE_MS = 220;          // 引信时长（命中后点燃至爆炸）
  const BARREL_RADIUS_MULT = 4.5;      // 爆炸半径 = r * 4.5
  const ICE_SHATTER_RADIUS_MULT = 4;   // 冰柱碎裂冻结半径 = r * 4
  const LAVA_FREEZE_MS = 8000;         // 冰冻结熔岩的安全持续时长

  // 实例化某地图的活动对象（带运行状态），供游戏层每帧 tick
  function makeObjects(mapIndex) {
    return WORLD_OBJECTS
      .filter(o => o.map === mapIndex)
      .map(o => ({
        id: o.id, type: o.type, x: o.x, y: o.y, r: o.r,
        alive: true,          // barrel / icePillar 触发后转 false
        fuse: 0,              // barrel 引信截止时间戳（performance.now 体系）
        frozenUntil: 0,       // lava 被冰冻结的截止时间戳
        dotTick: 0,           // lava 持续伤害累加器
      }));
  }

  // 元素命中反应（状态机推进）。element ∈ {fire, ice, spirit, phys}
  // 返回事件描述，由游戏层执行实际效果（伤害/粒子/减速）。
  function onElementHit(obj, element, now) {
    if (!obj) return { event: 'none' };
    now = now || 0;
    if (!obj.alive && obj.type !== 'lava') return { event: 'none' };

    if (obj.type === 'barrel') {
      // 火 / 雷 → 点燃引信
      if (element === 'fire' || element === 'spirit') {
        if (obj.fuse <= 0) obj.fuse = now + BARREL_FUSE_MS;
        return { event: 'armed', x: obj.x, y: obj.y, t: obj.fuse };
      }
      return { event: 'none' };
    }

    if (obj.type === 'lava') {
      // 冰 → 冻结为临时安全地面（打通「冰+熔岩」元素协同）
      if (element === 'ice') {
        obj.frozenUntil = now + LAVA_FREEZE_MS;
        return { event: 'freeze', x: obj.x, y: obj.y, radius: obj.r };
      }
      return { event: 'none' };
    }

    if (obj.type === 'icePillar') {
      // 火 / 雷 → 击碎，释放冻结爆发（范围减速 + 冰伤，可触发后续元素反应）
      if (element === 'fire' || element === 'spirit') {
        obj.alive = false;
        const radius = obj.r * ICE_SHATTER_RADIUS_MULT;
        return { event: 'shatter', x: obj.x, y: obj.y, radius: radius, frozenUntil: now + 2500 };
      }
      return { event: 'none' };
    }

    return { event: 'none' };
  }

  // 每帧推进对象状态，返回需游戏层处理的事件（如 barrel 引信到达 → 爆炸）
  function tick(obj, dt, now) {
    if (!obj) return { event: 'none' };
    if (obj.type === 'barrel' && obj.alive && obj.fuse > 0 && now >= obj.fuse) {
      obj.alive = false;
      return { event: 'explode', x: obj.x, y: obj.y, radius: obj.r * BARREL_RADIUS_MULT };
    }
    return { event: 'none' };
  }

  // 熔岩当前是否安全（冻结窗口内）
  function lavaSafe(obj, now) {
    return !!(obj && obj.type === 'lava' && now < (obj.frozenUntil || 0));
  }

  const Api = {
    WORLD_OBJECTS, makeObjects, onElementHit, tick, lavaSafe,
    BARREL_FUSE_MS, BARREL_RADIUS_MULT, ICE_SHATTER_RADIUS_MULT, LAVA_FREEZE_MS,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Api;
  root.Env = Api;
})(typeof window !== 'undefined' ? window : globalThis);
