# 传奇 H5 ARPG

一个纯前端 HTML5 + Canvas 2D 像素风 ARPG，浏览器直接运行，可部署到微信小游戏；规则数据由配置文件驱动，标配轻量 Node 后端做账号与存档持久化。

![stack](https://img.shields.io/badge/stack-H5%20%2B%20Canvas%202D-blue)
![config](https://img.shields.io/badge/rules-config--driven-orange)
![license](https://img.shields.io/badge/license-MIT-green)

## 在线体验

**方式一 · 纯静态（快速试玩，离线模式可跳过登录）**

```bash
cd h5-game
python -m http.server 8099
```

然后访问 http://localhost:8099 —— 在登录层点「跳过，离线游玩」即可进入。

**方式二 · 带后端（账号 / 云存档 / 规则热更新）**

```bash
cd h5-game/server
npm start            # 默认端口 3000；可用 PORT=3100 node start.js 覆盖
```

然后访问 http://localhost:3000 。后端提供账号注册登录、SQLite 存档，以及 `/api/equip-rules` 等路由，支持不重启即热更新掉落规则。

## 核心玩法

- **三职业**：战士 / 法师 / 道士，含技能树、转职、流派（archetype）、属性加点
- **装备词条与品质规则系统（数据驱动）**：`equip-rules.json` 配置 47 条词条 / 6 档品质；`equip-rules.js` 规则引擎负责随机生成、三层稀有度（基础/稀有/传奇）、品质→词条层概率联动、评分算法、品质动态评定（生成只升不降、替换允许降级）、词条锁定/替换、升阶（材料×档序 + 成功率 clamp）；全量校验 + 环形日志 + 热更新
- **装备系统**：12 槽位、6 品质、词缀、强化 +0~+15、耐久与修理、镶嵌/附魔
- **词缀联动**：暴击猛攻 / 狂怒连击 / 死神降临 等质变
- **套装协同**：多套 × 2pc/4pc 增益
- **战斗深化**：连击、终结技、元素反应、弱点/破防、打断读条、On-Hit Procs、部位破坏、可破坏物
- **经济系统**：金币 / 绑金 / 代币 / 灵玉 四层货币 + 修理/传送/复活费，含通胀监控
- **任务系统**：主线 / 每日 / 周常 / 成就
- **地图与 Boss**：5 张主题地图（比奇城郊→僵尸洞窟→烈焰火山→冰封雪原→魔龙深渊）+ 多阶段 Boss
- **地图自由导航**：顶部 `#map-nav` 控件 `◀ 上一图 / 下一图 ▶`，与出口传送阵同视觉同交互；下一图保留等级门槛、上一图无门槛，均收取对称传送费
- **难度选择**：休闲 / 普通 / 困难 / 噩梦 四档乘子
- **音频系统**：WebAudio 程序化合成零外部资源音效（命中/受击/技能/击杀/升级/掉落分档/Boss出现/死亡/点击）+ 🔊/🔇 静音持久化
- **账号与持久化**：后端 SQLite 账号 + 客户端 localStorage 双写；等级/经验/金币/装备/背包/地图进度自动恢复
- **进阶系统**：转生、公会、排行榜、坐骑、拍卖行（基础框架）
- **便捷操作**：自动拾取 / 自动战斗 / 自动技能

## 技术栈

- 原生 HTML5 + Canvas 2D，无外部游戏引擎
- 客户端以单文件 `index.html` 为入口，游戏逻辑按职责拆分为 30+ 模块化 `.js` 文件，规则数据由 `equip-rules.json` 配置驱动（改配置即调规则，零代码改动）
- 轻量 Node 后端（零依赖 HTTP + `node:sqlite`，带 JSON 回退）：账号、存档、规则路由
- 自写测试框架：`test_*.js`（22 套，约 500+ 项断言）
- 本地存档：`localStorage`（离线模式）

## 项目结构

```
h5-game/
├── index.html              # 客户端入口（单文件，Canvas 2D 渲染 + UI + 调试钩子 __game）
├── equip-rules.json        # 装备词条/品质规则配置（数据驱动，v2 / 47 词条 / 6 品质）
├── equip-rules.js          # 规则引擎（UMD：生成/评分/动态评定/升阶/校验/热更新 reloadRules）
├── server/                 # Node 后端（零依赖 HTTP + SQLite 持久化）
│   ├── index.js            # 静态托管 + /api/* 路由（/api/equip-rules、/api/save 等）
│   ├── db.js               # SQLite 封装（带 JSON 回退）
│   ├── auth.js / mail.js   # 账号 / 邮件
│   ├── start.js            # 启动入口
│   └── package.json
├── 核心玩法模块/
│   ├── account.js          # 账号、技能树、转职
│   ├── archetype.js        # 流派
│   ├── attributes.js       # 属性分配/加点
│   ├── combat.js           # 战斗深化（连击/破防/元素/打断）
│   ├── core_system.js      # 核心系统（等级/经验/属性结算）
│   ├── body_part.js        # 部位破坏
│   └── destructible.js     # 可破坏物
├── 装备 / 经济模块/
│   ├── economy.js          # 经济公式（掉落/强化/修理/通胀）
│   ├── gameEconomy.js      # 经济桥接
│   ├── sets.js             # 套装协同
│   ├── affix_synergy.js    # 词缀联动 / On-Hit Procs
│   ├── npcshop.js          # NPC 商店 / 重铸洗练
│   ├── refine.js           # 强化
│   ├── gem_enchant.js      # 镶嵌 / 附魔
│   ├── reincarnation.js    # 转生
│   └── questboard.js       # 每日 / 周常 / 成就
├── 世界 / 社交模块/
│   ├── env.js              # 环境互动（炸药桶/熔岩/冰柱）
│   ├── quest.js            # 主线任务引擎
│   ├── quest_defs.json     # 主线任务定义
│   ├── guild.js            # 公会
│   ├── rank.js             # 排行榜
│   ├── mount.js            # 坐骑
│   └── ah.js               # 拍卖行（基础框架）
├── test_*.js               # 各模块测试（22 套，约 500+ 项断言）
├── GDD.md                  # 游戏设计文档（活文档，当前 v1.5）
├── 设计合规审计报告.md      # GDD 实现覆盖率审计
└── overview.md             # 最新交付概览
```

## 运行测试

每个模块配套独立的 Node 测试，零依赖，可直接运行：

```bash
node test_economy.js
node test_gameEconomy.js
node test_questboard.js
node test_combat.js
node test_npcshop.js
node test_sets.js
node test_env.js
node test_affix_synergy.js
node test_equip_rules.js      # 装备词条/品质规则引擎（24 项：生成/评分/评定/升阶/边界）
node test_refine.js
node test_gem_enchant.js
node test_reincarnation.js
node test_guild.js
node test_rank.js
node test_mount.js
node test_archetype.js
node test_attributes.js
node test_body_part.js
node test_destructible.js
node test_core_system.js
node test_ah.js
# 或一次性跑全部：
for f in test_*.js; do echo "== $f =="; node "$f"; done
```

## 部署到微信小游戏

当前为纯 Canvas 程序化绘制，无外部图片资源，对微信小游戏转制友好。推荐直接作为小游戏项目运行，或嵌入 web-view。

## 当前覆盖率

四份 GDD 实现覆盖率审计（详见 [设计合规审计报告.md](./设计合规审计报告.md)）。GDD 已迭代至 **v1.5** 活文档，更多系统已落地（装备词条/品质规则引擎、音效、5 图多阶段 Boss、打击感演出、经济闭环、套装与词缀联动、NPC 重铸、周常成就、战斗深化、环境危害、四档难度、自动化、地图自由导航等）。拍卖行 UI、公会/排行榜/转生独立界面、镶嵌附魔独立 UI、传承等为前瞻设计，按 GDD 落地即形成完整闭环。

## 开源协议

MIT License
