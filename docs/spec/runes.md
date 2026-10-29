# 座位符文

玩法可以给每个座位一组符文，比如促融共竞「常规项目」的比赛风格：一种风格是几条符文，只作用于选它的玩家的单位。关卡自己的符文（对所有人生效）见 关卡-2。

### 符文-1 座位符文

- 对局设定可以带每个座位的符文列表（`runes`，同步-9，协议第 8 版）。一条符文有键（`key`）、职业掩码（`professions`）和 blackboard（`board`，键与数值或文字）。
- 符文只作用于它所在座位的单位，并且只作用于职业在掩码里的单位：干员按自己的职业，召唤物按召唤物自己数据里的职业。
- 职业的位：近卫 1、狙击 2、重装 4、医疗 8、辅助 16、术师 32、特种 64、召唤物（`TOKEN`）128、装置（`TRAP`）256、先锋 512。比如 639 是八个干员职业，不含召唤物和装置。
- 符文按列表的顺序处理。引擎还不支持的符文键：对局设定的内容不组装，报出这些键（同 关卡-2）。

- 来源：数据：activity_table 中符文的说明与掩码——act42d0 `effectInfoData`「狙击和医疗干员」10、「术师和辅助干员」48、「重装和特种干员」68、「近卫和先锋干员」513，「指标·浩荡」「近卫和狙击干员」3，「攻坚协议」「近卫与辅助干员」17，「防护协议」「重装与医疗干员」12，「破阵协议」「术师与特种干员」96，「锐击协议」「先锋与狙击干员」514，「指标·火海」「辅助和特种干员」80；act17sre「近战干员」581、「远程干员」58；sandbox_table act1sandbox「所有建筑」256；促融共竞的比赛风格：activity_table `MULTIPLAY_V3/act1multi` 的 `squadEffectList[].runeData.runes`（干员符文的掩码 639）

### 符文-2 属性与部署

组装内容时改这个座位的单位：

| 符文 | 效果 |
|---|---|
| `char_attribute_mul` | 属性乘以倍率，乘在基础值上：`atk` 攻击力、`def` 防御力、`max_hp` 最大生命值、`magic_resistance` 法术抗性、`attack_speed` 攻击速度（基础 100）、`move_speed` 移动速度、`mass_level` 重量 |
| `char_respawntime_mul` | 再部署时间乘以 `scale` |
| `char_blockcnt_add` | 阻挡数加 `value`，不低于 0 |
| `char_skill_cd_mul` | 技能所需技力（技能-2）乘以 `scale`，不取整 |
| `env_gbuff_new`，`key` 为 `modify_sp[born]` | 每次部署时的初始技力加 `sp`（不超过技力上限，技能-2） |
| `global_deck_placeable_char_num_add` | 这个座位的可部署人数（部署-2）加 `value`，不低于 0；与职业无关 |

- 来源：[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「比赛风格一览」：基础「我方干员的攻击力+10%」（`char_attribute_mul` atk 1.1），攻坚「我方干员攻击速度+20」（attack_speed 1.2，即基础 100 的 1.2 倍），驻场「我方干员再部署时间增加15%」（`char_respawntime_mul` scale 1.15），游走「再部署时间减少20%，初始技力提升10」「我方干员可部署人数减少1」（scale 0.8、`modify_sp[born]` sp 10、`global_deck_placeable_char_num_add` value −1）；数据：activity_table `MULTIPLAY_V3/act1multi` `squadEffectList`；stage_table ME-1「<拘谨>干员施放技能所需技力提升」与该关的 `char_skill_cd_mul` scale 1.5；乘在基础值上为推断 INF-0162，技力不取整为推断 INF-0631

### 符文-3 在场效果

单位每次部署时带上一个没有结束时间的 Buff `rune`，按符文给出修饰器（属性-2）：

| `env_gbuff_new` 的 `key` | 效果 | 修饰器 |
|---|---|---|
| `damage_scale[out]` | 造成的伤害乘以 `damage_scale` | 伤害倍率 `dmgDealtMul` |
| `damage_scale[input][char]` | 受到的伤害乘以 `damage_scale`（伤判，伤害-8） | `dmgTakenMul` |
| `heal_scale[advanced][out]` | 治疗量乘以 `heal_scale` | 治疗倍率 `healingDealtMul` |
| `sp_recovery_reduction` | 技力自然回复速度乘以 `sp_recovery_per_sec`（最终乘算） | `spRecoveryMul` |

`attr_up_on_trigger[atk][max_hp]`：部署后每过 `interval` 秒，攻击力与最大生命值各加一层 `atk`、`max_hp`（直接乘算），最多 `max_stack_cnt` 层；按 部署-7 的「每在场上停留N秒」计时（第一次在部署后一个间隔），撤退后重新部署时从头开始。

- 来源：[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「比赛风格一览」：支援「我方干员治疗效果提升40%」「我方干员造成伤害降低10%」（`heal_scale[advanced][out]` 1.4、`damage_scale[out]` 0.9），攻坚「我方干员受到伤害增加20%」（`damage_scale[input][char]` 1.2），驻场「我方干员在场时攻击力与最大生命值逐渐提升，最多+60%」（atk 0.03、max_hp 0.03、max_stack_cnt 20、interval 5）；[PRTS「VI-4 整装列队」revid 258942](https://prts.wiki/index.php?title=VI-4%20%E6%95%B4%E8%A3%85%E5%88%97%E9%98%9F&oldid=258942) 突袭「我方干员技力自然回复速度降低至25%」与该关突袭符文 `sp_recovery_reduction` sp_recovery_per_sec 0.25；叠层的起点与计法为推断 INF-0163

### 符文-4 造成伤害时回复技力

`env_gbuff_new`，`key` 为 `attack_prob_get[sp][char]`：单位每对一个目标造成一次伤害（伤害-7，来源是它自己），以 `prob` 的几率得到 `sp` 点技力（技能-2：技能运行中阻回，不得）。几率用战斗的随机数（随机-1）。

- 来源：[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839) 攻坚「造成伤害有10%概率回复1技力」（prob 0.1、sp 1）；同类符文的说明：activity_table「术师和特种干员每对一个单位造成伤害就有50%概率回复1点技力值」；只算来源是它自己的伤害为推断 INF-0164

### 符文-5 攻击范围内回复技力

`char_dynamic_ability_new`，`key` 为 `dyn_attr_get_in_attack_range[modify_sp]`：开局后每过 `interval` 秒，这个座位每名在场的、职业在掩码里的干员，它攻击范围内的所有干员（不论座位，包括它自己的格子在范围内时的它自己）各得 `sp` 点技力（技能-2：阻回时不得）。一名干员同时在几名干员的范围内，也只得一次。

- 来源：[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839) 支援「攻击范围内的所有干员每秒技力额外回复1（不叠加）」（sp 1、interval 1）；从开局计时、直接给技力（而不是改技力自然回复速度）为推断 INF-0165

### 符文-6 携带物卡

`insert_token_card`：这个座位的卡组多一张 `token_key` 的卡（`count` 现在只支持 1）。卡上的单位按它的训练数据组装：精英 0、等级 `level`、潜能 1。它可以部署在近战位和远程位，不占可部署人数，不攻击，部署后可以撤退；费用、再部署时间和再部署惩罚与干员相同（部署-3）。它部署时的效果见 装置-6；它自己的技能不运行。它的职业是装置，所以这个座位的干员符文（掩码 639）不作用于它。

- 来源：数据：activity_table `MULTIPLAY_V3/act1multi` `squadEffectList` 的 `insert_token_card`（token_key、level 1、skill 0、count 1、skill_level 1）；[PRTS「赛场啦啦队」revid 338721](https://prts.wiki/index.php?title=%E8%B5%9B%E5%9C%BA%E5%95%A6%E5%95%A6%E9%98%9F&oldid=338721) 等五个携带物的「装置信息」：「部署条件=部署于近战/远程位」「占用部署数=0」「撤回策略=部署后可撤回」；不攻击、再部署惩罚与干员相同为推断 INF-0166
