// The shapes of the content the simulation reads and of the world it keeps. The world holds plain data only (numbers,
// strings, booleans, arrays, plain objects), so a snapshot is a deep copy of it (ADR 0054).

/** @typedef {{ row: number, col: number }} Cell */
/** A route checkpoint; (dx, dy) is its reach offset in tiles (路线-1). @typedef {{ type: string, row: number, col: number, time: number, dx?: number, dy?: number }} Checkpoint */
/**
 * A route: `motion` WALK or FLY; `allowDiagonal` (default true) lets the smoothed path step diagonally (寻路-2);
 * `spawnOffset` moves the spawn point off the start tile's centre (出怪-1).
 * @typedef {{ start: Cell, end: Cell, checkpoints: Checkpoint[], motion: string, allowDiagonal?: boolean, spawnOffset?: { x: number, y: number } }} Route
 */
/**
 * One action of a fragment (波次-1): SPAWN an enemy `key` on `route`; ACTIVATE or WITHDRAW the predefined unit whose
 * alias is `key`; STORY tells the story `key` (波次-8); NONE does nothing. Its i-th of `count` times comes `preDelay + i × interval` seconds after its
 * fragment starts (波次-2). `dontBlockWave`: its enemies need not be handled for the wave to end (波次-3); `hidden`:
 * its hidden group (波次-4); `group`, `pack`, `weight`: random alternatives (波次-5); `unharmful`: its enemies cost no life
 * at the goal (目标-1).
 * @typedef {{ type: 'SPAWN' | 'ACTIVATE' | 'WITHDRAW' | 'STORY' | 'NONE', key: string, route: number, count: number, preDelay: number, interval: number,
 *   dontBlockWave?: boolean, hidden?: string, group?: string, pack?: string, weight?: number, unharmful?: boolean }} WaveAction
 */
/** A fragment (波次-1, 波次-2). @typedef {{ preDelay: number, actions: WaveAction[] }} Fragment */
/** A wave (波次-1…波次-3); `maxWait` is maxTimeWaitingForNextWave, −1 for none. @typedef {{ preDelay: number, postDelay: number, maxWait: number, fragments: Fragment[] }} Wave */
/**
 * A level's own cards (关卡-7): its operator cards with their training, its token cards with their count, alias and
 * whether they are hidden at first (波次-9).
 * @typedef {{ operators: { key: string, build: import('@aue/schema').Build }[], tokens: { key: string, alias: string, count: number, hidden: boolean }[] }} LevelCards
 */
/**
 * A predefined unit (波次-6): its tile and facing when the data gives them; a predefined operator's training (波次-7).
 * @typedef {{ alias: string, key: string, hidden: boolean, row?: number, col?: number, dir?: string, build?: import('@aue/schema').Build }} Predefine
 */
/**
 * A device's record (关卡-6, 装置-1): its name, attributes and its talents' blackboard; its side when it is the enemies'
 * (装置-3), the statuses it is immune to, and the modifiers it gives every enemy while on the field (装置-4).
 * @typedef {{ name: string, maxHp: number, atk: number, def: number, res: number, blockCnt: number, baseAttackTime: number, aspd: number, tauntLevel: number,
 *   massLevel: number, talentBb: Record<string, number>, side?: 'ENEMY', immune?: string[], enemyMods?: Record<string, number>, talents?: Record<string, number>[],
 *   cost?: number, facility?: FacilityDef, builder?: BuilderDef, rubble?: RubbleDef, inert?: boolean }} DeviceDef
 */
/**
 * 堡垒守御 (守御-1…守御-6): the level's times in seconds and the life a rest gives; a facility's kind, its modes'
 * blackboards by level and a roadblock's blast; a builder's progress key, hits and seconds on the field; the rubble
 * pile's range cells, its guards' branch and its check times.
 * @typedef {{ rest: number, wave: number, waveLast: number, life: number, restAdd: number }} FortressRules
 * @typedef {{ kind: 'workshop' | 'lounge' | 'platform' | 'roadblock' | 'gym', modes: Record<string, number>[], boom?: number }} FacilityDef
 * @typedef {{ sp: 'sp' | 'sp2', hits: number, life: number }} BuilderDef
 * @typedef {{ range: string, cells: Cell[], branch: string, first: number, every: number }} RubbleDef
 */
/**
 * A co-op stage (合作-6, 合作-7): the alias of its controller, its objective, the minimum and advanced targets (for 突击 as
 * fractions of `hpMax`; for 生存 in seconds), its time limit and the rest before it in seconds, the enemy 渗透 counts; its
 * task's title and texts for the page (关卡-5).
 * @typedef {{ alias: string, objective: 'protect' | 'target' | 'kill' | 'survive' | 'boss' | 'tower' | 'car', goal: number, advanced?: number,
 *   time: number, rest: number, enemy?: string, hpMax?: number, task?: { title: string, basic: string, advanced?: string } }} Stage
 */
/**
 * A level's options; `costTransfer` is the most a cost request moves (合作-5; default 15).
 * @typedef {{ maxLifePoint: number, initialCost: number, maxCost: number, costIncreaseTime: number, characterLimit: number, moveMultiplier: number, costTransfer?: number,
 *   characterLimitAdd?: number[] }} LevelOptions
 */
/**
 * A level: its map, options, routes, waves (波次-1), the hidden groups enabled (波次-4), its predefined units (波次-6) and
 * its co-op stages (合作-6).
 * @typedef {import('./level.js').LevelMap & { id: string, code?: string, name?: string, options: LevelOptions, routes: Route[], waves: Wave[],
 *   hiddenGroups?: string[], predefines?: Predefine[], stages?: Stage[], view?: number[], works?: { dealt: number, taken: number }, cards?: LevelCards,
 *   branches?: Record<string, Fragment[]>, fortress?: FortressRules, uncovered?: string[] }} Level
 */

/** @typedef {'phys' | 'arts' | 'true' | 'elemental'} DamageType */

/**
 * A unit's attack clip as its Spine skeleton gives it (攻击-2): the clip's length and its OnAttack time, in seconds.
 * @typedef {{ duration: number, hit: number }} AttackTiming
 */

/**
 * What enemies and operators may give besides their required stats; each defaults as in attrs.js ATTRS.
 * @typedef {object} OptionalStats
 * @property {number} [aspd] attack speed (default 100)
 * @property {number} [tauntLevel]
 * @property {number} [massLevel] weight
 * @property {number} [epDamageResistance] 元素抗性
 * @property {number} [epResistance] 损伤抵抗
 * @property {string[]} [immune] status flags the unit is immune to (状态-7)
 * @property {DamageType} [dmgType] the type of its normal attack (default phys)
 * @property {number} [maxEp] maximum element value (default by 元素-1)
 * @property {string} [levelType] NORMAL, ELITE or BOSS (领袖)
 * @property {AttackTiming} [attack] its attack clip's timing (攻击-2); none: the attack lands as it starts
 * @property {boolean} [shared] a 共同敌手: it costs every player a life at any goal (合作-2)
 * @property {boolean} [neutral] a neutral unit (合作-9)
 * @property {number} [deathLife] the lives a neutral unit costs when knocked down (合作-9)
 * @property {number} [lifePointReduce] the lives it costs at the goal (目标-1; default 1)
 */

/**
 * What a skill's description adds (技能-9, 技能-14): modifiers and flags while it runs; and for its attacks, every enemy the operator blocks
 * as targets, `more` targets than it would have, `times` hits, the damage type, a status each hit gives (at a chance
 * `prob`), modifiers each hit gives its target for some seconds (`hitDebuff`), the operator's own HP back for each attack
 * (`selfHeal`, a share of its maximum), the 元素损伤 each hit carries (`element`, `epScale` × its attack), a push or
 * pull of 力度 `force` on each target (`displace`; along the operator's facing for `along`).
 * 技能-14, read from other sentences: `counter` while the skill runs, a `barrier` gained as it starts, `bursts` at the
 * start or the end, `selfStun` when it ends, `allyHeal` for a friendly unit. `hitScale` `'attack'` means a plain
 * `atk_scale` belongs to the counter or the burst, so the attack's scale is `attack@atk_scale`.
 * @typedef {{ mods?: Record<string, number>, flags?: Record<string, boolean>, attack?: { blocked?: boolean, more?: number, times?: number, type?: DamageType,
 *   hitStatus?: { key: import('./status.js').StatusKey, seconds: number, prob?: number }, hitDebuff?: { seconds: number, mods: Record<string, number> },
 *   selfHeal?: number, element?: import('./elements.js').Element, epScale?: number,
 *   displace?: { pull: boolean, force: number, along?: boolean } },
 *   counter?: { scale: number, stat: 'atk' | 'def', type: DamageType, around?: boolean, ground?: boolean, cooldown?: number,
 *     element?: import('./elements.js').Element, epScale?: number, silence?: number },
 *   barrier?: { ratio: number, seconds: number, decay?: boolean, type?: 'phys', cap?: number, tied?: boolean },
 *   bursts?: { at: 'start' | 'end', scale: number, type: DamageType, where: 'attack' | 'cells', range?: Cell[] }[],
 *   selfStun?: { seconds: number },
 *   allyHeal?: { scale: number, all?: boolean, others?: boolean, on: 'attack' | 'start', below?: number, range?: Cell[] },
 *   hitScale?: 'attack' }} SkillExtra
 */
/**
 * An enemy's skill (敌能-1): its name (prefabKey), first and later cooldowns in seconds, SP cost (spCost; 0 for none),
 * blackboard.
 * @typedef {{ key: string, cooldown: number, initCooldown: number, sp?: number, bb: Record<string, number> }} FoeSkill
 */
/**
 * An enemy: `blockCnt` is how much block it takes (阻挡数消耗, default 1); `rangeRadius` its attack radius in tiles and
 * `applyWay` MELEE, RANGED or ALL (敌人攻击-1); its talents by name and its skills (敌能-1); its tags (关卡-1).
 * @typedef {OptionalStats & { name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number, motion?: string,
 *   baseAttackTime?: number, blockCnt?: number, rangeRadius?: number, applyWay?: string, talents?: Record<string, Record<string, number>>,
 *   skills?: FoeSkill[], tags?: string[] }} EnemyDef
 */
/**
 * A skill as the content gives it (技能-1): one level of a skill_table entry.
 * @typedef {object} SkillDef
 * @property {string} id
 * @property {'AUTO' | 'MANUAL' | 'PASSIVE'} type
 * @property {'time' | 'attack' | 'hurt' | 'none'} sp how it recovers SP
 * @property {number} cost spCost
 * @property {number} init initSp
 * @property {number} charges maxChargeTime, at least 1
 * @property {number} duration seconds; 0 or less: none
 * @property {boolean} ammo durationType AMMO
 * @property {Record<string, number>} bb the blackboard
 * @property {boolean} [stoppable] the player may close it while it runs (技能-7)
 * @property {Cell[]} [range] the operator's attack range while it runs (技能-8)
 * @property {SkillExtra} [extra] what its description adds to the blackboard's effects (技能-9)
 * @property {boolean} [rangeAll] while it runs the operator's attack reaches the whole map (技能-8)
 * @property {boolean} [forever] it has no duration and runs until it is closed or its operator leaves the field (技能-4)
 * @property {number} [spend] the deployment cost its owner pays to start it; it starts only while the owner holds that
 *   much (技能-10)
 * @property {SkillAllies} [allies] what it gives the friendly units in its attack range while it runs (技能-11)
 * @property {AlchemyDef} [alchemy] the 炼金单元 it throws as it starts; it is then an instant skill (技能-13)
 * @property {'start' | 'end'} [doll] the skill switches a 傀儡师 to its 替身 as it starts, or after it ends on its own (职业-15)
 */
/**
 * What a skill's 炼金单元 does (技能-13). `at`: thrown at the enemies (the operator's target, else the farthest tile ahead in
 * its range) or the friendly units (the one in its range with the lowest HP share); `seconds` it lasts, `radius` in tiles
 * — `square`: its tile and the 8 around instead —; every `interval` seconds (1) the ground enemies in it take arts damage
 * of `scale` × the thrower's attack × `dmgMul` (天赋); `foeMods` the ground enemies in it have, `heavy` those of 重量 at
 * least `weight` more damage and their own modifiers; `regen` × the thrower's attack of 生命回复速度 and `allyMods` for the
 * friendly units in it; `drift`: it moves away from the thrower at `speed` tiles a second, its radius growing `grow` a
 * second, for `seconds`; `extend` seconds more when another operator is in the thrower's range as it throws (天赋);
 * `hitRate`: the ground enemies in it hit at × `mul` (× `heavyMul` those of 重量 at least `weight`; 天赋).
 * @typedef {{ at: 'enemy' | 'ally', seconds: number, radius: number, square?: boolean, interval?: number, scale?: number, dmgMul?: number,
 *   foeMods?: Record<string, number>, heavy?: { weight: number, scale?: number, mods?: Record<string, number> }, regen?: number,
 *   allyMods?: Record<string, number>, drift?: { speed: number, seconds: number, grow: number }, extend?: number,
 *   hitRate?: { mul: number, heavyMul?: number, weight?: number } }} AlchemyDef
 */
/**
 * A 炼金单元 on the field (技能-13): its id, its thrower's record key, unit and seat, its centre (`cx` the column, `cy` the
 * row) and radius, the frames it landed and ends, the thrower's attack then; drifting, its speed (tiles a second) until a frame.
 * @typedef {{ id: number, key: string, src: number, owner: number, cx: number, cy: number, r: number, born: number, end: number, atk: number,
 *   vx?: number, vy?: number, until?: number }} Alchemy
 */
/**
 * What a skill gives the friendly units (summons too) in its operator's attack range while it runs (技能-11): its
 * operator too unless `others`; modifiers; 鼓舞, a share of the operator's attack, defence or maximum HP for each
 * attribute (最终加算; never to a unit with `noInspire`).
 * @typedef {{ others: boolean, mods?: Record<string, number>, inspire?: Partial<Record<'atk' | 'def' | 'maxHp', number>> }} SkillAllies
 */
/**
 * A 傀儡师's 替身 (职业-15, 职业-16). The fields after `maxHp` may be left out: no range of its own, ground units only, it
 * attacks, no aura.
 * @typedef {object} Doll
 * @property {number} duration the seconds it fights
 * @property {number} switch the seconds of each switch
 * @property {number} atk its attack + this (直接乘算)
 * @property {number} maxHp its maximum HP + this (直接乘算)
 * @property {Cell[] | null} [range] its own range, as offsets facing right, in place of the operator's (职业-16)
 * @property {boolean} [antiAir] its normal attack can select flying units
 * @property {boolean} [attack] false: it makes no normal attack
 * @property {{ moveMul: number, scale: number } | null} [aura] the ground enemies in its range move at × `moveMul` (最终乘算)
 *   and take `scale` × its attack as arts damage each second
 * @property {boolean} [arts] its normal attacks deal arts damage
 * @property {number} [taken] the physical and arts damage it takes × this
 */
/**
 * A branch trait as the simulation reads it (职业-1…职业-6): anything left out takes the default of the operator's
 * position (traits.js defaultTrait).
 * @typedef {object} TraitDef
 * @property {boolean} antiAir its normal attack can select flying units
 * @property {boolean} blockedFirst it can and prefers to attack the units it blocks (even flying or out of range)
 * @property {'HATRED_DES' | 'DEF_ASC' | 'MASS_DES' | 'ALL'} filter its 仇恨过滤器 (索敌-3)
 * @property {'' | 'FLY_FIRST'} secondary its 二次过滤器 (索敌-3)
 * @property {number | 'blockCnt' | 'all'} targets a normal attack's maximum number of targets
 * @property {boolean} heal its normal attack heals allies instead (职业-2)
 * @property {number} hits hits per target of each attack
 * @property {Record<string, number>} mods lasting modifiers while deployed
 * @property {Record<string, boolean>} flags lasting flags while deployed
 * @property {number} killCost cost gained when its attack or skill kills an enemy
 * @property {number} refund the share of the paid cost a retreat returns (返还倍率)
 * @property {{ key: import('./status.js').StatusKey, seconds: number, value?: number } | null} hitStatus a status each hit gives the target
 *   (with its strength, 状态-5)
 * @property {Splash | null} splash its attack also hits the enemies around the target (职业-8)
 * @property {number} aftershock its attack hits once more at this share of its 倍率 (0: no aftershock; 职业-8)
 * @property {number} unblockedScale its attack's 倍率 against an enemy it does not block is multiplied by this (职业-8)
 * @property {number} selfHeal HP it restores itself for each enemy an attack of its reaches (职业-9)
 * @property {number | 'blockCnt'} selfHealMax at most this many such heals an attack (its 阻挡数, at least 1)
 * @property {'attack' | 'damage'} selfHealOn when it heals itself: for the enemies an attack reaches, or for every hit it
 * deals (职业-9)
 * @property {boolean} rangedTiles a melee operator may also be deployed on ranged tiles (部署-1, 职业-10)
 * @property {boolean} meleeTiles a ranged operator may also be deployed on melee tiles (部署-1, 职业-19)
 * @property {boolean} skillArts its attacks started while its skill runs deal arts damage (职业-10)
 * @property {string[]} immuneBlocking the flags it is immune to while it blocks an enemy (职业-10)
 * @property {number} hpDrain the share of its maximum HP it loses each second, never the last point (职业-10)
 * @property {{ every: number, cost: number } | null} costDrain the cost it consumes every so many seconds on the field (职业-10)
 * @property {{ cells: Cell[], scale: number, outside: boolean } | null} zone its attack's (or heal's) 倍率 × scale for a target
 *   inside these tiles around it, turned with it — or, `outside`, for one outside them (职业-11)
 * @property {Chain | null} chain its attack or heal jumps on from its first target (职业-11)
 * @property {number} healOnHit damage it deals an enemy heals one operator by this share of that damage (职业-11)
 * @property {boolean} attackInSkill it makes normal attacks only while its skill runs (职业-12)
 * @property {Record<string, number>} idleMods modifiers while its skill does not run (职业-12)
 * @property {Record<string, boolean>} idleFlags flags while its skill does not run (职业-12)
 * @property {boolean} idleAirOnly while its skill does not run, its normal attack selects only flying enemies and those it
 *   blocks (职业-12)
 * @property {Splash | null} skillSplash its attack's splash while its skill runs (职业-12)
 * @property {number} liftoffBlock its block count while it took off (起飞), 0 for its 阻挡数 (阻挡-2, 职业-12)
 * @property {number} fortress a 要塞's ranged attack's splash radius, 0 for none: a melee attack on the enemies it blocks or
 *   on its tile, a ranged one with that splash on the others (职业-12)
 * @property {{ atk: number, steps: number, init?: number } | null} charge while its skill does not run, a step a second up to
 *   `steps`, each `atk` ÷ `steps` attack (直接乘算), from the steps of `init` attack at deployment; back to 0 after the
 *   skill ran (职业-12)
 * @property {number} skillHeal while its skill runs, its normal attacks heal at this 倍率 (职业-12)
 * @property {{ max: number, scale: number, extra?: number } | null} bullets each attack spends a bullet at this 倍率; it reloads one at
 *   a time, `extra` more when it has none (职业-12, 职业-22)
 * @property {number} store the most attack energy it stores when it has no target (0: none; 职业-12)
 * @property {number} epHeal its heals also restore each element value by this share of the heal (职业-12)
 * @property {{ out: number, back: number } | null} boomerang its attack throws boomerangs that come back, at these speeds
 *   (tiles per second); it attacks again only when it caught them all (职业-12)
 * @property {{ init: number, delta: number, max: number } | null} funnel its attack's 倍率: `init` on a new target, `delta` more
 *   for each attack on the one it attacked last, at most `max` (职业-12)
 * @property {boolean} noAttack it makes no normal attacks (职业-13)
 * @property {boolean} free it does not count towards the deploy limit (部署-2, 职业-13)
 * @property {boolean} noInspire 鼓舞 does not reach it (职业-13, 技能-11)
 * @property {{ atk: number, max: number } | null} spendAtk a skill of its that costs deployment cost gives attack + `atk`
 *   (直接乘算) for each cost paid, at most `max` of them, while it runs (职业-20, 技能-10)
 * @property {number} regenAura the operators in its attack range gain 生命回复速度 of this share of its attack (职业-13)
 * @property {boolean} summonBlocked its normal attack can also select the enemies its own summons block, wherever they
 *   stand (职业-14)
 * @property {number} summonBlockedScale its attack's 倍率 against an enemy one of its own summons blocks is multiplied by
 *   this (职业-14)
 * @property {boolean} trapTiles its summons cannot be deployed on a tile a ground enemy stands on (职业-14)
 * @property {boolean} rangeTiles its normal attack searches its range by the tile of each enemy's position, not by its
 *   collider (体积-5: 谬因)
 * @property {Doll | null} doll brought to 0 HP in its own form it switches (`switch` seconds) to its 替身, which fights
 *   `duration` seconds with attack and maximum HP + `atk`, `maxHp` (直接乘算), then switches back (职业-15)
 * @property {VsScale[]} vs its hits' attack 倍率 or 伤害倍率, or its heals' 倍率, against a target as `when` says (职业-17)
 * @property {{ min: number, max: number, dmg: number } | null} far its hits' 伤害倍率 by the distance to the target: 1 up to
 *   `min` tiles, 1 + `dmg` at `max` and on (职业-17)
 * @property {{ step: number, cap: number } | null} crowd its hits' 伤害倍率: + `step` for each enemy in its attack range, at
 *   most `cap` of them (职业-17)
 * @property {{ cnt: number, atk: number } | null} packed an attack whose splash reaches at least `cnt` enemies, the target's
 *   included, hits at `atk` × its 倍率 (职业-17)
 * @property {WhileMods[]} whiles modifiers it has while a condition on it holds (职业-18)
 * @property {number} extraArts each hit of its attack also deals arts damage of this share of its attack (职业-20)
 * @property {number} counterArts each hit of an enemy's attack on it deals the attacker arts damage of this share of its attack (职业-20)
 * @property {{ el: import('./elements.js').Element, ratio: number, arts: boolean } | null} epRider its damage (arts damage only, `arts`) also deals 元素损伤 of
 *   `el` of `ratio` of the HP it took (职业-20)
 * @property {{ el: import('./elements.js').Element, scale: number } | null} burstHit its damage on a target in a burst of `el` also deals elemental damage of
 *   `scale` of its attack (职业-20)
 * @property {{ on: 'elite' | 'survives' | 'catch', sp: number, every?: number } | null} spOn SP for a hit of its attack on an elite or
 *   leader, on a target it did not bring down, or every `every` boomerangs caught (职业-20)
 * @property {{ atk: number, max: number } | null} payStack each upkeep payment, attack + `atk` (直接乘算), at most `max` steps (职业-20)
 * @property {ModuleAura[]} auras modifiers or flags it gives other units while they are so (职业-20)
 * @property {number} firstCost added to its deploy cost before its first deployment, the cost never below 0 (职业-21)
 * @property {number} firstRetreatRespawn × its 再部署时间 after its first retreat (职业-21)
 * @property {boolean} refundUncapped a retreat's refund is not capped at its initial cost (撤退-1, 职业-21)
 * @property {number} freeSummons this many of its summons on the field take no place in the deploy limit (部署-2, 职业-21)
 * @property {boolean} summonRangedTiles its summons may also be deployed on ranged tiles (部署-1, 职业-21)
 * @property {{ prob: number, scale: number } | null} summonBoost a summon deployed from its card deals × `scale` damage at the
 *   chance `prob` (职业-21)
 * @property {number} aftershocks how many aftershocks its attack has when it has one (职业-8, 职业-22)
 * @property {{ cnt: number, level: number } | null} pushBoost its pushes `level` 力度 stronger while it blocks `cnt` or more (职业-23)
 * @property {{ range: number, level: number } | null} pullBoost its pulls `level` 力度 stronger on a target farther than `range` tiles (职业-23)
 * @property {{ perTile: number, every: number } | null} pullTrauma a target its pull moves takes `perTile` arts damage a tile moved, every
 *   `every` seconds, until the pull ends (移动创伤, 职业-23)
 * @property {number} rangedRefund this share of the cost back when deployed on a ranged tile (职业-23)
 * @property {{ hp: number, mods: Record<string, number> } | null} secondLife brought to 0 HP, once a deployment it stays with these
 *   modifiers and `hp` of its maximum HP (职业-22)
 * @property {TalentHit[]} onHit what each hit of its attack gives the target by its talents (干员-19, 职业-24)
 * @property {{ status?: string, tag?: string, lacksHit?: boolean, during?: number }[]} prefer the targets its talents prefer, each a
 *   二次过滤器 (职业-28, 职业-35)
 * @property {boolean} hurtSleeping it can select sleeping enemies and its damage goes through 沉睡 (职业-28)
 * @property {number} sleepDot every second, arts damage of this share of its attack on each enemy asleep (职业-28)
 * @property {{ scale: number, n: number } | null} lowestArts after each attack, arts damage of `scale` × its attack on its
 *   `n` targets with the least HP (职业-28)
 * @property {{ el: string, where: 'range' | 'field', dmg?: number, heal?: number }[]} burstOn what answers an enemy's
 *   burst of `el` as it begins, in its attack range or on the field: elemental damage of `dmg` × its attack, a heal of
 *   `heal` × its maximum HP (职业-29)
 * @property {{ who: 'blocked' | 'range', every: number, ep?: { el: string, scale: number }, arts?: number,
 *   status?: { key: string, seconds: number } }[]} pulses every `every` seconds, on the enemies it blocks or in its range (职业-29)
 * @property {number} palsyHit elemental damage of this share of its attack on an enemy in its range whose attack 麻痹
 *   cuts (职业-29)
 * @property {number} epOnHit element values restored for each enemy its attack reaches, at most its block count (职业-29)
 * @property {{ share: number, seconds: number, max: number } | null} healDot what its normal heals leave: each second
 *   a heal of `share` × its attack and the element values back by that × `epHeal`, a layer each heal (职业-29)
 * @property {TalentStack[]} stacks steps of modifiers its talents give it for kills or damage (干员-20, 职业-25)
 * @property {TalentSp[]} talentSp SP its talents give on events (干员-21, 职业-25)
 * @property {{ mods: Record<string, number>, full: number } | null} grit its talent's 坚忍: the modifiers × the share of its maximum HP
 *   lost over `full`, at most 1 (干员-23, 职业-25)
 * @property {NextAttack[]} nextAttack what its attack gets as it starts after a while without attacking, or after a dodge (干员-24, 职业-26)
 * @property {{ min: number, max: number, top: number } | null} rhythm its attack's 倍率 by the seconds since its last attack started:
 *   1 up to `min`, rising to `top` at `max` (干员-24, 职业-26)
 * @property {{ value: number, share: number } | null} idleShield a 屏障 of `share` of its maximum HP once it has not attacked for
 *   `value` seconds, the wait beginning again when the 屏障 is gone (干员-24, 职业-26)
 * @property {{ every: number, max: number, init: number, heal: number } | null} layers 护盾 layers: `init` at deployment, one more
 *   every `every` seconds up to `max`, a heal of `heal` of its maximum HP as each breaks (干员-25, 职业-27)
 * @property {{ below: number, heal: number, mods: Record<string, number> } | null} lowHp 不死 until its HP is below `below` of its
 *   maximum, then once a heal of `heal` of it and `mods` for the rest of the deployment (干员-25, 职业-27)
 * @property {{ seconds: number } | null} lastStand brought to 0 HP, once a deployment, it stays at 1 HP, 不死 and 禁疗, and
 *   retreats after `seconds` (干员-25, 职业-27)
 * @property {{ hp: number, self: number, foes: number } | null} frostLife brought to 0 HP, once a deployment, it heals to `hp` of
 *   its maximum, is 冻结 `self` seconds and the enemies in its range `foes` seconds (干员-25, 职业-27)
 * @property {{ cost: number, hp: number, mul: number } | null} costLife brought to 0 HP, when its owner has the cost — `cost`, × `mul`
 *   each time before this deployment — it pays and goes on at `hp` of its maximum (干员-25, 职业-27)
 * @property {{ heal?: { low: number, high: number, below: number }, status?: { key: import('./status.js').StatusKey, seconds: number } } | null} hurt
 *   what a hit sets off as its 伤判 begins: a heal of itself (`high` below `below` of its maximum HP, else `low`), a status on
 *   the enemy that dealt it (干员-25, 职业-27); read from the record's `talentTrait`
 * @property {{ power: string, scale: number } | null} reflect while it is on the field, an enemy's attack on an operator of
 *   the faction `power` takes true damage of `scale` × its attack (干员-25, 职业-27)
 * @property {number} startCost its seat starts with this much more cost while it is in the deck (部署-10, 职业-30)
 * @property {CostCut[]} costCuts the cost it takes off cards of a profession or faction (部署-10, 职业-30)
 * @property {number} retreatCut added to the cost of its seat's next operator after its retreat (部署-10, 职业-30)
 * @property {{ profession: string, value: number, max: number } | null} deployCut as it is deployed, `value` added to the
 *   cost of each card of `profession` of its seat not on the field, at most `max` × `value` until that card is deployed
 *   (部署-10, 职业-30)
 * @property {number} costRate × its seat's cost recovery while it is on the field (费用-1, 职业-30)
 * @property {number} aloneCost the cost its seat gains as it is deployed with no other operator on the 4 tiles next to it (职业-30)
 * @property {DeploySp[]} deploySp SP on its deployment, or on others' while it is on the field (职业-30)
 * @property {{ sp: number, seconds: number, mods: Record<string, number> } | null} allySkill as a skill starts on a tile of its
 *   attack range: `sp` (阻回 no matter) and `mods` for `seconds` (职业-30)
 * @property {{ profession: string, every: number, sp: number } | null} spPulse while it is on the field, every `every` seconds `sp`
 *   for each operator of `profession` with an attack-recovery skill (职业-30)
 * @property {number} hurtAttackSp while it is on the field, a hurt-recovery skill also gains this for its holder's attack (职业-30)
 * @property {Record<string, number>[]} deployPick one of these modifiers at random for its deployment, without an end (职业-31)
 * @property {{ where: 'around' | 'blocked', share: number }[]} downHeal a heal of `share` of its maximum HP for an enemy that
 *   falls on its tile or the 8 around it, or that it blocked (职业-31)
 * @property {{ profession: string, seconds: number, mods: Record<string, number> } | null} deployBuff as it is deployed,
 *   `mods` for `seconds` on each operator of `profession` on the field (职业-31)
 * @property {number} fieldRegen while it is on the field, every friendly unit gains 生命回复速度 of this share of its attack (职业-31)
 * @property {{ seconds: number, mods: Record<string, number>, above?: number, aboveSeconds?: number } | null} healGives what
 *   its heals leave on the one healed for some seconds (职业-31)
 * @property {number} groundEpHeal × the 元素损伤 its heals restore on a unit on a 低地 tile (职业-31)
 * @property {boolean} seeStealth its attack can select 隐匿 enemies (职业-31)
 * @property {{ scale: number, front?: number } | null} minDamage the least damage of its attacks' hits after the defences, × its
 *   attack (职业-31)
 * @property {{ seconds: number, radius: number } | null} deployStun as it is deployed, 晕眩 on its first target and the enemies
 *   around it (职业-31)
 * @property {{ scale: number, stun: number, again: string } | null} deployBlast as it is deployed, true damage and 晕眩 on the
 *   enemies on its tile and the 4 next to it (职业-31)
 * @property {FieldBuff[]} fieldBuffs buffs for the friendly units on the field it is for, while it is there (职业-32)
 * @property {ShareGain | null} shareGain a gain it shares with units chosen at random (职业-32)
 * @property {{ power: string, mods: Record<string, number> } | null} stackShare its stack marked `shared` given to the other
 *   units of a faction, × its steps (职业-32)
 * @property {number} healShare healing another unit, it heals itself this share of the heal (职业-33)
 * @property {number} healMore the chance of one more target for its heal (职业-33)
 * @property {{ scale: number, cooldown: number } | null} statusHeal a heal of `scale` × its attack for a unit in its range taking
 *   a 可抵抗 status, then a wait of `cooldown` seconds (职业-33)
 * @property {{ below: number, value: number } | null} lowHeal `value` more for a heal on a unit below `below` of its maximum HP (职业-33)
 * @property {{ cap: number, decay: number } | null} overhealBarrier its heal beyond the target's maximum as a 屏障, at most `cap` ×
 *   its attack, losing `decay` a second (职业-33)
 * @property {{ scale: number, seconds: number } | null} healBarrier its heal leaves a 屏障 of `scale` × its attack for `seconds` (职业-33)
 * @property {{ scale: number, max: number } | null} skillEndHeal as its skill ends, a heal of `scale` × its attack on itself and at
 *   most `max` units in its range (职业-33)
 * @property {number} resistRegen the units with 抵抗 in its range gain 生命回复速度 of this share of its attack (职业-33)
 * @property {number} overflowBarrier a heal beyond its maximum HP becomes its 屏障, at most this share of its maximum HP (职业-33)
 * @property {{ max: number, mods: Record<string, number> } | null} sameTarget a step of `mods` for each attack on the same target
 *   as its last, at most `max`, gone for another target (职业-34)
 * @property {string} skipStatus its attack leaves enemies under this status alone (职业-34)
 * @property {{ seconds: number, mods: Record<string, number> } | null} attackerMods an enemy whose attack hit it gets `mods` for
 *   `seconds` (职业-34)
 * @property {number} hitStatusPlus seconds more of its trait's 停顿 (职业-34)
 * @property {number} energyScale × its stored energy's damage (职业-34)
 * @property {{ max: number, mods: Record<string, number> } | null} kindStack a step of `mods` for each kind of enemy it killed since
 *   its deployment, at most `max` (职业-34)
 * @property {boolean} slainKinds its seat keeps the kinds of enemy its card killed (职业-34)
 * @property {{ scale: number, cold: number } | null} skillStrike as its skill starts, physical damage and 寒冷 on its first target (职业-34)
 * @property {{ max: number, mods: Record<string, number>, stun: number } | null} spendBoost as it spends cost, a step of `mods` (at
 *   most `max`) and 晕眩 on the ground enemies in its range (职业-34)
 * @property {{ base: number, after: number, max: number } | null} stayVuln the enemies in its range take × `base`, × `max` once they
 *   stayed `after` seconds (职业-34)
 * @property {{ hits: number, gap: number, max: number, mods: Record<string, number> } | null} combo outside its skill, a step of `mods`
 *   for each `hits` hits less than `gap` seconds apart, at most `max` (职业-34)
 * @property {{ seconds: number, sp: number } | null} nonLethal its hits do not kill an enemy, leaving it 重伤 for `seconds`, its
 *   killer to gain `sp` (职业-34)
 * @property {number} chargedRider at its full charge, each hit of its also deals physical damage of this share of its attack (职业-34)
 * @property {{ power: string, vs: VsScale[] } | null} fieldVs while it is on the field, these 倍率 for the operators of the faction (职业-35)
 * @property {{ count: number, scale: number } | null} powerAttacks after its first skill start of a deployment, its next `count`
 *   attacks × `scale` on their 攻击倍率 (职业-35)
 * @property {{ after: number, scale: number, fragile: { value: number, seconds: number } } | null} timedBlast `after` seconds from
 *   its deployment, physical damage and 脆弱 on the enemies around it, then it retreats (职业-35)
 * @property {{ cost: number, sleep: number } | null} firstBlock the first enemy it blocks gives `cost` and sleeps (职业-35)
 * @property {Record<string, number>} bb the trait's blackboard, for its behaviour
 */
/**
 * A buff a talent gives the field (职业-32): for the units that are melee (近战位 or both), block at least `minBlock`, are
 * of the rarity, have an ammo skill, are of the profession, the faction or one of `powers`, have more than `hpAbove`
 * of their maximum HP; with `needOther`, only while another operator of the profession is on the field; × `afterMul`
 * once the holder has been on the field `after` seconds; × the `double`'s `mul` for a unit of its faction.
 * @typedef {{ mods: Record<string, number>, flags?: Record<string, boolean>, melee?: boolean, minBlock?: number, rarity?: number, ammo?: boolean,
 *   profession?: string, power?: string, powers?: string[], hpAbove?: number, needOther?: boolean, after?: number, afterMul?: number,
 *   double?: { power: string, mul: number }, during?: number }} FieldBuff
 */
/**
 * A gain a talent shares (职业-32): `mods` for `count` operators (not summons) on the field of the profession or faction,
 * with an ammo skill, in the holder's range — each as asked —, chosen at random as the holder is deployed or after
 * `after` seconds, the ones left for operators that arrive later; the holder too once it has shared with one (`self`).
 * @typedef {{ mods: Record<string, number>, count: number, profession?: string, power?: string, ammo?: boolean, inRange?: boolean, self?: boolean,
 *   after?: number }} ShareGain
 */
/**
 * A cut of deploy cost by a talent (部署-10, 职业-30): `value` added to the cost of the cards of a profession or faction —
 * of its holder's seat while it is in the deck, only until one of them is deployed with `first`; any seat's while it is on
 * the field with `field`.
 * @typedef {{ value: number, first?: boolean, field?: boolean } & ({ profession: string } | { power: string })} CostCut
 */
/**
 * SP a talent gives on deployments (职业-30): `sp` to its holder as it is deployed (`self`; only the first time with
 * `first`), to the operators of `profession` on the field as it is (`field`), or to those that arrive while it is on the
 * field (`arriving`).
 * @typedef {{ who: 'self' | 'field' | 'arriving', sp: number, first?: boolean, profession?: string }} DeploySp
 */
/**
 * What an attack gets as it starts (干员-24, 职业-26): after `value` seconds without attacking (`idle`; with `fresh`, also
 * before the first attack since its deployment), or while a dodge is not yet spent (`dodged`, one spent for the attack):
 * × `scale` on its 倍率, + `atk` attack for it (直接乘算), its stun of `stun` seconds on each hit, × `times` its hits, all the
 * enemies it blocks as its targets (`blocked`).
 * @typedef {{ when: 'idle' | 'dodged', value?: number, fresh?: boolean, scale?: number, atk?: number, stun?: number, times?: number, blocked?: boolean }} NextAttack
 */
/**
 * A talent's steps (干员-20, 职业-25): for its kills (its summons' too with `summons`) or the damage it deals (physical
 * only with `phys`), a step every `every` of them (1 by default), at most `max` steps, each with `mods`; the steps last
 * `seconds` from the last one when it has them; for an enemy's burst of `el` in its attack range (`burst`, 职业-29).
 * @typedef {{ on: 'kill' | 'dealt' | 'burst' | 'status', mods: Record<string, number>, max: number, every?: number, seconds?: number, phys?: boolean, summons?: boolean, el?: string,
 *   shared?: boolean, status?: string }} TalentStack
 */
/**
 * SP a talent gives on an event (干员-21, 职业-25): `sp` to the operator — or, on a heal, to the one healed —, `other`
 * to another unit at random; `share` of the skill's cost at the chance `prob` when its skill ends, or a heal of `heal` of
 * its maximum HP; for its kills during its skill, `sp` each at its end, at most `max`; `sp` at the end of the first skill it
 * starts in the battle (`firstSkillEnd`, 职业-30); `sp` at the chance `prob` for a hit that took HP (`dealt`, 职业-31).
 * @typedef {{ on: 'attack' | 'kill' | 'heal' | 'enemyDown' | 'allyDown' | 'attacked' | 'skillEnd' | 'skillKills' | 'firstSkillEnd' | 'dealt', sp?: number, other?: number,
 *   prob?: number, share?: number, max?: number, heal?: number }} TalentSp
 */
/**
 * What a hit of an operator's attack gives the target by a talent (干员-19, 职业-24): a status (with its strength), or
 * modifiers for some seconds, or arts damage each second for some seconds (`amount`, or `scale` × the attack: 职业-25);
 * at the chance `prob` when it has one; only on the first hit on each enemy with `first`; only on a target blocked by no
 * unit with `when` 'unblocked'.
 * @typedef {{ status?: { key: import('./status.js').StatusKey, seconds: number, value?: number }, debuff?: { seconds: number, mods: Record<string, number> },
 *   dot?: { amount?: number, scale?: number, seconds: number }, prob?: number, first?: boolean, when?: 'unblocked' | 'beyondRange', during?: number,
 *   ep?: { el: string, amount: number } }} TalentHit
 */
/**
 * Modifiers or flags an operator's trait gives other units (职业-20): the enemies it blocks (`blocked`), those its own
 * summons block (`summonBlocked`), those with a tile in its attack range (`range`), the operator on the tile in front of
 * it (`frontAlly`), its own summons (`summons`), the operators with a tile in its attack range (`rangeAllies`) — a buff on
 * each while they are so; `skill`: only while its skill runs; from talents, every enemy any unit blocks (`blockedAll`, 职业-25).
 * @typedef {{ to: 'blocked' | 'summonBlocked' | 'range' | 'frontAlly' | 'summons' | 'rangeAllies' | 'blockedAll', skill?: boolean, mods?: Record<string, number>,
 *   flags?: Record<string, boolean> }} ModuleAura
 */
/**
 * A trait's modifiers while a condition on the operator holds (职业-18): it blocks an enemy (`blocking`) or none
 * (`notBlocking`); its HP is above or below `value` of its maximum (`hpAbove`, `hpBelow`); at least `value` enemies are in
 * its own attack range (`enemies`), or ground ones (`groundEnemies`), or an elite or leader is (`eliteEnemies`), or one in
 * an element burst (`burstEnemies`); at least `value` other operators are in it (`allies`), or a wounded friendly unit
 * (`injuredAllies`), or one with element damage (`epAllies`), or another operator whose skill runs (`skillAllies`); no
 * other operator stands on the 4 tiles next to it (`alone4`) or the 8 around it (`alone8`); it holds stored attack energy
 * (`energy`); its skill runs (`inSkill`); a 炼金单元 it threw is on the field (`alchemy`, 技能-13); always (`always`). The
 * buff may carry flags too. From talents (职业-24): it blocks at least `value` enemies (`blockingAtLeast`); an enemy below
 * `value` of its maximum HP is in its range (`lowHpEnemies`); `burstEnemies` of the element `el` only; no enemy on the 4
 * tiles next to it (`noEnemies4`) or exactly one (`soleEnemy4`); no other friendly unit, summons too, on them
 * (`aloneUnits4`); its skill does not run (`notInSkill`); it has killed no enemy since its deployment (`noKills`); its skill
 * has started fewer than `value` times since its deployment (`fewStarts`), or runs a second time or later (`laterSkill`).
 * With `per`, an `enemies` part's modifiers are × the enemies in its own range, at most `per` (职业-25). In time (职业-26):
 * no attack of its ended for `value` seconds (`idle`), no hit took its HP (`unhurt`), no hit's 伤判 began on it (`calm`) —
 * the deployment counting as such an event, or not with `fresh` —; at least `value` 高台 tiles are behind it and at its
 * sides (`highSide`); at least `value` operators on the field, summons left out (`fieldOps`, 职业-29); it is on the field
 * for its first time (`firstDeploy`, 职业-30). From 职业-31: its HP is at least `value` of its maximum (`hpNotBelow`); no hit
 * took its HP since its deployment (`neverHurt`); a 隐匿 enemy is in its own range (`stealthEnemies`); its skill runs or
 * ended less than `value` seconds ago (`skillOrAfter`); its skill does not run and has at most `value` of its SP cap
 * (`lowSp`); at least `value` enemies, or fewer, stand on its tile and the 8 around it (`enemiesNear`, `fewEnemiesNear`).
 * From 职业-32: another operator of the faction `power` — or only others — on a tile of its range or its summons'
 * (`rangeAlly`, `rangeAllyOnly`); at least `value` friendly units on the 8 tiles around it (`alliesNear`); at least
 * `value` enemies blocked beyond the first (`blockedExtra`); at least `value` operators of the faction on the field
 * (`powerOnField`); at least `value` of the 4 tiles next to it 高地 (`highAround`); the map has water, or not
 * (`waterMap`, `noWaterMap`); on the field for `value` seconds (`onFieldFor`). With `per`, `alliesNear`, `blockedExtra`
 * and `powerOnField` count those.
 * @typedef {{ when: 'blocking' | 'notBlocking' | 'hpAbove' | 'hpBelow' | 'enemies' | 'groundEnemies' | 'eliteEnemies' | 'burstEnemies'
 *   | 'allies' | 'injuredAllies' | 'epAllies' | 'skillAllies' | 'alone4' | 'alone8' | 'energy' | 'always' | 'inSkill' | 'alchemy'
 *   | 'blockingAtLeast' | 'lowHpEnemies' | 'noEnemies4' | 'soleEnemy4' | 'aloneUnits4' | 'notInSkill' | 'noKills' | 'fewStarts' | 'laterSkill'
 *   | 'idle' | 'unhurt' | 'calm' | 'highSide' | 'fieldOps' | 'firstDeploy' | 'hpNotBelow' | 'neverHurt' | 'stealthEnemies' | 'skillOrAfter' | 'lowSp'
 *   | 'enemiesNear' | 'fewEnemiesNear' | 'rangeAlly' | 'rangeAllyOnly' | 'alliesNear' | 'blockedExtra' | 'powerOnField' | 'highAround' | 'waterMap' | 'noWaterMap'
 *   | 'onFieldFor' | 'liftoff' | 'grounded',
 *   value?: number, el?: string, power?: string, per?: number, fresh?: boolean, mods: Record<string, number>, flags?: Record<string, boolean> }} WhileMods
 */
/**
 * A trait's 倍率 against a target (职业-17): × `atk` on a hit's attack 倍率 (before the target's 防御), × `dmg` on its 伤害倍率,
 * × `heal` on a heal, while the target is blocked or blocks a unit (`blocked`), flies (`flying`), is on the ground while
 * the operator's skill runs (`skillGround`), has less than `value` of its maximum HP (`hpBelow`), has a 重量等级 of at least
 * `value` (`heavy`), stands on the line of tiles straight in front of the operator (`front`), on its tile or the 8 around
 * (`near`), is in an element burst (`burst`), stands on a ground tile (`onGround`), or the hit is the skill's (`skill`);
 * `noDodge`: such a physical hit cannot be dodged; × `ep` on the 元素损伤 it deals the target, an elite or leader (`elite`).
 * From talents (职业-24): the target is blocked by no unit (`unblocked`), not by the operator (`notOwnBlocked`), has more
 * than `value` of its maximum HP (`hpAbove`), a 重量等级 of at most `value` (`light`), the tag `tag` (`tag`), a ranged
 * attack (`rangedFoe`), the status `status` (`status`); `defFlat`, `defPct` more 无视防御 for the hit. From talents on the
 * enemies (职业-28): the target has a 可抵抗 status (`abnormal`), full HP (`hpFull`), stands still (`still`), any status of
 * `statuses` (`statusAny`), or the operator's record has not met it yet (`first`, the 非首次标记 `seen`); `on` which
 * damage counts ('attack' a hit of an attack, 'damage' any but a rider's); after the hit: `inflict` a status, `steal`
 * 攻击力 (`atk`, at most `max` in all), `sp`, a `mark` for `seconds` (the operator's later damage × `dmg`, or arts damage of
 * `arts` × its attack), arts damage of `arts` × its attack (at once, or a moment `later`). From talents on elements (职业-29):
 * the target is in the burst of `el` (`burstOf`); `post` its condition checked after the hit; after the hit elemental
 * damage of `burstDot` × the attack each second while that burst lasts, or 元素损伤 over time `epDot`.
 * @typedef {{ when: 'blocked' | 'flying' | 'skillGround' | 'hpBelow' | 'heavy' | 'front' | 'near' | 'burst' | 'onGround' | 'skill' | 'elite'
 *   | 'unblocked' | 'notOwnBlocked' | 'hpAbove' | 'light' | 'tag' | 'rangedFoe' | 'status' | 'abnormal' | 'hpFull' | 'still' | 'statusAny' | 'first' | 'burstOf' | 'slainKind' | 'hpRatioAtMostOwn',
 *   atk?: number, dmg?: number, heal?: number, ep?: number, value?: number, noDodge?: boolean, tag?: string, status?: string, defFlat?: number, defPct?: number,
 *   statuses?: string[], seen?: string, on?: 'attack' | 'damage', inflict?: { key: string, seconds: number }, steal?: { atk: number, max: number }, sp?: number,
 *   mark?: { seconds: number, dmg?: number, arts?: number }, arts?: number, later?: boolean,
 *   el?: string, post?: boolean, burstDot?: number, epDot?: { el: string, scale: number, seconds: number } }} VsScale
 */
/**
 * A chain (职业-11): at most `max` targets in all, each jump at `scale` × the one before; a damage chain jumps to the
 * nearest enemy within `radius`, a heal chain to an operator among `cells` around the current target.
 * @typedef {{ max: number, scale: number, radius: number, cells: Cell[] | null }} Chain
 */
/**
 * A splash (职业-8): every other enemy within `radius` tiles of the target (only those on the ground when `ground`)
 * takes the hit at `scale` of its amount. `side` `friendly` (an enemy's, 敌能-43) hits operators, neutral units and our
 * devices instead.
 * @typedef {{ radius: number, scale: number, ground: boolean, side?: 'friendly' }} Splash
 */
/**
 * An operator: `branch` is its profession branch (subProfessionId), `trait` the branch's trait (职业-1), `respawnTime`
 * its 再部署时间 in seconds (部署-3; default 60), `talentBb` the blackboard of its always-on talents and `talentMods` the
 * modifiers of their effects (部署-4), `talentTrait` what its talents add to its trait (职业-24),
 * `fieldTalents` its talents for every operator of a profession or faction while it is on the field (部署-5), `fieldAspd`
 * the attack speed it gives every friendly unit (`ally`) and every enemy (`enemy`) while on the field, those on a straight
 * road of at least `cnt` passable ground tiles `allyExtra`, `enemyExtra` more (部署-5), `powers`
 * its factions, `rangeTalents` its talents for the units in its attack range while it is on the field (部署-6),
 * `critTalents` its chances to strike harder (攻击-4), `timedTalents` its talents in time on the field (部署-7),
 * `deployTalents` what its talents do at its deployment (部署-8); from its seat's runes, `runeMods` its always-on buff
 * (符文-3), `probSp` its chances of SP on dealing damage (符文-4), `rangeSp` the SP it gives in its attack range (符文-5); a
 * carried unit's record (符文-6) what its deployment does (`carried`, 装置-6). A summon's record names its owner's key (`summoner`)
 * and how its card works (`summon`, 召唤-3, 召唤-4); `position` ALL lets it stand on melee and ranged tiles. An operator a mod
 * adds names the official operator whose figure and voice it has (`look`, mod-11).
 * @typedef {OptionalStats & { name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number,
 *   range: Cell[], skill?: SkillDef, branch?: string, profession?: string, rarity?: number, trait?: Partial<TraitDef>, respawnTime?: number, char?: string, look?: string,
 *   talentBb?: Record<string, number>, talentMods?: Record<string, number>, talentTrait?: Partial<TraitDef>, fieldTalents?: TeamTalent[], fieldAspd?: { ally: number, enemy: number, cnt: number, allyExtra: number, enemyExtra: number },
 *   powers?: string[], rangeTalents?: RangeTalent[],
 *   critTalents?: CritTalent[], timedTalents?: TimedTalent[], deployTalents?: DeployTalent[], summoner?: string, summon?: SummonDef,
 *   runeMods?: Record<string, number>, probSp?: { prob: number, sp: number }[], rangeSp?: { sp: number, interval: number }, carried?: CarriedEffect, builder?: BuilderDef }} OperatorDef
 */
/**
 * A summon's card rules (召唤-3, 召唤-4): its limits on the field and held, what its owner's deployment adds (0: no card),
 * whether it takes a place in the deploy limit (部署占用数), its 再部署策略, whether it stays when its owner leaves (召唤-5),
 * whether it may only stand in its owner's attack range, the copies its owner's skill gives at its start or end (召唤-8),
 * the seconds it stays (召唤-9), what its owner's skill's end does to it (召唤-10), and for a tactical point the seconds
 * of its point form and its block bonus in its summon form (召唤-11). `device` is set only when the page's 实体类型 is
 * 装置 (敌能-54); a summon that is merely unattacked does not have it.
 * @typedef {{ deployLimit: number, holdLimit: number, supply: number, occupy: number, respawn: 'default' | 'unique' | 'queue', stays?: boolean,
 *   ownerRange?: boolean, grant?: { n: number, at: 'start' | 'end' }, life?: number, skillEnd?: { recover: boolean, below?: number },
 *   tactical?: { every: number, block: number }, device?: boolean }} SummonDef
 */
/**
 * A deployment talent (部署-8): SP between `sp[0]` and below `sp[1]`, a heal of every operator (`value` HP or `scale` × the
 * attack), shield layers. `break` is what each broken layer does (干员-14): stacked `mods`, at most `max`, and `sp`.
 * @typedef {{ sp?: [number, number], heal?: { value: number } | { scale: number }, shield?: number,
 *   break?: { mods?: { atkPct?: number, defPct?: number }, max?: number, sp?: number } }} DeployTalent
 */
/**
 * What a carried unit's deployment does (装置-6): for every operator on the field then, modifiers (`allyMods`) or a
 * barrier for `seconds`; damage to every enemy; every redeploying operator card ready; and a spray of SP — `shots`
 * times, one every `every` seconds, `sp` to each of up to `targets` operators on the field at random.
 * @typedef {{ seconds?: number, allyMods?: Record<string, number>, barrier?: number, enemyDamage?: { type: 'phys' | 'arts', amount: number }, readyCards?: boolean,
 *   spray?: { shots: number, every: number, targets: number, sp: number } }} CarriedEffect
 */
/**
 * A timed talent (部署-7): from deployment, a step of `mods` every `seconds` up to `max` steps ('stack'), the mods once
 * after `seconds` ('after'), or the mods for `seconds` ('during').
 * @typedef {{ kind: 'stack' | 'after' | 'during', seconds: number, max: number, mods: Record<string, number> }} TimedTalent
 */
/**
 * A chance talent (攻击-4): on each attack, with chance `prob`, the attack's 倍率 × `scale`, and maybe a stun of `stun`
 * seconds on each hit and `more` targets, `atk` more attack (直接乘算) for that attack, `ignoreDef` of the targets' 防御
 * ignored, × `times` hits. `front`: while the primary target's centre lies on those tiles, the chance is `front.prob` (干员-12).
 * @typedef {{ prob: number, scale: number, stun?: number, more?: number, atk?: number, ignoreDef?: number, times?: number, skillProb?: number,
 *   front?: { tiles: number, prob: number },
 *   pick?: { times?: number, stun?: number, ignoreDef?: number }[], grow?: { power: string, step: number, max: number }, ammoProb?: number, sp?: number }} CritTalent
 */
/**
 * An in-range talent (部署-6): modifiers for the enemies, or the (ranged, melee, of a profession) operators, in the
 * holder's attack range — or on the tiles of `area` around it, turned with it with `rotate` —, those for which `when`
 * holds when it has one; not the holder with `others`; only while `srcWhen` holds on the holder (职业-32).
 * @typedef {{ side: 'enemy' | 'ally', ranged: boolean, mods: Record<string, number>, melee?: boolean, profession?: string, professions?: string[], area?: Cell[],
 *   rotate?: boolean, others?: boolean, srcWhen?: WhileMods['when'], flags?: Record<string, boolean>, during?: number,
 *   when?: { when: 'hpBelow' | 'hpAbove' | 'blocked' | 'normal' | 'flying' | 'epHalf' | 'hpRatioAtMostSrc' | 'sameDir' | 'maxHpHighest' | 'sluggish' | 'coldOnly' | 'frozen', value?: number } }} RangeTalent
 */
/**
 * A team talent (部署-5): for the operators of a profession, of one of several (`professions`), of a faction, or every
 * friendly unit (`all`), its blackboard and the modifiers of its effects; `max`: of several such talents, the strongest
 * (同类效果取最高); `skill`: only while its holder's skill runs (true) or does not (false); `after`: only once its holder has
 * been on the field that many seconds.
 * @typedef {({ profession: string } | { professions: string[] } | { power: string } | { all: true })
 *   & { bb: Record<string, number>, mods?: Record<string, number>, max?: boolean, skill?: boolean, after?: number, maxCost?: number }} TeamTalent
 */
/**
 * Behaviours by key (ADR 0054, 0055): what a skill or a buff does beyond its data. Content brings them; the default is
 * the generic one (技能-5). `world` sets up a new world's hooks and timers (钩子-4).
 * @typedef {{ skills?: Record<string, import('./skills.js').SkillBehavior>, buffs?: Record<string, import('./buffs.js').Behavior>, traits?: Record<string, import('./traits.js').TraitBehavior>,
 *   foes?: Record<string, import('./foes.js').FoeBehavior>, world?: (w: World, c: Content) => void }} Behaviors
 */
/**
 * The content of a battle: the level, enemies, operators, behaviours, and each seat's deck of operator keys when the
 * match gives them (同步-9; none: every operator for every seat), the kits it uses (兼容-6) and the mods it is made
 * with (mod-8).
 * @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef>, devices?: Record<string, DeviceDef>, behaviors?: Behaviors, decks?: string[][],
 *   kits?: { sha: string, used: string[] }, mods?: { id: string, version: string, sha: string }[] }} Content
 */

/**
 * A unit's base attributes (属性-1): the values its stats start from, with the Stronghold names; anything missing takes
 * the default in attrs.js ATTRS. `motion`, `immune` and `dmgType` are fixed facts of the unit.
 * @typedef {object} Base
 * @property {number} maxHp
 * @property {number} atk
 * @property {number} def
 * @property {number} res
 * @property {number} aspd
 * @property {number} bat attack interval in seconds (baseAttackTime)
 * @property {number} blockCnt
 * @property {number} moveSpeed
 * @property {number} tauntLevel
 * @property {number} massLevel
 * @property {number} epDamageResistance
 * @property {number} epResistance
 * @property {string} motion WALK or FLY
 * @property {string[]} immune
 * @property {DamageType} dmgType
 * @property {number} rangeRadius an enemy's attack radius in tiles, 0 for melee
 * @property {string} applyWay MELEE or RANGED
 * @property {number} maxEp maximum element value (元素-1)
 * @property {boolean} shared a 共同敌手 (合作-2)
 * @property {string} levelType NORMAL, ELITE or BOSS (领袖, 合作-7)
 * @property {boolean} neutral a neutral unit (合作-9)
 * @property {number} deathLife the lives a neutral unit costs when knocked down (合作-9)
 * @property {number} lifeCost the lives an enemy costs at the goal (目标-1: lifePointReduce, default 1)
 * @property {boolean} [hostile] a device on the enemies' side (装置-3)
 */

/**
 * A buff (状态-1): plain data. Its behaviour, if any, is looked up by key, never stored.
 * @typedef {object} Buff
 * @property {string} key
 * @property {number} src the id of the unit that gave it, −1 for none
 * @property {'queue' | 'max' | 'stack' | 'extend' | 'independent'} rule how buffs of the same key combine (状态-2)
 * @property {number} value its strength, for rule "max"
 * @property {Record<string, number>} mods
 * @property {Record<string, boolean>} flags
 * @property {number} stacks
 * @property {number} maxStacks
 * @property {number} left frames left, −1 for no end (may be fractional: 状态-3)
 * @property {number} every frames between triggers, 0 for none (状态-4)
 * @property {number} acc progress towards the next trigger
 * @property {boolean} fixed triggers ignore the decay rate
 * @property {boolean} resist a resistible status (可抵抗状态)
 * @property {number} decay its own decay multiplier (2 for 浮空 or 缚地 on a unit heavier than 3)
 * @property {number} prio event priority in the damage step (伤害-8)
 * @property {number} shield barrier (屏障) left
 * @property {number} shieldHits shield (护盾) layers left
 * @property {string} shieldType the damage type it absorbs, "" for every type, or several joined by "+" (伤害-8)
 * @property {number} n a counter its behaviour keeps (麻痹's decay, 狂躁's damage)
 * @property {string} tag marks a buff a behaviour made, to find it again ("" for none)
 * @property {string} act the key its behaviour is found by, "" for its own key (状态-1)
 * @property {number} [restore] frames until this source of 隐匿 returns after the enemy is released (索敌-2); absent is 90, and 0 is at once
 */

/**
 * A unit on the field. Operators have a range and attack; enemies have a route and a leg (the waypoint they head for).
 * @typedef {object} Unit
 * @property {number} id
 * @property {number} kind 0 operator, 1 enemy (schema KIND)
 * @property {string} key the content id
 * @property {number} owner the player index of an operator, −1 for enemies
 * @property {number} x column (tile coordinates)
 * @property {number} y row
 * @property {number} z height level of the tile
 * @property {import('./dir.js').Dir} dir facing (spec 方向-1)
 * @property {Base} base
 * @property {Buff[]} buffs in acquisition order
 * @property {number} hp
 * @property {number} maxHp the maximum HP last computed (属性-4)
 * @property {number} atkCd frames until the next attack may start
 * @property {number} blockedBy the id of the unit blocking this one, −1 for none
 * @property {number} blockedAt the frame it was blocked in, −1 when not blocked
 * @property {number} born the frame the unit was created in
 * @property {number} bornN its place among the units created in that frame, from 1 (索敌-5)
 * @property {number} route index into the level's routes, −1 for operators
 * @property {number} leg index of the enemy's current leg of its route (路线-1)
 * @property {number[]} path the planned points of its current move leg, flat [x, y, …]; empty until planned (路线-2)
 * @property {number} pt index of the point of `path` it heads for
 * @property {number} wait frames left in its current wait, −1 when not waiting
 * @property {boolean} hidden it has disappeared (路线-4)
 * @property {number} frag the frame its spawn's fragment began
 * @property {number} wave the wave that must wait for it to be handled (波次-3), −1 for none
 * @property {boolean} [unharmful] it costs no life at the goal (目标-1)
 * @property {Record<string, number>} ab an enemy's ability state (敌能-2): cooldowns, marks, what it saw last turn;
 *   `@taken` counts accepted hits once an ability of its asks (敌能-38); absent otherwise, and never on an operator
 * @property {SkillState | null} skill its skill, null when it has none (技能-1)
 * @property {Record<string, number>} ep element values below their maximum, by element (元素-1); none recorded is at its maximum
 * @property {number} paid the cost its deployment took, 0 for enemies (撤退-1)
 * @property {string} [alias] a device's predefined unit (装置-1)
 * @property {Cell[]} [range] an operator's own attack range when content changed it, over its record's (攻击-1)
 * @property {number[]} [reachExtra] extra tile keys content gave an operator's attack (攻击-1)
 * @property {Swing | null} swing the attack it is in the wind-up of, null for none (攻击-2)
 * @property {{ vx: number, vy: number, hard: number, pull?: { x: number, y: number, bx: number, by: number, f: number, x0: number, left: number, stop: boolean,
 *   trauma?: { per: number, every: number, src: number, moved: number, frames: number } } }} [slide]
 *   its 失衡 slide: speed (tiles/s) and 硬直 frames left (位移-3); a pull on it — its point, its puller's centre, its force,
 *   the distance it began at, its frames left, whether it stopped (位移-4). A 静态刚体 keeps vx and vy at 0 and drops the
 *   slide when the force ends (位移-5)
 * @property {number} anim schema ANIM
 * @property {Drift} [drift] 恐惧 / 诱导 movement, present once either has been applied (状态-10, 状态-11)
 * @property {number} [summoner] the id of the unit that summoned it (召唤-4, 召唤-6); left out for others
 * @property {number} [expires] the frame a summon with a time leaves at (召唤-9); left out for others
 * @property {{ level: number, top: number, pts: number }} [fac] a facility's level, highest level reached and progress (守御-3)
 * @property {{ hits: number, next: number, leave: number }} [bld] a builder's hits, the frame of its next and the frame it leaves at (守御-4)
 */

/**
 * An attack under way (攻击-2): frames until it lands, frames since it began, the ids of its locked targets, its mods;
 * a channel's hits still to come (敌能-6).
 * @typedef {{ wind: number, since: number, targets: number[], mods: import('./skills.js').AttackMods, left?: number, now?: boolean, free?: boolean }} Swing
 */
/**
 * 恐惧 / 诱导 movement kept on the enemy (状态-10, 状态-11), so a snapshot restores the same frames. `way` is the
 * temporary path as flat [x, y, …]; `head` is the point it walks toward. `marks` are attract targets in application
 * order, `n` matching the buff's counter. `placed` is 1 after a frame of this movement has recorded `seenX`/`seenY`.
 * @typedef {object} Drift
 * @property {number} fearSeq how many fears have been applied
 * @property {number} seenSeq the application the tile list was built for
 * @property {number} fearN fear buffs seen at the end of the last fear frame
 * @property {number} self 1 when the fear has no source or the source is the enemy
 * @property {number} hx hit position when the latest fear was applied
 * @property {number} hy
 * @property {number} srcX effect-source position then
 * @property {number} srcY
 * @property {number[]} tiles reachable tile keys, with too-far picks already removed
 * @property {number} aim checkpoint tile key, −1 when there is none
 * @property {number} ax checkpoint x
 * @property {number} ay checkpoint y
 * @property {number[]} way
 * @property {number} head
 * @property {number} placed
 * @property {number} seenX position at the end of the last induced frame
 * @property {number} seenY
 * @property {string} stamp grid stamp that path was planned against
 * @property {string} mode 'fear', 'attract', or ''
 * @property {number} nextMark next attract mark id
 * @property {number} attractN mark id the path currently aims at
 * @property {{ n: number, src: number, x: number, y: number, fixed: number }[]} marks
 */
/**
 * A delayed explosion (敌能-3): where, how far it reaches, frames left, whether it reaches flying units, its source's id
 * (−1 for none), what it does. `buff`, when set, is given to each unit the explosion hits that is still on the field
 * (敌能-43). Left out otherwise: a null field would change the hash of every blast that has none.
 * @typedef {{ x: number, y: number, radius: number, left: number, air: boolean, src: number, type: DamageType, amount: number,
 *   status: { key: string, seconds: number } | null, buff?: import('./buffs.js').BuffInit }} Blast
 */
/**
 * A 直击 bolt in flight (敌能-4): its source's id, where it is, its direction, what it does — or the radius of the
 * explosion it sets off (0 for none).
 * @typedef {{ src: number, x: number, y: number, dx: number, dy: number, type: DamageType, amount: number, status: { key: string, seconds: number } | null,
 *   blast: number }} Bolt
 */
/**
 * A zone that ticks once a second (污染秽蚀, 敌能-46; a 燃烧区域, 敌能-60): where its centre is, how far it reaches, the
 * true damage on 低地 and on 高地, whether it reaches flying units, ignores 无法选择 and 迷彩, and includes our devices.
 * A burn zone sets `arts` (flat arts each tick) and `pad` (added to the radius for the ally collider); 污染秽蚀 leaves
 * both off. Its source's id, the frame it was placed, frames until the next tick, frames of life left.
 * @typedef {{ x: number, y: number, radius: number, low: number, high: number, air: boolean, open: boolean, wide: boolean,
 *   src: number, placed: number, next: number, life: number, arts?: number, pad?: number }} Zone
 */
/**
 * An enemy another brings in after a delay (敌能-22): its key, where it appears, the route and leg it goes on with, the
 * frame its fragment began, the frames left.
 * @typedef {{ key: string, x: number, y: number, route: number, leg: number, frag: number, left: number }} Brood
 */

/**
 * A projectile in flight (攻击-3): its shooter's and its target's ids, where it is (tile coordinates), its speed in
 * tiles per second, and what it carries — the damage type and amount, hits, 元素损伤 ('' and 0 for none); a boomerang
 * (职业-12) its way back's speed and, on its way back, `ret` 1; `held` 1 while content holds it where it arrived.
 * @typedef {{ src: number, target: number, sx: number, sy: number, speed: number, type: DamageType, amount: number, times: number, element: string, ep: number,
 *   splash?: Splash | null, aftershock?: number, chain?: Chain | null, hitStatus?: { key: import('./status.js').StatusKey, seconds: number } | null,
 *   skill?: boolean, back?: number, ret?: number, held?: number, mark?: number, frozen?: number, ignoreDef?: number }} Shot
 */

/**
 * A unit's skill as it runs (技能-2…技能-4).
 * @typedef {object} SkillState
 * @property {string} id
 * @property {string} spType time, attack, hurt or none
 * @property {number} cost SP one use takes
 * @property {number} cap the most SP it holds: cost × charges
 * @property {number} sp whole points
 * @property {number} slot the 技力冷却槽's progress, in points
 * @property {boolean} active it is running (and blocks SP: 阻回)
 * @property {boolean} armed a next-attack skill waiting for its attack
 * @property {number} dur frames left of its duration, −1 for none
 * @property {number} ammo shots left of an ammo skill
 * @property {number} at the frame it started
 * @property {number} [spend] the deployment cost it takes to start (技能-10)
 * @property {boolean} [dollPending] set until this frame's flush when the skill has asked to switch to the 替身 (职业-15); absent otherwise, so a snapshot of a skill that never asked stays the same
 */

/**
 * An operator's card in a player's deck (部署-3): the 再部署惩罚 layers it has (0–2) and the frame it may be deployed
 * again from; `lock`, the enemy that devoured it (吞噬, 敌能-30) — locked while that enemy is on the field.
 * @typedef {{ penalty: number, ready: number, lock?: number, retreated?: boolean }} Card
 */
/**
 * A summon's card in a player's deck (召唤-4): copies held, the frame it may be deployed from, copies cooling (队列).
 * @typedef {{ held: number, ready: number, cooling: number }} SummonCard
 */
/**
 * A player: life, cost and its timer, the operators on the field, the deck's cards; `revive` is the frames left until a
 * down player comes back (−1 when not down), `downs` how often they went down (合作-4); `ask` the frames left of their
 * open cost request (−1 for none), `askCd` the frames until they may ask again (合作-5); its summons' cards, once one
 * has one (召唤-4); once talents give them (部署-10, 职业-30), the cut for its next operator (`cut`), the cuts on cards
 * (`cuts`), the cards whose first skill has started (`once`), its last operator deployed (`last`, 职业-31) and the kinds of
 * enemy each card killed (`slain`, 职业-34).
 * @typedef {{ life: number, cost: number, costTimer: number, deployed: string[], cards: Record<string, Card>, revive: number, downs: number,
 *   ask: number, askCd: number, summons?: Record<string, SummonCard>, cut?: number, cuts?: Record<string, number>, once?: string[], last?: string,
 *   slain?: Record<string, string[]> }} Player
 */

/**
 * The co-op stages' progress (合作-6, 合作-7): the current stage (−1 before the first), the frame its clock starts (after
 * its rest), whether it is running, its count (rescued, knocked down) and whether a leader left the field, the team's
 * stamps and the stages passed.
 * @typedef {{ index: number, start: number, running: boolean, count: number, died: boolean, stamps: number, passed: number }} StageState
 */

/**
 * The waves' progress (波次-2, 波次-3): the current wave (−1 before the first), its step — `pre` its preDelay, `frags`
 * its fragments, `hold` waiting for its enemies, `post` its postDelay, `done` all waves over — and the frame the step's
 * timing counts from; the current fragment, the frame it started (−1 while its preDelay runs) and how often each of its
 * actions has acted; the random alternatives chosen for the wave, as indices into its actions in order (波次-5).
 * @typedef {{ wave: number, step: 'pre' | 'frags' | 'hold' | 'post' | 'done', at: number, frag: number, fragAt: number, fired: number[],
 *   chosen: number[] }} Schedule
 */
/**
 * 堡垒守御's progress (守御-1, 守御-2, 守御-4, 守御-6): the phase — `defend`, `rest`, `go` (the rest over, the next wave
 * about to begin), `over` —, its wave (`round`), the frame the defence began and the frame the phase ends at, the last wave that
 * may begin; whether a player fell in this defence, the waves defended, the damage the last wave took; each seat's
 * 「休整完毕」 and builder cards; the rubble piles' guards to come and whether the advanced builder came this defence; the
 * enemies the wave spawns that it waits for and those of them gone from the field.
 * @typedef {{ phase: 'defend' | 'rest' | 'go' | 'over', round: number, start: number, until: number, next: number, fell: boolean, defended: number, damage: number,
 *   ready: boolean[], pools: Record<string, number>[], guards: { at: number, key: string, route: number }[], freed: boolean, total: number, out: number }} FortressState
 */

/**
 * @typedef {object} World
 * @property {number} frame frames done
 * @property {number} rng uint32 state (rng.js)
 * @property {number} nextId the next unit id
 * @property {Player[]} players
 * @property {Unit[]} units in creation order
 * @property {Schedule} sched where the waves are (波次-2)
 * @property {string[]} predefined the aliases of the predefined units in effect (波次-6)
 * @property {number} result the battle's result (结束-1): −1 going on, 0 lost, 1 won
 * @property {StageState} stage the co-op stages (合作-6)
 * @property {Blast[]} blasts delayed explosions (敌能-3)
 * @property {Bolt[]} bolts 直击 bolts in flight (敌能-4)
 * @property {Zone[]} [zones] areas that tick once a second (污染秽蚀 敌能-46, 燃烧区域 敌能-60), once there has been one
 * @property {Brood[]} [broods] enemies brought in that appear later (敌能-22), once there has been one
 * @property {number} bornThisFrame units created so far in this frame
 * @property {FortressState} [fortress] 堡垒守御's progress (守御-1), only in its levels
 * @property {Shot[]} shots projectiles in flight, in launch order (攻击-3)
 * @property {Alchemy[]} [alchemy] the 炼金单元 on the field (技能-13), once there has been one
 * @property {Record<string, string | number>[]} events this frame's presentation events (not part of the state)
 * @property {import('./bus.js').Bus} [bus] the hook bus and timers (钩子-1, 钩子-2; not part of the state)
 */

export {};
