// ============================================================
//  主线任务引擎 (QuestEngine) — window.Quest
//  数据驱动：quest_defs.json；状态机 + 事件总线 + HUD 追踪栏
//  与 index.html 全局互通：playerLevel/playerGold/playerExp/
//  calcPlayerStats/saveGame/Account；存档复用 SAVE_KEY
// ============================================================
window.Quest = (function () {
  var defs = null;
  var arcs = {};        // arcId -> arc (含 chapters)
  var chapters = {};     // chapterId -> chapter (含 _arc)
  var ready = false;
  var _deferredActivate = null;
  var _dirty = false;

  // 状态：mainQuests[chapterId] = state; questObjectives[objId]={cur,target}; coreFragments; unlocks; ending
  var _state = {
    mainQuests: {},
    questObjectives: {},
    coreFragments: 0,
    unlocks: {},
    ending: null
  };

  // ---------- 加载与索引 ----------
  function init() {
    fetch('quest_defs.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { defs = d; index(); ready = true; if (_deferredActivate) { var f = _deferredActivate; _deferredActivate = null; f(); } })
      .catch(function (e) { console.error('[Quest] 加载 quest_defs.json 失败:', e); ready = false; });
  }

  function index() {
    arcs = {}; chapters = {};
    (defs.arcs || []).forEach(function (a) {
      arcs[a.id] = a;
      (a.chapters || []).forEach(function (c) { c._arc = a; chapters[c.id] = c; });
    });
  }

  function mapName(idx) {
    try { return (typeof MAP_DEFS !== 'undefined' && MAP_DEFS[idx]) ? MAP_DEFS[idx].name : null; }
    catch (e) { return null; }
  }

  // ---------- 状态机 ----------
  function arcCompleted(arcId) {
    var a = arcs[arcId]; if (!a) return false;
    return (a.chapters || []).every(function (c) { return _state.mainQuests[c.id] === 'completed'; });
  }

  function canStart(ch) {
    if (!ch || !ch._arc) return false;
    var lvl = (typeof playerLevel !== 'undefined') ? playerLevel : 1;
    if (lvl < (ch._arc.minLevel || 1)) return false;
    if (ch.prereqArc && !arcCompleted(ch.prereqArc)) return false;
    if (ch.prereqChapter && _state.mainQuests[ch.prereqChapter] !== 'completed') return false;
    return true;
  }

  function refreshStates() {
    Object.keys(chapters).forEach(function (cid) {
      var s = _state.mainQuests[cid];
      if (s === 'completed' || s === 'active') return; // 终态/进行中不回退
      _state.mainQuests[cid] = canStart(chapters[cid]) ? 'available' : 'locked';
    });
  }

  function ensureObjectives(ch) {
    (ch.objectives || []).forEach(function (o) {
      if (!_state.questObjectives[o.id]) {
        _state.questObjectives[o.id] = { cur: 0, target: o.amount || 1 };
      }
    });
  }

  function startChapter(ch) {
    if (_state.mainQuests[ch.id] !== 'available') return;
    _state.mainQuests[ch.id] = 'active';
    ensureObjectives(ch);
    // 满足当前地图的 reach/explore 目标（玩家已在场，无地图切换事件）
    if (typeof currentMapIndex !== 'undefined') onEnterMap(currentMapIndex);
    _dirty = true;
  }

  // ---------- 激活（进入游戏时调用） ----------
  function activate() {
    if (ready) _doActivate(); else _deferredActivate = _doActivate;
  }

  function _doActivate() {
    if (!ready) return;
    // 读取持久化任务状态
    try {
      if (typeof loadGame === 'function') {
        var save = loadGame();
        if (save && save.quest) {
          _state = Object.assign({ mainQuests: {}, questObjectives: {}, coreFragments: 0, unlocks: {}, ending: null }, save.quest);
        }
      }
    } catch (e) {}

    refreshStates();
    // 自动开启最早一个 available 章节
    var first = null;
    Object.keys(chapters).forEach(function (cid) {
      if (_state.mainQuests[cid] === 'available') {
        if (!first || (chapters[cid]._arc.order < chapters[first]._arc.order)) first = cid;
      }
    });
    if (first) startChapter(chapters[first]);

    // 满足当前地图的 reach/explore 目标（玩家已在场），并构建世界内容
    if (typeof currentMapIndex !== 'undefined') enterMap(currentMapIndex);
    _dirty = true;
    render();
  }

  // ---------- 奖励 ----------
  function grantExp(amt) {
    if (!amt || typeof playerExp === 'undefined') return;
    playerExp += amt;
    var leveled = false;
    while (playerExp >= playerExpToNext) {
      playerExp -= playerExpToNext;
      playerLevel++;
      playerExpToNext = Math.round(playerExpToNext * 1.2);
      leveled = true;
    }
    if (leveled && typeof player !== 'undefined' && player) {
      if (typeof calcPlayerStats === 'function') {
        playerStats = calcPlayerStats(playerProfession, playerLevel, Object.values(playerEquipment || {}));
        player.maxHp = playerStats.maxHp; player.hp = playerStats.maxHp;
        player.maxMp = playerStats.maxMp; player.mp = playerStats.mp;
      }
      if (typeof addFloatText === 'function') addFloatText(player.x, player.y - player.size - 20, '🎉 升级! Lv.' + playerLevel, '#ffd700');
      if (typeof Sound !== 'undefined') Sound.levelup();
      if (typeof Account !== 'undefined') Account.onLevelUp();
    }
  }

  function applyRewards(r) {
    if (!r) return;
    if (r.exp) grantExp(r.exp);
    if (r.gold && typeof playerGold !== 'undefined') playerGold += r.gold;
    if (r.skillPoints && typeof Account !== 'undefined' && Account.myProfile) {
      Account.myProfile.skillPoints = (Account.myProfile.skillPoints || 0) + r.skillPoints;
    }
  }

  function completeObjective(ch, o) {
    var st = _state.questObjectives[o.id];
    if (!st) { st = _state.questObjectives[o.id] = { cur: 0, target: o.amount || 1 }; }
    st.cur = st.target;
    applyRewards(o.rewards);
    _dirty = true;
  }

  function chapterAllDone(ch) {
    return (ch.objectives || []).every(function (o) { var st = _state.questObjectives[o.id]; return st && st.cur >= st.target; });
  }

  function checkChapterComplete(ch) {
    if (_state.mainQuests[ch.id] !== 'active') return;
    if (!chapterAllDone(ch)) return;
    _state.mainQuests[ch.id] = 'completed';

    // 章节完成奖励
    applyRewards(ch.rewards);
    if (ch.onCompleteFeedback && typeof addFloatText === 'function' && typeof player !== 'undefined' && player) {
      addFloatText(player.x, player.y - 40, '💬 ' + ch.onCompleteFeedback, '#ffe08a');
    }
    var oc = ch.onComplete || {};
    if ((ch.rewards && ch.rewards.coreFragment) || oc.addCoreFragment) {
      _state.coreFragments = (_state.coreFragments || 0) + 1;
      if (typeof Account !== 'undefined' && Account.myProfile) Account.myProfile.coreFragments = _state.coreFragments;
    }
    if (oc.unlockAdvancement) { _state.unlocks['advancement' + oc.unlockAdvancement] = true; }
    if (ch.rewards && ch.rewards.ending) { _state.ending = ch.rewards.ending; if (typeof addKillMsg === 'function') addKillMsg('🎊 你已无敌觉醒！'); }

    _dirty = true;
    if (typeof saveGame === 'function') saveGame();
    refreshStates();
    // 自动开启下一个 available 章节
    var next = null;
    Object.keys(chapters).forEach(function (cid) {
      if (_state.mainQuests[cid] === 'available') {
        if (!next || (chapters[cid]._arc.order < chapters[next]._arc.order)) next = cid;
      }
    });
    if (next) startChapter(chapters[next]);
  }

  // ---------- 事件总线 ----------
  function eachActive(fn) {
    Object.keys(chapters).forEach(function (cid) {
      if (_state.mainQuests[cid] === 'active') fn(chapters[cid]);
    });
  }

  function onKill(monsterId, isBoss) {
    if (!ready) return;
    eachActive(function (ch) {
      (ch.objectives || []).forEach(function (o) {
        if (_state.questObjectives[o.id].cur >= _state.questObjectives[o.id].target) return;
        if (o.type === 'kill' && o.target === monsterId) {
          _state.questObjectives[o.id].cur++;
          if (_state.questObjectives[o.id].cur >= _state.questObjectives[o.id].target) completeObjective(ch, o);
          _dirty = true;
        } else if (o.type === 'boss' && isBoss && o.target === monsterId) {
          completeObjective(ch, o);
        }
      });
      checkChapterComplete(ch);
    });
  }

  function onBossDown(bossId) { onKill(bossId, true); }

  function onEnterMap(idx) {
    if (!ready) return;
    var name = mapName(idx);
    if (!name) return;
    eachActive(function (ch) {
      (ch.objectives || []).forEach(function (o) {
        if (_state.questObjectives[o.id].cur >= _state.questObjectives[o.id].target) return;
        if ((o.type === 'reach' || o.type === 'explore') && o.target === name) {
          completeObjective(ch, o);
        }
      });
      checkChapterComplete(ch);
    });
  }

  function collect(itemId, amount) {
    if (!ready) return; amount = amount || 1;
    eachActive(function (ch) {
      (ch.objectives || []).forEach(function (o) {
        if (o.type !== 'collect' || o.target !== itemId) return;
        var st = _state.questObjectives[o.id];
        if (st.cur >= st.target) return;
        st.cur = Math.min(st.target, st.cur + amount);
        if (st.cur >= st.target) completeObjective(ch, o);
        _dirty = true;
      });
      checkChapterComplete(ch);
    });
  }

  function talk(npcId) {
    if (!ready) return;
    eachActive(function (ch) {
      (ch.objectives || []).forEach(function (o) {
        if (o.type !== 'talk' || o.target !== npcId) return;
        if (_state.questObjectives[o.id].cur >= _state.questObjectives[o.id].target) return;
        completeObjective(ch, o);
      });
      checkChapterComplete(ch);
    });
  }

  function talkCurrent() {
    if (!ready) return;
    var found = null;
    eachActive(function (ch) { if (!found && ch.npc) found = ch.npc; });
    if (found) talk(found);
  }

  // 返回当前激活章节中、以该 NPC 为对话对象的章节 id（取 order 最小者）
  function activeChapterIdForNpc(name) {
    var found = null;
    eachActive(function (ch) {
      if (ch.npc === name) {
        if (!found || (ch._arc.order < found._arc.order)) found = ch;
      }
    });
    return found ? found.id : null;
  }

  // 按当前激活章节选取 NPC 台词；无匹配则回落 default / 首条 / 旧 lines
  function linesForNpc(n) {
    if (n && n.beats && n.beats.length) {
      var cid = activeChapterIdForNpc(n.name);
      for (var i = 0; i < n.beats.length; i++) {
        if (n.beats[i].when === cid) return n.beats[i].lines;
      }
      for (var j = 0; j < n.beats.length; j++) {
        if (n.beats[j].when === 'default') return n.beats[j].lines;
      }
      return n.beats[0].lines;
    }
    return (n && n.lines) ? n.lines : ['……'];
  }

  // ---------- 世界内容（NPC + 可采集物，坐标基于 CFG.MAP_W/H 比例） ----------
  // 仅放置有 talk / collect 目标的 NPC 与道具；坐标为 0~1 的世界比例
  // beats: 按「当前激活章节」切换台词，实现剧情节点与转折；when 匹配 chapterId，'default' 兜底
  var WORLD_CONTENT = {
    0: { // 比奇城郊
      npcs: [
        {
          name: '遗迹导师·玄机子', x: 0.30, y: 0.35, color: '#7fe0ff',
          beats: [
            { when: 'arc0_ch1', lines: [
              '觉醒者，你自外界而来，身负「渊墟修炼系统」的印记——那是初代守渊人留下的封印之钥。',
              '渊墟曾由初代守渊人以四象核心封印，如今裂隙将开，异动已起，万物都在苏醒。',
              '先去击退几只史莱姆，体会拳锋落处的重量；再采些疗伤草药，学着想护住自己。',
              '拾取与战斗，是守渊人的第一课。不必急，印记会陪你慢慢长大。',
              '去吧，待你揩净第一滴汗，我们再谈「为什么」要守。'
            ]},
            { when: 'arc0_ch2', lines: [
              '你已初窥门径，可还不知这印记是什么。它并非恩赐，而是「守渊人」的烙印。',
              '千年之前，有人以四核封住裂隙，也把守护的债，写进了每一个觉醒者的骨血。',
              '比奇城郊的兽潮，只是裂隙异动的第一道涟漪——真正的浪，在远方的洞窟与火山。',
              '去找守村人阿蛮。他守着村，也守着通往真相的第一块路牌。',
              '记住：你不是被选中，你只是恰好，愿意伸手。'
            ]},
            { when: 'default', lines: [
              '修炼之路漫长，印记会指引你集齐四象核心，也会替你记住每一个抉择。',
              '若遇瓶颈，回来找我。石碑不语，却比谁都听得清。',
              '裂隙怕的从来不是力量，是「不肯改主意」的人。',
              '去罢，渊墟的晨光，配得上一个清醒的守渊人。'
            ]}
          ]
        },
        {
          name: '守村人·阿蛮', x: 0.68, y: 0.62, color: '#ffcf6b',
          beats: [
            { when: 'arc1_ch1', lines: [
              '兽潮要来了！哥布林正从林子边往村里涌，领头的就是哥布林王——那畜生比普通家伙高出一个头。',
              '帮我守村、把涌进来的杂碎打回去，这是你成为守渊人的第一道试炼，也是我的谢礼。',
              '别怕死，村口的锅里有热汤；真撑不住了，喊一声，玄机子那老头听得见。',
              '撑过去，我告诉你一件怪事：僵尸洞窟里的碑灵残魂，一直在等一个身上有印记的人。',
              '动手罢，孩子。风里有铁锈味，今天不是个能偷懒的日子。'
            ]},
            { when: 'arc1_ch2', lines: [
              '你做到了！比奇城郊今晚能睡个安稳觉，老胳膊老腿的我，替全村谢你。',
              '残魂托我传话：枯骨回廊的碑文里，藏着核心碎片②的下落——那是地之核。',
              '拿着这个守村信物，洞窟门口的封石认它，能少费你不少力气。',
              '往僵尸洞窟去吧，别让裂隙抢在你前头醒透。',
              '路上小心，阿蛮的狼烟，会一直替你望着身后。'
            ]},
            { when: 'default', lines: [
              '村子的安危，就托付给你了。我守着门，你守着更远的地方。',
              '若裂隙再动，我会燃起狼烟——你回头看见烟，就知道自己不是一个人。',
              '出门的人，记得回头看一眼。村口的灯，我每晚都留着。',
              '你比我以为的更结实，孩子。'
            ]}
          ]
        },
        {
          name: '醉望溪翁', x: 0.15, y: 0.60, color: '#9c8b6b',
          beats: [
            { when: 'default', lines: [
              '后生，你看这天色，像不像千年前封印那天的晚霞？',
              '我喝了一辈子酒，就为等一个肯坐下来，陪老头看一会儿云的人。',
              '守渊人换了一茬又一茬，只有这溪水，把每一句誓都听全了。',
              '你腕上那印记……亮得发烫的时候，记得回头看看来路，别成了下一个碑文。'
            ]}
          ]
        },
        {
          name: '小满', x: 0.52, y: 0.78, color: '#ffd1dc',
          beats: [
            { when: 'default', lines: [
              '大哥哥，你打跑怪兽了吗？',
              '阿蛮爷爷说，等你打完全部的怪兽，天空就不会再裂开了。',
              '我给你留了颗糖，等你回来吃喔。',
              '你要是累了，就蹲下来，小满给你唱首歌。'
            ]}
          ]
        }
      ],
      collectibles: [
        { id: '疗伤草药', x: 0.42, y: 0.22 },
        { id: '疗伤草药', x: 0.55, y: 0.48 },
        { id: '守村信物', x: 0.62, y: 0.28 }
      ]
    },
    1: { // 僵尸洞窟
      npcs: [
        {
          name: '碑灵·残魂', x: 0.35, y: 0.40, color: '#b9a0ff',
          beats: [
            { when: 'arc2_ch1', lines: [
              '回廊的枯骨在低语……它们骂的，是远古的诅咒，也是守渊人里那个先伸手的人。',
              '收集三块碑文残片，我方能从碎语里唤醒核心碎片②——地之核，埋在这片白骨之下。',
              '小心尸王。它曾是我们之一，是守渊人，后来……被裂隙记住了名字。',
              '走的时候轻些，这些骨头，都曾是谁的同袍。',
              '你听，风穿过肋骨的声音，像不像有人在后悔？'
            ]},
            { when: 'arc2_ch2', lines: [
              '你斩了尸王，却也听见它死前那句低语了吧？「四核归一，巨龙将醒」——别当它是哀嚎。',
              '那是封印的咒文，也是枷锁的钥匙。初代守渊人把它写进尸王的喉咙，是要你记住代价。',
              '地之核归你。可你该明白：每集一核，裂隙就多看你一眼，你也离「它」更近一分。',
              '集核者终将被注视，被诱，被问：你究竟是想封住裂隙，还是想成为它？',
              '拿着吧。这一核很沉，沉的不是重量，是千万年没人答上来的问题。',
              '去烈焰深处，火之核在等——也请你，别在火里忘了自己是谁。'
            ]},
            { when: 'default', lines: [
              '碑文仍在低语，我只是其中一缕残响，替死人把话传下去。',
              '继续前行，火之核在烈焰深处等你，冰之核在风雪那头。',
              '若哪天你听见自己的名字被碑文念出，别应答——那不是唤你，是诱你。',
              '走罢，活着的人，总比枯骨多一个选择。'
            ]}
          ]
        },
        {
          name: '无名遗骸', x: 0.60, y: 0.30, color: '#cfc4b0',
          beats: [
            { when: 'default', lines: [
              '（一具仍握着剑的枯骨。你蹲下，指节触到冰冷的甲片。）',
              '他死时仍握着剑，剑柄上刻着一个被磨平的姓。',
              '残魂说过，他是第一个走进回廊、却没走出来的守渊人。',
              '你轻轻把剑合进他怀里。枯骨发出极轻的「喀」，像是终于肯睡了。'
            ]}
          ]
        }
      ],
      collectibles: [
        { id: '碑文残片', x: 0.25, y: 0.25 },
        { id: '碑文残片', x: 0.50, y: 0.55 },
        { id: '碑文残片', x: 0.72, y: 0.70 }
      ]
    },
    2: { // 烈焰火山
      npcs: [
        {
          name: '炎心·炽', x: 0.40, y: 0.45, color: '#ff7a3c',
          beats: [
            { when: 'arc3_ch1', lines: [
              '熔狱之火能淬炼意志，也能焚尽软弱——你若怕烫，现在回头还来得及。',
              '兽人部族盘踞火山口，火焰魔君在其中沉眠，梦里还在守着它没守住的东西。',
              '击败它们，炎之核心③归你；但你要知道，魔君本也是守渊人，和我同列过。',
              '裂隙挑中的从来不是弱者，是心里有火、却还没学会收的人。',
              '上吧，让火山认认你这枚新烙印的成色。'
            ]},
            { when: 'arc3_ch2', lines: [
              '你斩了魔君……可曾看见它眼中最后那点清明？那不是恨，是「终于结束了」的释然。',
              '裂隙的腐化会吞噬守渊人，一寸寸地把人变成它想要的模样——包括你这枚刚烙上的印记。',
              '火之核已醒，它在你掌心发烫，也请你记住：烫的是核，不是你的本心。',
              '若有一天你照镜子认不出自己，回来找我，我替你掌这炉火。',
              '去霜原罢。那里的风冷，恰好能让你把今天的事，想清楚。',
              '别走成魔君的老路——它当初，也只是想护住什么。'
            ]},
            { when: 'default', lines: [
              '火不灭，心不冷。',
              '霜原的风，会考验你的誓约，也会替你吹凉发烫的念头。',
              '守渊人最难的不是打，是打完之后，还认得镜中的自己。',
              '走罢，火山记得每一个来过又离开的人。'
            ]}
          ]
        },
        {
          name: '烬', x: 0.62, y: 0.66, color: '#ff6a3a',
          beats: [
            { when: 'default', lines: [
              '我见过上一个集核者。他走到第四核，然后……不认识自己了。',
              '裂隙不杀人，它只是把人心里那点贪，慢慢养大。',
              '你怀里已经三核了吧？记着，热的是核，不是你。',
              '若有一天你照镜子认不出自己，来找我——我替你，把这身火浇灭。'
            ]}
          ]
        }
      ]
    },
    3: { // 冰封雪原
      npcs: [
        {
          name: '雪原长老·霜', x: 0.45, y: 0.40, color: '#9fe6ff',
          beats: [
            { when: 'arc4_ch1', lines: [
              '冰原的誓约，需用鲜血立下——不是别人的血，是你愿意为这片雪原流的那一口。',
              '冰狼群是裂隙探出来的爪牙，冰霜巨魔守着霜之核心④，也守着我对你的疑虑。',
              '击败它们，核心归你；但先立誓：集核只为守护，不为夺力，不为成神。',
              '风雪里站得住的人，才配谈封印。你站得住吗？',
              '立誓罢。风雪会替天地，记着你这句话。'
            ]},
            { when: 'arc4_ch2', lines: [
              '霜之核已入手，四核将齐——可你可知，龙裔先知·渊要这四核，究竟何用？',
              '重开裂隙，让渊墟重归混沌？还是永久封印，把我们都锁进安宁的牢？……我不敢全信他。',
              '立誓吧：纵是渊意欲重裂，你也肯挡在他身前。这是守渊人的底线，不是忠心。',
              '拿着霜之核。它冷，恰好压一压你怀里另三核的热。',
              '去深渊。终点亦是起点，我会在风雪里，等一个能回来的你。',
              '若渊骗了你……替我把这句话，钉进裂隙里。'
            ]},
            { when: 'default', lines: [
              '风雪会记得每一个守渊人的名字，也会刮走每一个背叛者的脚印。',
              '去深渊吧，终点亦是起点——有些人走到尽头，才发现开头就错了。',
              '我信你，胜过信渊。这话说出口，便收不回了。',
              '走好，雪原的蓝火，认得你眼里的光。'
            ]}
          ]
        },
        {
          name: '小霜灵', x: 0.26, y: 0.60, color: '#bff0ff',
          beats: [
            { when: 'default', lines: [
              '爷爷说，渊叔叔的眼睛，和冰宫里的蓝火，是一样的颜色。',
              '可蓝火是暖的，裂隙的蓝缝是冷的。你说，渊叔叔到底是哪一边？',
              '霜长老不让我靠近深渊，可我偷偷去看过——那里有好多好多人，在风里说话。',
              '你也要去深渊吗？替我问问那些声音，有没有人想回家。'
            ]}
          ]
        }
      ]
    },
    4: { // 魔龙深渊
      npcs: [
        {
          name: '龙裔先知·渊', x: 0.50, y: 0.42, color: '#ffd24a',
          beats: [
            { when: 'arc5_ch1', lines: [
              '四枚核心已集，深渊裂隙将开——你听，崖壁里的蓝缝，正在学呼吸。',
              '取那四枚英灵核心，与远古巨龙终战。它不只是怪物，是初代守渊人的化身，是「锁」本身。',
              '别怕。我与你同脉，我是初代守渊人的后裔，也是被裂隙选中、却始终没松手的囚徒。',
              '集核，从不是为了力量，是为了给这场千年的拉锯，一个了断。',
              '靠近些。深渊不吞肯低头的人，它只吞不肯回头的人。'
            ]},
            { when: 'arc5_ch2', lines: [
              '巨龙陨落。裂隙仍在喘息，像不甘心，也像终于松了口气。',
              '以你之印记为锁，永久封印裂隙——这不是夺力，是选择；选择把「守」这件事，扛成自己。',
              '你不是要赢，是要留下。留下，比赢更难，也更像一个人。',
              '「无敌觉醒」不是天下无敌，是再没什么能让你背离今日的决定。',
              '渊墟因你而安。而我，终于可以把初代的那句嘱托，交出去了。',
              '去罢，守渊人——不，渊墟本身。风会替你，把故事讲给下一缕印记听。'
            ]},
            { when: 'default', lines: [
              '我是初代守渊人的后裔，亦是被裂隙选中的囚徒——我们，都被同一件事困着。',
              '如今，轮到你了。锁在你手里，也在你心里。',
              '若你听见深渊在笑，别慌，那是在恭喜你：终于走到了谁都没走过的地方。',
              '我等的，从来不是英雄，是一个肯留下的人。'
            ]}
          ]
        },
        {
          name: '万魂回响', x: 0.70, y: 0.70, color: '#c9b6ff',
          beats: [
            { when: 'default', lines: [
              '（亿万道低语同时响起，像潮水漫过崖壁。）',
              '后来者，谢谢你肯钉上去——我们等这个「肯」字，等了千年。',
              '历代守渊人没说完的话，都在这儿了：别夺力，别成神，留下，就好。',
              '巨龙不是敌，是初代自己。你封住的也不是它，是它背了太久的愧。'
            ]}
          ]
        }
      ],
      collectibles: [
        { id: '英灵核心', x: 0.30, y: 0.30 },
        { id: '英灵核心', x: 0.55, y: 0.25 },
        { id: '英灵核心', x: 0.70, y: 0.55 },
        { id: '英灵核心', x: 0.40, y: 0.65 }
      ]
    }
  };

  var _collectibles = [];
  var _npcs = [];
  var _builtMap = -1;
  var _nearbyNpc = null;
  var _dialog = null;

  function qdist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function enterMap(idx) {
    buildWorld(idx);
    onEnterMap(idx);
  }

  function buildWorld(idx) {
    if (_builtMap === idx) return; // 同图不重置（保留已拾取）
    _builtMap = idx;
    var c = WORLD_CONTENT[idx] || {};
    var W = (typeof CFG !== 'undefined') ? CFG.MAP_W : 3000;
    var H = (typeof CFG !== 'undefined') ? CFG.MAP_H : 3000;
    _collectibles = (c.collectibles || []).map(function (it) {
      return { id: it.id, x: it.x * W, y: it.y * H, taken: false, bob: Math.random() * 6 };
    });
    _npcs = (c.npcs || []).map(function (n) {
      return { name: n.name, x: n.x * W, y: n.y * H, color: n.color, beats: n.beats, lines: n.lines, bob: Math.random() * 6 };
    });
  }

  function updateWorld(dt) {
    if (!ready || typeof player === 'undefined' || !player) return;
    var pr = player.size || 16;
    _collectibles.forEach(function (c) {
      if (c.taken) return;
      c.bob = (c.bob || 0) + dt * 3;
      if (qdist(player.x, player.y, c.x, c.y) < 22 + pr) {
        c.taken = true;
        collect(c.id, 1);
        if (typeof addFloatText === 'function') addFloatText(player.x, player.y - 30, '🍃 获得 ' + c.id, '#7f7');
      }
    });
    _collectibles = _collectibles.filter(function (c) { return !c.taken; });
    _nearbyNpc = null;
    _npcs.forEach(function (n) {
      n.bob = (n.bob || 0) + dt * 2;
      if (qdist(player.x, player.y, n.x, n.y) < 52 + pr) _nearbyNpc = n;
    });
    var hint = document.getElementById('npc-hint');
    if (hint) {
      if (_nearbyNpc && !_dialog) { hint.style.display = 'block'; hint.textContent = '按 F 与 ' + _nearbyNpc.name + ' 对话'; }
      else hint.style.display = 'none';
    }
  }

  function renderWorld(ctx, camX, camY) {
    if (!ready) return;
    _collectibles.forEach(function (c) {
      var sx = c.x - camX, sy = c.y - camY + Math.sin(c.bob || 0) * 3;
      var pulse = 0.5 + Math.sin(Date.now() / 180) * 0.3;
      var col = c.id === '英灵核心' ? '#ffd24a' : (c.id === '碑文残片' ? '#b9a0ff' : '#7fe07f');
      var icon = c.id === '英灵核心' ? '💎' : (c.id === '碑文残片' ? '🪨' : '🍃');
      ctx.save();
      ctx.strokeStyle = col; ctx.globalAlpha = pulse * 0.6; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, sx, sy);
      ctx.restore();
    });
    _npcs.forEach(function (n) {
      var sx = n.x - camX, sy = n.y - camY + Math.sin(n.bob || 0) * 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(sx, sy + 14, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.ellipse(sx, sy, 11, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe0c0';
      ctx.beginPath(); ctx.arc(sx, sy - 12, 8, 0, Math.PI * 2); ctx.fill();
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(n.name, sx, sy - 24); ctx.fillStyle = '#fff'; ctx.fillText(n.name, sx, sy - 24);
      ctx.restore();
    });
  }

  function interact() {
    if (!ready || typeof player === 'undefined' || !player) return;
    if (_dialog) {
      _dialog.idx++;
      if (_dialog.idx >= (_dialog.lines || []).length) closeDialog();
      else renderDialog();
      return;
    }
    if (!_nearbyNpc) {
      if (typeof addFloatText === 'function') addFloatText(player.x, player.y - 30, '附近没有可对话的人', '#aaa');
      return;
    }
    var n = _nearbyNpc;
    talk(n.name);
    _dialog = { name: n.name, lines: linesForNpc(n), idx: 0 };
    renderDialog();
  }

  function closeDialog() {
    _dialog = null;
    var el = document.getElementById('npc-dialog');
    if (el) el.style.display = 'none';
  }

  function renderDialog() {
    var el = document.getElementById('npc-dialog');
    if (!el || !_dialog) return;
    el.style.display = 'block';
    el.innerHTML = '<div class="npcd-name">' + escapeHtml(_dialog.name) + '</div>'
      + '<div class="npcd-line">' + escapeHtml(_dialog.lines[_dialog.idx] || '') + '</div>'
      + '<div class="npcd-foot">按 F 继续 / 关闭</div>';
  }

  // ---------- HUD 追踪栏 ----------
  function render() {
    var el = document.getElementById('quest-tracker');
    if (!el || !ready) return;
    var active = null;
    Object.keys(chapters).forEach(function (cid) {
      if (_state.mainQuests[cid] === 'active') {
        if (!active || chapters[cid]._arc.order < active._arc.order) active = chapters[cid];
      }
    });
    var html = '';
    if (active) {
      html += '<div class="qt-title">📜 主线 · ' + escapeHtml(active.name) + '</div>';
      if (active.flavor) html += '<div style="color:#cba;font-size:10px;margin:2px 0 4px;font-style:italic;">' + escapeHtml(active.flavor) + '</div>';
      if (active.npc) html += '<div class="qt-npc">NPC：' + escapeHtml(active.npc) + '</div>';
      html += '<div class="qt-objs">';
      (active.objectives || []).forEach(function (o) {
        var st = _state.questObjectives[o.id];
        var done = st && st.cur >= st.target;
        var prog = (o.type === 'talk' || o.type === 'reach' || o.type === 'explore' || o.type === 'boss' || o.type === 'escort')
          ? (done ? '完成' : '待办')
          : (st ? st.cur + '/' + st.target : '0/' + (o.amount || 1));
        html += '<div class="qt-obj ' + (done ? 'done' : '') + '">' + (done ? '✓ ' : '▸ ') + escapeHtml(o.desc) + ' <span class="qt-prog">' + prog + '</span></div>';
      });
      html += '</div>';
    } else {
      var ending = _state.ending ? '🎊 已通关：' + _state.ending : '✅ 当前无进行中主线';
      html += '<div class="qt-title">' + ending + '</div>';
    }
    html += '<div class="qt-frag">核心碎片：' + (_state.coreFragments || 0) + '/4</div>';
    el.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function tick() {
    if (ready && typeof player !== 'undefined' && player && _dirty) { render(); _dirty = false; }
  }

  function getState() {
    return JSON.parse(JSON.stringify(_state));
  }

  return {
    init: init,
    activate: activate,
    enterMap: enterMap,
    onKill: onKill,
    onBossDown: onBossDown,
    onEnterMap: onEnterMap,
    collect: collect,
    talk: talk,
    talkCurrent: talkCurrent,
    buildWorld: buildWorld,
    updateWorld: updateWorld,
    renderWorld: renderWorld,
    interact: interact,
    closeDialog: closeDialog,
    render: render,
    tick: tick,
    debugWorld: function () { return { collectibles: _collectibles, npcs: _npcs, builtMap: _builtMap, ready: ready }; },
    getState: getState,
    isReady: function () { return ready; }
  };
})();
