(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BondCatCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAVE_VERSION = 9;
  const RESONANCE_SLICE_MS = 250;
  const RESONANCE_WINDOW_MS = 3000;
  const RESONANCE_CHARGE_MAX = 40;
  const RESONANCE_TIER_THRESHOLDS = [0, 2, 6, 10];
  const RESONANCE_SPEED_BONUSES = [0, 0.06, 0.12, 0.18];
  const FIRST_LIFE_EXPEDITION = [
    { id: 'trailhead', index: 0, minLevel: 1, maxLevel: 3, nextLevel: 4 },
    { id: 'echo-grove', index: 1, minLevel: 4, maxLevel: 6, nextLevel: 7 },
    { id: 'ruin-gate', index: 2, minLevel: 7, maxLevel: 10, nextLevel: 10 },
  ];
  const HEIRLOOM_EN_NAMES = {
    '布帽': 'Cloth Cap', '皮盔': 'Leather Helm', '铁盔': 'Iron Helm',
    '布衣': 'Cloth Tunic', '皮甲': 'Leather Armor', '板甲': 'Plate Armor',
    '布靴': 'Cloth Boots', '皮靴': 'Leather Boots', '银靴': 'Silver Boots',
    '木剑': 'Wooden Sword', '铁锤': 'Iron Hammer', '猎弓': 'Hunter Bow', '魔杖': 'Arcane Wand',
    '幸运符': 'Lucky Charm', '利爪项链': 'Claw Necklace', '魔力戒指': 'Arcane Ring',
    '九命结晶': 'Nine Lives Crystal',
  };

  const SET_BONUSES = {
    echo: {
      nameZh: '回响之歌',
      nameEn: 'Echo Song',
      two: { chargePerPulseBonus: 0.25 },
      three: { syncDamageBonus: 0.35, syncChain: true },
    },
    execution: {
      nameZh: '终结誓约',
      nameEn: 'Execution Oath',
      two: { executeThreshold: 0.30, executeDamageBonus: 0.30 },
      three: { executeThreshold: 0.40, syncExecute: true },
    },
    guardian: {
      nameZh: '九命守望',
      nameEn: 'Ninefold Guard',
      two: { damageReduction: 0.12, retreatThresholdBonus: 0.05 },
      three: { retreatRegenBonus: 0.75, guardPulse: true },
    },
  };

  const SKILL_DEFAULTS = {
    attack: 0,
    vitality: 0,
    greed: 0,
    luck: 0,
    resonance: 0,
    tempo: 0,
    sync: 0,
    execution: 0,
    guardian: 0,
    recovery: 0,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function createResonanceState(saved) {
    const source = saved && typeof saved === 'object' ? saved : {};
    const charge = clamp(source.charge, 0, RESONANCE_CHARGE_MAX);
    return {
      charge,
      skillReady: !!source.skillReady || charge >= RESONANCE_CHARGE_MAX,
      pulseTimes: Array.isArray(source.pulseTimes)
        ? source.pulseTimes.filter(Number.isFinite).slice(-16)
        : [],
      lastAcceptedAt: Number.isFinite(source.lastAcceptedAt) ? source.lastAcceptedAt : -Infinity,
    };
  }

  function prunePulseTimes(resonance, now) {
    const cutoff = now - RESONANCE_WINDOW_MS;
    resonance.pulseTimes = resonance.pulseTimes.filter(time => time > cutoff && time <= now);
    return resonance.pulseTimes;
  }

  function getResonanceTier(resonance, now) {
    const state = resonance || createResonanceState();
    const count = prunePulseTimes(state, Number.isFinite(now) ? now : 0).length;
    if (count >= RESONANCE_TIER_THRESHOLDS[3]) return 3;
    if (count >= RESONANCE_TIER_THRESHOLDS[2]) return 2;
    if (count >= RESONANCE_TIER_THRESHOLDS[1]) return 1;
    return 0;
  }

  function registerInputPulse(resonance, now, options) {
    const state = resonance || createResonanceState();
    const timestamp = Number.isFinite(now) ? now : 0;
    const opts = options || {};
    prunePulseTimes(state, timestamp);
    if (timestamp - state.lastAcceptedAt < RESONANCE_SLICE_MS) {
      return {
        accepted: false,
        tier: getResonanceTier(state, timestamp),
        charge: state.charge,
        skillReady: state.skillReady,
        pulseCount: state.pulseTimes.length,
      };
    }

    state.lastAcceptedAt = timestamp;
    state.pulseTimes.push(timestamp);
    prunePulseTimes(state, timestamp);
    const chargePerPulse = Math.max(0.1, Number(opts.chargePerPulse) || 1);
    state.charge = clamp(state.charge + chargePerPulse, 0, RESONANCE_CHARGE_MAX);
    if (state.charge >= RESONANCE_CHARGE_MAX) state.skillReady = true;
    return {
      accepted: true,
      tier: getResonanceTier(state, timestamp),
      charge: state.charge,
      skillReady: state.skillReady,
      pulseCount: state.pulseTimes.length,
    };
  }

  function consumeResonanceSkill(resonance) {
    if (!resonance || !resonance.skillReady) return false;
    resonance.charge = clamp(resonance.charge - RESONANCE_CHARGE_MAX, 0, RESONANCE_CHARGE_MAX);
    resonance.skillReady = resonance.charge >= RESONANCE_CHARGE_MAX;
    return true;
  }

  function getResonanceSpeedBonus(resonance, now) {
    return RESONANCE_SPEED_BONUSES[getResonanceTier(resonance, now)] || 0;
  }

  function getInputActionDuration(baseMs, resonance, now) {
    const base = Math.max(1, Number(baseMs) || 1);
    return base / (1 + getResonanceSpeedBonus(resonance, now));
  }

  function shouldSafeRetreat(context) {
    const input = context || {};
    const maxHp = Math.max(1, Number(input.maxHp) || 1);
    const hpRatio = clamp(input.hp, 0, maxHp) / maxHp;
    let threshold = 0.24 + clamp(input.retreatThresholdBonus, 0, 0.16);
    const heavyWithoutInput = (input.isBoss || input.isElite) && (Number(input.recentPulseCount) || 0) === 0;
    // 长时间停手时对重敌稍早休整，避免桌面陪伴角色被动死亡。
    if (heavyWithoutInput) threshold = Math.max(threshold, 0.35);
    return hpRatio <= threshold;
  }

  function getFirstLifeExpeditionStage(level, lifeNumber) {
    if (Math.max(1, Math.floor(Number(lifeNumber) || 1)) !== 1) return null;
    const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
    return FIRST_LIFE_EXPEDITION.find(stage => normalizedLevel >= stage.minLevel && normalizedLevel <= stage.maxLevel) || null;
  }

  function normalizeInventoryRules(rules) {
    const source = rules && typeof rules === 'object' ? rules : {};
    const maxRarity = Math.floor(Number(source.autoSalvageMaxRarity));
    return {
      autoSalvageMaxRarity: Number.isFinite(maxRarity) ? Math.max(-1, Math.min(2, maxRarity)) : -1,
      protectUpgraded: source.protectUpgraded === undefined ? true : !!source.protectUpgraded,
    };
  }

  function shouldAutoSalvageItem(item, rules) {
    if (!item || item.locked || item.heirloom) return false;
    const normalized = normalizeInventoryRules(rules);
    if (normalized.autoSalvageMaxRarity < 0) return false;
    if (normalized.protectUpgraded && Math.max(0, Math.floor(Number(item.upgradeLevel) || 0)) > 0) return false;
    return Math.floor(clamp(item.rarityIdx, 0, 4)) <= normalized.autoSalvageMaxRarity;
  }

  function aggregateSetBonuses(items, definitions) {
    const defs = definitions || SET_BONUSES;
    const counts = {};
    const effects = {};
    const active = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || !item.setId || !defs[item.setId]) continue;
      counts[item.setId] = (counts[item.setId] || 0) + 1;
    }
    for (const setId of Object.keys(counts)) {
      const count = counts[setId];
      const def = defs[setId];
      if (count >= 2) {
        mergeEffects(effects, def.two);
        active.push({ setId, pieces: 2 });
      }
      if (count >= 3) {
        mergeEffects(effects, def.three);
        active.push({ setId, pieces: 3 });
      }
    }
    return { counts, effects, active };
  }

  function mergeEffects(target, source) {
    for (const key of Object.keys(source || {})) {
      const value = source[key];
      if (typeof value === 'number') target[key] = (target[key] || 0) + value;
      else target[key] = target[key] || value;
    }
  }

  function migrateItem(item) {
    if (!item || typeof item !== 'object') return null;
    const migrated = { ...item };
    migrated.setId = typeof migrated.setId === 'string' ? migrated.setId : null;
    migrated.affixes = Array.isArray(migrated.affixes) ? migrated.affixes.map(affix => ({ ...affix })) : [];
    migrated.dmg = Math.max(0, Number.isFinite(Number(migrated.dmg)) ? Number(migrated.dmg) : 0);
    migrated.hp = Math.max(0, Number.isFinite(Number(migrated.hp)) ? Number(migrated.hp) : 0);
    migrated.upgradeLevel = Math.max(0, Math.floor(Number(migrated.upgradeLevel) || 0));
    migrated.rarityIdx = Math.floor(clamp(migrated.rarityIdx, 0, 4));
    migrated.locked = !!migrated.locked;
    return migrated;
  }

  function normalizeHeirloom(item) {
    const source = migrateItem(item);
    if (!source) return null;
    const behaviorAffix = source.affixes.find(affix => ['resonanceGain', 'execute', 'guardian'].includes(affix.key));
    return {
      id: 0,
      slot: source.slot,
      name: source.name,
      nameEn: source.nameEn,
      icon: source.icon,
      weaponType: source.weaponType,
      dmg: source.slot === 'weapon' ? clamp(source.dmg, 1, 4) : clamp(source.dmg, 0, 1),
      hp: source.slot === 'weapon' ? 0 : clamp(source.hp, 0, 12),
      rarityIdx: 1,
      upgradeLevel: 0,
      affixes: behaviorAffix ? [{ ...behaviorAffix, value: 5 }] : [],
      setId: source.setId,
      heirloom: true,
    };
  }

  function crystallizeNineLivesHeirloom(item, memoryEffects) {
    const source = normalizeHeirloom(item) || {
      id: 0,
      slot: 'accessory',
      name: '九命结晶',
      nameEn: 'Nine Lives Crystal',
      icon: '💍',
      weaponType: null,
      dmg: 0,
      hp: 8,
      rarityIdx: 1,
      upgradeLevel: 0,
      affixes: [],
      setId: 'guardian',
      heirloom: true,
    };
    const effects = {
      resonance: Math.max(0, Math.floor(Number(memoryEffects && memoryEffects.resonance) || 0)),
      strength: Math.max(0, Math.floor(Number(memoryEffects && memoryEffects.strength) || 0)),
      guardian: Math.max(0, Math.floor(Number(memoryEffects && memoryEffects.guardian) || 0)),
    };
    const englishBaseName = source.nameEn || HEIRLOOM_EN_NAMES[source.name] || 'Heirloom';
    return {
      ...source,
      id: 0,
      name: `九命·${source.name || '传家宝'}`,
      nameEn: `Nine Lives ${englishBaseName}`,
      rarityIdx: 4,
      upgradeLevel: 0,
      heirloom: true,
      finalHeirloom: true,
      crystals: effects,
      affixes: [
        { key: 'resonanceGain', value: 5 + effects.resonance * 2 },
        { key: 'atkBonus', value: 2 + effects.strength * 2 },
        { key: 'guardian', value: 5 + effects.guardian * 3 },
      ],
    };
  }

  function migrateFinalHeirloom(item) {
    const source = migrateItem(item);
    if (!source) return null;
    const crystals = source.crystals && typeof source.crystals === 'object' ? source.crystals : {};
    return {
      ...source,
      rarityIdx: 4,
      upgradeLevel: 0,
      heirloom: true,
      finalHeirloom: true,
      crystals: {
        resonance: Math.max(0, Math.floor(Number(crystals.resonance) || 0)),
        strength: Math.max(0, Math.floor(Number(crystals.strength) || 0)),
        guardian: Math.max(0, Math.floor(Number(crystals.guardian) || 0)),
      },
    };
  }

  function normalizeLifeMemoryRecord(record, fallbackLife) {
    if (!record || typeof record !== 'object') return null;
    const choiceId = ['resonance', 'strength', 'guardian'].includes(record.choiceId)
      ? record.choiceId
      : 'resonance';
    return {
      life: Math.floor(clamp(record.life || fallbackLife || 1, 1, 9)),
      choiceId,
      catName: typeof record.catName === 'string' && record.catName.trim() ? record.catName.trim().slice(0, 32) : 'BondCat',
      classId: typeof record.classId === 'string' ? record.classId : null,
      outfit: Math.max(0, Math.floor(Number(record.outfit) || 0)),
      level: Math.max(1, Math.floor(Number(record.level) || 1)),
      weaponName: typeof record.weaponName === 'string' ? record.weaponName.slice(0, 64) : '',
      keyLootName: typeof record.keyLootName === 'string' ? record.keyLootName.slice(0, 64) : '',
      setIds: Array.isArray(record.setIds)
        ? [...new Set(record.setIds.filter(id => typeof id === 'string'))].slice(0, 5)
        : [],
      recordedAt: Number.isFinite(Number(record.recordedAt)) ? Number(record.recordedAt) : 0,
    };
  }

  function createLifeMemoryRecord(input) {
    return normalizeLifeMemoryRecord(input, input && input.life);
  }

  function migrateState(saved, defaults) {
    const base = clone(defaults && typeof defaults === 'object' ? defaults : {}) || {};
    const source = saved && typeof saved === 'object' ? clone(saved) : {};
    const state = { ...base, ...source };
    state.saveVersion = SAVE_VERSION;
    state.skills = { ...SKILL_DEFAULTS, ...(base.skills || {}), ...(source.skills || {}) };
    state.prestigeBuffs = {
      atkStart: 0,
      goldRate: 0,
      critStart: 0,
      hpStart: 0,
      ...(base.prestigeBuffs || {}),
      ...(source.prestigeBuffs || {}),
    };
    state.equipment = {
      head: null,
      body: null,
      feet: null,
      weapon: null,
      accessory: null,
      ...(base.equipment || {}),
      ...(source.equipment || {}),
    };
    for (const slot of Object.keys(state.equipment)) state.equipment[slot] = migrateItem(state.equipment[slot]);
    state.inventory = (Array.isArray(source.inventory) ? source.inventory : (base.inventory || []))
      .map(migrateItem)
      .filter(Boolean);
    state.inventoryRules = normalizeInventoryRules(source.inventoryRules || base.inventoryRules);
    const savedBatch = source.lastInventoryBatch && typeof source.lastInventoryBatch === 'object'
      ? source.lastInventoryBatch
      : null;
    state.lastInventoryBatch = savedBatch
      ? {
          type: typeof savedBatch.type === 'string' ? savedBatch.type : 'auto-salvage',
          batchId: typeof savedBatch.batchId === 'string' && savedBatch.batchId ? savedBatch.batchId : `legacy-${Math.max(0, Number(savedBatch.createdAt) || 0)}`,
          items: (Array.isArray(savedBatch.items) ? savedBatch.items : []).map(migrateItem).filter(Boolean),
          goldDelta: Math.max(0, Math.floor(Number(savedBatch.goldDelta) || 0)),
          createdAt: Math.max(0, Number(savedBatch.createdAt) || 0),
          stage: Math.floor(clamp(savedBatch.stage === undefined ? -1 : savedBatch.stage, -1, 2)),
          undone: !!savedBatch.undone,
        }
      : null;
    state.expeditionClearedStages = [...new Set(
      (Array.isArray(source.expeditionClearedStages) ? source.expeditionClearedStages : [])
        .map(value => Math.floor(Number(value)))
        .filter(value => value === 0 || value === 1),
    )].sort();
    if ((Number(source.saveVersion) || 0) < SAVE_VERSION && Math.max(1, Math.floor(Number(state.lifeNumber) || 1)) === 1) {
      if (Number(state.level) >= 4 && !state.expeditionClearedStages.includes(0)) state.expeditionClearedStages.push(0);
      if (Number(state.level) >= 7 && !state.expeditionClearedStages.includes(1)) state.expeditionClearedStages.push(1);
      state.expeditionClearedStages.sort();
    }
    const stageStats = source.expeditionStageStats && typeof source.expeditionStageStats === 'object'
      ? source.expeditionStageStats
      : {};
    state.expeditionStageStats = {
      stage: getFirstLifeExpeditionStage(state.level, state.lifeNumber)?.index ?? -1,
      kills: Math.max(0, Math.floor(Number(stageStats.kills) || 0)),
      items: Math.max(0, Math.floor(Number(stageStats.items) || 0)),
      salvaged: Math.max(0, Math.floor(Number(stageStats.salvaged) || 0)),
      salvageGold: Math.max(0, Math.floor(Number(stageStats.salvageGold) || 0)),
    };
    state.lastLootSummary = source.lastLootSummary && typeof source.lastLootSummary === 'object'
      ? clone(source.lastLootSummary)
      : null;
    const resonance = createResonanceState(source.resonance || base.resonance);
    state.resonance = { charge: resonance.charge, skillReady: resonance.skillReady };
    state.nineLivesTimeline = (Array.isArray(source.nineLivesTimeline) ? source.nineLivesTimeline : [])
      .map((record, index) => normalizeLifeMemoryRecord(record, index + 1))
      .filter(Boolean)
      .slice(0, 9);
    state.lifeNumber = Math.floor(clamp(source.lifeNumber || state.nineLivesTimeline.length + 1, 1, 9));
    state.nineLives = Math.floor(clamp(
      source.nineLives === undefined ? 9 - state.nineLivesTimeline.length : source.nineLives,
      0,
      9,
    ));
    state.memoryEffects = {
      resonance: 0,
      strength: 0,
      guardian: 0,
      ...(base.memoryEffects || {}),
      ...(source.memoryEffects || {}),
    };
    for (const key of Object.keys(state.memoryEffects)) {
      state.memoryEffects[key] = Math.max(0, Math.floor(Number(state.memoryEffects[key]) || 0));
    }
    state.lifeMemoryPending = !!source.lifeMemoryPending;
    state.pendingLifeSummary = source.pendingLifeSummary && typeof source.pendingLifeSummary === 'object'
      ? clone(source.pendingLifeSummary)
      : null;
    state.demoFirstLifeComplete = !!source.demoFirstLifeComplete;
    state.secondLifePreviewStartedAt = Math.max(0, Number(source.secondLifePreviewStartedAt) || 0);
    state.secondLifePreviewElapsedMs = Math.max(0, Number(source.secondLifePreviewElapsedMs) || 0);
    state.secondLifePreviewComplete = !!source.secondLifePreviewComplete;
    state.demoComplete = !!source.demoComplete;
    state.chapterBossPending = source.chapterBossPending ? 1 : 0;
    state.chapterBossConfirmed = state.chapterBossPending ? !!source.chapterBossConfirmed : false;
    state.chapterBossInProgress = !!source.chapterBossInProgress;
    state.nineLivesComplete = !!source.nineLivesComplete || state.nineLivesTimeline.length >= 9;
    if (state.nineLivesComplete) state.nineLives = 0;
    const savedFinalHeirloom = migrateFinalHeirloom(
      source.finalHeirloom || (source.heirloom && source.heirloom.finalHeirloom ? source.heirloom : null),
    );
    state.finalHeirloom = state.nineLivesComplete
      ? (savedFinalHeirloom || crystallizeNineLivesHeirloom(source.heirloom || base.heirloom, state.memoryEffects))
      : null;
    state.heirloom = state.finalHeirloom || normalizeHeirloom(source.heirloom || base.heirloom);
    const itemIds = [
      ...Object.values(state.equipment),
      ...state.inventory,
      ...(state.lastInventoryBatch?.items || []),
    ].filter(Boolean).map(item => Math.max(0, Math.floor(Number(item.id) || 0)));
    state.nextItemId = Math.max(1, Math.floor(Number(state.nextItemId) || 1), ...itemIds.map(id => id + 1));
    return state;
  }

  return {
    SAVE_VERSION,
    RESONANCE_SLICE_MS,
    RESONANCE_WINDOW_MS,
    RESONANCE_CHARGE_MAX,
    RESONANCE_TIER_THRESHOLDS,
    RESONANCE_SPEED_BONUSES,
    FIRST_LIFE_EXPEDITION,
    SET_BONUSES,
    SKILL_DEFAULTS,
    createResonanceState,
    registerInputPulse,
    getResonanceTier,
    getResonanceSpeedBonus,
    consumeResonanceSkill,
    getInputActionDuration,
    shouldSafeRetreat,
    getFirstLifeExpeditionStage,
    normalizeInventoryRules,
    shouldAutoSalvageItem,
    aggregateSetBonuses,
    normalizeHeirloom,
    crystallizeNineLivesHeirloom,
    normalizeLifeMemoryRecord,
    createLifeMemoryRecord,
    migrateState,
  };
});
