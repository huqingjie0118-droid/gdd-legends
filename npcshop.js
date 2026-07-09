/*
 * npcshop.js — NPC 商店 / 词缀重铸 逻辑模块
 * 设计依据：《游戏经济系统设计.md》(GDD v1) §3.1 重铸（最大软货币 sink）、§5.2 动态物价缩放
 * 双模式：浏览器 <script> 挂载 window.NPCShop；Node 下 module.exports（供测试）。
 *
 * 职责：
 *   1. 把「词缀重铸」做成纯逻辑闭环——花费金币重掷装备词缀，保留槽位/品质/强化等级，
 *      仅刷新词条组合。这是经济文档里最大的金币 sink，也是《战斗系统深化设计》套装联动的入口。
 *   2. 重铸费用随已重铸次数指数增长（Economy.reforgeCost）+ 全服均价动态缩放（Economy.priceMult），
 *      形成抗通胀的水泵：花金币→极品词缀→能刷更高难内容→赚更多→再重铸。
 *   3. 词缀生成委托注入式 roller（index.html 提供真实生成器，Node 测试注入 mock），保证本模块不依赖绘制层。
 *
 * 该层不依赖 index.html，可被 test_npcshop.js 直接加载验证。
 */
(function (root, factory) {
  const Economy = (typeof require !== 'undefined')
    ? require('./economy.js')
    : (root.Economy || (typeof window !== 'undefined' ? window.Economy : undefined));
  const api = factory(Economy);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.NPCShop = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Economy) {
  'use strict';

  if (!Economy) throw new Error('npcshop.js 依赖 Economy 模块（请先加载 economy.js）');

  const C = Economy.C; // BASE_REF=500, REF_RATE=1.15, 等

  // ── 1. 重铸费用（消耗侧核心）──────────────────────────────
  // 基础 = Economy.reforgeCost(times) = BASE_REF × REF_RATE^times（指数水泵）
  // 叠加动态物价缩放 priceMult(serverAvgLevel)（§5.2 抗通胀，全服越富单价越贵）
  // eq.reforgeCount：该装备已被重铸过的次数；未定义按 0 处理。
  function reforgeCost(eq, opts) {
    opts = opts || {};
    const base = (opts.base != null) ? opts.base : C.BASE_REF;     // 500
    const rate = (opts.rate != null) ? opts.rate : C.REF_RATE;     // 1.15
    const times = (eq && Number.isFinite(eq.reforgeCount)) ? Math.max(0, eq.reforgeCount | 0) : 0;
    let cost = Math.round(base * Math.pow(rate, times));
    if (opts.serverAvgLevel != null && Number.isFinite(opts.serverAvgLevel)) {
      cost = Math.round(cost * Economy.priceMult(opts.serverAvgLevel));
    }
    return cost;
  }

  // ── 2. 能否重铸 ───────────────────────────────────────────
  function canReforge(eq, gold, opts) {
    if (!eq) return { ok: false, reason: 'no-equip' };
    if (!eq.affixes || eq.affixes.length === 0) return { ok: false, reason: 'no-affix' };
    const cost = reforgeCost(eq, opts);
    if (!Number.isFinite(gold) || gold < cost) {
      return { ok: false, reason: 'insufficient-gold', cost };
    }
    return { ok: true, cost };
  }

  // 默认 roller：未注入时抛错（浏览器由 index.html 注入真实生成器；测试注入 mock）
  function defaultRollAffixes() {
    throw new Error('applyReforge 需要 opts.rollAffixes 注入（来自 index.html 的词缀生成器）');
  }

  // ── 3. 执行重铸（纯函数，返回副本，不修改入参）────────────
  // 规则：
  //   - 仅重掷词缀（next.affixes），保留 baseAtk/baseDef/enhanceLevel/quality/name/slotKey/slotName
  //   - 词缀数量保持不变（防战力膨胀：重铸只换"组合"不换"词条量"）
  //   - reforgeCount += 1
  // opts.rollAffixes(eq, count, rng) => affixes[]  （注入式词缀生成器）
  // opts.rng => 随机数源（默认 Math.random；测试可注入固定源）
  // opts.serverAvgLevel => 动态物价缩放用
  function applyReforge(eq, gold, opts) {
    opts = opts || {};
    const check = canReforge(eq, gold, opts);
    if (!check.ok) return { ok: false, reason: check.reason, cost: check.cost };

    const rollAffixes = opts.rollAffixes || defaultRollAffixes;
    const rng = opts.rng || Math.random;
    const count = (eq.affixes || []).length;

    const next = JSON.parse(JSON.stringify(eq));
    next.affixes = rollAffixes(eq, count, rng);
    next.reforgeCount = (next.reforgeCount || 0) + 1;
    return { ok: true, eq: next, cost: check.cost, reforgeCount: next.reforgeCount };
  }

  // ── 4. NPC 服务目录（UI 渲染用，纯描述）──────────────────
  const SERVICES = [
    { id: 'reforge', name: '词缀重铸', icon: '♻',
      desc: '花费金币重掷装备词缀，保留槽位/品质/强化等级，仅刷新词条组合。适合定向补全套装。' },
    { id: 'enhance', name: '装备强化', icon: '⚒',
      desc: '消耗金币永久提升装备基础攻防（+8%/级，上限+15）。' },
    { id: 'sell',    name: '装备回购', icon: '💰',
      desc: '将闲置装备折价卖给铁匠，回收少量金币。' },
  ];

  return {
    C, reforgeCost, canReforge, applyReforge, SERVICES,
  };
});
