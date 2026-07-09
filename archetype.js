/*
 * archetype.js —— 流派觉醒系统（双模式）
 * 设计意图：玩家在等级30时选择一个流派（Archetype），解锁觉醒技能树。
 * 每个职业3个流派，流派决定战斗风格和终极觉醒技。
 */
(function () {
  'use strict';

  // ── 流派定义 ──
  // 每个职业3个流派，各有独立觉醒技能树（5个节点）
  const ARCHETYPE_DEFS = {
    warrior: [
      {
        id: 'berserker', name: '狂战士', icon: '💢',
        desc: '放弃防御，极致输出。生命越低伤害越高',
        color: '#f44',
        reqLevel: 30,
        bonuses: { atkPct: 0.10, critRate: 0.05, dmgReduce: -0.05 },
        skillTree: [
          { id: 'b_s1', name: '血怒', tier: 1, desc: '生命低于50%时攻击+15%', effects: [{ stat: 'lowHpAtk', threshold: 0.5, val: 0.15 }] },
          { id: 'b_s2', name: '狂乱打击', tier: 2, desc: '暴击后攻速+20%持续3秒', effects: [{ stat: 'critAtkSpd', val: 0.20, dur: 3 }] },
          { id: 'b_s3', name: '血祭', tier: 3, desc: '击杀敌人回复5%生命', effects: [{ stat: 'killHpRestore', val: 0.05 }] },
          { id: 'b_s4', name: '死战', tier: 4, desc: '生命低于20%时暴击率+15%', effects: [{ stat: 'lowHpCrit', threshold: 0.2, val: 0.15 }] },
          { id: 'b_s5', name: '觉醒·战神之怒', tier: 5, desc: '终极技:15秒内攻击+80%,吸血+30%,免疫控制', effects: [{ stat: 'ultAtkPct', val: 0.80 }, { stat: 'ultLifesteal', val: 0.30 }, { stat: 'ultCcImmune', val: 1 }], meta: { duration: 15, cd: 120 } },
        ],
      },
      {
        id: 'guardian', name: '守护者', icon: '🛡️',
        desc: '坚如磐石，护卫队友。高减伤高仇恨',
        color: '#48f',
        reqLevel: 30,
        bonuses: { hpPct: 0.15, defPct: 0.15, dmgReduce: 0.08 },
        skillTree: [
          { id: 'g_s1', name: '铁壁', tier: 1, desc: '受到伤害-10%', effects: [{ stat: 'dmgReduce', val: 0.10 }] },
          { id: 'g_s2', name: '复仇', tier: 2, desc: '受击后下次攻击+25%', effects: [{ stat: 'revengeDmg', val: 0.25 }] },
          { id: 'g_s3', name: '坚韧', tier: 3, desc: '生命+10%, 防御+10%', effects: [{ stat: 'hpPct', val: 0.10 }, { stat: 'defPct', val: 0.10 }] },
          { id: 'g_s4', name: '反击风暴', tier: 4, desc: '受击时有20%几率反击100%伤害', effects: [{ stat: 'counterChance', val: 0.20 }] },
          { id: 'g_s5', name: '觉醒·不灭金身', tier: 5, desc: '终极技:8秒内无敌,每秒回复5%生命', effects: [{ stat: 'ultInvincible', val: 8 }, { stat: 'ultRegen', val: 0.05 }], meta: { duration: 8, cd: 150 } },
        ],
      },
      {
        id: 'gladiator', name: '角斗士', icon: '⚔️',
        desc: '均衡之道，连击专精。连击越高伤害越恐怖',
        color: '#fa0',
        reqLevel: 30,
        bonuses: { atkPct: 0.05, critDmg: 0.10, comboBonus: 0.15 },
        skillTree: [
          { id: 'gl_s1', name: '连击专精', tier: 1, desc: '连击增益+20%', effects: [{ stat: 'comboDmgMult', val: 0.20 }] },
          { id: 'gl_s2', name: '疾风连斩', tier: 2, desc: '连击达到20后攻速+15%', effects: [{ stat: 'comboAtkSpd', threshold: 20, val: 0.15 }] },
          { id: 'gl_s3', name: '破绽', tier: 3, desc: '连击10以上无视目标10%防御', effects: [{ stat: 'comboArmorPen', threshold: 10, val: 0.10 }] },
          { id: 'gl_s4', name: '终结大师', tier: 4, desc: '终结技伤害+40%', effects: [{ stat: 'finisherDmg', val: 0.40 }] },
          { id: 'gl_s5', name: '觉醒·无尽连舞', tier: 5, desc: '终极技:10秒内连击不衰减且每击附带80%额外伤害', effects: [{ stat: 'ultComboStable', val: 1 }, { stat: 'ultComboExtraDmg', val: 0.80 }], meta: { duration: 10, cd: 100 } },
        ],
      },
    ],
    mage: [
      {
        id: 'pyromancer', name: '炎术士', icon: '🔥',
        desc: '火焰主宰，灼烧万物。灼烧伤害层层叠加',
        color: '#f60',
        reqLevel: 30,
        bonuses: { matkPct: 0.10, fireDmg: 0.08, burnDmg: 0.20 },
        skillTree: [
          { id: 'p_s1', name: '烈焰亲和', tier: 1, desc: '火焰伤害+12%', effects: [{ stat: 'fireDmg', val: 0.12 }] },
          { id: 'p_s2', name: '灼烧蔓延', tier: 2, desc: '灼烧有30%几率扩散到附近敌人', effects: [{ stat: 'burnSpread', val: 0.30 }] },
          { id: 'p_s3', name: '烈焰护盾', tier: 3, desc: '受击时50%几率灼烧攻击者3秒', effects: [{ stat: 'burnShield', val: 0.50 }] },
          { id: 'p_s4', name: '点燃', tier: 4, desc: '灼烧目标时暴击率+10%', effects: [{ stat: 'burnCrit', val: 0.10 }] },
          { id: 'p_s5', name: '觉醒·炼狱', tier: 5, desc: '终极技:全屏火焰爆发500%伤害,灼烧所有敌人8秒', effects: [{ stat: 'ultAoEDmg', val: 5.0 }, { stat: 'ultBurn', val: 8 }], meta: { duration: 0, cd: 120 } },
        ],
      },
      {
        id: 'cryomancer', name: '冰术士', icon: '❄️',
        desc: '寒冰掌控，冻结万物。减速至冰冻的控制链',
        color: '#6cf',
        reqLevel: 30,
        bonuses: { matkPct: 0.08, iceDmg: 0.10, slowEffect: 0.15 },
        skillTree: [
          { id: 'c_s1', name: '寒冰亲和', tier: 1, desc: '冰霜伤害+12%', effects: [{ stat: 'iceDmg', val: 0.12 }] },
          { id: 'c_s2', name: '冻结', tier: 2, desc: '冰霜有15%几率冻结敌人2秒', effects: [{ stat: 'freezeChance', val: 0.15 }] },
          { id: 'c_s3', name: '冰甲', tier: 3, desc: '受到近战伤害-15%', effects: [{ stat: 'meleeDmgReduce', val: 0.15 }] },
          { id: 'c_s4', name: '暴风雪', tier: 4, desc: '冰霜暴击时减速效果翻倍', effects: [{ stat: 'iceCritSlowDouble', val: 1 }] },
          { id: 'c_s5', name: '觉醒·永冻领域', tier: 5, desc: '终极技:10秒内持续冻结周围敌人,每秒100%伤害', effects: [{ stat: 'ultFreezeField', val: 10 }, { stat: 'ultFieldDmg', val: 1.0 }], meta: { duration: 10, cd: 130 } },
        ],
      },
      {
        id: 'arcanist', name: '奥术师', icon: '🔮',
        desc: '奥秘之力，法术连击。技能交替使用获得增益',
        color: '#c6f',
        reqLevel: 30,
        bonuses: { matkPct: 0.08, cdr: 0.10, mpRegen: 5 },
        skillTree: [
          { id: 'a_s1', name: '奥术智慧', tier: 1, desc: '法力回复+8/s', effects: [{ stat: 'mpRegen', val: 8 }] },
          { id: 'a_s2', name: '法术连击', tier: 2, desc: '连续使用不同技能伤害+8%', effects: [{ stat: 'skillChain', val: 0.08 }] },
          { id: 'a_s3', name: '法力护盾', tier: 3, desc: '法力替代30%生命承受伤害', effects: [{ stat: 'manaShield', val: 0.30 }] },
          { id: 'a_s4', name: '奥术充能', tier: 4, desc: '技能暴击时冷却-1秒', effects: [{ stat: 'critReduceCd', val: 1 }] },
          { id: 'a_s5', name: '觉醒·奥术风暴', tier: 5, desc: '终极技:12秒内所有技能无冷却,法力消耗为0', effects: [{ stat: 'ultNoCd', val: 1 }, { stat: 'ultNoMpCost', val: 1 }], meta: { duration: 12, cd: 150 } },
        ],
      },
    ],
    taoist: [
      {
        id: 'necromancer', name: '死灵法师', icon: '💀',
        desc: '亡灵统帅，以战养战。召唤物越多越强',
        color: '#a7f',
        reqLevel: 30,
        bonuses: { matkPct: 0.08, summonCount: 1, summonDmg: 0.10 },
        skillTree: [
          { id: 'n_s1', name: '亡灵强化', tier: 1, desc: '召唤物伤害+15%', effects: [{ stat: 'summonDmg', val: 0.15 }] },
          { id: 'n_s2', name: '骸骨护甲', tier: 2, desc: '每存在一个召唤物减伤+4%', effects: [{ stat: 'summonDmgReduce', val: 0.04 }] },
          { id: 'n_s3', name: '生命汲取', tier: 3, desc: '召唤物造成伤害5%治疗玩家', effects: [{ stat: 'summonLifesteal', val: 0.05 }] },
          { id: 'n_s4', name: '亡灵大军', tier: 4, desc: '召唤数量+1且召唤物生命+30%', effects: [{ stat: 'summonCount', val: 1 }, { stat: 'summonHp', val: 0.30 }] },
          { id: 'n_s5', name: '觉醒·亡灵天灾', tier: 5, desc: '终极技:召唤5个强力亡灵战斗15秒,每个造成200%伤害', effects: [{ stat: 'ultSummonCount', val: 5 }, { stat: 'ultSummonDmg', val: 2.0 }], meta: { duration: 15, cd: 180 } },
        ],
      },
      {
        id: 'oracle', name: '先知', icon: '👁️',
        desc: '预知未来，增益团队。buff持续时间和效果翻倍',
        color: '#fd4',
        reqLevel: 30,
        bonuses: { matkPct: 0.05, buffDur: 0.30, healEffect: 0.15 },
        skillTree: [
          { id: 'o_s1', name: '祝福强化', tier: 1, desc: '增益效果+15%', effects: [{ stat: 'buffEffect', val: 0.15 }] },
          { id: 'o_s2', name: '预知', tier: 2, desc: '闪避率+8%', effects: [{ stat: 'dodgeChance', val: 0.08 }] },
          { id: 'o_s3', name: '净化', tier: 3, desc: '净化自身负面效果,冷却30秒', effects: [{ stat: 'cleanse', val: 30 }] },
          { id: 'o_s4', name: '先知祝福', tier: 4, desc: '所有增益技时长+40%', effects: [{ stat: 'buffDur', val: 0.40 }] },
          { id: 'o_s5', name: '觉醒·命运扭转', tier: 5, desc: '终极技:重置所有技能冷却,全队回复50%生命', effects: [{ stat: 'ultResetCd', val: 1 }, { stat: 'ultTeamHeal', val: 0.50 }], meta: { duration: 0, cd: 180 } },
        ],
      },
      {
        id: 'shaman', name: '萨满', icon: '🌿',
        desc: '自然之力，元素共鸣。元素反应伤害大幅提升',
        color: '#3c8',
        reqLevel: 30,
        bonuses: { matkPct: 0.06, reactionDmg: 0.20, maxHp: 200 },
        skillTree: [
          { id: 's_s1', name: '自然亲和', tier: 1, desc: '元素反应伤害+25%', effects: [{ stat: 'reactionDmg', val: 0.25 }] },
          { id: 's_s2', name: '元素共鸣', tier: 2, desc: '触发反应时回复5%生命', effects: [{ stat: 'reactionHeal', val: 0.05 }] },
          { id: 's_s3', name: '图腾', tier: 3, desc: '每15秒自动触发一次元素反应', effects: [{ stat: 'autoReaction', val: 15 }] },
          { id: 's_s4', name: '元素过载', tier: 4, desc: '反应伤害+40%且100%概率触发额外效果', effects: [{ stat: 'reactionDmg', val: 0.40 }, { stat: 'reactionBonusEffect', val: 1 }] },
          { id: 's_s5', name: '觉醒·元素风暴', tier: 5, desc: '终极技:8秒内每击触发所有元素反应,伤害翻倍', effects: [{ stat: 'ultAllReaction', val: 1 }, { stat: 'ultReactionDmgMult', val: 2.0 }], meta: { duration: 8, cd: 140 } },
        ],
      },
    ],
  };

  // ── 流派状态 ──
  function makeArchetypeState() {
    return {
      selected: null,        // archetype id
      unlockedSkills: {},    // { skillId: true }
      skillPoints: 0,       // 觉醒技能点
    };
  }

  // ── 可用流派列表 ──
  function getArchetypes(prof) {
    return ARCHETYPE_DEFS[prof] || [];
  }

  // ── 获取流派定义 ──
  function getArchetype(prof, archId) {
    const list = ARCHETYPE_DEFS[prof];
    if (!list) return null;
    return list.find(a => a.id === archId) || null;
  }

  // ── 可觉醒检查 ──
  function canAwaken(prof, archId, level, state) {
    const arch = getArchetype(prof, archId);
    if (!arch) return false;
    if (level < arch.reqLevel) return false;
    if (state.selected && state.selected !== archId) return false;
    return true;
  }

  // ── 觉醒 ──
  function awaken(prof, archId, level, state) {
    if (!canAwaken(prof, archId, level, state)) return { ok: false, reason: '条件不满足' };
    state.selected = archId;
    state.skillPoints = (state.skillPoints || 0) + 3; // 觉醒奖励3点
    const arch = getArchetype(prof, archId);
    return { ok: true, bonuses: arch ? arch.bonuses : null };
  }

  // ── 学习觉醒技能 ──
  function canLearnSkill(prof, archId, skillId, state) {
    const arch = getArchetype(prof, archId);
    if (!arch) return false;
    if (state.selected !== archId) return false;
    const skill = arch.skillTree.find(s => s.id === skillId);
    if (!skill) return false;
    if (state.unlockedSkills[skillId]) return false; // 已学
    // 前置技能检查
    const tier = skill.tier;
    if (tier > 1) {
      const prevSkills = arch.skillTree.filter(s => s.tier === tier - 1);
      const hasPrev = prevSkills.some(s => state.unlockedSkills[s.id]);
      if (!hasPrev) return false;
    }
    const cost = skillCost(tier);
    if ((state.skillPoints || 0) < cost) return false;
    return true;
  }

  function skillCost(tier) { return tier; } // tier=1cost1, tier=5cost5

  function learnSkill(prof, archId, skillId, state) {
    if (!canLearnSkill(prof, archId, skillId, state)) return false;
    state.unlockedSkills[skillId] = true;
    state.skillPoints = (state.skillPoints || 0) - skillCost(
      (getArchetype(prof, archId).skillTree.find(s => s.id === skillId) || {}).tier || 1
    );
    return true;
  }

  // ── 获取觉醒技能效果 ──
  function getActiveBonuses(prof, state) {
    const result = {};
    if (!state || !state.selected) return result;
    const arch = getArchetype(prof, state.selected);
    if (!arch) return result;
    // 基础加成
    if (arch.bonuses) Object.assign(result, arch.bonuses);
    // 已学技能效果
    for (const skill of arch.skillTree) {
      if (state.unlockedSkills[skill.id]) {
        for (const ef of skill.effects) {
          if (!ef.stat.startsWith('ult')) { // 终极技单独处理
            result[ef.stat] = (result[ef.stat] || 0) + ef.val;
          }
        }
      }
    }
    return result;
  }

  // ── 获取觉醒终极技 ──
  function getUltimateSkill(prof, state) {
    if (!state || !state.selected) return null;
    const arch = getArchetype(prof, state.selected);
    if (!arch) return null;
    const ult = arch.skillTree.find(s => s.tier === 5);
    if (!ult || !state.unlockedSkills[ult.id]) return null;
    return {
      name: ult.name,
      desc: ult.desc,
      effects: ult.effects,
      meta: ult.meta,
    };
  }

  // ── 获取流派进度百分比 ──
  function archetypeProgress(prof, state) {
    if (!state || !state.selected) return 0;
    const arch = getArchetype(prof, state.selected);
    if (!arch) return 0;
    const unlocked = Object.keys(state.unlockedSkills).filter(k => state.unlockedSkills[k]).length;
    return Math.round((unlocked / arch.skillTree.length) * 100);
  }

  // ── 导出 ──
  const Archetype = {
    ARCHETYPE_DEFS,
    makeArchetypeState,
    getArchetypes,
    getArchetype,
    canAwaken,
    awaken,
    canLearnSkill,
    learnSkill,
    skillCost,
    getActiveBonuses,
    getUltimateSkill,
    archetypeProgress,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Archetype;
  if (typeof window !== 'undefined') window.Archetype = Archetype;
})();
