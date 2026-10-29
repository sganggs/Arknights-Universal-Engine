# 架构决定记录（ADR）

这里记录 Arknights Universal Engine（AUE）及其第一个平台 Icebreaker-Games / 促融共竞的架构决定。每条 ADR 写清背景、决定、理由、后果和被否决的备选方案，让后来的人知道为什么这样做，以及改动要付出什么代价。本项目是非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。

## 怎么新增或取代一条 ADR

1. 复制 [0000-template.md](0000-template.md)，用下一个编号命名：`NNNN-short-kebab-english-slug.md`。
2. 填写状态、日期、来源，以及背景、决定、理由、后果、备选方案。
3. 在下面的索引里加一行。
4. 要改一个已采纳的决定时，不要直接改它。新增一条 ADR，写明为什么改；把旧的状态改为「已取代（被 NNNN 取代）」，并在新条目里链接旧条目。两边都要有链接。
5. 状态只有：已提议、已采纳、已弃用、已取代。

## 索引

| 编号 | 标题 | 状态 | 领域 |
|---|---|---|---|
| [0001](0001-platform-positioning.md) | 定位：做成平台，官方内容优先，PC 优先 | 已采纳 | 定位与仓库 |
| [0002](0002-repository-split.md) | 仓库划分：引擎、平台、素材各自独立 | 已采纳 | 定位与仓库 |
| [0003](0003-licensing.md) | 许可：引擎 GPL，平台 AGPL，脚本 mod 须兼容 GPL | 已采纳 | 许可与命名 |
| [0004](0004-naming-and-disclaimer.md) | 命名与免责声明 | 已采纳 | 许可与命名 |
| [0005](0005-js-jsdoc-checkjs.md) | 语言：JS + JSDoc，tsc --checkJs strict | 已采纳 | 工程与包 |
| [0006](0006-pnpm-workspace-packages.md) | 工程结构：pnpm 工作区，按功能分包，固定 pnpm 版本 | 已采纳 | 工程与包 |
| [0007](0007-engine-consumed-by-git-tag.md) | 平台通过 git 标签 + 子目录引用引擎 | 已取代（见 0052） | 工程与包 |
| [0008](0008-module-boundaries.md) | 模块边界由 lint 的导入规则强制 | 已采纳 | 工程与包 |
| [0009](0009-worker-thread-architecture.md) | 模拟放在后台线程，主线程只负责画面 | 已采纳 | 工程与包 |
| [0010](0010-import-mapping-table.md) | 导入路径映射表是唯一事实来源 | 已采纳 | 工程与包 |
| [0011](0011-numerics-integer-frames.md) | 数值与时间：64 位浮点 + 精确运算，整数帧 | 已采纳 | 模拟内核 |
| [0012](0012-stronghold-compatible-core.md) | 新内核，兼容 Stronghold 的内容接口 | 已采纳 | 内容兼容 |
| [0013](0013-rewrite-order-official-semantics.md) | 机制模块全部自己重写，只实现官方语义 | 已采纳 | 模拟内核 |
| [0014](0014-attack-windup-by-animation.md) | 攻击前摇和动画时间：所有单位按动画出伤害 | 已采纳 | 模拟内核 |
| [0015](0015-multiplayer-in-core.md) | 多玩家能力放进内核，玩法规则放进插件 | 已采纳 | 模拟内核 |
| [0016](0016-arbitrary-operator-levels.md) | 任意练度在数据层计算 | 已采纳 | 内容兼容 |
| [0017](0017-data-pipeline-auto-update.md) | 数据流程：定时自动更新，可复现，握手比对数据哈希 | 已采纳 | 数据 |
| [0018](0018-asset-repository-and-hosting.md) | 素材：独立素材仓库，开服时下载固定版本并自己提供 | 已取代（见 0062） | 素材 |
| [0019](0019-operator-spine-source.md) | 干员战斗 Spine 来自 HX0922，固定提交 | 已采纳 | 素材 |
| [0020](0020-texture-format-webp.md) | 贴图格式：MVP 先用 WebP，实测后再决定 KTX2 | 已采纳 | 素材 |
| [0021](0021-battle-ui-restoration.md) | 界面：战斗界面按原版还原，战斗外界面自己设计 | 已取代（见 0063） | 素材 |
| [0022](0022-map-generation.md) | 地图按关卡数据生成 | 已采纳 | 素材 |
| [0023](0023-operator-effects-and-player.md) | 干员特效：MVP 做攻击、命中和常见状态，技能特效分批 | 已采纳 | 素材 |
| [0024](0024-audio-sources.md) | 音频：原版音效照用，缺的先空着，BGM 可替换 | 已取代（见 0061） | 素材 |
| [0025](0025-true-3d-three-js.md) | 渲染：原版样式的真 3D，战斗只用 three.js | 已采纳 | 渲染 |
| [0026](0026-camera-model.md) | 镜头：社区模型 + 每关镜头表 + 截图校验 | 已采纳 | 渲染 |
| [0027](0027-occlusion-draw-order.md) | 遮挡和绘制顺序：照原版 | 已采纳 | 渲染 |
| [0028](0028-own-spine-runtime.md) | Spine 3.8 运行时自己实现 | 已采纳 | Spine 运行时 |
| [0029](0029-deterministic-lockstep.md) | 确定性帧同步：服务器是时钟，逐帧封口，仲裁复算 | 已采纳 | 帧同步 |
| [0030](0030-input-delay-and-catchup.md) | 输入延迟固定 9 帧，落后时最多 5 倍速追赶 | 已采纳 | 帧同步 |
| [0031](0031-desync-recovery.md) | 断同步：每 30 帧比对哈希，以服务器为准，用快照恢复 | 已采纳 | 帧同步 |
| [0032](0032-command-table.md) | 指令表：哪些操作走帧同步 | 已采纳 | 帧同步 |
| [0033](0033-coop-rules-follow-prts.md) | 合作模式规则照 PRTS，没有数字的先推断并登记 | 已采纳 | 合作规则 |
| [0034](0034-activity-system.md) | 战斗外的活动系统：照做、改动、全部解锁 | 已采纳 | 平台功能 |
| [0035](0035-saves-and-accounts.md) | 存档本地优先，账号可选且认证可插拔 | 已采纳 | 平台功能 |
| [0036](0036-box-entry-and-import.md) | 干员 box：手动录入，可选导入两种格式，不接第三方账号 | 已采纳 | 平台功能 |
| [0037](0037-data-mods-first.md) | mod：先做数据 mod，官方内容注册为内置 mod | 已采纳 | mod |
| [0038](0038-script-mod-rewriting.md) | 脚本 mod：服务器在安装时改写导入路径 | 已取代（见 0058） | mod |
| [0039](0039-mod-assets.md) | mod 素材：允许的格式、哈希清单、大小上限、严格解析 | 已采纳 | mod |
| [0040](0040-spec-traceability.md) | 书面规范与条款追溯 | 已采纳 | 验证 |
| [0041](0041-stronghold-differential-testing.md) | 以固定版本的 Stronghold 做差分对照：行为等价 | 已取代（见 0058） | 验证 |
| [0042](0042-verification-suite.md) | 验证手段：穷举、随机、不变量、变换、覆盖率、整场随机 | 已采纳 | 验证 |
| [0043](0043-ci-gates-and-registry.md) | 三道 CI 关卡与已知差异登记表 | 已采纳 | 验证 |
| [0044](0044-maintainability-gates.md) | 可维护性规则作为 CI 硬门槛 | 已采纳 | 可维护性 |
| [0045](0045-unit-field-ownership-compat-isolation.md) | 单位字段归属表与兼容层隔离 | 已采纳 | 可维护性 |
| [0046](0046-versioned-interfaces.md) | 接口有版本，用契约测试检查 | 已采纳 | 可维护性 |
| [0047](0047-aue-canonical-source.md) | AUE 是共享代码的正本 | 已采纳 | 可维护性 |
| [0048](0048-rendering-tests.md) | 渲染测试：纯函数单测加截图回归 | 已采纳 | 可维护性 |
| [0049](0049-adr-process.md) | 决定记录为 ADR，改决定就新增一条 | 已采纳 | 可维护性 |
| [0050](0050-end-to-end-skeleton-first.md) | 起步后先做端到端骨架 | 已采纳 | 里程碑 |
| [0051](0051-mvp-scope-and-milestones.md) | MVP 范围与里程碑 | 已采纳 | 里程碑 |
| [0052](0052-engine-as-git-submodule.md) | 平台以 git 子模块引用引擎 | 已采纳 | 工程与包 |
| [0053](0053-interface-schemas.md) | 接口模式集中在 @aue/schema | 已采纳 | 可维护性 |
| [0054](0054-attributes-and-buffs-as-data.md) | 属性由 Buff 推导，Buff 是纯数据 | 已采纳 | 模拟内核 |
| [0055](0055-sdk-prepared-now-built-after-mvp.md) | SDK：现在只做准备，MVP 之后再做 | 已采纳 | 定位与仓库 |
| [0056](0056-testkit-parses-sources-with-espree.md) | testkit 用 espree 解析源码 | 已采纳 | 验证 |
| [0057](0057-hook-bus-and-timers.md) | 内核的钩子总线与定时器 | 已采纳 | 模拟内核 |
| [0058](0058-stronghold-kits-in-matches.md) | Stronghold 的 kit 作为固定版本的脚本 mod 进入对局 | 已采纳 | 模拟内核 |
| [0059](0059-player-chosen-performance.md) | 画面开销由玩家选择，不设统一预算 | 已采纳 | 渲染 |
| [0060](0060-frame-cost-memos.md) | 帧内反复求值的纯函数加备忘，按输入逐项核对 | 已采纳 | 模拟内核 |
| [0061](0061-voices-and-battle-music-source.md) | 战斗语音和缺的战斗曲来自 ArknightsAssets2，固定提交，进入 v0.1.0 | 已采纳 | 素材 |
| [0062](0062-release-bundles-with-assets.md) | 发布包附带素材和 kit | 已采纳 | 素材 |
| [0063](0063-coop-lobby-ui-restoration.md) | 促融共竞的战斗外界面也按原版还原 | 已采纳 | 素材 |
| [0064](0064-data-mod-loader-and-sdk.md) | 数据 mod 加载器和 SDK 第一版 | 已采纳 | 定位与仓库 |
| [0068](0068-enemy-facing-in-simulation.md) | 敌人的左右面向记在模拟里，渲染读它 | 已采纳 | 渲染 |
