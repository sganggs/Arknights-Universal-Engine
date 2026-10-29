# 明日方舟通用引擎 · Arknights Universal Engine

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。本仓库不包含任何游戏素材；游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/ArknightsDevs/Arknights-Universal-Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/ArknightsDevs/Arknights-Universal-Engine/actions/workflows/ci.yml)
[![跨引擎一致](https://github.com/ArknightsDevs/Arknights-Universal-Engine/actions/workflows/simcheck.yml/badge.svg)](https://github.com/ArknightsDevs/Arknights-Universal-Engine/actions/workflows/simcheck.yml)

一个开源的《明日方舟》战斗引擎。同样的操作，在每一台机器上都会算出完全相同的战斗，所以适合用来做联机玩法。它在浏览器和 Node.js 上运行，战场是 three.js 绘制的真 3D 画面。

第一个用它做的作品是 [促融共竞 · Icebreaker-Games](https://github.com/ArknightsDevs/Icebreaker-Games)：两名玩家在局域网里实时合作的双人比赛，可以在那里下载开服。

## 引擎能做什么

- **战斗规则**：干员与敌人的属性、Buff 和异常状态，伤害计算，索敌与阻挡，敌人的寻路和行进路线，技能与元素损伤，全部 72 个职业分支的特性，召唤物，关卡装置和特殊地形，以及合作关卡的目标点、比赛阶段和复活规则。
- **联机**：帧同步，由服务器复算并裁决。支持断线重连、二倍速与暂停、等待队友进场。Node.js 与 Chromium、Firefox、WebKit 每一帧算出的结果都相同，每次提交都由 CI 检查。
- **画面**：真 3D 战场，自己实现的 Spine 3.8 动画，按关卡主题拼出的地图和场景装饰，攻击范围与部署预览，攻击和受击特效。画面开销由玩家在设置里自己选。
- **界面**：自带的界面引擎，能还原原版的战斗界面，也能还原整套活动界面：列表与滚动、输入框、动画、界面里的 3D 场景和粒子。
- **声音**：按游戏数据播放音效、关卡音乐和干员的战斗语音。
- **干员**：全部 461 名干员都能上场。72 名六星干员运行 [Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol) 的干员脚本，其余干员使用引擎通用的实现。

## 进度

当前版本是 **v0.1.4**。已经能完整运行常规项目的 IG-1 逃离火线、IG-10 匪帮集会、IG-14 创造与繁殖，特级的 IG-S-2 爬高上低，阵地足球（初级赛、高级赛、特级赛 IG-S-4 和它的规则教学），单人的阵地足球锦标 14 关，以及规则教学关卡；堡垒守御模式的防御与休整、设施和建造者也已经能玩，还在测试。数据 mod 和制作 mod 的命令行工具也已经可用。促融共竞用它发布了可玩的版本。

还在做的：

- 更多关卡和玩法模式需要的敌人能力与关卡装置；
- 没有专门脚本的干员里，大部分天赋已经按原版生效，少数需要专门机制的天赋（如魔力、积雪、倒地复活）和一部分技能还只有部分效果；
- 动画之间的过渡、攻击与动画的同步等画面细节；
- mod 自带素材，以及新增敌人和召唤物；
- 阵地足球锦标还缺智能裁判官和龙卷风的模型。

每一条机制实现到了什么程度，都写在 [docs/spec/](docs/spec/) 里。

## 设计原则

- **确定性**：每秒 30 帧，时间一律按整数帧计；所有玩家和服务器算出逐位相同的结果；随机数只来自对局的种子。
- **有出处**：每条机制都写成带编号的规范条款（[docs/spec/](docs/spec/)），注明依据——[PRTS](https://prts.wiki/) 的固定修订版本，或公开的游戏数据表。暂时找不到依据的，先登记为推断（[docs/registry/](docs/registry/)），以后再核实。每一条都有对应的测试。
- **原版的样子**：真 3D 画面，原版的镜头、遮挡关系和界面。
- **好维护**：文件、函数的长度和复杂度有上限，包之间的依赖关系有规定，都由 CI 检查；重要的决定记录在 [docs/adr/](docs/adr/)。

## 包

| 包 | 职责 |
|---|---|
| `@aue/math` | 精确运算、确定性的数学函数、官方的取整规则 |
| `@aue/sim` | 战斗内核 |
| `@aue/content` | 官方内容，以及兼容 Stronghold Protocol 干员脚本的接口 |
| `@aue/spine` | Spine 3.8 的读取、动画和网格（自己实现） |
| `@aue/data` | 游戏数据的处理流程和生成的数据 |
| `@aue/render` | three.js 战斗渲染 |
| `@aue/ui` | 界面引擎 |
| `@aue/net` | 帧同步 |
| `@aue/worker` | 后台线程入口 |
| `@aue/simcheck` | 跨浏览器一致性检查 |
| `@aue/sdk` | 给 mod 作者用的命令行 `aue`（新建、检查、试跑、打包）和 JSON Schema |
| `@aue/testkit` | 测试与对照工具（只在开发时用） |
| `@aue/lint` | 共享的 ESLint 规则 |

## 做 mod

数据 mod 用 JSON 改干员、关卡、敌人和召唤物的数值，或者加入新的干员和关卡；装在开服的主机上，玩家自动拿到同一份。写法和命令见 [docs/mods.md](docs/mods.md)：

```sh
pnpm aue mod new my-mod
pnpm aue mod check my-mod
```

## 在自己的项目里使用

引擎没有发布到 npm。把本仓库作为 git 子模块加进你的项目，指向一个发布标签，再用 pnpm 工作区安装需要的包（做法见 [ADR 0052](docs/adr/0052-engine-as-git-submodule.md)）。促融共竞就是这样使用引擎的。

引擎不附带游戏素材。画面和声音需要的素材由使用引擎的项目自己提供；没有素材时，战斗照常计算，只是不绘制、没有声音。

## 开发

需要 Node.js 22.12 或更新的版本，以及 pnpm（版本由 `package.json` 的 `packageManager` 固定；装了 corepack 会自动使用，没有时运行 `npx pnpm@11.28.0`）。

```sh
pnpm install
pnpm run ci        # lint、类型检查、测试与覆盖率、规范与登记表检查
pnpm test          # 只跑测试
```

`pnpm run ci` 的第一步会取得固定版本的 Stronghold Protocol（放在 `.cache/oracle/`），干员脚本的测试要用到它。

想报告问题或参与开发，请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 数据与致谢

- 游戏数据取自 [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) 的固定提交。
- 机制依据 [PRTS](https://prts.wiki/) 的页面，引用时注明修订版本。
- 72 名六星干员的脚本来自 [Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol)（GPL-3.0-or-later）。
- 感谢每一位提交问题和代码的贡献者。

## 许可

本项目自己编写的代码以 [GPL-3.0-or-later](LICENSE) 发布。游戏素材与数据不在其中，见 [NOTICE.md](NOTICE.md)。
