# 波次与战斗结束

关卡的出怪和关卡事件按波次编排。实现见 `packages/sim/src/waves.js`。

### 波次-1 结构与动作

关卡的 `waves` 是若干**波次**，每个波次是若干**片段**（PRTS 称「兵团」），每个片段是若干**动作**（「小队」）。一个动作执行 `count` 次。

数据里的动作类型按下表处理：

| 数据 `actionType` | 引擎 | 做什么 |
|---|---|---|
| `SPAWN` | `SPAWN` | 出怪（出怪-1） |
| `ACTIVATE_PREDEFINED`、`TRIGGER_PREDEFINED` | `ACTIVATE` | 让隐藏的预部署单位生效（波次-6） |
| `WITHDRAW_PREDEFINED` | `WITHDRAW` | 让在场的预部署单位撤回（波次-6） |
| 其他（`PREVIEW_CURSOR`、`STORY`、`TUTORIAL`、`PLAY_BGM`、`DISPLAY_ENEMY_INFO`、`PLAY_OPERA`、`BATTLE_EVENTS`、`DIALOG`、`SHOW_ALL_HIDDEN_CARDS`、`EMPTY` 等） | `NONE` | 只用于表现，模拟里什么也不做，但照常占用时间 |

`isValid` 为 false 的动作不进入内容。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「扩展阅读：波次」：「所有的敌人被划分为许多"波次"（Wave），每个波次由许多"兵团"（Fragment）组成，兵团再细化成"小队"（Action）」，以及「小队动作指令」表（SPAWN 召唤；ACTIVATE_PREDEFINED「使预部署但隐藏的单位立刻部署」；TRIGGER_PREDEFINED「使预部署但隐藏的装置立刻部署」；WITHDRAW_PREDEFINED「使在场特定预部署单位立刻撤退」；EMPTY「不执行任何动作的占位符」）；数据：level.waves[].fragments[].actions[]；`isValid` 为 false 表示停用、表现类动作不影响模拟为推断 INF-0057

### 波次-2 时间

时间都按秒给出，用 时间-2 换算成帧；下面的「t 秒后」都指 t 秒换算成的帧数之后。

- **波次依次进行**：第一个波次在战斗开始时开始；每个波次结束（波次-3）后再过它的 `postDelay` 秒，下一个波次开始。
- **片段依次进行**：波次开始 `preDelay` 秒后，第一个片段开始的计时起步；每个片段在计时起步后再过它自己的 `preDelay` 秒开始。一个片段结束后，下一个片段的计时立即起步。
- **动作同时进行**：片段开始后，每个动作的第 i 次（从 0 数）在 `preDelay + i × interval` 秒后执行；同一帧到期的按动作在片段里的顺序、同一动作按次序执行。
- **片段结束**：它所有动作的最后一次都执行过时结束；不执行的动作（波次-4、波次-5）不占时间。

敌人记住它所在片段的开始帧（路线-1 的 `WAIT_CURRENT_FRAGMENT_TIME` 从这一帧起算）。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：小队「可通过参数每隔一段时间才开始行动」，「兵团是若干小队的集合，代表一定时间内的出兵」，「波次是若干兵团的集合，代表较长一段时间内的出兵」，路线指令 WAIT_CURRENT_FRAGMENT_TIME「当前兵团开始后时间达到一定值后执行下一步」；数据：preDelay、postDelay、interval、count；片段依次进行与各项延迟的起算点为推断 INF-0007

### 波次-3 波次的结束

一个波次的片段全部结束后，它在下面两件事之一发生时结束：

- 这个波次出的敌人（`dontBlockWave` 的动作出的除外）都已处理：被击倒，或走到终点离场；
- 波次的 `maxTimeWaitingForNextWave` 不小于 0，并且从片段全部结束起已经过了这么多秒。

最后一个波次结束（含它的 `postDelay`）后，所有波次完成。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「过早击杀关键节点的敌人（BOSS一阶段、剿灭节点敌人）导致下一波次提前来临」，敌人完成全部行动后「视为已处理」；数据：dontBlockWave、maxTimeWaitingForNextWave；具体条件为推断 INF-0058

### 波次-4 隐藏组

带 `hiddenGroup` 的动作只在这个组被启用时执行，否则跳过。启用的组由关卡的符文 `level_hidden_group_enable` 给出：它的 `key` 是组名，`difficultyMask` 决定在哪种难度下生效（`NORMAL` 普通、`FOUR_STAR` 突袭、`ALL` 都生效）。内容按选定的难度算好启用的组（`hiddenGroups`）。

- 来源：[PRTS「FD-7 背离法则」oldid=364740](https://prts.wiki/index.php?title=FD-7%20%E8%83%8C%E7%A6%BB%E6%B3%95%E5%88%99&oldid=364740)（普通「level_hidden_group_enable: key: 0.0 (normal)」，突袭「(raid)」，「关卡难度=FOUR_STAR」）；[PRTS「CF-EX-1 山地的震颤」oldid=356910](https://prts.wiki/index.php?title=CF-EX-1%20%E5%B1%B1%E5%9C%B0%E7%9A%84%E9%9C%87%E9%A2%A4&oldid=356910)（「普通难度 level_hidden_group_enable: key: 0.0 (g1)」，突袭「(g2)」）；数据：level.runes；`ALL` 的含义为推断 INF-0059

### 波次-5 随机组

有些动作是几选一的：

- 带 `randomSpawnGroupKey`（组）的动作是一个候选，它的 `randomSpawnGroupPackKey`（包）是这个候选带的一包动作；没有组、但包名是某个候选的包的动作，是这一包的成员。
- 每个波次开始时，按组在波次里第一次出现的顺序，每个组从它的全部候选里按权重（`weight`）随机选一个（随机-2），不看候选的隐藏组。
- 选中的候选和它那一包的成员执行，其余候选和成员跳过；执行的动作仍各按自己的隐藏组决定（波次-4），所以选中的候选被隐藏组跳过时，它那一包里隐藏组启用的成员照常执行。没有组、包名也不属于任何候选的动作照常执行。

- 来源：[PRTS「随机数」oldid=422383](https://prts.wiki/index.php?title=%E9%9A%8F%E6%9C%BA%E6%95%B0&oldid=422383) 举例「敌人从随机兔子洞出口钻出」属于权重随机；[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「即使是同一项目，敌人的配置也会出现随机性」；数据：randomSpawnGroupKey、randomSpawnGroupPackKey、weight；组与包的含义、在波次开始时抽取为推断 INF-0060

### 波次-6 预部署单位

关卡的预部署单位（`predefines`）各有别名（`alias`），数据给出时还有所在格（`row`、`col`）和朝向（`dir`）。不隐藏的从战斗开始就生效；隐藏的在 `ACTIVATE` 动作执行时生效，`WITHDRAW` 动作执行时撤回。生效和撤回各产生表现事件 `predefine`（事件第 8 版，`key` 为别名，`on` 为 1 或 0）。已经生效的再生效、没有生效的撤回，什么也不做。预部署单位在场上做什么由它的种类决定（如合作的阶段控制）；内容还没有给出的种类只记录生效状态。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935) 小队动作指令表（见波次-1）；数据：level.predefines（characterInsts、tokenInsts 的 alias、hidden）

### 波次-7 预置干员

关卡的预部署单位里，给出了所在格、没有别名或本身是干员（id 以 `char_` 开头）的角色实例是预置干员（训练场里协作者的干员）：别名是它的别名，没有时就是它的干员 id；数据还给出它的练度（精英化阶段、等级、潜能、技能与技能等级；信赖 100，推断 INF-0201）。它生效时（波次-6），如果不在场上，就作为最后一个座位（两人对局里是协作者）的干员部署在给定的格子、朝向上：不花费用，不在任何卡组里，不占可部署人数，部署的效果同干员（部署-2）。它被撤下以后（比如中场休整时所有干员撤退，合作-8），下一次生效会再次部署；已经在场上时再生效什么也不做。`WITHDRAW` 动作撤回它时（波次-6），在场上的它撤退（撤退-1）。

- 来源：[PRTS「IG-TR-1 规则教学-常规项目」oldid=430163](https://prts.wiki/index.php?oldid=430163)「已部署干员」（米格鲁、阿米娅、芙蓉、空爆的练度与技能，「本关卡已部署干员信赖值都为100%」）与关卡内剧情「阿米娅部署米格鲁」「阿米娅，空爆，芙蓉，米格鲁依次部署」；数据：level.predefines.characterInsts（position、direction、hidden、skillIndex、mainSkillLvl、inst）；属于最后一个座位、不占可部署人数为推断 INF-0201；带别名的干员实例：[PRTS「IG-TR-2 规则教学-阵地足球」oldid=430161](https://prts.wiki/index.php?oldid=430161)「已部署干员」与关卡内剧情「玫兰莎，红云部署推动足球；缠丸部署」（数据里第二次部署的玫兰莎、红云是 `char_208_melan#2`、`char_190_clour#2`）

### 波次-8 剧情

`STORY` 动作执行时产生表现事件 `story`（事件第 10 版，`key` 为剧情的路径，如 `Activities/MultiV3/Training/training_multi_v3_01-01_a`）。剧情不改变战斗；由页面按剧情的内容显示（例如训练场的教学），它要暂停战斗时经暂停控制（同步-8、同步-14）。

- 来源：数据：level_act1multi_tr01 的波次动作 `actionType: STORY`；[PRTS「IG-TR-1 规则教学-常规项目」oldid=430163](https://prts.wiki/index.php?oldid=430163)「关卡内剧情」

### 波次-9 起初隐藏的关卡卡

关卡自带的装置卡或干员卡起初隐藏时（关卡-7），卡组里这种装置或这名干员的卡（平台按它编进卡组的，例如专项带来的装置卡，符文-6；训练场的固定编队）在它的别名生效（`ACTIVATE`，波次-6）之前不显示、不能部署；生效之后照常。

- 来源：数据：level_act1multi_tr01 的 `tokenCards`（`trap_201_muulco`，`hidden: true`）与第三波的 `ACTIVATE trap_201_muulco`（紧接着的剧情 training_multi_v3_01-01_g 才教部署它）；level_act1multi_tr02 的六张干员卡（`hidden: true`，别名如 `char_208_melan#3`）与第三波的 `ACTIVATE char_208_melan#3` 等，[PRTS「IG-TR-2 规则教学-阵地足球」oldid=430161](https://prts.wiki/index.php?oldid=430161) 关卡内剧情最后一句「固定编队干员进入待部署区」

### 结束-1 战斗结束

- **胜利**：有比赛阶段的关卡（合作-6），最后一个阶段结算通过；其他关卡，关卡有波次，并且所有波次已完成（波次-3）。
- **失败**：所有玩家同时失守（合作-4）。单人时就是生命降到 0。
- 先判失败。结束时产生表现事件 `end`（事件第 8 版，`result` 为 1 胜利、0 失败），世界记下结果（`result`，进行中为 −1），之后不再判定。模拟本身不停止，由帧同步的服务器停止封口。

- 来源：[PRTS「新人入门」oldid=439650](https://prts.wiki/index.php?title=%E6%96%B0%E4%BA%BA%E5%85%A5%E9%97%A8&oldid=439650)「目标生命值降至0，则行动失败」「歼灭关卡内所有目标敌人且未损失目标生命值即获得3星评价」；[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「双方玩家将被立即扣除所有生命值，比赛将提前结束」；双方同时失守即失败为推断 INF-0061
