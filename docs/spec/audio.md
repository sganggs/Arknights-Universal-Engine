# 音频

战斗的音效、音乐和干员语音按原版的数据播放（ADR 0024、0061）：素材里有的照原版用，没有的不播，不拿别的声音顶替。

### 音频-1 音效库

- 素材带一份音频索引：音效库（库名 → 几个音效，各有文件、权重、延迟秒数、音高范围、音量范围；同时播放的上限、满了时是否挤掉最早的一个、是否循环）和音乐库（前奏、循环、音量、交叉淡化秒数）。库名和这些数值取自游戏数据 `audio_data.json` 的 `soundFXBanks`、`bgmBanks`。
- 播一个音效库：按权重随机选一个音效（权重都为 0 时等概率），音高和音量各在范围内均匀随机，延迟之后开始。这个库同时在播的个数已到上限时，挤掉最早的一个（`popOldest`），否则这次不播。上限为 0 表示不限。
- 素材里没有的库不播。
- 这里的随机数是页面自己的，不进模拟，各座位可以不同。
- 音效和音乐的总音量由玩家设定（页面的画面设置）。

- 来源：数据：audio_data.json `soundFXBanks[]`（name、sounds[].asset、weight、delay、minPitch、maxPitch、minVolume、maxVolume、maxSoundAllowed、popOldest、loop）、`bgmBanks[]`（name、intro、loop、volume、crossfade）；设计决定：[ADR 0024](../adr/0024-audio-sources.md)；权重为 0 时等概率、上限时不挤就不播、上限为 0 表示不限为推断 INF-0168

### 音频-2 战斗事件的音效

每帧的表现事件对应的音效库如下，按顺序取素材里有的第一个：

| 事件 | 音效库 |
|---|---|
| 干员部署（`deploy`） | `battle.ON_UNIT_BORN.<单位 id>`；召唤物和携带物 `battle.ON_UNIT_BORN.token`；其他 `battle.ON_UNIT_BORN.char` |
| 撤退（`retreat`） | `battle.ON_CHARACTER_WITHDRAW.<单位 id>`；召唤物和携带物 `.token`；其他 `.char` |
| 阵亡（`death`） | 干员：`battle.ON_UNIT_DEAD.<单位 id>`，召唤物和携带物 `.token`，其他 `.char`；敌人：`battle.ON_UNIT_DEAD.<敌人 id>`，其他 `battle.ON_UNIT_DEAD.enemy` |
| 敌人进入目标点（`goal`） | `battle.ON_ENEMY_REACHED_EXIT` |
| 技能开始（`skill`，开启） | `battle.ON_SKILL_START.<技能 id>` |
| 玩家失守（`down`，合作-4） | 自己：`battle.ON_COOPERATE_DYING`；协作者：`battle.ON_COOPERATE_MATE_DYING` |
| 复活（`revive`） | `battle.ON_COOPERATE_REVIVE` |
| 费用请求被拒（`answer`，拒绝，合作-5） | 请求的一方：`battle.ON_COOPERATE_COST_REJECT` |
| 阶段结算（`stage`，结束，合作-6） | `battle.ON_COOPERATE_STAGE_COMPLETE_<阶段序号，从 1 起>`；之后还有阶段时再播 `battle.ON_COOPERATE_REST_START`（中场休整，合作-8） |
| 协作者申请暂停、申请加速（同步-7、同步-8） | `battle.ON_COOPERATE_PAUSE_CONFIRM`、`battle.ON_COOPERATE_SPEED_REQUEST` |

单位 id 是干员、召唤物或携带物的数据 id（内容键「id#座位」去掉座位，多份的「id#座位#n」也去掉后面的部分，同步-9），敌人 id 是敌人的键。

- 来源：数据：audio_data.json 的库名（`battle.ON_UNIT_BORN.char`「b_char_set」、`battle.ON_UNIT_BORN.token`「b_char_tokenset」、`battle.ON_CHARACTER_WITHDRAW.char`「b_char_escape」、`battle.ON_UNIT_DEAD.char`「b_char_dead」、`battle.ON_UNIT_DEAD.enemy`「b_enemy_dead_n」、`battle.ON_UNIT_DEAD.token`「b_char_tokendead」、`battle.ON_ENEMY_REACHED_EXIT`「b_ui_alarmenter」、`battle.ON_SKILL_START.<技能 id>`、`battle.ON_COOPERATE_DYING`「b_ui_sos」、`battle.ON_COOPERATE_MATE_DYING`「b_ui_teammatelose」、`battle.ON_COOPERATE_REVIVE`「b_ui_reviveol」、`battle.ON_COOPERATE_COST_REJECT`、`battle.ON_COOPERATE_STAGE_COMPLETE_1`/`_2`「b_ui_achievestage」、`battle.ON_COOPERATE_REST_START`「b_ui_halftimerest」、`battle.ON_COOPERATE_PAUSE_CONFIRM`「b_ui_applypause」、`battle.ON_COOPERATE_SPEED_REQUEST`「b_ui_applyspeedup」）；事件与库的对应、携带物用召唤物的库为推断 INF-0169

### 音频-3 战斗音乐

关卡数据带它的 BGM 事件（`bgm`，取自关卡的 `bgmEvent`）。所有座位就绪、战斗开始时播音乐库 `battle.ON_GAME_READY.<bgm>`，素材里没有时播默认的 `battle.ON_GAME_READY`：先播前奏，前奏结束时接上循环段，一直循环。战斗结束时按库的交叉淡化秒数淡出。开服的人可以在素材里换掉这两个文件（ADR 0024）。

- 来源：数据：关卡的 `bgmEvent`（如 act1multi_01「lostmemory」）、audio_data.json `bgmBanks` 的 `battle.ON_GAME_READY`（m_bat_indust_intro、m_bat_indust_loop，crossfade 1.5）与 `battle.ON_GAME_READY.<bgmEvent>`；设计决定：[ADR 0024](../adr/0024-audio-sources.md)、规划问答 Q69（BGM 默认用本地的原版战斗曲，可替换）；开始与淡出的时机为推断 INF-0170

### 音频-4 语音索引与配音

- 素材带一份语音索引：每名干员的战斗台词，按台词类型分组（`BATTLE_START` 行动出发、`BATTLE_FACE_ENEMY` 行动开始、`BATTLE_SELECT` 选中干员、`BATTLE_PLACE` 部署、`BATTLE_SKILL_1`…`BATTLE_SKILL_4` 作战中），各配音语言的台词文件，每名干员的默认配音；还有战斗语音的设定：交叉淡化秒数、两次「行动开始」之间的最短秒数、重要技能的技力消耗下限，以及每种语音类型的优先级、同优先级时能否接替、冷却秒数、延迟秒数。
- 现在数据里的设定是：交叉淡化 0.1 秒，「行动开始」最短间隔 3 秒，重要技能的技力消耗下限 10。各类型的延迟都是 0：

| 语音类型 | 优先级 | 同优先级时接替 | 冷却（秒） |
|---|---|---|---|
| `BATTLE_START` | 100 | 是 | 0 |
| `ENCOUNTER_ENEMY` | 90 | 否 | 0 |
| `SKILL_ACTIVE` | 70 | 是 | 0 |
| `SKILL_PASSIVE_IMP` | 60 | 否 | 10 |
| `SKILL_PASSIVE_NOR` | 50 | 否 | 10 |
| `PLACE_CHAR` | 20 | 是 | 0 |
| `FOCUS_CHAR` | 10 | 是 | 0 |
| `NORMAL_ATTACK` | 5 | 否 | 36000 |

- 一名干员用哪种配音：
  - 玩家选了语言（中文-普通话、日语、英语、韩语），这名干员有这种配音就用它。
  - 这名干员没有，或玩家选的是「默认」：用它的默认配音。数据里大多是日语，联动干员是联动配音。
  - 数据没给它默认配音：用全局默认（中文-普通话）。
  - 这些素材里都没有：用素材里它有的第一种配音。
  - 一种都没有：它不说话。
- 带配音的音效库：有的音效库按干员和配音语言另有一份（如 `battle.ON_UNIT_BORN.char_101_sora@JP`）。音频-2 选出的库有这名干员这种配音的一份，而且素材里有，就播那一份。
- 语音音量由玩家设定，和音效、音乐分开。

- 来源：数据：charword_table.json `charWords[]`（charId，wordKey 等于 charId 的基础台词，placeType，voiceAsset）、`voiceLangDict`、`charDefaultTypeDict`（日语 414 名、联动 24 名）、`defaultLangType`（CN_MANDARIN）、`voiceLangTypeDict`；audio_data.json `battleVoice`（crossfade、minTimeDeltaForEnemyEncounter、minSpCostForImportantPassiveSkill、voiceTypeOptions[] 的 voiceType、priority、overlapIfSamePriority、cooldown、delay）、`soundFxVoiceLang`；设计决定：[ADR 0061](../adr/0061-voices-and-battle-music-source.md)；玩家选的语言没有时的回退顺序为推断 INF-0171

### 音频-5 什么时候说话

只有自己座位的干员说话。召唤物、携带物和装置不说话。下表列出每种语音类型的时机和台词：

| 语音类型 | 时机 | 台词 |
|---|---|---|
| `BATTLE_START` | 战斗开始时：所有座位就绪，战斗第一帧，和音乐同时开始。由自己编队里第一名有台词的干员说 | 行动出发 |
| `ENCOUNTER_ENEMY` | 干员部署后第一次攻击敌人（`attack` 事件，目标是敌人）。每次部署只说一次 | 行动开始 |
| `PLACE_CHAR` | 干员部署（`deploy`） | 部署 1、2 |
| `FOCUS_CHAR` | 玩家选中自己的干员，手牌里的或场上的都算。由页面告诉音频 | 选中干员 1、2 |
| `SKILL_ACTIVE` | 手动技能（MANUAL）开启（`skill`，开启） | 作战中 1–4 |
| `SKILL_PASSIVE_IMP` | 自动（AUTO）或被动（PASSIVE）技能开启，技力消耗不低于重要技能的下限 | 作战中 1–4 |
| `SKILL_PASSIVE_NOR` | 同上，技力消耗低于下限 | 作战中 1–4 |
| `NORMAL_ATTACK` | 台词里没有对应的类型，不说 | — |

一种类型有几条台词时，等概率随机选一条。用的是页面自己的随机数。

- 来源：数据：voiceTypeOptions 的类型名；charword_table 的 placeType 和 voiceTitle（行动出发、行动开始、选中干员1/2、部署1/2、作战中1–4）；minSpCostForImportantPassiveSkill；技能的 skillType 和 spCost；技能数目：没有干员有第 4 个技能，却有 417 名干员有「作战中4」，只有 1 个技能的干员中有 11 名有 3 条以上作战中台词，所以作战中台词不按技能序号；类型与台词的对应、各类型的时机、只让自己座位的干员说话为推断 INF-0172，随机选台词为推断 INF-0173

### 音频-6 一次说一句

- 同一时刻只播一条语音。正在播一条时来了新的，按优先级比较：
  - 新的更高：新的接替。
  - 一样高：看新类型的「同优先级时接替」，是就接替，否就不播。
  - 新的更低：不播。
- 接替时，旧的在交叉淡化秒数内淡出，新的同时淡入。
- 一种类型播过之后，冷却秒数内同类型不再播。「行动开始」离上一条播出的「行动开始」不足最短间隔时也不播。
- 触发后过了延迟秒数才开始播。
- 时间按页面的音频时钟算，不进模拟，各座位可以不同。浏览器还不让页面出声时（音频时钟不走），语音不说，也不排队。

- 来源：数据：battleVoice（crossfade、minTimeDeltaForEnemyEncounter、voiceTypeOptions 的 priority、overlapIfSamePriority、cooldown、delay）；一次一条、接替时交叉淡化、冷却按类型计、最短间隔从上一条播出的「行动开始」算为推断 INF-0174
