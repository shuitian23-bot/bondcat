import test from 'node:test';
import assert from 'node:assert/strict';
import GameCore from '../src/game-core.js';

test('输入充能按 250ms 节流，并按最近 3 秒进入 0-3 档', () => {
  const resonance = GameCore.createResonanceState();
  assert.equal(GameCore.registerInputPulse(resonance, 0).accepted, true);
  assert.equal(GameCore.registerInputPulse(resonance, 100).accepted, false);
  assert.equal(GameCore.registerInputPulse(resonance, 250).accepted, true);
  assert.equal(GameCore.getResonanceTier(resonance, 250), 1);

  for (let now = 500; now <= 2250; now += 250) GameCore.registerInputPulse(resonance, now);
  assert.equal(GameCore.getResonanceTier(resonance, 2250), 3);
  assert.equal(GameCore.getResonanceTier(resonance, 5500), 0);
});

test('输入充能满 40 后锁定一次武器特技并可消费', () => {
  const resonance = GameCore.createResonanceState({ charge: 39 });
  const result = GameCore.registerInputPulse(resonance, 1000);
  assert.equal(result.skillReady, true);
  assert.equal(result.charge, 40);
  assert.equal(GameCore.consumeResonanceSkill(resonance), true);
  assert.equal(resonance.charge, 0);
  assert.equal(resonance.skillReady, false);
  assert.equal(GameCore.consumeResonanceSkill(resonance), false);
});

test('连续输入只缩短已触发动作的持续时间，最高约 18%', () => {
  const resonance = GameCore.createResonanceState();
  assert.equal(GameCore.getInputActionDuration(1000, resonance, 0), 1000);
  for (let now = 0; now <= 2250; now += 250) GameCore.registerInputPulse(resonance, now);
  assert.equal(GameCore.getResonanceTier(resonance, 2250), 3);
  assert.ok(Math.abs(GameCore.getInputActionDuration(1000, resonance, 2250) - 847.46) < 0.01);
});

test('低血量撤退，Boss/精英无输入时提前进入安全阈值', () => {
  assert.equal(GameCore.shouldSafeRetreat({ hp: 23, maxHp: 100 }), true);
  assert.equal(GameCore.shouldSafeRetreat({ hp: 25, maxHp: 100 }), false);
  assert.equal(GameCore.shouldSafeRetreat({ hp: 34, maxHp: 100, isBoss: true, recentPulseCount: 0 }), true);
  assert.equal(GameCore.shouldSafeRetreat({ hp: 36, maxHp: 100, isBoss: true, recentPulseCount: 0 }), false);
  assert.equal(GameCore.shouldSafeRetreat({ hp: 34, maxHp: 100, isElite: true, recentPulseCount: 2 }), false);
});

test('首命远征按 Lv1-3、Lv4-6、Lv7-10 分为三段，第二命不重复', () => {
  assert.equal(GameCore.getFirstLifeExpeditionStage(1, 1).id, 'trailhead');
  assert.equal(GameCore.getFirstLifeExpeditionStage(3, 1).index, 0);
  assert.equal(GameCore.getFirstLifeExpeditionStage(4, 1).id, 'echo-grove');
  assert.equal(GameCore.getFirstLifeExpeditionStage(6, 1).index, 1);
  assert.equal(GameCore.getFirstLifeExpeditionStage(7, 1).id, 'ruin-gate');
  assert.equal(GameCore.getFirstLifeExpeditionStage(10, 1).index, 2);
  assert.equal(GameCore.getFirstLifeExpeditionStage(11, 1), null);
  assert.equal(GameCore.getFirstLifeExpeditionStage(4, 2), null);
});

test('自动分解保护锁定、传家宝和已升级装备，并限制在稀有品质以下', () => {
  const rules = GameCore.normalizeInventoryRules({ autoSalvageMaxRarity: 99 });
  assert.deepEqual(rules, { autoSalvageMaxRarity: 2, protectUpgraded: true });
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 2, upgradeLevel: 0 }, rules), true);
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 3, upgradeLevel: 0 }, rules), false);
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 0, locked: true }, rules), false);
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 0, heirloom: true }, rules), false);
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 0, upgradeLevel: 1 }, rules), false);
  assert.equal(GameCore.shouldAutoSalvageItem({ rarityIdx: 0 }, { autoSalvageMaxRarity: -1 }), false);
});

test('三套装备按 2/3 件聚合行为效果', () => {
  const items = [
    { setId: 'echo' }, { setId: 'echo' }, { setId: 'echo' },
    { setId: 'guardian' }, { setId: 'guardian' }, { setId: 'guardian' },
    { setId: 'execution' }, { setId: 'execution' }, { setId: 'execution' },
  ];
  const result = GameCore.aggregateSetBonuses(items);
  assert.equal(result.counts.echo, 3);
  assert.equal(result.effects.chargePerPulseBonus, 0.25);
  assert.equal(result.effects.syncDamageBonus, 0.35);
  assert.equal(result.effects.syncChain, true);
  assert.equal(result.effects.damageReduction, 0.12);
  assert.equal(result.effects.retreatThresholdBonus, 0.05);
  assert.equal(result.effects.retreatRegenBonus, 0.75);
  assert.equal(result.effects.executeDamageBonus, 0.30);
  assert.equal(result.effects.syncExecute, true);
});

test('旧 bondcat_v5 状态迁移时保留进度并补齐新字段', () => {
  const oldState = {
    gold: 321,
    level: 12,
    skills: { attack: 3 },
    chapterBossPending: 1,
    equipment: {
      weapon: { id: 7, slot: 'weapon', name: '木剑', icon: 'swordWep', dmg: 2, rarityIdx: 0 },
    },
    inventory: [{ id: 8, slot: 'head', name: '布帽', hp: 5, rarityIdx: 1 }],
  };
  const migrated = GameCore.migrateState(oldState, { gold: 0, skills: {} });
  assert.equal(migrated.gold, 321);
  assert.equal(migrated.skills.attack, 3);
  assert.equal(migrated.skills.resonance, 0);
  assert.deepEqual(migrated.resonance, { charge: 0, skillReady: false });
  assert.equal(migrated.equipment.weapon.setId, null);
  assert.deepEqual(migrated.equipment.weapon.affixes, []);
  assert.equal(migrated.equipment.weapon.hp, 0);
  assert.equal(Number.isFinite(migrated.equipment.weapon.dmg), true);
  assert.equal(migrated.inventory[0].setId, null);
  assert.equal(migrated.inventory[0].locked, false);
  assert.equal(migrated.inventory[0].dmg, 0);
  assert.equal(Number.isFinite(migrated.inventory[0].hp), true);
  assert.equal(migrated.chapterBossConfirmed, false);
  assert.equal(migrated.nineLives, 9);
  assert.deepEqual(migrated.inventoryRules, { autoSalvageMaxRarity: -1, protectUpgraded: true });
  assert.deepEqual(migrated.expeditionClearedStages, [0, 1]);
  assert.equal(migrated.saveVersion, GameCore.SAVE_VERSION);
});

test('自动分解撤销批次迁移后保留完整物品并抬高下一个 ID', () => {
  const migrated = GameCore.migrateState({
    inventoryRules: { autoSalvageMaxRarity: 1, protectUpgraded: false },
    lastInventoryBatch: {
      type: 'auto-salvage',
      items: [{ id: 40, slot: 'head', name: '布帽', rarityIdx: 1, hp: 5, locked: false }],
      goldDelta: 31,
      createdAt: 1234,
    },
    nextItemId: 2,
  }, {});
  assert.deepEqual(migrated.inventoryRules, { autoSalvageMaxRarity: 1, protectUpgraded: false });
  assert.equal(migrated.lastInventoryBatch.items[0].id, 40);
  assert.equal(migrated.lastInventoryBatch.goldDelta, 31);
  assert.equal(migrated.lastInventoryBatch.undone, false);
  assert.equal(migrated.nextItemId, 41);
});

test('传家宝归一化后保留身份与行为词缀，不继承数值膨胀', () => {
  const heirloom = GameCore.normalizeHeirloom({
    id: 99,
    slot: 'weapon',
    name: '铁锤',
    icon: 'hammerWep',
    weaponType: 'melee',
    dmg: 35,
    rarityIdx: 4,
    upgradeLevel: 10,
    setId: 'guardian',
    affixes: [{ key: 'guardian', value: 18 }, { key: 'atkBonus', value: 9 }],
  });
  assert.equal(heirloom.heirloom, true);
  assert.equal(heirloom.dmg, 4);
  assert.equal(heirloom.rarityIdx, 1);
  assert.equal(heirloom.upgradeLevel, 0);
  assert.equal(heirloom.setId, 'guardian');
  assert.deepEqual(heirloom.affixes, [{ key: 'guardian', value: 5 }]);
});

test('九命时间线迁移后可完整恢复选择与 Build 摘要', () => {
  const migrated = GameCore.migrateState({
    nineLivesTimeline: [{
      life: 1,
      choiceId: 'guardian',
      catName: 'Milo',
      classId: 'warrior',
      outfit: 3,
      level: 10,
      weaponName: 'Iron Hammer',
      keyLootName: 'Ninefold Guard',
      setIds: ['guardian', 'guardian'],
      recordedAt: 1234,
    }],
    memoryEffects: { guardian: 1 },
    lifeNumber: 2,
    nineLives: 8,
  }, {});
  assert.equal(migrated.nineLivesTimeline.length, 1);
  assert.equal(migrated.nineLivesTimeline[0].choiceId, 'guardian');
  assert.deepEqual(migrated.nineLivesTimeline[0].setIds, ['guardian']);
  assert.equal(migrated.memoryEffects.guardian, 1);
  assert.equal(migrated.lifeNumber, 2);
  assert.equal(migrated.nineLives, 8);
});

test('九命圆满会结晶三重效果传家宝并在迁移后保持终局', () => {
  const finalHeirloom = GameCore.crystallizeNineLivesHeirloom({
    id: 90,
    slot: 'weapon',
    name: '铁锤',
    nameEn: 'Iron Hammer',
    icon: 'hammerWep',
    weaponType: 'melee',
    dmg: 35,
    rarityIdx: 4,
    upgradeLevel: 8,
    affixes: [],
    setId: 'guardian',
  }, { resonance: 3, strength: 4, guardian: 2 });
  assert.equal(finalHeirloom.finalHeirloom, true);
  assert.equal(finalHeirloom.rarityIdx, 4);
  assert.equal(finalHeirloom.affixes.length, 3);
  assert.deepEqual(finalHeirloom.crystals, { resonance: 3, strength: 4, guardian: 2 });

  const migrated = GameCore.migrateState({
    nineLivesTimeline: Array.from({ length: 9 }, (_, index) => ({ life: index + 1, choiceId: 'strength' })),
    nineLives: 0,
    nineLivesComplete: true,
    finalHeirloom,
    heirloom: finalHeirloom,
  }, {});
  assert.equal(migrated.nineLivesComplete, true);
  assert.equal(migrated.nineLives, 0);
  assert.equal(migrated.finalHeirloom.finalHeirloom, true);
  assert.equal(migrated.heirloom.affixes.length, 3);
});
