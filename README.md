# 传奇 H5 ARPG

一个单文件 HTML5  Canvas 2D 像素风 ARPG，浏览器直接运行，可部署到微信小游戏。

![tech](https://img.shields.io/badge/stack-H5%20%2B%20Canvas%202D-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## 在线体验

直接打开仓库里的 `index.html` 即可游玩（推荐用本地静态服务器）。

```bash
cd h5-game
python -m http.server 8099
```

然后访问 http://localhost:8099

## 核心玩法

- **三职业**：战士 / 法师 / 道士
- **装备系统**：12 槽位、6 品质、词缀、强化 +0~+15、耐久与修理
- **词缀联动**：暴击猛攻 / 狂怒连击 / 死神降临 三系质变
- **套装协同**：6 套 × 2pc/4pc 增益
- **战斗深化**：连击、终结技、元素反应、弱点/破防、打断读条、On-Hit Procs
- **经济系统**：金币 / 绑金 / 代币 / 灵玉 四层货币 + 修理/传送/复活费
- **任务系统**：主线 / 每日 / 周常 / 成就
- **地图与 Boss**：5 张主题地图 + 多阶段 Boss
- **难度选择**：休闲 / 普通 / 困难 / 噩梦 四档乘子

## 技术栈

- 原生 HTML5 + Canvas 2D，无外部引擎
- 单文件 `index.html` 包含所有游戏逻辑
- 模块化 JS 文件：`economy.js`、`gameEconomy.js`、`questboard.js`、`combat.js`、`sets.js`、`env.js`、`affix_synergy.js`、`npcshop.js`、`account.js`、`quest.js`
- 自写测试框架：`test_*.js`（8 套测试，约 400 项）
- 本地存档：`localStorage`

## 项目结构

```
h5-game/
├── index.html              # 主游戏（单文件入口）
├── account.js              # 账号、技能树、转职
├── economy.js              # 经济公式（掉落、强化、修理、通胀等）
├── gameEconomy.js          # 经济桥接
├── questboard.js           # 每日/周常/成就/奖励公式
├── combat.js               # 战斗深化（连击、破防、元素、打断）
├── sets.js                 # 套装协同
├── env.js                  # 环境互动（炸药桶/熔岩/冰柱）
├── affix_synergy.js        # 词缀联动 / On-Hit Procs
├── npcshop.js              # NPC 商店 / 重铸
├── quest.js                # 主线任务引擎
├── quest_defs.json         # 主线任务定义
├── test_*.js               # 各模块测试
├── 设计合规审计报告.md      # 四份 GDD 实现覆盖率审计
└── overview.md             # 最新交付概览
```

## 运行测试

```bash
node test_economy.js
node test_gameEconomy.js
node test_questboard.js
node test_combat.js
node test_npcshop.js
node test_sets.js
node test_env.js
node test_affix_synergy.js
```

## 部署到微信小游戏

当前为纯 Canvas 程序化绘制，无外部图片资源，对微信小游戏转制友好。推荐直接作为小游戏项目运行，或嵌入 web-view。

## 当前覆盖率

四份 GDD 实现覆盖率审计：

- 游戏机制与系统设计：≈ 68%
- 游戏经济系统设计：≈ 55%
- 任务与奖励机制系统：≈ 91%
- 战斗系统深化设计：≈ 72%
- **合计：≈ 71%**

详见 [设计合规审计报告.md](./设计合规审计报告.md)。

## 开源协议

MIT License
