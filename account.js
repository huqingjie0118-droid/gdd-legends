// ============================================================
//  账号系统 + 职业成长（技能树 / 进阶）— 前端逻辑
//  依赖后端 /api/* ；同域部署时直接 fetch 相对路径。
//  通过 window.Account 暴露，供 index.html 内联脚本调用。
// ============================================================
(function () {
  'use strict';

  // 跨脚本共享：技能/进阶加成（被 index.html 的 calcPlayerStats 读取）
  // 必须挂到 window，否则 IIFE 作用域内的本地变量外部脚本读不到
  var extraBonuses = (window.extraBonuses = window.extraBonuses || {});

  // ---------------- 平衡参数（单一调参入口） ----------------
  // 数值平衡放大：所有 balanceKey 缩放统一取 7（5~10 倍区间中值），
  // 单一乘数保持各分支/各效果之间的相对比例不变，避免单参数失控。
  // recomputeBonuses 中 v = ef.perLevel * lv * SKILL_TREE_BAL[balanceKey]
  var SKILL_TREE_BAL = {
    pointsPerLevel: 1,                                  // 每升 1 级基础技能点
    milestone: { every5: 2, every10: 3 },               // 里程碑额外点
    questPoint: 1, achievementPoint: 2, startBonus: 2,  // 其他来源（预留 Hook）
    // 统一放大系数（核心调参旋钮）：全部取 7，保持相对比例
    combat: 7, augment: 7, survival: 7, mastery: 7, ultimate: 7,
    // 单分支总贡献封顶（随放大系数同步 ×7，防碾压且不被提前钳制）
    branchCap: { combat: { atkPct: 2.10, matkPct: 2.10 }, survival: { hpPct: 3.15, dmgReduce: 1.75 }, mastery: { cdr: 1.26, armorPen: 1.40 } },
    augmentDmg: 1.0,        // 增强类全局系数（热修，预留）
    ultimateHotfix: 1.0,    // 终极技伤害热修乘子（与 balanceKey.ultimate 区分，避免双重放大）
    resetBase: 500,     // 洗点基础费（金）
    resetExp: 1.5,      // 洗点费用指数
    resetCooldownH: 24, // 洗点冷却（小时）
  };

  // ---------------- 数据：技能树（每职业 3 分支 × 6 层 = 18 节点） ----------------
  // 节点字段：branch/tier/name/icon/type(passive|augment|active)/desc/
  //   resource{type,cost}/prereq[]/reqLevel/maxLevel/costPerLevel[]/effects[]/balanceKey
  // Effect: { stat:'atkPct'|'hpPct'|'skillMult'|'critRate'|..., skill?:id, perLevel, isPercent }
  function mkTree(prefix, atkStat, skill) {
    var atkPct = atkStat + 'Pct';
    var nodes = {};
    function N(id, o) { nodes[prefix + '_' + id] = o; }
    var head = prefix + '_';
    // === 战斗 / 奥术 分支 ===
    N('combat_t1', { branch: 'combat', tier: 1, name: '武器精通', icon: '🗡️', type: 'passive', desc: '攻击力提升', resource: { type: 'none' }, prereq: [], reqLevel: 0, maxLevel: 5, costPerLevel: [1, 1, 2, 2, 3], effects: [{ stat: atkPct, perLevel: 0.03, isPercent: true }], balanceKey: 'combat' });
    N('combat_t2', { branch: 'combat', tier: 2, name: '主战强化', icon: '🔥', type: 'augment', desc: '强化主战技能伤害', resource: { type: 'none' }, prereq: [head + 'combat_t1'], reqLevel: 0, maxLevel: 4, costPerLevel: [1, 1, 2, 2], effects: [{ stat: 'skillMult', skill: skill.combat, perLevel: 0.08, isPercent: false }], balanceKey: 'augment' });
    N('combat_t3', { branch: 'combat', tier: 3, name: '范围扩展', icon: '🌀', type: 'augment', desc: '扩大范围技能覆盖', resource: { type: 'none' }, prereq: [head + 'combat_t2'], reqLevel: 0, maxLevel: 3, costPerLevel: [2, 2, 3], effects: [{ stat: 'skillRange', perLevel: 0.08, isPercent: false }], balanceKey: 'augment' });
    N('combat_t4', { branch: 'combat', tier: 4, name: '爆发延长', icon: '⏱️', type: 'augment', desc: '延长增益技能持续', resource: { type: 'none' }, prereq: [head + 'combat_t3'], reqLevel: 0, maxLevel: 3, costPerLevel: [2, 2, 3], effects: [{ stat: 'buffDur', skill: skill.burst, perLevel: 0.20, isPercent: false }], balanceKey: 'augment' });
    N('combat_t5', { branch: 'combat', tier: 5, name: '致命连击', icon: '💢', type: 'passive', desc: '提升暴击与暴伤', resource: { type: 'none' }, prereq: [head + 'combat_t4'], reqLevel: 0, maxLevel: 4, costPerLevel: [2, 3, 3, 4], effects: [{ stat: 'critRate', perLevel: 0.02, isPercent: false }, { stat: 'critDmg', perLevel: 0.05, isPercent: false }], balanceKey: 'combat' });
    N('combat_t6', { branch: 'combat', tier: 6, name: '战神降临', icon: '⚡', type: 'active', desc: '激活:10秒内攻击+40%、吸血+15%', resource: { type: 'mp', cost: 80 }, prereq: [head + 'combat_t5'], reqLevel: 30, maxLevel: 1, costPerLevel: [6], effects: [{ stat: 'ultAtkPct', perLevel: 0.40, isPercent: true }, { stat: 'ultLifesteal', perLevel: 0.15, isPercent: true }], balanceKey: 'ultimate', meta: { duration: 10, cd: 90 } });
    // === 生存 / 守护 分支 ===
    N('survival_t1', { branch: 'survival', tier: 1, name: '强健体魄', icon: '❤️', type: 'passive', desc: '生命上限提升', resource: { type: 'none' }, prereq: [], reqLevel: 0, maxLevel: 5, costPerLevel: [1, 1, 2, 2, 3], effects: [{ stat: 'hpPct', perLevel: 0.05, isPercent: true }], balanceKey: 'survival' });
    N('survival_t2', { branch: 'survival', tier: 2, name: '铁壁', icon: '🛡️', type: 'passive', desc: '物理防御提升', resource: { type: 'none' }, prereq: [head + 'survival_t1'], reqLevel: 0, maxLevel: 4, costPerLevel: [1, 1, 2, 2], effects: [{ stat: 'defPct', perLevel: 0.05, isPercent: true }], balanceKey: 'survival' });
    N('survival_t3', { branch: 'survival', tier: 3, name: '嗜血', icon: '🩸', type: 'passive', desc: '攻击吸血', resource: { type: 'none' }, prereq: [head + 'survival_t2'], reqLevel: 0, maxLevel: 4, costPerLevel: [2, 2, 3, 3], effects: [{ stat: 'lifesteal', perLevel: 0.02, isPercent: false }], balanceKey: 'survival' });
    N('survival_t4', { branch: 'survival', tier: 4, name: '不屈', icon: '🪨', type: 'passive', desc: '受伤减免', resource: { type: 'none' }, prereq: [head + 'survival_t3'], reqLevel: 0, maxLevel: 3, costPerLevel: [2, 2, 3], effects: [{ stat: 'dmgReduce', perLevel: 0.03, isPercent: false }], balanceKey: 'survival' });
    N('survival_t5', { branch: 'survival', tier: 5, name: '再生', icon: '🌿', type: 'passive', desc: '生命与减伤兼备', resource: { type: 'none' }, prereq: [head + 'survival_t4'], reqLevel: 0, maxLevel: 4, costPerLevel: [2, 3, 3, 4], effects: [{ stat: 'hpPct', perLevel: 0.04, isPercent: true }, { stat: 'dmgReduce', perLevel: 0.02, isPercent: false }], balanceKey: 'survival' });
    N('survival_t6', { branch: 'survival', tier: 6, name: '绝境壁垒', icon: '🏰', type: 'passive', desc: '大量生命与减伤', resource: { type: 'none' }, prereq: [head + 'survival_t5'], reqLevel: 30, maxLevel: 1, costPerLevel: [6], effects: [{ stat: 'hpPct', perLevel: 0.10, isPercent: true }, { stat: 'dmgReduce', perLevel: 0.15, isPercent: false }], balanceKey: 'survival' });
    // === 精通 / 秘法 分支 ===
    N('mastery_t1', { branch: 'mastery', tier: 1, name: '疾风步', icon: '💨', type: 'passive', desc: '移动速度提升', resource: { type: 'none' }, prereq: [], reqLevel: 0, maxLevel: 4, costPerLevel: [1, 1, 2, 2], effects: [{ stat: 'spdPct', perLevel: 0.04, isPercent: true }], balanceKey: 'mastery' });
    N('mastery_t2', { branch: 'mastery', tier: 2, name: '冷却掌控', icon: '⏳', type: 'passive', desc: '冷却缩减', resource: { type: 'none' }, prereq: [head + 'mastery_t1'], reqLevel: 0, maxLevel: 5, costPerLevel: [1, 1, 2, 2, 3], effects: [{ stat: 'cdr', perLevel: 0.03, isPercent: false }], balanceKey: 'mastery' });
    N('mastery_t3', { branch: 'mastery', tier: 3, name: '怒气回收', icon: '🔋', type: 'passive', desc: '法力回复提升', resource: { type: 'none' }, prereq: [head + 'mastery_t2'], reqLevel: 0, maxLevel: 4, costPerLevel: [2, 2, 3, 3], effects: [{ stat: 'mpRegen', perLevel: 1, isPercent: false }], balanceKey: 'mastery' });
    N('mastery_t4', { branch: 'mastery', tier: 4, name: '破甲', icon: '🪓', type: 'passive', desc: '无视部分防御', resource: { type: 'none' }, prereq: [head + 'mastery_t3'], reqLevel: 0, maxLevel: 3, costPerLevel: [2, 2, 3], effects: [{ stat: 'armorPen', perLevel: 0.04, isPercent: false }], balanceKey: 'mastery' });
    N('mastery_t5', { branch: 'mastery', tier: 5, name: '群战大师', icon: '⚔️', type: 'passive', desc: '暴击与攻击兼备', resource: { type: 'none' }, prereq: [head + 'mastery_t4'], reqLevel: 0, maxLevel: 4, costPerLevel: [2, 3, 3, 4], effects: [{ stat: 'critRate', perLevel: 0.02, isPercent: false }, { stat: atkPct, perLevel: 0.03, isPercent: true }], balanceKey: 'mastery' });
    N('mastery_t6', { branch: 'mastery', tier: 6, name: '武器大师', icon: '🗿', type: 'passive', desc: '攻击与暴伤大幅提升', resource: { type: 'none' }, prereq: [head + 'mastery_t5'], reqLevel: 30, maxLevel: 1, costPerLevel: [6], effects: [{ stat: atkPct, perLevel: 0.15, isPercent: true }, { stat: 'critDmg', perLevel: 0.10, isPercent: false }], balanceKey: 'mastery' });
    return {
      branches: [
        { id: 'combat', name: atkStat === 'atk' ? '战斗' : '奥术', color: '#e85030' },
        { id: 'survival', name: '生存', color: '#27ae60' },
        { id: 'mastery', name: atkStat === 'atk' ? '精通' : '秘法', color: '#3498db' },
      ],
      nodes: nodes,
    };
  }

  var SKILL_TREE_DEFS = {
    warrior: mkTree('war', 'atk',  { combat: 'fire',   aoe: 'cleave',  burst: 'berserk', util: 'shield' }),
    mage:    mkTree('mag', 'matk', { combat: 'ice',    aoe: 'meteor',  burst: 'thunder', util: 'firewall' }),
    taoist:  mkTree('tao', 'matk', { combat: 'poison', aoe: 'heal',    burst: 'summon',  util: 'shield' }),
  };

  // ---------------- 数据：职业进阶 ----------------
  // tier 需顺序解锁；reqLevel 等级门槛；bonus 永久属性；skillPoints 奖励技能点
  var ADVANCEMENTS = {
    warrior: [
      { tier: 1, name: '战神觉醒', reqLevel: 10, skillPoints: 3, bonus: { atk: 20, hp: 120, def: 10 }, desc: '转职为战神，攻防与生命大幅提升' },
      { tier: 2, name: '无双战神', reqLevel: 22, skillPoints: 5, bonus: { atk: 45, hp: 260, def: 25, critRate: 0.05 }, desc: '终极形态，碾压一切敌人' },
    ],
    mage: [
      { tier: 1, name: '元素尊者', reqLevel: 10, skillPoints: 3, bonus: { matk: 24, mp: 80, cdr: 0.05 }, desc: '掌握元素本源，法力与魔攻暴涨' },
      { tier: 2, name: '法神降世', reqLevel: 22, skillPoints: 5, bonus: { matk: 52, mp: 180, cdr: 0.10 }, desc: '法神临世，毁天灭地' },
    ],
    taoist: [
      { tier: 1, name: '仙风道骨', reqLevel: 10, skillPoints: 3, bonus: { hp: 120, mdef: 16, lifesteal: 0.04 }, desc: '脱胎换骨，生存与辅助俱强' },
      { tier: 2, name: '道尊临凡', reqLevel: 22, skillPoints: 5, bonus: { hp: 260, mdef: 34, lifesteal: 0.08, def: 12 }, desc: '道尊降世，万法不侵' },
    ],
  };

  function findNode(prof, id) {
    var defs = SKILL_TREE_DEFS[prof];
    return defs ? defs.nodes[id] : null;
  }
  function advList(prof) { return ADVANCEMENTS[prof] || []; }
  function findT6(prof) {
    var defs = SKILL_TREE_DEFS[prof];
    if (!defs) return null;
    for (var id in defs.nodes) { if (defs.nodes[id].type === 'active') return defs.nodes[id]; }
    return null;
  }

  // 重新计算所有派生数据：extraBonuses(百分比+加性) / skillMultMap / buffDurMap / ultimateInfo
  function recomputeBonuses() {
    var b = {};                 // 写进 extraBonuses（被 calcPlayerStats 消费）
    var sm = {};                // 技能增伤 map: { skillId: addMult }
    var buffDur = {};           // 增益时长放大 map: { skillId: addMult }
    var ult = null;             // 终极技信息
    var p = Account.myProfile;
    var prof = (p && p.class) || playerProfession;
    var defs = SKILL_TREE_DEFS[prof];
    if (p && p.skillTree && defs) {
      for (var nid in p.skillTree) {
        var lv = p.skillTree[nid];
        if (!lv) continue;
        var node = defs.nodes[nid];
        if (!node) continue;
        var scale = SKILL_TREE_BAL[node.balanceKey];
        if (scale == null) scale = 1;
        for (var ei = 0; ei < node.effects.length; ei++) {
          var ef = node.effects[ei];
          var v = ef.perLevel * lv * scale;
          if (ef.stat === 'skillMult') sm[ef.skill] = (sm[ef.skill] || 0) + v;
          else if (ef.stat === 'buffDur') buffDur[ef.skill] = (buffDur[ef.skill] || 0) + v;
          else if (ef.stat === 'ultAtkPct') { if (!ult) ult = { atkPct: 0, lifesteal: 0, duration: 10, cd: 90, cost: 80 }; ult.atkPct += v; }
          else if (ef.stat === 'ultLifesteal') { if (!ult) ult = { atkPct: 0, lifesteal: 0, duration: 10, cd: 90, cost: 80 }; ult.lifesteal += v; }
          else b[ef.stat] = (b[ef.stat] || 0) + v;   // 其余为 extraBonuses 字段
        }
      }
    }
    if (p && p.advancement) {
      advList(prof).forEach(function (a) {
        if (a.tier <= p.advancement) for (var k in a.bonus) b[k] = (b[k] || 0) + a.bonus[k];
      });
    }
    if (ult) {
      var t6 = findT6(prof);
      if (t6 && t6.meta) { ult.duration = t6.meta.duration; ult.cd = t6.meta.cd; }
      if (t6 && t6.resource) ult.cost = t6.resource.cost || 80;
    }
    window.extraBonuses = extraBonuses = b;
    window.skillMultMap = sm;
    window.buffDurMap = buffDur;
    window.ultimateInfo = ult;
    return b;
  }

  var Account = {
    token: null,
    user: null,
    myProfile: null,

    // ---------- 网络 ----------
    async api(path, opts) {
      opts = opts || {};
      var headers = { 'Content-Type': 'application/json' };
      if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
      try {
        var res = await fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
        var data;
        try { data = await res.json(); }
        catch (e) {
          var hint = '';
          if (res.status === 501 || res.status === 405) hint = '（账号接口未启用：请用 `node server/index.js` 启动服务，勿用 python -m http.server）';
          else if (res.status === 404) hint = '（接口不存在）';
          data = { ok: false, error: '响应解析失败' + hint };
        }
        return { status: res.status, data: data };
      } catch (e) {
        return { status: 0, data: { ok: false, error: '网络错误，请确认服务已启动' } };
      }
    },

    // ---------- 启动：显示账号屏 ----------
    boot() {
      var ps = document.getElementById('profession-select');
      var ui = document.getElementById('ui-layer');
      if (ps) ps.style.display = 'none';
      if (ui) ui.style.display = 'none';
      try { this.token = localStorage.getItem('legends_token') || null; } catch (e) {}
      this.showAccountScreen();
      if (this.token) this.tryAutoLogin();
    },

    showAccountScreen() {
      var s = document.getElementById('account-screen');
      if (s) s.style.display = 'flex';
      this.switchTab('login');
    },
    hideAccountScreen() {
      var s = document.getElementById('account-screen');
      if (s) s.style.display = 'none';
    },

    switchTab(tab) {
      var lt = document.getElementById('login-form');
      var rt = document.getElementById('register-form');
      var tabs = document.querySelectorAll('.acc-tab');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      if (lt) lt.style.display = (tab === 'login') ? 'block' : 'none';
      if (rt) rt.style.display = (tab === 'register') ? 'block' : 'none';
      this.clearErrors();
    },
    clearErrors() {
      ['login-err', 'register-err'].forEach(id => { var e = document.getElementById(id); if (e) e.textContent = ''; });
    },

    // 离线游玩（后端不可用时仍可直接玩，技能/进阶本地生效）
    offlinePlay() {
      this.token = null;
      this.myProfile = null;
      this.hideAccountScreen();
      var ps = document.getElementById('profession-select');
      if (ps) ps.style.display = 'flex';
    },

    // ---------- 注册（最简：用户名 + 密码） ----------
    async doRegister() {
      var u = document.getElementById('reg-username').value.trim();
      var p1 = document.getElementById('reg-password').value;
      var p2 = document.getElementById('reg-confirm').value;
      var err = document.getElementById('register-err');
      if (u.length < 3 || u.length > 20 || !/^[a-zA-Z0-9_]+$/.test(u)) { err.textContent = '用户名需3-20位，仅字母/数字/下划线'; return; }
      var ps = this.checkStrength(p1);
      if (!ps.valid) { err.textContent = '密码需满足: ' + ps.reasons.join('、'); return; }
      if (p1 !== p2) { err.textContent = '两次密码不一致'; return; }
      var r = await this.api('/api/register', { method: 'POST', body: { username: u, password: p1 } });
      if (!r.data.ok) {
        err.textContent = (r.data.errors && (r.data.errors.username || r.data.errors.password || r.data.errors.email)) || '注册失败';
        return;
      }
      // 注册成功自动登录
      await this.doLogin(u, p1, false);
    },

    checkStrength(pw) {
      pw = pw || '';
      var reasons = [];
      if (pw.length < 8) reasons.push('至少8位');
      if (!/[a-z]/.test(pw)) reasons.push('小写字母');
      if (!/[A-Z]/.test(pw)) reasons.push('大写字母');
      if (!/[0-9]/.test(pw)) reasons.push('数字');
      if (!/[^a-zA-Z0-9]/.test(pw)) reasons.push('特殊字符');
      var score = 0;
      if (pw.length >= 8) score++; if (pw.length >= 12) score++;
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++; if (/[^a-zA-Z0-9]/.test(pw)) score++;
      this.updateStrengthBar(score);
      return { score: Math.min(5, score), valid: reasons.length === 0, reasons: reasons };
    },
    updateStrengthBar(score) {
      var bar = document.getElementById('pwd-strength');
      if (!bar) return;
      var colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60', '#1abc9c'];
      bar.style.width = (score / 5 * 100) + '%';
      bar.style.background = colors[score] || '#e74c3c';
      bar.title = '强度 ' + score + '/5';
    },

    // ---------- 登录 ----------
    async doLogin(username, password, remember) {
      if (username == null) {
        username = document.getElementById('login-username').value.trim();
        password = document.getElementById('login-password').value;
        remember = document.getElementById('login-remember').checked;
      }
      var err = document.getElementById('login-err');
      if (!username || !password) { if (err) err.textContent = '请输入账号和密码'; return; }
      var r = await this.api('/api/login', { method: 'POST', body: { identifier: username, password: password, remember: !!remember } });
      if (!r.data.ok) { if (err) err.textContent = r.data.error || '登录失败'; return; }
      this.token = r.data.token;
      this.user = r.data.user;
      try { localStorage.setItem('legends_token', this.token); } catch (e) {}
      await this.afterAuth();
    },

    async tryAutoLogin() {
      var r = await this.api('/api/me');
      if (r.data.ok) {
        this.user = r.data.user;
        this.myProfile = r.data.profile;
        await this.afterAuth();
      } else {
        this.token = null;
        try { localStorage.removeItem('legends_token'); } catch (e) {}
      }
    },

    // 登录/自动登录成功后：拉档案 → 有职业直接进游戏，否则选职业
    async afterAuth() {
      var r = await this.api('/api/profile');
      if (r.data.ok) this.myProfile = r.data.profile;
      else this.myProfile = { class: null, level: 1, exp: 0, expToNext: 100, gold: 0, equipment: {}, backpack: [], mapIndex: 0, clearedMaps: [], skillTree: {}, advancement: 0, skillPoints: 0, skillResets: 0 };
      this.hideAccountScreen();
      this.updateAccountMenu();
      if (this.myProfile.class) {
        // 已有职业：直接进入游戏（带回存档）
        if (typeof selectProfession === 'function') selectProfession(this.myProfile.class);
      } else {
        var ps = document.getElementById('profession-select');
        if (ps) ps.style.display = 'flex';
      }
    },

    // 退出登录
    async logout() {
      await this.api('/api/logout', { method: 'POST' });
      this.token = null; this.user = null; this.myProfile = null;
      try { localStorage.removeItem('legends_token'); } catch (e) {}
      location.reload();
    },

    // ---------- 进入游戏前的档案应用（被 selectProfession 调用） ----------
    applyProfileToGame(prof) {
      if (!this.myProfile) this.myProfile = { class: null, level: 1, exp: 0, expToNext: 100, gold: 0, equipment: {}, backpack: [], mapIndex: 0, clearedMaps: [], skillTree: {}, advancement: 0, skillPoints: 0, skillResets: 0 };
      this.myProfile.class = prof;
      // 若后端有进度，覆盖本地初始值
      var p = this.myProfile;
      if (p.level > 1) playerLevel = p.level;
      if (typeof p.exp === 'number') playerExp = p.exp;
      if (typeof p.expToNext === 'number') playerExpToNext = p.expToNext;
      if (typeof p.gold === 'number') playerGold = p.gold;
      if (p.mapIndex) currentMapIndex = p.mapIndex;
      if (Array.isArray(p.clearedMaps)) { clearedMaps.clear(); p.clearedMaps.forEach(function (i) { clearedMaps.add(i); }); }
      recomputeBonuses();
    },

    // selectProfession 完成后调用：显示按钮 + 同步
    onEntered() {
      this.updateAccountMenu();
      var bs = document.getElementById('btn-skill'); if (bs) bs.style.display = 'inline-block';
      var ba = document.getElementById('btn-adv'); if (ba) ba.style.display = 'inline-block';
      var am = document.getElementById('account-menu'); if (am) am.style.display = 'flex';
      this.syncProfile();
    },

    updateAccountMenu() {
      var el = document.getElementById('acc-username');
      if (el && this.user) el.textContent = this.user.username;
    },

    // ---------- 档案同步（后端为真相源） ----------
    syncProfile() {
      if (!this.token || !this.myProfile) return;
      var p = this.myProfile;
      p.class = playerProfession;
      p.level = playerLevel; p.exp = playerExp; p.expToNext = playerExpToNext; p.gold = playerGold;
      p.mapIndex = currentMapIndex;
      p.clearedMaps = Array.from(clearedMaps);
      p.equipment = playerEquipment; p.backpack = playerBackpack;
      this.api('/api/profile', { method: 'PUT', body: p });
    },

    // ---------- 技能树 ----------
    openSkill() {
      this.renderSkill();
      var p = document.getElementById('skill-panel'); if (p) p.style.display = 'flex';
    },
    closeSkill() { var p = document.getElementById('skill-panel'); if (p) p.style.display = 'none'; },

    // ---------- 技能树：状态 / 解锁判定 ----------
    nodeStatus(id) {
      var prof = playerProfession;
      var defs = SKILL_TREE_DEFS[prof];
      var node = defs && defs.nodes[id];
      if (!node) return 'locked';
      var p = this.myProfile || {};
      var owned = p.skillTree || {};
      var lv = owned[id] || 0;
      if (lv >= node.maxLevel) return 'maxed';
      if (lv > 0) return lv === 1 ? 'unlocked' : 'upgraded';
      if (this.canUpgrade(id)) return 'unlockable';
      return 'locked';
    },
    canUpgrade(id) {
      var prof = playerProfession;
      var node = SKILL_TREE_DEFS[prof] && SKILL_TREE_DEFS[prof].nodes[id];
      if (!node) return false;
      var p = this.myProfile || {};
      var owned = p.skillTree || {};
      var lv = owned[id] || 0;
      if (lv >= node.maxLevel) return false;
      for (var i = 0; i < node.prereq.length; i++) if (!(owned[node.prereq[i]] >= 1)) return false;
      if (playerLevel < node.reqLevel) return false;
      var cost = node.costPerLevel[lv] || 0;
      if ((p.skillPoints || 0) < cost) return false;
      return true;
    },

    // ---------- 技能树：升级 / 重置节点 ----------
    upgradeNode(id) {
      var prof = playerProfession;
      var p = this.myProfile; if (!p) return false;
      var node = SKILL_TREE_DEFS[prof] && SKILL_TREE_DEFS[prof].nodes[id];
      if (!node) return false;
      if (!this.canUpgrade(id)) { if (typeof Sound !== 'undefined') Sound.deny(); return false; }
      var lv = (p.skillTree && p.skillTree[id]) || 0;
      var cost = node.costPerLevel[lv] || 0;
      p.skillPoints = (p.skillPoints || 0) - cost;
      p.skillTree = p.skillTree || {};
      p.skillTree[id] = lv + 1;
      recomputeBonuses();
      this.recalculate();
      if (typeof Sound !== 'undefined') Sound.levelup();
      this.renderSkill();
      this.syncProfile();
      if (typeof updateTopBarUI === 'function') updateTopBarUI();
      return true;
    },
    resetNode(id) {
      var prof = playerProfession;
      var p = this.myProfile; if (!p) return;
      var node = SKILL_TREE_DEFS[prof] && SKILL_TREE_DEFS[prof].nodes[id];
      if (!node) return;
      var lv = (p.skillTree && p.skillTree[id]) || 0; if (!lv) return;
      var refunded = 0;
      for (var i = 0; i < lv; i++) refunded += (node.costPerLevel[i] || 0);
      p.skillPoints = (p.skillPoints || 0) + refunded;
      delete p.skillTree[id];
      recomputeBonuses();
      this.recalculate();
      this.renderSkill();
      this.syncProfile();
      if (typeof updateTopBarUI === 'function') updateTopBarUI();
    },
    resetTree() {
      var p = this.myProfile; if (!p) return;
      var prof = playerProfession;
      var defs = SKILL_TREE_DEFS[prof];
      var spent = p.skillTree || {};
      var total = 0; for (var k in spent) total += spent[k];
      if (!total) return;
      var now = Date.now();
      var last = window.__lastResetTs || 0;
      if (p.skillResets > 0 && now - last < SKILL_TREE_BAL.resetCooldownH * 3600e3) {
        if (typeof Sound !== 'undefined') Sound.deny();
        return;
      }
      var cost = Math.round(SKILL_TREE_BAL.resetBase * Math.pow((p.skillResets || 0) + 1, SKILL_TREE_BAL.resetExp));
      if (playerGold < cost) { if (typeof Sound !== 'undefined') Sound.deny(); return; }
      playerGold -= cost;
      var refunded = 0;
      if (defs) for (var id in spent) {
        var node = defs.nodes[id];
        if (!node) continue;
        for (var i = 0; i < spent[id]; i++) refunded += (node.costPerLevel[i] || 0);
      }
      p.skillPoints = (p.skillPoints || 0) + refunded;
      p.skillTree = {};
      p.skillResets = (p.skillResets || 0) + 1;
      window.__lastResetTs = now;
      recomputeBonuses();
      this.recalculate(true);
      this.renderSkill();
      this.syncProfile();
      if (typeof updateTopBarUI === 'function') updateTopBarUI();
      if (typeof addFloatText === 'function' && player) addFloatText(player.x, player.y - 50, '🔄 已洗点 (返还 ' + refunded + ' 点)', '#ffd24a');
    },
    awardSkillPoints(n) {
      var p = this.myProfile; if (!p) return;
      p.skillPoints = (p.skillPoints || 0) + (n || 0);
      this.syncProfile();
      if (typeof updateTopBarUI === 'function') updateTopBarUI();
    },

    // ---------- 技能树：UI ----------
    renderSkill() {
      var prof = playerProfession;
      var defs = SKILL_TREE_DEFS[prof];
      var p = this.myProfile || { skillTree: {}, skillPoints: 0 };
      var owned = p.skillTree || {};
      var pts = p.skillPoints || 0;
      var self = this;
      var ptsEl = document.getElementById('skill-points'); if (ptsEl) ptsEl.textContent = '可用技能点: ' + pts;

      var resetBtn = document.getElementById('skill-reset-btn');
      if (resetBtn) {
        var hasSpent = Object.keys(owned).some(function (k) { return owned[k]; });
        var cost = Math.round(SKILL_TREE_BAL.resetBase * Math.pow((p.skillResets || 0) + 1, SKILL_TREE_BAL.resetExp));
        resetBtn.textContent = '重置技能树 (耗 ' + cost + ' 金)';
        resetBtn.disabled = !hasSpent || playerGold < cost;
        resetBtn.onclick = function () { self.resetTree(); };
      }

      var html = '<div class="st-cols">';
      defs.branches.forEach(function (br) {
        html += '<div class="st-col" style="border-top:3px solid ' + br.color + '">';
        html += '<div class="st-branch" style="color:' + br.color + '">' + br.name + '</div>';
        var nodes = Object.keys(defs.nodes).filter(function (k) { return defs.nodes[k].branch === br.id; })
          .sort(function (a, b) { return defs.nodes[a].tier - defs.nodes[b].tier; });
        nodes.forEach(function (nid) {
          var n = defs.nodes[nid];
          var lv = owned[nid] || 0;
          var st = self.nodeStatus(nid);
          var cost = n.costPerLevel[lv] || 0;
          var reqTxt = n.prereq.length ? '<div class="st-req">需 ' + n.prereq.map(function (r) { var rn = defs.nodes[r]; return rn ? rn.name : r; }).join('、') + ' ≥1</div>' : '';
          var lvTxt = (n.maxLevel > 1) ? '<div class="st-lv">' + lv + '/' + n.maxLevel + '</div>' : '';
          var costTxt = (st === 'maxed') ? '<div class="st-cost">已满级</div>' : '<div class="st-cost">升级耗 ' + cost + ' 点</div>';
          html += '<div class="st-node st-' + st + '" data-id="' + nid + '">'
            + '<div class="st-head"><span class="st-ico">' + n.icon + '</span><span class="st-name">' + n.name + '</span>' + lvTxt + '</div>'
            + '<div class="st-tier-tag">T' + n.tier + (n.type === 'active' ? ' · 终极' : (n.type === 'augment' ? ' · 增强' : '')) + '</div>'
            + '<div class="st-desc">' + n.desc + '</div>'
            + reqTxt + costTxt
            + '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
      html += '<div id="skill-detail" class="st-detail">点击任意节点查看详情并升级</div>';

      var c = document.getElementById('skill-tree-content');
      if (c) c.innerHTML = html;
      if (c) c.querySelectorAll('.st-node').forEach(function (el) {
        el.onclick = function () { self.openDetail(el.dataset.id); };
      });
    },

    openDetail(id) {
      var prof = playerProfession;
      var defs = SKILL_TREE_DEFS[prof];
      var node = defs && defs.nodes[id];
      if (!node) return;
      var p = this.myProfile || {};
      var owned = p.skillTree || {};
      var lv = owned[id] || 0;
      var self = this;
      var c = document.getElementById('skill-detail');
      if (!c) return;

      function effStr(lvFrom, lvTo) {
        return node.effects.map(function (ef) {
          var from = ef.perLevel * lvFrom, to = ef.perLevel * lvTo;
          var isMp = ef.stat === 'mpRegen';
          var name = STAT_NAME[ef.stat] || ef.stat;
          if (ef.stat === 'skillMult' && ef.skill) { var sk = (SKILL_DEFS[prof] || []).find(function (s) { return s.id === ef.skill; }); name = (sk ? sk.name : ef.skill) + ' 增伤'; }
          if (ef.stat === 'buffDur' && ef.skill) { var sk2 = (SKILL_DEFS[prof] || []).find(function (s) { return s.id === ef.skill; }); name = (sk2 ? sk2.name : ef.skill) + ' 时长'; }
          var unit = isMp ? '/s' : '%';
          var vFrom = isMp ? from : from * 100;
          var vTo = isMp ? to : to * 100;
          if (lvFrom === lvTo) return name + ' +' + Math.round(vTo) + unit;
          return name + ' ' + Math.round(vFrom) + unit + ' → +' + Math.round(vTo) + unit;
        }).join('，');
      }
      var cost = node.costPerLevel[lv] || 0;
      var canUp = this.canUpgrade(id);
      var brName = ((defs.branches.find(function (b) { return b.id === node.branch; }) || {}).name) || '';
      var html = '<div class="sd-head">' + node.icon + ' ' + node.name + ' <span class="sd-lv">' + lv + '/' + node.maxLevel + '</span></div>';
      html += '<div class="sd-sub">' + brName + ' · T' + node.tier + (node.type === 'active' ? ' · 主动终极' : (node.type === 'augment' ? ' · 技能增强' : ' · 被动')) + '</div>';
      html += '<div class="sd-desc">' + node.desc + '</div>';
      html += '<div class="sd-eff">当前效果: ' + (lv > 0 ? effStr(0, lv) : '未学习') + '</div>';
      if (lv < node.maxLevel) {
        html += '<div class="sd-next">下一级: ' + effStr(lv, lv + 1) + '</div>';
        html += '<div class="sd-cost">消耗 ' + cost + ' 技能点' + (node.reqLevel && playerLevel < node.reqLevel ? ' ｜ 需等级 Lv.' + node.reqLevel : '') + '</div>';
      } else { html += '<div class="sd-max">✦ 已满级</div>'; }
      html += '<div class="sd-btns">';
      if (lv < node.maxLevel) html += '<button class="sd-btn up" ' + (canUp ? '' : 'disabled') + ' data-act="up" data-id="' + id + '">' + (lv === 0 ? '学习' : '升级') + ' (' + cost + '点)</button>';
      if (lv > 0) html += '<button class="sd-btn reset" data-act="reset" data-id="' + id + '">重置此节点</button>';
      html += '</div>';
      c.innerHTML = html;
      c.querySelectorAll('.sd-btn').forEach(function (b) {
        b.onclick = function () { if (b.dataset.act === 'up') self.upgradeNode(b.dataset.id); else self.resetNode(b.dataset.id); };
      });
    },

    // ---------- 职业进阶 ----------
    openAdv() {
      this.renderAdv();
      var p = document.getElementById('adv-panel'); if (p) p.style.display = 'flex';
    },
    closeAdv() { var p = document.getElementById('adv-panel'); if (p) p.style.display = 'none'; },

    renderAdv() {
      var prof = playerProfession;
      var list = advList(prof);
      var cur = (this.myProfile && this.myProfile.advancement) || 0;
      var self = this;
      var html = '<div class="adv-cur">当前进阶: ' + (cur === 0 ? '未进阶' : list[cur - 1].name) + ' ｜ 等级 Lv.' + playerLevel + '</div>';
      list.forEach(function (a) {
        var state = a.tier <= cur ? 'done' : (a.tier === cur + 1 ? 'next' : 'lock');
        var canDo = state === 'next' && playerLevel >= a.reqLevel;
        var btn = state === 'done' ? '<span class="adv-tag">已达成</span>'
          : (canDo ? '<button class="adv-btn" data-tier="' + a.tier + '">进阶</button>'
            : '<span class="adv-tag">' + (playerLevel >= a.reqLevel ? '未解锁' : '需 Lv.' + a.reqLevel) + '</span>');
        html += '<div class="adv-card ' + state + '">'
          + '<div class="adv-name">第' + a.tier + '阶 · ' + a.name + '</div>'
          + '<div class="adv-desc">' + a.desc + '</div>'
          + '<div class="adv-bonus">奖励: ' + bonusText(a.bonus) + ' ｜ 技能点 +' + a.skillPoints + '</div>'
          + btn + '</div>';
      });
      var c = document.getElementById('adv-content'); if (c) c.innerHTML = html;
      if (c) c.querySelectorAll('.adv-btn').forEach(function (b) {
        b.onclick = function () { self.doAdvance(parseInt(b.dataset.tier, 10)); };
      });
    },

    doAdvance(tier) {
      var prof = playerProfession;
      var p = this.myProfile;
      var list = advList(prof);
      var cur = (p && p.advancement) || 0;
      var a = list[tier - 1];
      if (!a || tier !== cur + 1) return;
      if (playerLevel < a.reqLevel) { return; }
      p.advancement = tier;
      p.skillPoints = (p.skillPoints || 0) + a.skillPoints;
      recomputeBonuses();
      this.recalculate(true); // 进阶后回满
      this.renderAdv();
      this.syncProfile();
      if (typeof addFloatText === 'function' && player) addFloatText(player.x, player.y - 50, '🌟 进阶成功: ' + a.name, '#ffd700');
      if (typeof updateTopBarUI === 'function') updateTopBarUI();
    },

    // 重算玩家属性（应用 extraBonuses）
    recalculate(heal) {
      if (!playerProfession) return;
      var ratio = (player && player.maxHp) ? player.hp / player.maxHp : 1;
      playerStats = calcPlayerStats(playerProfession, playerLevel, Object.values(playerEquipment));
      if (player) {
        player.maxHp = playerStats.maxHp; player.maxMp = playerStats.maxMp;
        player.atk = playerStats.atk; player.def = playerStats.def;
        player.matk = playerStats.matk; player.mdef = playerStats.mdef;
        if (typeof CFG !== 'undefined' && CFG.PLAYER_SPEED)
          player.speed = Math.round(CFG.PLAYER_SPEED * (1 + (window.extraBonuses.spdPct || 0)));
        if (heal) { player.hp = player.maxHp; player.mp = player.maxMp; }
        else { player.hp = Math.min(player.maxHp, Math.round(player.maxHp * ratio)); player.mp = player.maxMp; }
      }
    },

    // 升级时调用：奖励技能点（基础 + 里程碑）并同步
    onLevelUp() {
      if (this.myProfile) {
        var g = SKILL_TREE_BAL.pointsPerLevel;
        if (playerLevel % 5 === 0) g += SKILL_TREE_BAL.milestone.every5;
        if (playerLevel % 10 === 0) g += SKILL_TREE_BAL.milestone.every10;
        this.myProfile.skillPoints = (this.myProfile.skillPoints || 0) + g;
      }
      this.syncProfile();
    },
  };

  function SKILL_TRES_get(prof) { return (SKILL_TREE_DEFS[prof] || { nodes: {} }).nodes ? Object.values(SKILL_TREE_DEFS[prof].nodes) : []; }
  function bonusText(b) {
    var map = { atk: '攻', matk: '魔攻', def: '防', mdef: '魔防', hp: '生命', mp: '法力', critRate: '暴击', critDmg: '暴伤', cdr: '冷却缩减', lifesteal: '吸血', armorPen: '穿甲', thorns: '反伤', dmgReduce: '减伤', luck: '幸运', skillRange: '技能范围' };
    var parts = [];
    for (var k in b) {
      var v = b[k];
      var pct = (k === 'critRate' || k === 'critDmg' || k === 'cdr' || k === 'lifesteal' || k === 'dmgReduce' || k === 'skillRange');
      parts.push((map[k] || k) + ' +' + (pct ? Math.round(v * 100) + '%' : v));
    }
    return parts.join(' / ');
  }

  window.Account = Account;

  // 属性中文名（详情面板用）
  var STAT_NAME = { atkPct: '攻击', matkPct: '魔攻', defPct: '防御', mdefPct: '魔防', hpPct: '生命', mpPct: '法力', spdPct: '移速', critRate: '暴击率', critDmg: '暴伤', lifesteal: '吸血', dmgReduce: '减伤', cdr: '冷却缩减', armorPen: '破甲', skillRange: '技能范围', mpRegen: '法力回复' };
  window.STAT_NAME = STAT_NAME;

  // 暴露给 index.html 主逻辑（终极技 / 增伤读取）
  window.SKILL_TREE_BAL = SKILL_TREE_BAL;
  window.SKILL_TREE_DEFS = SKILL_TREE_DEFS;
})();
