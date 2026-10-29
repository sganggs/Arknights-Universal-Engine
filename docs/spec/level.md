# 关卡内容

一个关卡的内容怎样从游戏数据整理出来。实现见 `packages/data/src/level.js`（提取）和 `packages/content/src/levels.js`（按难度组装）。

### 关卡-1 敌人数据

关卡用到的每种敌人（所有 SPAWN 动作的 `key`，经过关卡-2 的替换）取自敌人数据库（`enemy_database`）：

1. 先取级别 0 的数据；
2. 关卡的 `enemyDbRefs` 给这种敌人指定了级别时，用那个级别写明（`m_defined` 为 true）的字段覆盖；
3. 再用 `enemyDbRefs` 的 `overwrittenData` 写明的字段覆盖。天赋（`talentBlackboard`）按键覆盖：它列出的每个键替换敌人同名的那一项，敌人没有的键加在后面，没列出的照旧；技能（`skills`）给出时整列替换。

敌人的标签 `tags` 取 `enemyTags`（写明且不为空时），如 `machine`。

`useDb` 为 false 时不查数据库，只用 `overwrittenData`。读出的字段：名字、生命、攻击、防御、法术抗性、移动速度、攻击间隔、阻挡数消耗、重量、元素抗性、损伤抵抗、各项免疫、攻击半径、攻击方式、移动方式、地位级别（`levelType`）、到达目标点扣的生命（`lifePointReduce`，目标-1），以及中立单位的 `dead.value`（合作-9）。

- 来源：数据：enemy_database.enemies[].Value[].enemyData（每个字段带 `m_defined`）、level.enemyDbRefs[]（id、level、useDb、overwrittenData）；[PRTS「乌萨斯平民」oldid=436745](https://prts.wiki/index.php?title=%E4%B9%8C%E8%90%A8%E6%96%AF%E5%B9%B3%E6%B0%91&oldid=436745) 按「级别0」「级别1」分列敌人数值；覆盖的顺序为推断 INF-0066；关卡的天赋覆写按键合并：[PRTS「IG-TR-2 规则教学-阵地足球」oldid=430161](https://prts.wiki/index.php?oldid=430161) 关卡内剧情「玫兰莎攻击足球一次」之后才「玫兰莎推动足球」（这关只把 RMA70 刺球的 `physic.value` 覆写为 900，球照常滚动），[PRTS「田鼷大盗」oldid=436670](https://prts.wiki/index.php?title=%E7%94%B0%E9%BC%B7%E5%A4%A7%E7%9B%97&oldid=436670)「装置的类型和数量取决于关卡配置」（IG-S-3 只覆写它的 `DeathPassive` 两项），所有关卡的 671 处天赋覆写里 212 处只列出原有键的一部分，为推断 INF-0655

### 关卡-2 难度与符文

关卡按难度组装：普通（`NORMAL`）或突袭（`FOUR_STAR`）。关卡的符文（`runes`）在它的 `difficultyMask` 覆盖这个难度时生效（规则同波次-4）：

| 符文 | 效果 |
|---|---|
| `level_hidden_group_enable` | 启用隐藏组 `key`（波次-4） |
| `level_hidden_group_disable` | 停用隐藏组 `key`，即使另有符文启用它 |
| `global_lifepoint` | 生命上限改为 `value` |
| `enemy_attribute_mul` | 敌人的属性乘以倍率：`atk`、`def`、`max_hp`、`magic_resistance`、`move_speed`、`attack_speed`、`mass_level`；写了 `enemy` 时只对列出的敌人，写了 `enemy_exclude` 时不对列出的敌人（`\|` 分隔） |
| `level_enemy_replace` | 出怪时敌人 `key` 换成 `value` |
| `enemy_talent_blackb_mul` | 敌人天赋的数值乘以倍率：键为 `<天赋>.<字段>`，乘在关卡覆写之后的值上，多条连乘，敌人没有的字段不添加；写了 `enemy` 时只对列出的敌人，写了 `enemy_exclude` 时不对列出的敌人 |
| `cooperate_enemy_side_shared`，或 `env_gbuff_new_with_verify`（`key` 为 `cooperate_enemy_side_shared`） | 共同敌手（合作-2） |
| `cbuff_max_cost` | 费用上限改为 `max_cost`（`max_cost_ceil` 暂不使用） |
| `char_blockcnt_add` | 所有干员的阻挡数加 `value`，不低于 0 |
| `char_attribute_mul`、`char_respawntime_mul`、`char_skill_cd_mul`、`env_gbuff_new` | 作用于我方单位：作为每个座位的符文（符文-1…5），职业掩码取 `professionMask`（`ALL` 为全部十个职业）；其中引擎还不支持的同样拒绝组装 |

其他符文还不支持：提取时记下它们的名字（`unsupported`），有这些符文的难度拒绝组装。这个难度出场的敌人带着引擎还没有行为的能力（天赋或技能，敌能-5…）时，也拒绝组装，报出这些能力的名字；没有自己的行为但已由别处处理的天赋（中立单位的 `dead`、随掷弹生效的 `Light`、只对装置起作用的 `DmgUp`）不算。有行为、但行为需要的数值数据表里没有、也没有按敌人从 PRTS 补上的（如死亡爆炸的半径与延迟、远程攻击的倍率、弩箭的支数与蓄力、同时攻击的目标数、弹药数），这个敌人的这项能力同样算作还没有行为。

- 来源：[PRTS「FD-7 背离法则」oldid=364740](https://prts.wiki/index.php?title=FD-7%20%E8%83%8C%E7%A6%BB%E6%B3%95%E5%88%99&oldid=364740) 突袭「情报=敌方单位的生命值、攻击力和防御力都提升至120%」与「global_lifepoint: value: 1.0」「enemy_attribute_mul: atk: 1.2, def: 1.2, max_hp: 1.2」；[PRTS「CF-EX-1 山地的震颤」oldid=356910](https://prts.wiki/index.php?title=CF-EX-1%20%E5%B1%B1%E5%9C%B0%E7%9A%84%E9%9C%87%E9%A2%A4&oldid=356910) 突袭「情报=敌方单位的生命值和攻击力提升至120%」与「enemy_attribute_mul: atk: 1.2, max_hp: 1.2」；[PRTS「KR-1 玉门：沙丘狂欢」oldid=312721](https://prts.wiki/index.php?title=KR-1%20%E7%8E%89%E9%97%A8%EF%BC%9A%E6%B2%99%E4%B8%98%E7%8B%82%E6%AC%A2&oldid=312721) 突袭「level_enemy_replace: key: 0.0 (enemy_1039_breakr), value: 0.0 (enemy_1039_breakr_2)」；[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839) 阵地足球「主办方为所有干员提供了特别的支持加成」「所有球员的技力需求-20%（特级赛没有这个效果）」与 IG-FT-1 的 `char_skill_cd_mul` scale 0.8（特级赛 IG-S-4 没有这条符文）；[PRTS「IG-S-4 大力出奇迹」oldid=428766](https://prts.wiki/index.php?title=IG-S-4%20%E5%A4%A7%E5%8A%9B%E5%87%BA%E5%A5%87%E8%BF%B9&oldid=428766) 情报「所有敌方击球手针对足球的响应半径扩大至1.5倍」「所有敌方球员射门力度提升至1.2倍」「所有敌方单位苏醒所需时间缩短至60%」「[[战术队精英击球手]]的基础射门力度变为1.8」「[[爱球会荣誉击球手]]的射门力度降低至0.88倍」与这关的 `enemy_talent_blackb_mul`（`searchBall.range_radius` 1.5 带四名击球手的名单、`football.slapshot_force` 1.2、`Reborn.duration` 0.6、`football.slapshot_force` 0.88 带 enemy_4025_muhrym_2）和战术队精英击球手的关卡覆写 1.8；数据：level.runes；`level_hidden_group_disable`、倍率乘在基础值上、`enemy`/`enemy_exclude` 的含义为推断 INF-0067；`enemy_talent_blackb_mul` 的作用方式为推断 INF-0651

### 关卡-3 镜头视向量

关卡数据带镜头的视向量（`view`，三个数），即 ADR 0026 镜头模型里镜头相对关卡的位置。视向量取自按关卡路径（`levels/` 下去掉 `.json` 的相对路径）索引的视向量表中该关卡的第一个向量，并记下表的出处。没有给视向量表时关卡不带视向量，渲染用默认视向量。表里没有的关卡，可以指定另一个地图（`mapData`）完全相同的关卡，用它的视向量；两关的地图不同时拒绝，出处里记下借用的关卡路径。IG-S-4（act1multi_football_hard-01）借用 IG-FT-1 的。

- 来源：yuanyan3060/ArknightsGameResource 的 `map.json`（固定提交，见关卡数据的 `source.view`），act1multi_01 为 [0, −6.1, −9.76]；镜头模型见 [ADR 0026](../adr/0026-camera-model.md)；IG-S-4 借用 IG-FT-1 的视向量为推断 INF-0653

### 关卡-4 关卡代号与名称

关卡数据带关卡的代号（`code`）和名称（`name`），取自关卡表（`excel/stage_table.json`）里以关卡 id 为键的那一项的 `code` 和 `name`；没有这一项时，取第一个用这个关卡文件（`levelId` 以 `level_<关卡 id>` 结尾）的那一项（堡垒守御的关卡项的键与关卡 id 不同，IG-DF-1 与 IG-DF-4 共用一个关卡文件）。都没有时不带。界面在开始面板上显示它们（界面-21）。

- 来源：ArknightsGameData 的 `stage_table.json`（固定提交，见关卡数据的 `source`），act1multi_01 为 IG-1「逃离火线」；`act1multi_fortress-rm01`（IG-DF-1）与 `act1multi_fortress-ex-rm01`（IG-DF-4）的 levelId 都是 `level_act1multi_fortress_rm01`

### 关卡-5 阶段任务的说明

合作关卡的每个阶段（合作-6）带任务的说明（`task`）：标题（`title`）、最低目标的说明（`basic`），有进阶目标时还有进阶目标的说明（`advanced`）。它们取自活动表（`excel/activity_table.json`）里合作活动的关卡数据：关卡的任务列表按排序号排好后，依次给第一阶段的最低目标、第二阶段的最低目标、第二阶段的进阶目标……（每个阶段先最低、有进阶时再进阶）；用任务的标题和说明（`title`、`description`）。任务数与目标数不同时，阶段不带说明。界面在阶段开始的横幅上显示它们（界面-22）。

- 来源：ArknightsGameData 的 `activity_table.json`（固定提交），act1multi_01 的三个任务依次为「保护4位乌萨斯平民进入目标点」「保护3位乌萨斯平民进入目标点」「保护5位乌萨斯平民进入目标点」，与它两个阶段的目标 4、3（进阶 5）一一对应；act1multi_06 为存活 150、150（进阶 180）秒，同样对应

### 关卡-7 关卡自带的卡

关卡提取时一并记下关卡自带的卡（`cards`，只在关卡有的时候）：干员卡（`characterCards`）的干员 id 与练度（同 波次-7），装置卡（`tokenCards`）的 id、别名与张数，以及两种卡是否起初隐藏（隐藏的干员卡另记别名，没有别名时就是干员 id）：只有关卡里有动作会激活它的别名时才记为隐藏，没有动作激活的按不隐藏记（IG-TR-1 的克洛丝、末药、流星）。引擎不把它们编进卡组：用固定阵容的玩法（训练场）由平台按它们组成对局设定里的卡组（同步-9）。

- 来源：[PRTS「IG-TR-1 规则教学-常规项目」oldid=430163](https://prts.wiki/index.php?oldid=430163)「固定编队」（克洛丝、蛇屠箱、末药、流星的练度与技能）「我方装置」（赛场啦啦队，可部署数量 1）；数据：level.predefines.characterCards、tokenCards；[PRTS「IG-TR-2 规则教学-阵地足球」oldid=430161](https://prts.wiki/index.php?oldid=430161)「固定编队」（玫兰莎、米格鲁、芙兰卡、红云、蛇屠箱、砾，数据里六张都起初隐藏）；没有动作激活的不隐藏为推断 INF-0657

### 关卡-8 测试中的关卡

少数关卡在测试中：堡垒守御的 `act1multi_fortress_rm01`（IG-DF-1、IG-DF-4）和 `act1multi_fortress_hard-01`（IG-S-5），阵地足球的 `act1multi_football`（IG-FT-1、IG-FT-2），以及关卡文件自己写明在测试中的（`testing: true`，如 mod 新加的关卡、别的项目转来的场地）。它们的敌人有还没有行为的能力时（关卡-2）也照常加载：这些能力不起作用（缺数值的能力从敌人身上去掉），内容把它们记在关卡上（`uncovered`，按第一次出现的顺序），平台据此在房间和战斗里标明「部分敌人能力未实现」。其他关卡仍然拒绝加载。

- 来源：设计决定：先让堡垒守御的核心规则（守御-1…守御-6）能实际对局、按需补齐敌人能力；未实现的能力明确标出，不冒充原版；关卡文件自带的标记供 mod 和以 AUE 为内核的项目（Stronghold Protocol 的 aue 分支）使用

### 关卡-6 装置数据

关卡的预部署单位（波次-6）和关卡自带的装置卡（关卡-7）里，除了阶段控制（合作-6）之外的每一种装置，带一份记录（`devices`，按键）：名称；预部署时的练度（阶段、等级）下的属性——最大生命、攻击、防御、法术抗性、阻挡数、攻击间隔、攻击速度、嘲讽等级、重量等级，等级在该阶段第一个与最后一个关键帧之间时线性插值；部署费用（第一个关键帧的，数据有时；装置卡用它，守御-4）；各天赋在该阶段已解锁的最后一个候选的 blackboard，按顺序合并（装置的天赋是隐藏天赋），也按顺序各记一份（`talents`，设施的各级模式用它，守御-3）。同一种装置有几个实例时，按第一个实例的练度。

- 来源：ArknightsGameData 的 `character_table.json`（固定提交）：城防路障 trap_097_hstone 生命 5000、防御 300、法抗 20、阻挡数 20；山海密语仪 trap_096_gflag 生命 3500、防御 150、嘲讽等级 −1、隐藏天赋「在场时，强化所有敌军的攻击速度与移动速度」blackboard move_speed 1.15、attack_speed 25；关卡文件 level_act1multi_hard-02.json 的 predefines
