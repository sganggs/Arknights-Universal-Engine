# 敌人

### 出怪-1 出怪

敌人由波次的 SPAWN 动作产生（波次-1、波次-2），给出种类和路线。敌人出现在路线起点格的中心、再加上路线的出生偏移（spawnOffset），生命为满。出生的随机范围（spawnRandomRange）还没有实现。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「敌人在起点坐标出现时，位于方格正中心」；数据：level.waves[].fragments[].actions[]、level.routes[].spawnOffset

### 移动-1 移动

敌人按路线走（路线-1 至 路线-4）。每帧前进 `移动速度 × moveMultiplier ÷ 30` 格：移动速度是属性（属性-1），moveMultiplier 是关卡参数，默认 0.5，即通常实际速度是移动速度的一半。无法移动时（状态-5）不前进，路线上的等待也不计时。

- 来源：速度见 [PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)（每帧移动 移动速度 × m ÷ 帧率 格，「move_multiplier 默认值为0.5」）、数据：level.options.moveMultiplier；被阻挡、攻击当帧、无法移动时路线整体暂停为推断 INF-0030

### 目标-1 到达目标点

敌人到达路线终点后离场（不算阵亡），按 合作-1 至 合作-3 扣生命，扣敌人数据的 `lifePointReduce` 点（没有时 1 点，可以是 0），产生表现事件 `goal`（owner 为终点所属的第一个座位）。出它的动作标着 `isUnharmfulAndAlwaysCountAsKilled` 的敌人不扣生命，只算已处理。

- 来源：数据：level.routes[].endPosition、enemy_database 的 lifePointReduce、level.waves[].fragments[].actions[].isUnharmfulAndAlwaysCountAsKilled；扣生命的规则见 coop.md；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「对于赞助无人机这类扣除0生命值的敌人，依旧扣除生命值并触发音效」；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「isUnharmfulAndAlwaysCountAsKilled，会使得目标在自然行动完成后不触发生命值扣除和警报，仅判定为已处理（敌人计数+1）」

### 敌人攻击-1 敌人的普通攻击

- **冷却**：能行动时（不处于晕眩、冻结、沉睡、浮空）每帧减少一帧。冷却结束、有目标时，攻击按 索敌-5 排在第一的目标，造成攻击力的一次伤害，类型是敌人的伤害类型（伤害-7）；然后冷却变为攻击间隔（属性-5）。攻击力不大于 0 的敌人不攻击。
- **近战敌人**（攻击方式为 MELEE，或攻击半径为 0）只攻击阻挡它的单位。
- **远程敌人**攻击距离不超过「攻击半径 + 0.25」的可选干员（0.25 是干员的碰撞半径，常量-2）。阻挡它的单位不论距离和可选性，都在候选里。
- **对地规避**：不是空中单位的敌人不选中起飞（标记 `liftoff`，阻挡-2）的干员，它的格子范围攻击也不波及它们。已经打出的伤害、元素损伤和状态见 阻挡-2。
- **不能普通攻击**：带标记 `noAttack` 的敌人不进行普通攻击，正在进行的攻击中止（如近地悬浮，敌能-20）。攻击方式 `NONE` 不单独作数：页面写了不进行普通攻击的敌人，由内容的 `NoAttack`（敌能-64、敌能-117）加上这个标记（推断 INF-0673）。
- 攻击的那一帧敌人不移动。攻击前摇在 M3c 加入，在那之前出手当帧就造成伤害。

- 来源：[PRTS「索敌的概念」oldid=376233](https://prts.wiki/index.php?title=%E7%B4%A2%E6%95%8C%E7%9A%84%E6%A6%82%E5%BF%B5&oldid=376233)：「大部分情况下，只要敌人被阻挡，便可以向阻挡自己的单位发动攻击，无论目标是否处于自身攻击范围半径内」；[PRTS「状态机」oldid=431243](https://prts.wiki/index.php?title=%E7%8A%B6%E6%80%81%E6%9C%BA&oldid=431243)：COMBAT「索敌主目标默认固定为阻挡者」，ATTACK「攻击结束后回退到MOVE状态」；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「我方干员碰撞体积基本均为以0.25格为半径的圆形」；数据：enemy_database 的 rangeRadius、applyWay；出手当帧不移动、攻击力为 0 不攻击为推断 INF-0027；[PRTS「术语释义」oldid=440223](https://prts.wiki/index.php?title=%E6%9C%AF%E8%AF%AD%E9%87%8A%E4%B9%89&oldid=440223) 起飞「包含对地规避（无法被不同阵营行动方式为地面的单位选中）」；[PRTS「术语释义」oldid=401060](https://prts.wiki/index.php?title=%E6%9C%AF%E8%AF%AD%E9%87%8A%E4%B9%89&oldid=401060) 起飞「不会被地面敌人攻击」

