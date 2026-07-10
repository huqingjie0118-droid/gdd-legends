/*
 * equip-rules.js — 装备词条与品质规则引擎（配置驱动 / 双模式）
 * 浏览器：window.EquipRules   |   Node 测试：module.exports
 *
 * 设计职责（对应需求 1~5）：
 *   1. 词条系统：类型(basic/rare/legendary)、属性、数值范围、权重、稀有度；随机生成、词条池配置、
 *      冲突检测(同类型/conflicts 互斥)、锁定/替换机制。
 *   2. 品质系统：6 档品质决定词条数量上限、词条稀有度分布、基础属性倍率；升阶含材料消耗与成功率。
 *   3. 规则联动：高品质→高稀有度词条概率提升；词条总评分→动态品质评定(可升/可降级)。
 *   4. 数据配置：全部规则由 equip-rules.json 驱动，init()/loadFromURL()/reload() 支持热更新与扩展。
 *   5. 边界处理：词条溢出、品质降级、非法配置(validate 拒绝)、极端配置不崩，错误日志环形缓冲。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EquipRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────── 内嵌默认配置（离线兜底，与 equip-rules.json 一致） ─────────────────────────
  var DEFAULT_CONFIG = {
    version: 2,
    description: '传奇·觉醒 — 装备词条与品质规则配置（配置驱动 / 支持热更新）。',
    scaling: { levelScalePerLevel: 0.07, qualityAppliesTo: ['flat', 'pct'], levelAppliesTo: ['flat', 'pct'] },
    qualityOrder: ['common', 'good', 'rare', 'epic', 'legendary', 'mythic'],
    qualities: {
      common:    { name: '普通', color: '#aaaaaa', tier: 0, mult: 1.0, affixMin: 1, affixMax: 1, dropWeight: 600 },
      good:      { name: '优秀', color: '#44ff00', tier: 1, mult: 1.3, affixMin: 1, affixMax: 2, dropWeight: 250 },
      rare:      { name: '稀有', color: '#00aaff', tier: 2, mult: 1.7, affixMin: 2, affixMax: 3, dropWeight: 100 },
      epic:      { name: '史诗', color: '#aa00ff', tier: 3, mult: 2.2, affixMin: 2, affixMax: 3, dropWeight: 38 },
      legendary: { name: '传说', color: '#ff8800', tier: 4, mult: 3.0, affixMin: 3, affixMax: 4, dropWeight: 10 },
      mythic:    { name: '神话', color: '#ff0044', tier: 5, mult: 5.0, affixMin: 3, affixMax: 4, dropWeight: 2 }
    },
    affixTiers: { basic: { name: '基础词条', score: 10 }, rare: { name: '稀有词条', score: 45 }, legendary: { name: '传奇词条', score: 120 } },
    qualityAffixTierWeights: {
      common:    { basic: 100, rare: 0,  legendary: 0 },
      good:      { basic: 90,  rare: 10, legendary: 0 },
      rare:      { basic: 65,  rare: 32, legendary: 3 },
      epic:      { basic: 40,  rare: 48, legendary: 12 },
      legendary: { basic: 15,  rare: 50, legendary: 35 },
      mythic:    { basic: 0,   rare: 35, legendary: 65 }
    },
    scoring: { valueWeight: 0.6, specialBonus: 30 },
    qualityScoreThresholds: [
      { quality: 'common',    min: 0 },
      { quality: 'good',      min: 25 },
      { quality: 'rare',      min: 60 },
      { quality: 'epic',      min: 110 },
      { quality: 'legendary', min: 200 },
      { quality: 'mythic', min: 320 }
    ],
    upgrade: {
      materials: { iron_ore: 2, monster_core: 1 },
      materialScalePerTier: 1, successBase: 0.65, successDecayPerTier: 0.10,
      minSuccess: 0.10, maxSuccess: 0.95, addAffixOnSuccess: true, rerollValuesOnSuccess: true
    },
    affixes: [
      { id: 'A01', tier: 'basic', attr: 'atk', name: '攻击力', kind: 'flat', min: 5, max: 15, weight: 100, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A02', tier: 'basic', attr: 'matk', name: '魔法攻击', kind: 'flat', min: 5, max: 15, weight: 100, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A03', tier: 'basic', attr: 'datk', name: '道术攻击', kind: 'flat', min: 5, max: 15, weight: 80, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A04', tier: 'basic', attr: 'maxHp', name: '生命上限', kind: 'flat', min: 30, max: 100, weight: 100, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A05', tier: 'basic', attr: 'def', name: '物理防御', kind: 'flat', min: 3, max: 10, weight: 90, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A06', tier: 'basic', attr: 'mdef', name: '魔法防御', kind: 'flat', min: 3, max: 10, weight: 90, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A07', tier: 'basic', attr: 'luck', name: '幸运', kind: 'flat', min: 1, max: 3, weight: 40, qualityScale: false, levelScale: false, conflicts: [], prof: [] },
      { id: 'A08', tier: 'basic', attr: 'str', name: '力量', kind: 'flat', min: 2, max: 6, weight: 70, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A09', tier: 'basic', attr: 'agi', name: '敏捷', kind: 'flat', min: 2, max: 6, weight: 70, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'A10', tier: 'basic', attr: 'vit', name: '体质', kind: 'flat', min: 2, max: 6, weight: 70, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'B07', tier: 'basic', attr: 'cdr', name: '技能冷却缩减', kind: 'pct', min: 0.05, max: 0.12, weight: 30, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'B08', tier: 'basic', attr: 'mpSave', name: '技能消耗降低', kind: 'pct', min: 0.10, max: 0.20, weight: 30, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'B09', tier: 'rare', attr: 'critDmg', name: '暴击伤害', kind: 'pct', min: 0.15, max: 0.35, weight: 35, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'B10', tier: 'basic', attr: 'skillRange', name: '技能范围', kind: 'pct', min: 0.10, max: 0.20, weight: 25, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'D06', tier: 'basic', attr: 'healBoost', name: '受治疗效果', kind: 'pct', min: 0.20, max: 0.20, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: [] },
      { id: 'D07', tier: 'basic', attr: 'maxMp', name: '最大魔法', kind: 'flat', min: 20, max: 80, weight: 40, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'D08', tier: 'basic', attr: 'mpRegen', name: '魔法恢复速度', kind: 'pct', min: 0.50, max: 0.50, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: [] },
      { id: 'E01', tier: 'basic', attr: 'expBoost', name: '经验加成', kind: 'pct', min: 0.05, max: 0.15, weight: 25, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'E02', tier: 'basic', attr: 'goldBoost', name: '金币加成', kind: 'pct', min: 0.10, max: 0.30, weight: 25, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'E03', tier: 'basic', attr: 'dropRate', name: '掉落率提升', kind: 'pct', min: 0.05, max: 0.15, weight: 20, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'E04', tier: 'basic', attr: 'sellBonus', name: '出售价格', kind: 'pct', min: 0.20, max: 0.20, weight: 15, qualityScale: false, levelScale: false, conflicts: [], prof: [] },
      { id: 'E05', tier: 'basic', attr: 'repairDiscount', name: '修理费用降低', kind: 'pct', min: 0.30, max: 0.30, weight: 15, qualityScale: false, levelScale: false, conflicts: [], prof: [] },
      { id: 'B01', tier: 'rare', attr: 'skillLv', name: '烈火剑法', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['warrior'], skill: 'fire', lv: 1 },
      { id: 'B02', tier: 'rare', attr: 'skillLv', name: '横扫千军', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['warrior'], skill: 'cleave', lv: 1 },
      { id: 'B03', tier: 'rare', attr: 'skillLv', name: '冰咆哮', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['mage'], skill: 'ice', lv: 1 },
      { id: 'B04', tier: 'rare', attr: 'skillLv', name: '雷电术', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['mage'], skill: 'thunder', lv: 1 },
      { id: 'B05', tier: 'rare', attr: 'skillLv', name: '施毒术', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['taoist'], skill: 'poison', lv: 1 },
      { id: 'B06', tier: 'rare', attr: 'skillLv', name: '治愈术', kind: 'special', min: 1, max: 1, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: ['taoist'], skill: 'heal', lv: 1 },
      { id: 'C01', tier: 'rare', attr: 'lifesteal', name: '吸血', kind: 'pct', min: 0.03, max: 0.08, weight: 40, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C02', tier: 'rare', attr: 'critRate', name: '暴击率', kind: 'pct', min: 0.02, max: 0.06, weight: 45, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C03', tier: 'rare', attr: 'armorPen', name: '破甲', kind: 'pct', min: 0.03, max: 0.10, weight: 35, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C04', tier: 'rare', attr: 'thorns', name: '反伤', kind: 'pct', min: 0.05, max: 0.15, weight: 30, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C05', tier: 'rare', attr: 'slowAtk', name: '减速攻击', kind: 'pct', min: 0.15, max: 0.30, weight: 25, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C06', tier: 'rare', attr: 'stunChance', name: '眩晕几率', kind: 'pct', min: 0.03, max: 0.08, weight: 25, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C07', tier: 'rare', attr: 'burnDmg', name: '灼烧伤害', kind: 'flat', min: 5, max: 20, weight: 25, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'C08', tier: 'rare', attr: 'freezeSlow', name: '冰冻减速', kind: 'pct', min: 0.20, max: 0.40, weight: 20, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'C09', tier: 'rare', attr: 'chainLight', name: '连锁闪电', kind: 'special', min: 1, max: 3, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: [], count: 3 },
      { id: 'C10', tier: 'rare', attr: 'execute', name: '致命一击', kind: 'special', min: 0.20, max: 0.20, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: [], threshold: 0.20, multMin: 1.5, multMax: 2.5 },
      { id: 'D01', tier: 'rare', attr: 'hpRegen', name: '每秒回血', kind: 'flat', min: 5, max: 20, weight: 30, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'D02', tier: 'rare', attr: 'dmgReduce', name: '受伤减免', kind: 'pct', min: 0.03, max: 0.10, weight: 35, qualityScale: true, levelScale: false, conflicts: [], prof: [] },
      { id: 'D03', tier: 'rare', attr: 'shield', name: '护盾值', kind: 'flat', min: 50, max: 200, weight: 25, qualityScale: true, levelScale: true, conflicts: [], prof: [] },
      { id: 'D04', tier: 'rare', attr: 'cheatDeath', name: '免死一次', kind: 'special', min: 300, max: 300, weight: 15, qualityScale: false, levelScale: false, conflicts: ['reviveHp'], prof: [] },
      { id: 'D05', tier: 'rare', attr: 'reviveHp', name: '复活恢复', kind: 'pct', min: 0.30, max: 0.60, weight: 15, qualityScale: true, levelScale: false, conflicts: ['cheatDeath'], prof: [] },
      { id: 'F01', tier: 'legendary', attr: 'blink', name: '瞬移', kind: 'special', min: 15, max: 15, weight: 30, qualityScale: false, levelScale: false, conflicts: ['transform'], prof: [], cd: 15, range: 150 },
      { id: 'F02', tier: 'legendary', attr: 'transform', name: '变身(攻防提升)', kind: 'special', min: 0.30, max: 0.30, weight: 30, qualityScale: false, levelScale: false, conflicts: ['blink'], prof: [], duration: 10, boost: 0.30 },
      { id: 'F03', tier: 'legendary', attr: 'aura', name: '光环:友军攻击', kind: 'special', min: 0.10, max: 0.10, weight: 20, qualityScale: false, levelScale: false, conflicts: [], prof: [], radius: 100, stat: 'atk', val: 0.10 },
      { id: 'F04', tier: 'legendary', attr: 'reveal', name: '透视(显隐)', kind: 'special', min: 0, max: 0, weight: 15, qualityScale: false, levelScale: false, conflicts: [], prof: [], duration: 0 }
    ]
  };

  // ───────────────────────── 运行态 ─────────────────────────
  var config = null;
  var lastUrl = null;
  var _log = [];
  var derived = null;

  function log(level, msg) {
    var entry = { t: Date.now(), level: level, msg: msg };
    _log.push(entry);
    if (_log.length > 200) _log.shift();
    if (typeof console !== 'undefined') {
      var fn = level === 'ERROR' ? 'error' : (level === 'WARN' ? 'warn' : 'log');
      (console[fn] || console.log).call(console, '[EquipRules] ' + msg);
    }
  }

  // ───────────────────────── 工具 ─────────────────────────
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function weightedChoose(items, getWeight) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += Math.max(0, getWeight(items[i]));
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (i = 0; i < items.length; i++) { r -= Math.max(0, getWeight(items[i])); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function qualityTier(q) { return config.qualities[q] ? config.qualities[q].tier : 0; }
  function nextQuality(q) {
    var i = config.qualityOrder.indexOf(q);
    return (i >= 0 && i < config.qualityOrder.length - 1) ? config.qualityOrder[i + 1] : null;
  }
  function levelScaleFor(sourceLevel) { return 1 + Math.max(1, sourceLevel || 1) * config.scaling.levelScalePerLevel; }

  // ───────────────────────── 参数校验 ─────────────────────────
  function validate(cfg) {
    var errors = [], warnings = [];
    if (!cfg || typeof cfg !== 'object') { errors.push('配置为空或非对象'); return { ok: false, errors: errors, warnings: warnings }; }

    if (!cfg.qualities || typeof cfg.qualities !== 'object') errors.push('缺少 qualities');
    else {
      var order = cfg.qualityOrder || [];
      Object.keys(cfg.qualities).forEach(function (q) {
        var qd = cfg.qualities[q];
        if (!qd) { errors.push('品质 ' + q + ' 为空'); return; }
        if (typeof qd.name !== 'string') errors.push('品质 ' + q + ' 缺 name');
        if (typeof qd.color !== 'string') errors.push('品质 ' + q + ' 缺 color');
        if (typeof qd.tier !== 'number') errors.push('品质 ' + q + ' tier 非数字');
        if (typeof qd.mult !== 'number' || qd.mult <= 0) errors.push('品质 ' + q + ' mult 非法');
        if (typeof qd.affixMin !== 'number' || typeof qd.affixMax !== 'number' || qd.affixMin > qd.affixMax) errors.push('品质 ' + q + ' affixMin/affixMax 非法');
        if (typeof qd.dropWeight !== 'number' || qd.dropWeight < 0) errors.push('品质 ' + q + ' dropWeight 非法');
      });
      if (!order.length) warnings.push('未指定 qualityOrder，将按 qualities 键序');
      else order.forEach(function (q) { if (!cfg.qualities[q]) errors.push('qualityOrder 含未知品质 ' + q); });
    }

    if (!cfg.affixTiers || typeof cfg.affixTiers !== 'object') errors.push('缺少 affixTiers');
    else Object.keys(cfg.affixTiers).forEach(function (t) {
      var td = cfg.affixTiers[t];
      if (!td || typeof td.score !== 'number' || td.score < 0) errors.push('词条层 ' + t + ' score 非法');
    });

    if (cfg.qualities && cfg.affixTiers) {
      Object.keys(cfg.qualities).forEach(function (q) {
        var tw = cfg.qualityAffixTierWeights && cfg.qualityAffixTierWeights[q];
        if (!tw) { warnings.push('品质 ' + q + ' 缺 qualityAffixTierWeights，将无词条'); return; }
        Object.keys(cfg.affixTiers).forEach(function (t) {
          if (typeof tw[t] !== 'number' || tw[t] < 0) errors.push('品质 ' + q + ' 词条层权重 ' + t + ' 非法');
        });
      });
    }

    if (!Array.isArray(cfg.affixes)) errors.push('affixes 非数组');
    else {
      var ids = {};
      cfg.affixes.forEach(function (a, i) {
        if (!a.id) { errors.push('affixes[' + i + '] 缺 id'); return; }
        if (ids[a.id]) errors.push('affix id 重复: ' + a.id);
        ids[a.id] = 1;
        if (!cfg.affixTiers[a.tier]) errors.push('affix ' + a.id + ' tier 未知: ' + a.tier);
        if (!a.attr) errors.push('affix ' + a.id + ' 缺 attr');
        if (['flat', 'pct', 'special'].indexOf(a.kind) < 0) errors.push('affix ' + a.id + ' kind 非法: ' + a.kind);
        if (typeof a.min !== 'number' || typeof a.max !== 'number' || a.min > a.max) errors.push('affix ' + a.id + ' min/max 非法');
        if (typeof a.weight !== 'number' || a.weight <= 0) errors.push('affix ' + a.id + ' weight 非法');
        if (a.conflicts && !Array.isArray(a.conflicts)) errors.push('affix ' + a.id + ' conflicts 非数组');
        if (a.conflicts && a.conflicts.indexOf(a.attr) >= 0) errors.push('affix ' + a.id + ' 与自身冲突');
      });
    }

    if (!cfg.scoring || typeof cfg.scoring.valueWeight !== 'number') warnings.push('scoring.valueWeight 缺失，使用默认 0.6');

    if (!Array.isArray(cfg.qualityScoreThresholds) || !cfg.qualityScoreThresholds.length) errors.push('缺少 qualityScoreThresholds');
    else {
      var last = -1;
      cfg.qualityScoreThresholds.forEach(function (t, i) {
        if (!cfg.qualities || !cfg.qualities[t.quality]) errors.push('qualityScoreThresholds[' + i + '] 未知品质 ' + t.quality);
        if (typeof t.min !== 'number' || t.min < 0) errors.push('qualityScoreThresholds[' + i + '] min 非法');
        if (t.min < last) errors.push('qualityScoreThresholds 未按 min 升序');
        last = t.min;
      });
    }

    if (!cfg.upgrade || typeof cfg.upgrade !== 'object') errors.push('缺少 upgrade');
    else {
      if (!cfg.upgrade.materials || typeof cfg.upgrade.materials !== 'object') errors.push('upgrade.materials 非法');
      if (typeof cfg.upgrade.successBase !== 'number' || cfg.upgrade.successBase <= 0 || cfg.upgrade.successBase > 1) errors.push('upgrade.successBase 非法(应 0~1)');
      if (typeof cfg.upgrade.successDecayPerTier !== 'number') errors.push('upgrade.successDecayPerTier 非法');
      if (typeof cfg.upgrade.minSuccess !== 'number' || typeof cfg.upgrade.maxSuccess !== 'number') errors.push('upgrade 成功率钳制非法');
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function buildDerived(cfg) {
    var byTier = {}, byId = {};
    cfg.affixes.forEach(function (a) { (byTier[a.tier] = byTier[a.tier] || []).push(a); byId[a.id] = a; });
    return { byTier: byTier, byId: byId };
  }

  function init(cfg) {
    var v = validate(cfg);
    if (!v.ok) { v.errors.forEach(function (e) { log('ERROR', '配置校验失败: ' + e); }); return { ok: false, errors: v.errors, warnings: v.warnings }; }
    v.warnings.forEach(function (w) { log('WARN', '配置警告: ' + w); });
    config = cfg;
    derived = buildDerived(cfg);
    log('INFO', '规则已加载 version=' + (cfg.version || '?') + '，词条 ' + cfg.affixes.length + ' 条 / 品质 ' + Object.keys(cfg.qualities).length + ' 档');
    return { ok: true, warnings: v.warnings };
  }

  // ───────────────────────── 数值与展示 ─────────────────────────
  function computeValue(affix, qualityKey, sourceLevel) {
    var q = config.qualities[qualityKey] || config.qualities.common;
    var lvl = levelScaleFor(sourceLevel);
    var raw = rand(affix.min, affix.max);
    var mult = 1, ls = 1;
    if (config.scaling.qualityAppliesTo.indexOf(affix.kind) >= 0 && affix.qualityScale) mult = q.mult;
    if (config.scaling.levelAppliesTo.indexOf(affix.kind) >= 0 && affix.levelScale) ls = lvl;
    var val = raw * mult * ls;
    var displayValue, display;
    if (affix.kind === 'pct') {
      displayValue = (Math.round(val * 1000) / 1000).toString();
      display = affix.name + ' +' + Math.round(val * 100) + '%';
    } else if (affix.kind === 'flat') {
      displayValue = Math.round(val).toString();
      display = affix.name + ' +' + Math.round(val);
    } else {
      displayValue = Math.round(val).toString();
      display = affix.name + (affix.min !== affix.max ? ' +' + Math.round(val) : '');
    }
    return { value: val, displayValue: displayValue, display: display, rawValue: raw };
  }

  function toAffixOut(affix, qualityKey, sourceLevel) {
    var cv = computeValue(affix, qualityKey, sourceLevel);
    var out = {
      id: affix.id, tier: affix.tier, attr: affix.attr, name: affix.name, kind: affix.kind,
      type: affix.attr, displayValue: cv.displayValue, display: cv.display,
      value: cv.value, rawValue: cv.rawValue, rawMin: affix.min, rawMax: affix.max,
      weight: affix.weight, conflicts: affix.conflicts || [], prof: affix.prof || [], locked: false
    };
    ['skill', 'lv', 'cd', 'range', 'count', 'threshold', 'multMin', 'multMax', 'radius', 'stat', 'val', 'duration', 'boost']
      .forEach(function (k) { if (affix[k] !== undefined) out[k] = affix[k]; });
    return out;
  }

  // ───────────────────────── 1. 词条生成（冲突检测 / 职业限制 / 词条层分布 / 溢出保护） ─────────────────────────
  function rollAffixes(qualityKey, sourceLevel, prof) {
    var q = config.qualities[qualityKey];
    if (!q) { log('ERROR', 'rollAffixes: 未知品质 ' + qualityKey + '，回退 common'); qualityKey = 'common'; q = config.qualities.common; }
    var count = randInt(q.affixMin, q.affixMax);
    var result = [];
    var blocked = {};
    var tierWeights = config.qualityAffixTierWeights[qualityKey] || {};
    var SPECIAL_KEYS = ['skill', 'lv', 'cd', 'range', 'count', 'threshold', 'multMin', 'multMax', 'radius', 'stat', 'val', 'duration', 'boost'];

    function poolForTier(tier) {
      return (derived.byTier[tier] || []).filter(function (a) {
        if (blocked[a.attr]) return false;
        if (a.conflicts && a.conflicts.some(function (c) { return blocked[c]; })) return false;
        if (prof && a.prof && a.prof.length > 0 && a.prof.indexOf(prof) < 0) return false;
        return true;
      });
    }

    var guard = 0, maxGuard = count * 20 + 50;
    while (result.length < count && guard++ < maxGuard) {
      var tiers = Object.keys(config.affixTiers).filter(function (t) { return (tierWeights[t] || 0) > 0; });
      var avail = [];
      tiers.forEach(function (t) { var p = poolForTier(t); if (p.length > 0) avail.push(t); });
      if (avail.length === 0) {
        log('WARN', 'rollAffixes: 品质 ' + qualityKey + ' 可用词条池耗尽，停止生成（已 ' + result.length + '/' + count + ' 条）');
        break;
      }
      var chosenTier = weightedChoose(avail, function (t) { return tierWeights[t] || 0; });
      var pool = poolForTier(chosenTier);
      if (!pool.length) continue;
      var affix = weightedChoose(pool, function (a) { return a.weight; });
      blocked[affix.attr] = true;
      (affix.conflicts || []).forEach(function (c) { blocked[c] = true; });
      result.push(toAffixOut(affix, qualityKey, sourceLevel));
    }
    return result;
  }

  // ───────────────────────── 3. 词条评分 + 动态品质评定 ─────────────────────────
  function scoreAffixes(affixes) {
    if (!affixes || !affixes.length) return 0;
    var total = 0;
    var vw = (config.scoring && config.scoring.valueWeight != null) ? config.scoring.valueWeight : 0.6;
    var specialBonus = (config.scoring && config.scoring.specialBonus != null) ? config.scoring.specialBonus : 30;
    affixes.forEach(function (a) {
      var tierScore = (config.affixTiers[a.tier] || { score: 0 }).score;
      if (a.kind === 'special') { total += tierScore + specialBonus; return; }
      var lo = (a.rawMin != null) ? a.rawMin : 0, hi = (a.rawMax != null) ? a.rawMax : 1;
      var norm = (hi > lo) ? clamp((a.rawValue - lo) / (hi - lo), 0, 1) : 1;
      total += tierScore * (0.4 + vw * norm);
    });
    return Math.round(total * 10) / 10;
  }

  function judgedByScore(score) {
    var best = config.qualityOrder[0];
    config.qualityScoreThresholds.forEach(function (t) { if (score >= t.min) best = t.quality; });
    return best;
  }

  // allowDowngrade=false → 仅升不降（生成时）；true → 可降一档（替换词条后重评）
  function judgeQuality(rolledQuality, score, allowDowngrade) {
    var judged = judgedByScore(score);
    var rt = qualityTier(rolledQuality), jt = qualityTier(judged);
    if (jt > rt) return judged;
    if (allowDowngrade && jt < rt) return config.qualityOrder[rt - 1];
    return rolledQuality;
  }

  // ───────────────────────── 生成完整规则部分 ─────────────────────────
  function rollQuality(weightsOverride) {
    var qo = config.qualityOrder, wmap = {}, total = 0, i;
    for (i = 0; i < qo.length; i++) {
      var w = (weightsOverride && weightsOverride[qo[i]] != null) ? weightsOverride[qo[i]] : config.qualities[qo[i]].dropWeight;
      wmap[qo[i]] = w; total += w;
    }
    if (total <= 0) { log('ERROR', 'rollQuality: 总权重<=0，回退 common'); return 'common'; }
    var r = Math.random() * total;
    for (i = 0; i < qo.length; i++) { r -= wmap[qo[i]]; if (r <= 0) return qo[i]; }
    return qo[0];
  }

  function generateEquip(opts) {
    opts = opts || {};
    var sourceLevel = (opts.sourceLevel != null) ? opts.sourceLevel : 1;
    var prof = opts.prof || null;
    var rolled = opts.qualityOverride || rollQuality(opts.qualityWeights);
    var affixes = rollAffixes(rolled, sourceLevel, prof);
    var score = scoreAffixes(affixes);
    var quality = judgeQuality(rolled, score, false);
    return { rolledQuality: rolled, quality: quality, affixes: affixes, score: score, promoted: quality !== rolled };
  }

  // ───────────────────────── 1. 锁定 / 替换机制 ─────────────────────────
  function lockAffix(equip, index) {
    if (!equip || !equip.affixLocks || index < 0 || index >= equip.affixLocks.length) return false;
    equip.affixLocks[index] = !equip.affixLocks[index];
    return equip.affixLocks[index];
  }

  function replaceAffix(equip, index, opts) {
    opts = opts || {};
    if (!equip || !equip.affixes) return { ok: false, reason: 'no-equip' };
    if (index < 0 || index >= equip.affixes.length) return { ok: false, reason: 'index' };
    if (equip.affixLocks && equip.affixLocks[index]) return { ok: false, reason: 'locked' };
    var sourceLevel = (opts.sourceLevel != null) ? opts.sourceLevel : (equip._sourceLevel || 1);
    var prof = opts.prof || equip._prof || null;
    var qualityKey = equip.quality;
    var blocked = {};
    equip.affixes.forEach(function (a, i) {
      if (i === index) return;
      blocked[a.attr] = true;
      (a.conflicts || []).forEach(function (c) { blocked[c] = true; });
    });
    var pool = [];
    Object.keys(config.affixTiers).forEach(function (tier) {
      (derived.byTier[tier] || []).forEach(function (a) {
        if (blocked[a.attr]) return;
        if (a.conflicts && a.conflicts.some(function (c) { return blocked[c]; })) return;
        if (prof && a.prof && a.prof.length > 0 && a.prof.indexOf(prof) < 0) return;
        pool.push(a);
      });
    });
    if (!pool.length) { log('WARN', 'replaceAffix: 无可用替换词条（冲突/职业限制），保持原词条'); return { ok: false, reason: 'no-pool' }; }
    var affix = weightedChoose(pool, function (a) { return a.weight; });
    equip.affixes[index] = toAffixOut(affix, qualityKey, sourceLevel);
    equip.score = scoreAffixes(equip.affixes);
    var newQ = judgeQuality(equip.quality, equip.score, true);
    if (newQ !== equip.quality) { log('INFO', '替换词条后动态重评定: ' + equip.quality + ' → ' + newQ); equip.quality = newQ; }
    return { ok: true, affix: equip.affixes[index] };
  }

  // ───────────────────────── 2. 升阶（材料消耗 + 成功率） ─────────────────────────
  function canUpgrade(equip) { return !!nextQuality(equip.quality); }

  function upgradeCost(equip) {
    var tier = qualityTier(equip.quality);
    var scale = 1 + tier * (config.upgrade.materialScalePerTier || 1);
    var cost = {};
    Object.keys(config.upgrade.materials).forEach(function (k) { cost[k] = config.upgrade.materials[k] * scale; });
    return cost;
  }

  function upgradeSuccessRate(equip) {
    var tier = qualityTier(equip.quality);
    var r = config.upgrade.successBase - config.upgrade.successDecayPerTier * tier;
    return clamp(r, config.upgrade.minSuccess, config.upgrade.maxSuccess);
  }

  function hasMaterials(available, cost) {
    return Object.keys(cost).every(function (k) { return (available[k] || 0) >= cost[k]; });
  }

  function tryAddOneAffix(equip, qualityKey, sourceLevel, prof) {
    var blocked = {};
    equip.affixes.forEach(function (a) { blocked[a.attr] = true; (a.conflicts || []).forEach(function (c) { blocked[c] = true; }); });
    var pool = [];
    Object.keys(config.affixTiers).forEach(function (tier) {
      (derived.byTier[tier] || []).forEach(function (a) {
        if (blocked[a.attr]) return;
        if (a.conflicts && a.conflicts.some(function (c) { return blocked[c]; })) return;
        if (prof && a.prof && a.prof.length > 0 && a.prof.indexOf(prof) < 0) return;
        pool.push(a);
      });
    });
    if (!pool.length) return null;
    var tierWeights = config.qualityAffixTierWeights[qualityKey] || {};
    var tiers = Object.keys(config.affixTiers).filter(function (t) { return (tierWeights[t] || 0) > 0; });
    var avail = tiers.filter(function (t) { return (derived.byTier[t] || []).some(function (a) { return pool.indexOf(a) >= 0; }); });
    if (!avail.length) return null;
    var chosenTier = weightedChoose(avail, function (t) { return tierWeights[t] || 0; });
    var tierPool = pool.filter(function (a) { return a.tier === chosenTier; });
    if (!tierPool.length) return null;
    var affix = weightedChoose(tierPool, function (a) { return a.weight; });
    return toAffixOut(affix, qualityKey, sourceLevel);
  }

  function upgradeEquip(equip, availableMaterials) {
    if (!canUpgrade(equip)) return { ok: false, reason: 'max-quality' };
    var cost = upgradeCost(equip);
    if (!hasMaterials(availableMaterials, cost)) return { ok: false, reason: 'materials', cost: cost };
    var rate = upgradeSuccessRate(equip);
    var success = Math.random() < rate;
    Object.keys(cost).forEach(function (k) { availableMaterials[k] = (availableMaterials[k] || 0) - cost[k]; });
    if (!success) { log('INFO', '升阶失败: ' + equip.quality + '→' + nextQuality(equip.quality) + ' 成功率' + Math.round(rate * 100) + '%（材料已消耗）'); return { ok: true, success: false, cost: cost, rate: rate }; }
    var fromQ = equip.quality, toQ = nextQuality(fromQ);
    equip.quality = toQ;
    equip.qualityName = config.qualities[toQ].name;
    equip.color = config.qualities[toQ].color;
    var sourceLevel = equip._sourceLevel || 1;
    if (config.upgrade.rerollValuesOnSuccess) {
      equip.affixes.forEach(function (a) {
        var def = derived.byId[a.id];
        if (def) { var cv = computeValue(def, toQ, sourceLevel); a.displayValue = cv.displayValue; a.display = cv.display; a.value = cv.value; a.rawValue = cv.rawValue; }
      });
    }
    if (config.upgrade.addAffixOnSuccess && equip.affixes.length < config.qualities[toQ].affixMax) {
      var added = tryAddOneAffix(equip, toQ, sourceLevel, equip._prof);
      if (added) {
        equip.affixes.push(added);
        if (equip.affixLocks) equip.affixLocks.push(false);
      }
    }
    equip.score = scoreAffixes(equip.affixes);
    log('INFO', '升阶成功: ' + fromQ + ' → ' + toQ);
    return { ok: true, success: true, cost: cost, rate: rate, from: fromQ, to: toQ };
  }

  // ───────────────────────── 4. 热更新 ─────────────────────────
  function loadFromURL(url) {
    lastUrl = url;
    if (typeof fetch === 'undefined') { log('WARN', 'loadFromURL: 无 fetch 环境，保持当前配置'); return Promise.reject(new Error('no fetch')); }
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (cfg) { return init(cfg); });
  }
  function reload() { if (lastUrl) return loadFromURL(lastUrl); return Promise.reject(new Error('no lastUrl')); }

  // 立即用默认配置初始化，保证离线可用
  init(DEFAULT_CONFIG);

  var API = {
    get config() { return config; },
    get logs() { return _log; },
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    validate: validate,
    init: init,
    loadFromURL: loadFromURL,
    reload: reload,
    rollQuality: rollQuality,
    rollAffixes: rollAffixes,
    scoreAffixes: scoreAffixes,
    judgeQuality: judgeQuality,
    generateEquip: generateEquip,
    lockAffix: lockAffix,
    replaceAffix: replaceAffix,
    canUpgrade: canUpgrade,
    upgradeCost: upgradeCost,
    upgradeSuccessRate: upgradeSuccessRate,
    upgradeEquip: upgradeEquip,
    getLogs: function () { return _log.slice(); }
  };
  return API;
});
