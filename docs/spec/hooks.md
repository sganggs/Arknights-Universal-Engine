# 钩子与定时器

引擎在一帧的固定位置发出具名事件，规则之外的代码（Stronghold 兼容层，以后的原生行为）可以登记处理函数，也可以登记若干帧后或每隔若干帧运行的定时器。实现见 `packages/sim/src/bus.js`。处理函数和定时器不是状态：状态哈希和快照都不包含它们（ADR 0057）。

### 钩子-1 总线

- **登记**：事件名、处理函数、优先级（默认 0）、所有者（可选）、是否只运行一次。新登记的处理函数排在优先级不低于它的之后、优先级比它低的之前：发出时按优先级从高到低，同优先级按登记先后。
- **发出**：按顺序把事件的上下文和世界交给每个处理函数；上下文的 `stopPropagation` 为真时，后面的不再运行；只运行一次的运行后移除。发出过程中新登记的从下一次发出起生效，被移除的跳过。
- **嵌套**：处理函数里又发出事件时，嵌套超过 32 层的发出不运行任何处理函数。
- **移除**：可以移除单个处理函数，也可以按所有者移除它的全部处理函数并取消它的全部定时器。

- 来源：设计决定，见 [ADR 0057](../adr/0057-hook-bus-and-timers.md)；顺序、停止传播与嵌套上限 32 与 Stronghold 的钩子总线一致（`server/sim/battle/hooks.js`），以便兼容层载入它的 kit

### 钩子-2 定时器

- **若干帧后**：在第 F 帧登记、等 k 帧的定时器，在第 F + k 帧开头运行（k 不足 1 按 1）。
- **每隔若干帧**：间隔 n 帧（不足 1 按 1），第一次在 F + n 帧开头运行；要求立即时，在登记后的第一次定时器运行时运行——第 F 帧的定时器还没运行（开局的挂接、指令里登记的）就在第 F 帧，否则在 F + 1 帧；之后每 n 帧一次。
- 每帧开头（这一帧的指令之后，帧-1）运行所有到期的定时器：按到期的帧，再按登记先后；被取消的不再运行。

- 来源：设计决定，见 [ADR 0057](../adr/0057-hook-bus-and-timers.md)；以帧计时（时间-1、时间-2），Stronghold 的定时器以秒计、在每帧开头运行，立即的到期时间为登记时（`server/sim/battle/hooks.js` every）

### 钩子-3 引擎发出的事件

| 事件 | 时机 | 上下文 |
|---|---|---|
| `battleStart` | 第 0 帧，指令与定时器之后 | 无 |
| `tick` | 每帧，投射物等结算之后、移除阵亡单位之前（帧-1 第 8 步末） | `frames`：1 |
| `enter` | 干员或召唤物放到场上之后、它的特性、天赋、被动技能生效之前（部署-1…、召唤-4、召唤-6；一般方式的移动也是，部署-9） | `unit` |
| `deploy` | 干员部署完（特性、天赋、被动技能都已生效，部署-1…）之后；敌人出现（波次-1）之后；干员移动之后（部署-9） | `unit`，`initial`：否；移动时另有 `move`：是 |
| `enemySpawn` | 敌人出现，紧接在它的 `deploy` 之后 | `enemy` |
| `death` | 单位离场时：生命归零的单位在帧末移除（帧-1 第 9 步，`reason` 为 `killed`，到达目标点的为 `leak`），撤退的干员离场时（撤退-1，`retreat`） | `unit`、`reason`、`killer`：`killed` 时为这一帧最后一次命中它、仍在场上的单位，没有则为空 |
| `kill` | 生命归零的单位离场、有击杀者时，紧接在它的 `death` 之前 | `killer`、`victim` |
| `hit` | 一次伤害（伤害-7）判定无敌之后、计算防御之前 | `source`、`credit`、`target`、`dmg`：处理函数可改 `amount`、`mul`、`type` 与四项穿透，设 `cancel` 取消这次伤害 |
| `dodge` | 伤判效果里闪避了这次伤害时（伤害-8） | `source`、`target`、`dmg` |
| `hpDamage` | 伤判效果之后、扣生命之前，剩下的伤害大于 0 时 | `source`、`credit`、`target`、`amount`（只能调低）、`dmg` |
| `fatal` | 扣生命使它归零时（含生命流失） | `unit`、`source`、`credit`、`dmg`、`amount`、`prevented`：设为是时它留下 1 点生命（生命上限不足 1 时为上限） |
| `damaged` | 扣生命之后（含生命流失） | `source`、`credit`、`target`、`amount`、`type`、`dmg`。这四个伤害事件的 `credit` 是伤害记在谁名下：一般同 `source`；记在来源名下的无来源伤害（伤害-7）`source` 为空，`credit` 是来源 |
| `heal` | 治疗算完倍率、回复生命之前（伤害-11） | `source`、`target`、`amount`（可改）、`trait`（是治疗者特性的自身回复时为真，职业-9） |
| `beforeAttack` | 一次攻击锁定目标时（攻击-2 第 1 步） | `attacker`、`targets`（可换，留下仍在场、有生命的；为空时这次不攻击）、`isSkill`、`scale`（这次攻击的倍率再乘它，默认 1）、`mark`（内容给这次攻击的标记，整数，默认 0；随攻击和它的投射物带到 `attackHit`） |
| `attack` | 一次攻击命中、对锁定的目标结算之后（攻击-2 第 3 步），有目标时 | `attacker`、`targets`、`isSkill`、`noAmmo`：设为是时这次攻击不耗弹药技能的弹药 |
| `attackHit` | 一次攻击对一个目标的各段伤害结算之后（引擎自己的事件） | `attacker`、`target`、`dealt`（各段合计）、`kind`：`main`、`splash`、`chain`、`aftershock`，`isSkill`，`mark`（这次攻击的标记） |
| `skillStart` | 技能发动、它的行为开始之后（技能-3、技能-4） | `unit`、`reason`：`manual`（玩家发动）、`auto`、`deploy`（被动技能） |
| `skillEnd` | 技能结束之后（技能-4、技能-7）；运行中的干员离场时，先于它的 `death` | `unit`、`reason`：`duration`、`instant`（立即生效或下次攻击的技能）、`ammo`、`stopped`（玩家关闭）、`death`（离场）、`move`（一般方式的移动，部署-9） |
| `elementHit` | 一次元素损伤判定不受影响之后、计算受到的量之前（元素-2） | `source`、`target`、`dmg`：`type` 为 `element`、`element`、`amount` 与 `mul`（可改）、`cancel` |
| `elementBurst` | 元素爆发开始、爆发 Buff 加上之前（元素-3） | `source`（使它爆发的单位）、`target`、`element` |
| `burstStart` | 元素爆发的 Buff 加上、即时效果之后（元素-3） | `source`、`target`、`element` |
| `boomerangHit` | 回旋投射物到达目标、结算之后（职业-12） | `unit`（投出它的干员）、`target`、`x`、`y`（到达处）、`isSkill`、`shot`、`hold`：设为是时投射物停在那里，由内容接管 |
| `boomerangCaught` | 干员回收一个回旋投射物时（职业-12） | `unit`、`x`、`y`（回收处）、`isSkill`（技能的攻击投出的） |
| `merchantPay` | 干员的费用消耗扣费之前（职业-10） | `unit`、`cost`（可改，负数按 0）、`cancel`：设为是时这次不扣费 |
| `beforeStatus` | 战斗中施加一个状态之前（状态-5） | `source`、`target`、`status`、`frames`（−1 为无期限；改为 0 或更少则不施加）、`strength`（状态的数值）、`cancel` |

伤害信息 `dmg` 用 Stronghold 内容接口的字段名（ADR 0012）：`type`、`amount`、`mul`、`cancel`、四项穿透，以及来源标记——`isAttack`（一次攻击的命中，含溅射与跳跃）、`isSkill`（技能运行时或技能造成）、`isSplash`（溅射，余震也算）、`isProjectile`、`tags`（跳跃为 `chain`，余震为 `aftershock`；余震不算攻击的命中）、`hpLoss`（生命流失）。伤害开始结算时补齐缺省的字段：`mul` 为 1，`tags` 为空，`cancel` 为否，四项穿透为 0。

- 来源：设计决定，见 [ADR 0057](../adr/0057-hook-bus-and-timers.md)；事件名、时机与上下文同 Stronghold 的钩子（`docs/SIM.md` §5，`server/sim/damage.js` 的伤害与治疗流程，GPL-3.0-or-later）

### 钩子-4 每局的挂接

内容可以带一个挂接函数：每新建一局（第 0 帧之前），引擎把这一局交给它，让它登记处理函数和定时器。快照恢复出的一局不会再调用它（见 ADR 0057）。挂接还可以为内容自己的对象预留单位 id（`reserveIds`）：之后没有单位得到这些 id。

- 来源：设计决定，见 [ADR 0057](../adr/0057-hook-bus-and-timers.md)

