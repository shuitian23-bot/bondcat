import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const appFile = path.resolve('src/index.html');
let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

async function openGame(search, storageSeed = null) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  if (storageSeed) {
    await page.addInitScript(seed => {
      localStorage.setItem(seed.key, JSON.stringify(seed.value));
    }, storageSeed);
  }
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || String(error)));
  const url = pathToFileURL(appFile);
  url.search = search;
  await page.goto(url.href);
  await page.waitForFunction(() => typeof updateInputDrivenCombat === 'function');
  await page.waitForTimeout(150);
  return { context, page, pageErrors };
}

async function resetInputScenario(page, baseline = { k: 0, m: 0, mv: 0 }) {
  await page.evaluate((nextBaseline) => {
    clearPendingGlobalGameplayInput();
    modalOpen = false;
    activeModalType = null;
    document.getElementById('modal').classList.remove('open');
    suppressCombatUntil = 0;
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 25;
    state.catMaxHp = 1000;
    state.catHp = 1000;
    state.equipment.weapon = {
      id: 9001,
      slot: 'weapon',
      name: 'Test Hammer',
      nameEn: 'Test Hammer',
      icon: 'hammerWep',
      weaponType: 'melee',
      dmg: 18,
      hp: 0,
      rarityIdx: 2,
      upgradeLevel: 0,
      affixes: [],
      setId: null,
    };
    userPrefs.mouseMoveAttack = false;
    resonanceState = BondCatCore.createResonanceState();
    const typeIndex = MONSTER_TYPES.findIndex(type => !type.isBoss);
    const type = MONSTER_TYPES[typeIndex];
    monsters = [{
      type: typeIndex,
      x: catFrontX() + 12,
      y: STAGE_H - type.size - 8,
      hp: 500,
      maxHp: 500,
      elite: false,
      speed: 0,
      flash: 0,
      hitReact: 0,
      atkTimer: 0,
      attackAnim: 0,
      attackDuration: 0,
      attackDidHit: false,
      dodgeTimer: 0,
      frozenTimer: 0,
      dungeon: false,
    }];
    pendingInputActions = 0;
    pendingMeleeHits = [];
    pendingRangedActions = [];
    pendingLeapImpacts = [];
    projectiles = [];
    attackArc = 0;
    activeAttackVisualHit = null;
    shieldBlockAnim = 0;
    combatState = 'patrol';
    catDead = 0;
    idleSec = 0;
    routeScroll = 0;
    routeVelocity = 0;
    routeTargetSpeed = 0;
    routeCruiseTimer = 0;
    catWalkTimer = 0;
    catWalkPower = 0;
    spawnTimer = 9999;
    lastLocalGameplayInputAt = 0;
    lastLocalGameplayInputAtByKind = { keyboard: 0, pointer: 0, pointermove: 0 };
    lastLocalMoveAttack = 0;
    lastExecutedGlobalInputAt = 0;
    recentExecutedGlobalInputKinds = { keyboard: 0, pointer: 0, pointermove: 0, legacy: 0 };
    seenGlobalInput = {
      k: nextBaseline.k,
      m: nextBaseline.m,
      mv: nextBaseline.mv,
      total: nextBaseline.k + nextBaseline.m + nextBaseline.mv,
    };
  }, baseline);
}

async function queuedInputActionCount(page, waitMs = 145) {
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => pendingMeleeHits.length + pendingRangedActions.length + pendingInputActions);
}

test('旧存档缺失装备数值时可迁移为有限数值', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0', {
    key: 'bondcat_v5',
    value: {
      gold: 321,
      level: 12,
      guideSeen: true,
      skills: { attack: 3, vitality: 0, greed: 0, luck: 0 },
      equipment: {
        head: { id: 1, slot: 'head', name: '旧布帽', rarityIdx: 1 },
        body: null,
        weapon: { id: 2, slot: 'weapon', name: '旧木剑', icon: 'swordWep', weaponType: 'melee', rarityIdx: 0 },
        feet: null,
        accessory: null,
      },
      inventory: [{ id: 3, slot: 'feet', name: '旧布鞋', rarityIdx: 1 }],
    },
  });
  const result = await page.evaluate(() => {
    const items = [...Object.values(state.equipment), ...state.inventory].filter(Boolean);
    return {
      level: state.level,
      gold: state.gold,
      maxHp: state.catMaxHp,
      itemCount: items.length,
      allFinite: items.every(item => Number.isFinite(item.dmg) && Number.isFinite(item.hp)),
      tutorialComplete: state.tutorialComplete,
    };
  });
  assert.equal(result.level, 12);
  assert.equal(result.gold, 321);
  assert.equal(Number.isFinite(result.maxHp), true);
  assert.ok(result.itemCount >= 2);
  assert.equal(result.allFinite, true);
  assert.equal(result.tutorialComplete, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Demo 的 FIGHT 奖励不能突破 10 级上限，完成后也不能再开副本', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-demo&demo=1');
  const result = await page.evaluate(() => {
    closeModal();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.level = 10;
    state.xp = 149;
    state.demoComplete = false;
    state.lifeMemoryPending = false;
    dungeonRun = { active: true, timer: 1, kills: 18, goal: 18, banner: 0, reward: 100 };
    finishDungeon(true);
    const capped = { level: state.level, xp: state.xp, active: dungeonRun.active };
    state.demoComplete = true;
    closeModal();
    startDungeon();
    return { capped, blocked: !dungeonRun.active, modal: activeModalType };
  });
  assert.deepEqual(result.capped, { level: 10, xp: 0, active: false });
  assert.equal(result.blocked, true);
  assert.equal(result.modal, 'demoComplete');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Demo 首命记忆可继承到第二命，并在预览结束后稳定恢复完成页', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-demo&demo=1');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.level = 10;
    state.gold = 900;
    state.inventoryRules = { autoSalvageMaxRarity: 1, protectUpgraded: true };
    state.equipment.weapon = {
      id: 90,
      slot: 'weapon',
      name: 'Test Hammer',
      nameEn: 'Test Hammer',
      icon: 'hammerWep',
      weaponType: 'melee',
      dmg: 30,
      hp: 0,
      rarityIdx: 4,
      upgradeLevel: 6,
      affixes: [{ key: 'guardian', value: 15 }],
      setId: 'guardian',
    };
    resonanceState = BondCatCore.createResonanceState();
    beginLifeMemorySelection('demo');
    const pending = state.lifeMemoryPending && activeModalType === 'memory';
    chooseLifeMemory('guardian');
    const inherited = {
      life: state.lifeNumber,
      lives: state.nineLives,
      timeline: state.nineLivesTimeline.length,
      guardian: state.memoryEffects.guardian,
      heirloom: state.heirloom?.nameEn,
      finiteHp: Number.isFinite(state.catMaxHp),
      autoSalvageMaxRarity: state.inventoryRules.autoSalvageMaxRarity,
    };
    state.secondLifePreviewElapsedMs = DEMO_SECOND_LIFE_PREVIEW_MS - 20;
    closeModal();
    demoCompleteModalShown = false;
    updateDemoPreviewCompletion(25);
    const completed = state.demoComplete && activeModalType === 'demoComplete';
    closeModal();
    demoCompleteModalShown = false;
    updateDemoPreviewCompletion();
    const restored = activeModalType === 'demoComplete';
    return { pending, inherited, completed, restored };
  });
  assert.equal(result.pending, true);
  assert.deepEqual(result.inherited, {
    life: 2,
    lives: 8,
    timeline: 1,
    guardian: 1,
    heirloom: 'Test Hammer',
    finiteHp: true,
    autoSalvageMaxRarity: 1,
  });
  assert.equal(result.completed, true);
  assert.equal(result.restored, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('章节 Boss 中途退出后恢复为可重试 Boss 门', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0', {
    key: 'bondcat_v5',
    value: {
      gold: 10,
      level: 10,
      classId: 'warrior',
      guideSeen: true,
      chapterBossPending: 0,
      chapterBossConfirmed: false,
      chapterBossInProgress: true,
    },
  });
  const recovered = await page.evaluate(() => ({
    pending: state.chapterBossPending,
    confirmed: state.chapterBossConfirmed,
    inProgress: state.chapterBossInProgress,
  }));
  assert.deepEqual(recovered, { pending: 1, confirmed: false, inProgress: false });

  const spawned = await page.evaluate(() => {
    closeModal();
    monsters = [];
    confirmChapterBoss();
    spawnMonster();
    return {
      hasChapterBoss: monsters.some(monster => monster.chapterBoss),
      inProgress: state.chapterBossInProgress,
      pending: state.chapterBossPending,
    };
  });
  assert.deepEqual(spawned, { hasChapterBoss: true, inProgress: true, pending: 0 });
  await page.reload();
  await page.waitForFunction(() => typeof updateInputDrivenCombat === 'function');
  const retried = await page.evaluate(() => ({
    pending: state.chapterBossPending,
    confirmed: state.chapterBossConfirmed,
    inProgress: state.chapterBossInProgress,
  }));
  assert.deepEqual(retried, { pending: 1, confirmed: false, inProgress: false });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('非副本 Boss 存活时重复生成不会增加怪物', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.level = 25;
    dungeonRun.active = false;
    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= state.level);
    monsters = [{ type: bossType, hp: 100, maxHp: 100, dungeon: false, x: 300, y: 100 }];
    const before = monsters.length;
    for (let i = 0; i < 8; i++) spawnMonster();
    return { before, after: monsters.length };
  });
  assert.deepEqual(result, { before: 1, after: 1 });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('章节 Boss 确认后等待普通怪清空再生成且不提前消费状态', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.level = 25;
    state.chapterBossPending = 1;
    state.chapterBossConfirmed = true;
    dungeonRun.active = false;
    const normalType = MONSTER_TYPES.findIndex(type => !type.isBoss && type.minLv <= state.level);
    monsters = [{ type: normalType, hp: 100, maxHp: 100, dungeon: false, x: 300, y: 100 }];
    spawnMonster();
    const waiting = {
      count: monsters.length,
      pending: state.chapterBossPending,
      confirmed: state.chapterBossConfirmed,
      inProgress: state.chapterBossInProgress,
    };
    monsters = [];
    spawnMonster();
    const spawned = {
      count: monsters.length,
      chapterBoss: !!monsters[0]?.chapterBoss,
      isBoss: !!MONSTER_TYPES[monsters[0]?.type]?.isBoss,
      pending: state.chapterBossPending,
      confirmed: state.chapterBossConfirmed,
      inProgress: state.chapterBossInProgress,
    };
    return { waiting, spawned };
  });
  assert.deepEqual(result.waiting, { count: 1, pending: 1, confirmed: true, inProgress: false });
  assert.deepEqual(result.spawned, { count: 1, chapterBoss: true, isBoss: true, pending: 0, confirmed: false, inProgress: true });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('所有 Boss 的非副本停靠距离均在空手匕首 reach 内且可在前摇后命中', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 25;
    state.catMaxHp = 1000;
    state.catHp = 1000;
    state.equipment.weapon = null;
    suppressCombatUntil = 0;
    dungeonRun.active = false;
    resonanceState = BondCatCore.createResonanceState();
    const reach = meleeReachForWeapon(null);
    const distances = MONSTER_TYPES.map((type, typeIndex) => ({ type, typeIndex }))
      .filter(({ type }) => type.isBoss && type.minLv <= state.level)
      .map(({ type, typeIndex }) => {
        const boss = { type: typeIndex, hp: 39, maxHp: 100, dungeon: false };
        boss.x = normalMonsterHoldX(boss);
        boss.y = STAGE_H - type.size - 8;
        return { name: type.name, distance: targetDistanceFromCat(boss) };
      });

    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= state.level);
    const type = MONSTER_TYPES[bossType];
    const boss = { type: bossType, hp: 39, maxHp: 100, dungeon: false, elite: false };
    boss.x = normalMonsterHoldX(boss);
    boss.y = STAGE_H - type.size - 8;
    monsters = [boss];
    pendingInputActions = 0;
    pendingMeleeHits = [];
    pendingRangedActions = [];
    pendingLeapImpacts = [];
    attackArc = 0;
    activeAttackVisualHit = null;
    combatState = 'patrol';
    const before = boss.hp;
    handleGameplayInput('global');
    const queued = pendingMeleeHits.length;
    processPendingMeleeHits(performance.now() + 5000);
    return { reach, distances, before, after: boss.hp, queued };
  });
  assert.ok(result.distances.length > 0);
  assert.equal(result.distances.every(({ distance }) => distance <= result.reach), true);
  assert.equal(result.queued, 1);
  assert.ok(result.after < result.before);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('旧状态普通怪死亡后下一次输入可直接伤害同场 Boss', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 25;
    state.catMaxHp = 1000;
    state.catHp = 1000;
    state.equipment.weapon = null;
    suppressCombatUntil = 0;
    dungeonRun.active = false;
    resonanceState = BondCatCore.createResonanceState();
    const normalType = MONSTER_TYPES.findIndex(type => !type.isBoss);
    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= state.level);
    const bossDef = MONSTER_TYPES[bossType];
    const normal = { type: normalType, x: catFrontX() + 8, hp: 0, maxHp: 10, dungeon: false };
    const boss = { type: bossType, hp: 100, maxHp: 100, dungeon: false, elite: false };
    boss.x = normalMonsterHoldX(boss);
    boss.y = STAGE_H - bossDef.size - 8;
    monsters = [normal, boss];
    pendingInputActions = 0;
    pendingMeleeHits = [];
    pendingRangedActions = [];
    pendingLeapImpacts = [];
    attackArc = 0;
    activeAttackVisualHit = null;
    combatState = 'patrol';
    handleGameplayInput('global');
    const queuedForBoss = pendingMeleeHits.length === 1 && pendingMeleeHits[0].target === boss;
    processPendingMeleeHits(performance.now() + 5000);
    return { queuedForBoss, bossHp: boss.hp };
  });
  assert.equal(result.queuedForBoss, true);
  assert.ok(result.bossHp < 100);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('背包装备名称会转义后再写入 title 与 aria-label', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.inventory = [{
      id: 999, slot: 'head', name: 'X\" autofocus onfocus=\"alert(1)',
      nameEn: 'X\" autofocus onfocus=\"alert(1)', icon: 'head', dmg: 0, hp: 1,
      rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null, locked: false,
    }];
    openModal('backpack');
    const cell = document.querySelector('.gear-cell');
    return {
      title: cell?.getAttribute('title'),
      ariaLabel: cell?.getAttribute('aria-label'),
      autofocus: cell?.hasAttribute('autofocus'),
      onfocus: cell?.getAttribute('onfocus'),
    };
  });
  assert.match(result.title, /X\" autofocus onfocus=\"alert\(1\)/);
  assert.equal(result.ariaLabel, result.title);
  assert.equal(result.autofocus, false);
  assert.equal(result.onfocus, null);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Demo 击杀首命 Boss 后同步写入记忆选择，不存在退出竞态', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-demo&demo=1');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.level = DEMO_LEVEL_CAP;
    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= state.level);
    const type = MONSTER_TYPES[bossType];
    const boss = {
      type: bossType,
      x: 300,
      y: STAGE_H - type.size - 8,
      hp: 0,
      maxHp: 100,
      chapterBoss: true,
      dungeon: false,
      elite: false,
    };
    state.chapterBossInProgress = true;
    killMonster(boss);
    return {
      firstLifeComplete: state.demoFirstLifeComplete,
      pending: state.lifeMemoryPending,
      hasSummary: !!state.pendingLifeSummary,
      modal: activeModalType,
      bossInProgress: state.chapterBossInProgress,
    };
  });
  assert.deepEqual(result, {
    firstLifeComplete: true,
    pending: true,
    hasSummary: true,
    modal: 'memory',
    bossInProgress: false,
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Demo 二周目仅累计实际运行时间，重开不会按离线时间跳过', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-demo&demo=1');
  await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.demoFirstLifeComplete = true;
    state.secondLifePreviewStartedAt = Date.now() - 60 * 60 * 1000;
    state.secondLifePreviewElapsedMs = 1234;
    saveState();
  });
  await page.reload();
  await page.waitForFunction(() => typeof updateDemoPreviewCompletion === 'function');
  await page.waitForTimeout(180);
  const result = await page.evaluate(() => ({
    elapsed: state.secondLifePreviewElapsedMs,
    complete: state.demoComplete,
    previewComplete: state.secondLifePreviewComplete,
  }));
  assert.ok(result.elapsed >= 1234 && result.elapsed < 5000);
  assert.equal(result.complete, false);
  assert.equal(result.previewComplete, false);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('第九命完成后生成最终传家宝并拒绝第十次转生', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.level = 50;
    state.lifeNumber = 9;
    state.nineLives = 1;
    state.nineLivesTimeline = Array.from({ length: 8 }, (_, index) => BondCatCore.createLifeMemoryRecord({
      life: index + 1,
      choiceId: ['resonance', 'strength', 'guardian'][index % 3],
      level: 50,
      weaponName: 'Iron Hammer',
    }));
    state.memoryEffects = { resonance: 3, strength: 3, guardian: 2 };
    state.equipment.weapon = {
      id: 90,
      slot: 'weapon',
      name: '铁锤',
      nameEn: 'Iron Hammer',
      icon: 'hammerWep',
      weaponType: 'melee',
      dmg: 30,
      hp: 0,
      rarityIdx: 4,
      upgradeLevel: 6,
      affixes: [],
      setId: 'guardian',
    };
    beginLifeMemorySelection('prestige');
    chooseLifeMemory('strength');
    const completed = {
      timeline: state.nineLivesTimeline.length,
      lives: state.nineLives,
      terminal: state.nineLivesComplete,
      final: !!state.finalHeirloom?.finalHeirloom,
      affixes: state.finalHeirloom?.affixes.length,
      modal: activeModalType,
    };
    closeModal();
    state.level = 50;
    doPrestige();
    const rejected = {
      timeline: state.nineLivesTimeline.length,
      pending: state.lifeMemoryPending,
      modal: activeModalType,
    };
    return { completed, rejected };
  });
  assert.deepEqual(result.completed, {
    timeline: 9,
    lives: 0,
    terminal: true,
    final: true,
    affixes: 3,
    modal: 'nineLivesComplete',
  });
  assert.deepEqual(result.rejected, {
    timeline: 9,
    pending: false,
    modal: 'nineLivesComplete',
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('零输入不攻击；一次输入只触发一次行动并立即结束睡眠和守盾', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.level = 25;
    state.catMaxHp = 1000;
    state.catHp = 1000;
    state.equipment.weapon = {
      id: 1,
      slot: 'weapon',
      name: 'Test Sword',
      icon: 'swordWep',
      weaponType: 'melee',
      dmg: 18,
      hp: 0,
      rarityIdx: 2,
      upgradeLevel: 0,
      affixes: [],
      setId: null,
    };
    resonanceState = BondCatCore.createResonanceState();
    suppressCombatUntil = 0;
    state.tutorialComplete = true;
    idleSec = 40;

    function createTarget(type, elite) {
      const monsterType = MONSTER_TYPES[type];
      return {
        type,
        x: catFrontX() + 12,
        y: STAGE_H - monsterType.size - 8,
        hp: 500,
        maxHp: 500,
        elite,
        speed: 0,
        flash: 0,
        atkTimer: 0,
        attackAnim: 0,
        attackDuration: 0,
        attackDidHit: false,
        dodgeTimer: 0,
        frozenTimer: 0,
        dungeon: false,
      };
    }

    const target = createTarget(4, false);
    monsters = [target];
    pendingInputActions = 0;
    pendingMeleeHits = [];
    pendingRangedActions = [];
    pendingLeapImpacts = [];
    attackArc = 0;
    activeAttackVisualHit = null;
    combatState = 'sleep';
    shieldBlockAnim = 1;
    const now = performance.now();
    updateInputDrivenCombat(0.016, now + 1000);
    const withoutInput = {
      scheduled: pendingMeleeHits.length,
      hp: target.hp,
      sleeping: catSleepingActive(),
      shielding: idleGuardActive(target),
      state: combatState,
    };

    handleGameplayInput('global');
    const afterInput = {
      scheduled: pendingMeleeHits.length,
      idleSec,
      sleeping: catSleepingActive(),
      shielding: idleGuardActive(target),
      state: combatState,
    };
    processPendingMeleeHits(now + 5000);
    const hpAfterOneInput = target.hp;
    pendingMeleeHits = [];
    pendingRangedActions = [];
    pendingLeapImpacts = [];
    attackArc = 0;
    activeAttackVisualHit = null;
    combatState = 'patrol';
    updateInputDrivenCombat(0.016, now + 6000);

    return {
      withoutInput,
      afterInput,
      hpAfterOneInput,
      scheduledAgain: pendingMeleeHits.length,
    };
  });
  assert.deepEqual(result.withoutInput, {
    scheduled: 0, hp: 500, sleeping: false, shielding: false, state: 'patrol',
  });
  assert.equal(result.afterInput.scheduled, 1);
  assert.equal(result.afterInput.idleSec, 0);
  assert.equal(result.afterInput.sleeping, false);
  assert.equal(result.afterInput.shielding, false);
  assert.equal(result.afterInput.state, 'windup');
  assert.ok(result.hpAfterOneInput < 500);
  assert.equal(result.scheduledAgain, 0);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('真实 DOM 键盘和点击与全局监听无论先后都只产生一次行动', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');

  await resetInputScenario(page);
  await page.keyboard.press('a');
  await page.evaluate(() => handleGlobalInputPayload({ k: 1, m: 0, mv: 0 }));
  assert.equal(await queuedInputActionCount(page), 1, '本地键盘先到时应丢弃对应全局事件');

  await resetInputScenario(page);
  await page.evaluate(() => handleGlobalInputPayload({ k: 1, m: 0, mv: 0 }));
  await page.keyboard.press('a');
  assert.equal(await queuedInputActionCount(page), 1, '全局键盘先到时应由随后 DOM 事件接管');

  await resetInputScenario(page);
  await page.locator('#game').click({ position: { x: 240, y: 60 } });
  await page.evaluate(() => handleGlobalInputPayload({ k: 0, m: 1, mv: 0 }));
  assert.equal(await queuedInputActionCount(page), 1, '本地点击先到时应丢弃对应全局事件');

  await resetInputScenario(page);
  await page.evaluate(() => handleGlobalInputPayload({ k: 0, m: 1, mv: 0 }));
  await page.locator('#game').click({ position: { x: 240, y: 60 } });
  assert.equal(await queuedInputActionCount(page), 1, '全局点击先到时应由随后 DOM 事件接管');

  await resetInputScenario(page);
  await page.evaluate(() => handleGlobalInputPayload({ k: 3, m: 0, mv: 0 }));
  await page.keyboard.press('a');
  assert.equal(await queuedInputActionCount(page), 3, '本地事件只抵消整批全局计数中的对应一次');

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('阻塞状态和 heartbeat 都推进全局计数基线且不会回放历史输入', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  await resetInputScenario(page);
  const blocked = await page.evaluate(() => {
    modalOpen = true;
    handleGlobalInputPayload({ k: 3, m: 2, mv: 4 });
    return {
      seen: { ...seenGlobalInput },
      pendingTimer: pendingGlobalInputTimer !== null,
      actions: pendingMeleeHits.length + pendingRangedActions.length + pendingInputActions,
    };
  });
  assert.deepEqual(blocked, {
    seen: { k: 3, m: 2, mv: 4, total: 9 },
    pendingTimer: false,
    actions: 0,
  });

  await page.evaluate(() => {
    modalOpen = false;
    suppressCombatUntil = 0;
    handleGlobalInputPayload({ k: 4, m: 2, mv: 4 });
  });
  assert.equal(await queuedInputActionCount(page), 1, '解除阻塞后只能消费新增的一次输入');

  await resetInputScenario(page);
  const heartbeat = await page.evaluate(() => {
    handleInputHeartbeatPayload({ k: 10, m: 7, mv: 5 });
    return { seen: { ...seenGlobalInput }, keyHits: window.keyHits, mouseHits: window.mouseHits };
  });
  assert.deepEqual(heartbeat, {
    seen: { k: 10, m: 7, mv: 5, total: 22 },
    keyHits: 10,
    mouseHits: 7,
  });
  await page.evaluate(() => handleGlobalInputPayload({ k: 11, m: 7, mv: 5 }));
  assert.equal(await queuedInputActionCount(page), 1, 'heartbeat 之后只消费新的计数差');

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('连续 30 秒零输入不会自行移动、攻击或伤害怪物', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  await resetInputScenario(page);
  const result = await page.evaluate(() => {
    const target = monsters[0];
    const startHp = target.hp;
    const startScroll = routeScroll;
    const startNow = performance.now();
    for (let frame = 1; frame <= 1800; frame++) {
      idleSec += 1 / 60;
      updateInputDrivenCombat(1 / 60, startNow + frame * (1000 / 60));
    }
    return {
      startHp,
      hp: target.hp,
      startScroll,
      routeScroll,
      routeVelocity,
      pendingInputActions,
      queuedAttacks: pendingMeleeHits.length + pendingRangedActions.length + pendingLeapImpacts.length,
      projectiles: projectiles.length,
      attackArc,
    };
  });
  assert.deepEqual(result, {
    startHp: 500,
    hp: 500,
    startScroll: 0,
    routeScroll: 0,
    routeVelocity: 0,
    pendingInputActions: 0,
    queuedAttacks: 0,
    projectiles: 0,
    attackArc: 0,
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('普通怪格挡、无目标睡眠和输入攻击保持互斥', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  await resetInputScenario(page);
  const resting = await page.evaluate(() => {
    const target = monsters[0];
    idleSec = IDLE_GUARD_AFTER + 1;
    combatState = 'patrol';
    updateInputDrivenCombat(1 / 60, performance.now());
    const guard = {
      state: combatState,
      guarding: idleGuardActive(target),
      sleeping: catSleepingActive(),
    };

    monsters = [];
    idleSec = 40;
    combatState = 'patrol';
    routeVelocity = 0;
    catWalkPower = 0;
    updateInputDrivenCombat(1 / 60, performance.now() + 1000);
    const sleep = {
      state: combatState,
      guarding: idleGuardActive(null),
      sleeping: catSleepingActive(),
    };

    monsters = [target];
    suppressCombatUntil = 0;
    return { guard, sleep };
  });
  assert.deepEqual(resting.guard, { state: 'guard', guarding: true, sleeping: false });
  assert.deepEqual(resting.sleep, { state: 'sleep', guarding: false, sleeping: true });

  await page.keyboard.press('a');
  const attacking = await page.evaluate(() => ({
    state: combatState,
    guarding: idleGuardActive(monsters[0]),
    sleeping: catSleepingActive(),
    shield: shieldBlockAnim,
    queued: pendingMeleeHits.length + pendingRangedActions.length,
  }));
  assert.deepEqual(attacking, {
    state: 'windup',
    guarding: false,
    sleeping: false,
    shield: 0,
    queued: 1,
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('流畅动作与连续输入充能都会缩短已触发动作的真实时长', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.equipment.weapon = {
      id: 2, slot: 'weapon', name: '铁锤', icon: 'hammerWep', weaponType: 'melee',
      dmg: 5, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null,
    };
    state.skills.tempo = 0;
    const normalDuration = weaponAttackDuration('melee', state.equipment.weapon) * 1000;
    state.skills.tempo = 10;
    const fastDuration = weaponAttackDuration('melee', state.equipment.weapon) * 1000;
    resonanceState = BondCatCore.createResonanceState();
    const base = performance.now() - 2250;
    for (let offset = 0; offset <= 2250; offset += 250) {
      BondCatCore.registerInputPulse(resonanceState, base + offset);
    }
    const chargedDuration = weaponAttackDuration('melee', state.equipment.weapon) * 1000;
    return { normalDuration, fastDuration, chargedDuration };
  });
  assert.ok(result.fastDuration < result.normalDuration - 70);
  assert.ok(result.chargedDuration < result.fastDuration - 60);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('匕首、剑、锤、弓、杖保持不同前摇、动作时长与射程', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const profiles = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    const weapons = {
      dagger: null,
      sword: { id: 1, slot: 'weapon', name: '木剑', icon: 'swordWep', weaponType: 'melee', dmg: 2, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [] },
      hammer: { id: 2, slot: 'weapon', name: '铁锤', icon: 'hammerWep', weaponType: 'melee', dmg: 5, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [] },
      bow: { id: 3, slot: 'weapon', name: '猎弓', icon: 'bowWep', weaponType: 'ranged', dmg: 4, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [] },
      wand: { id: 4, slot: 'weapon', name: '魔杖', icon: 'wandWep', weaponType: 'magic', dmg: 9, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [] },
    };
    return Object.fromEntries(Object.entries(weapons).map(([name, weapon]) => {
      state.equipment.weapon = weapon;
      state.skills.tempo = 0;
      const weaponType = itemWeaponType(weapon);
      const profile = weaponActionProfile(weaponType, weapon);
      resonanceState = BondCatCore.createResonanceState();
      const duration = weaponAttackDuration(weaponType, weapon) * 1000;
      state.skills.tempo = 10;
      const fastDuration = weaponAttackDuration(weaponType, weapon) * 1000;
      return [name, {
        action: weaponActionKey(weaponType, weapon),
        hitDelay: profile.duration * profile.hitAt,
        duration,
        fastDuration,
        range: playerAttackRange(weaponType),
      }];
    }));
  });
  assert.deepEqual(Object.fromEntries(Object.entries(profiles).map(([name, value]) => [name, value.action])), {
    dagger: 'dagger', sword: 'sword', hammer: 'hammer', bow: 'bow', wand: 'wand',
  });
  assert.ok(profiles.dagger.hitDelay < profiles.sword.hitDelay);
  assert.ok(profiles.sword.hitDelay < profiles.hammer.hitDelay);
  assert.ok(profiles.hammer.duration > profiles.sword.duration);
  assert.ok(profiles.bow.range > profiles.sword.range * 3);
  assert.ok(profiles.wand.range > profiles.bow.range);
  for (const profile of Object.values(profiles)) assert.ok(profile.fastDuration < profile.duration);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('输入充能满时预告当前武器特技，释放后完成三步引导', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'rogue';
    state.guideSeen = true;
    state.tutorialComplete = false;
    state.equipment.weapon = {
      id: 3, slot: 'weapon', name: '猎弓', icon: 'bowWep', weaponType: 'ranged',
      dmg: 4, hp: 0, rarityIdx: 1, upgradeLevel: 0, affixes: [], setId: null,
    };
    resonanceState = BondCatCore.createResonanceState({ charge: 39 });
    suppressCombatUntil = 0;
    tutorialState = { active: false, step: 0, pulses: 0 };
    startLiveTutorial();
    registerInputPulse('test');
    updateResonanceHud();
    const readyLabel = document.getElementById('resonanceLabel').textContent;
    const tutorialBefore = document.getElementById('tutorialHud').textContent;
    const type = MONSTER_TYPES[0];
    const target = {
      type: 0, x: catFrontX() + 120, y: STAGE_H - type.size - 8,
      hp: 50, maxHp: 50, elite: false, dungeon: false, flash: 0,
      hitReact: 0, frozenTimer: 0,
    };
    monsters = [target];
    startInputAttack(target, performance.now());
    const beforeImpact = {
      tutorialComplete: state.tutorialComplete,
      charge: resonanceState.charge,
      hp: target.hp,
    };
    processPendingRangedActions(performance.now() + 5000);
    updateProjectiles(1);
    return {
      readyLabel,
      tutorialBefore,
      beforeImpact,
      tutorialComplete: state.tutorialComplete,
      charge: resonanceState.charge,
      hasCompletionFloat: floatTexts.some(item => item.text.includes('GUIDE COMPLETE') || item.text.includes('引导完成')),
    };
  });
  assert.match(result.readyLabel, /Bow Volley|弓·连射/);
  assert.match(result.tutorialBefore, /GUIDE 3\/3|引导 3\/3/);
  assert.deepEqual(result.beforeImpact, { tutorialComplete: false, charge: 40, hp: 50 });
  assert.equal(result.tutorialComplete, true);
  assert.equal(result.charge, 0);
  assert.equal(result.hasCompletionFloat, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('特技蓄力机制继续更新，但顶部 HUD 始终隐藏', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    tutorialState = { active: false, step: 0, pulses: 0 };
    resonanceState = BondCatCore.createResonanceState({ charge: 12 });
    resonanceHudVisibleUntil = 0;
    resonanceHudReleaseUntil = 0;
    updateResonanceHud(1000);
    const idle = getComputedStyle(document.getElementById('resonanceHud')).display;
    noteResonanceHudInput(1000);
    updateResonanceHud(1000);
    const active = getComputedStyle(document.getElementById('resonanceHud')).display;
    updateResonanceHud(1000 + RESONANCE_HUD_ACTIVITY_MS + 1);
    const faded = getComputedStyle(document.getElementById('resonanceHud')).display;
    resonanceState = BondCatCore.createResonanceState({ charge: 40, skillReady: true });
    updateResonanceHud(5000);
    const ready = getComputedStyle(document.getElementById('resonanceHud')).display;
    resonanceState = BondCatCore.createResonanceState();
    noteResonanceHudRelease(6000);
    updateResonanceHud(6000);
    const released = {
      display: getComputedStyle(document.getElementById('resonanceHud')).display,
      label: document.getElementById('resonanceLabel').textContent,
    };
    updateResonanceHud(6000 + RESONANCE_HUD_RELEASE_MS + 1);
    const releaseFaded = getComputedStyle(document.getElementById('resonanceHud')).display;
    return { idle, active, faded, ready, released, releaseFaded };
  });
  assert.equal(result.idle, 'none');
  assert.equal(result.active, 'none');
  assert.equal(result.faded, 'none');
  assert.equal(result.ready, 'none');
  assert.equal(result.released.display, 'none');
  assert.match(result.released.label, /RELEASED|已释放/);
  assert.equal(result.releaseFaded, 'none');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('打开菜单取消前摇时保留输入充能，引导不提前完成', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'mage';
    state.guideSeen = true;
    state.tutorialComplete = false;
    state.equipment.weapon = {
      id: 4, slot: 'weapon', name: '魔杖', icon: 'wandWep', weaponType: 'magic',
      dmg: 9, hp: 0, rarityIdx: 1, upgradeLevel: 0, affixes: [], setId: null,
    };
    resonanceState = BondCatCore.createResonanceState({ charge: 40, skillReady: true });
    tutorialState = { active: true, step: 3, pulses: 3 };
    suppressCombatUntil = 0;
    const type = MONSTER_TYPES[0];
    const target = {
      type: 0, x: catFrontX() + 120, y: STAGE_H - type.size - 8,
      hp: 50, maxHp: 50, elite: false, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
    };
    monsters = [target];
    startInputAttack(target, performance.now());
    const queued = pendingRangedActions.length;
    openModal('backpack');
    return {
      queued,
      queueAfterMenu: pendingRangedActions.length,
      charge: resonanceState.charge,
      ready: resonanceState.skillReady,
      hp: target.hp,
      tutorialComplete: state.tutorialComplete,
    };
  });
  assert.deepEqual(result, {
    queued: 1,
    queueAfterMenu: 0,
    charge: 40,
    ready: true,
    hp: 50,
    tutorialComplete: false,
  });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Boss 与精英休整后保留剩余血量，避免满血重开死循环', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.level = 10;
    state.chapterBossInProgress = true;
    const typeIndex = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= state.level);
    const type = MONSTER_TYPES[typeIndex];
    const boss = {
      type: typeIndex, x: catFrontX() + 20, y: STAGE_H - type.size - 8,
      hp: 37, maxHp: 120, elite: false, chapterBoss: true, dungeon: false,
      flash: 0, hitReact: 0, frozenTimer: 0, atkTimer: 0, attackAnim: 0,
    };
    monsters = [boss];
    beginSafeRetreat(boss);
    const during = {
      retained: monsters.includes(boss), hp: boss.hp, pending: state.chapterBossPending,
      inProgress: state.chapterBossInProgress, combatState,
    };
    retreatTimer = 0;
    updateInputDrivenCombat(0.016, performance.now());
    return { during, after: { retained: monsters.includes(boss), hp: boss.hp, combatState } };
  });
  assert.deepEqual(result.during, {
    retained: true, hp: 37, pending: 0, inProgress: true, combatState: 'retreat',
  });
  assert.deepEqual(result.after, { retained: true, hp: 37, combatState: 'patrol' });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('已有随机 Boss 时延迟章节 Boss，不消耗 Boss 门或降级为普通怪', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.level = 10;
    state.chapterBossPending = 1;
    state.chapterBossConfirmed = true;
    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss && type.minLv <= 10);
    const type = MONSTER_TYPES[bossType];
    monsters = [{
      type: bossType, x: 400, y: STAGE_H - type.size - 8,
      hp: 50, maxHp: 50, elite: false, chapterBoss: false, dungeon: false,
    }];
    spawnMonster();
    const delayed = {
      count: monsters.length,
      pending: state.chapterBossPending,
      confirmed: state.chapterBossConfirmed,
      chapterCount: monsters.filter(monster => monster.chapterBoss).length,
    };
    monsters = [];
    spawnMonster();
    const spawned = monsters.find(monster => monster.chapterBoss);
    return {
      delayed,
      spawned: !!spawned,
      spawnedIsBoss: !!spawned && MONSTER_TYPES[spawned.type].isBoss,
      pending: state.chapterBossPending,
      confirmed: state.chapterBossConfirmed,
    };
  });
  assert.deepEqual(result.delayed, { count: 1, pending: 1, confirmed: true, chapterCount: 0 });
  assert.equal(result.spawned, true);
  assert.equal(result.spawnedIsBoss, true);
  assert.equal(result.pending, 0);
  assert.equal(result.confirmed, false);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('Demo 第二命没有精英或 Boss 时隐藏目标 HUD', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-demo&demo=1');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.level = 10;
    state.chapterBossPending = 1;
    state.chapterBossConfirmed = false;
    state.secondLifePreviewStartedAt = Date.now();
    monsters = [];
    tutorialState.active = false;
    updateBossGateHud();
    updateObjectiveHud();
    return {
      gateVisible: document.getElementById('bossGate').classList.contains('open'),
      objectiveDisplay: document.getElementById('objectiveHud').style.display,
      objectiveText: document.getElementById('objectiveHud').textContent,
    };
  });
  assert.equal(result.gateVisible, false);
  assert.equal(result.objectiveDisplay, 'none');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('普通怪、精英和 Boss 都不显示顶部目标条', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    tutorialState.active = false;
    state.chapterBossPending = 0;
    const makeMonster = (type, elite = false) => ({
      type, x: 240, y: STAGE_H - MONSTER_TYPES[type].size - 8,
      hp: 8, maxHp: 16, elite, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
    });
    monsters = [makeMonster(0)];
    updateObjectiveHud();
    const normalDisplay = getComputedStyle(document.getElementById('objectiveHud')).display;
    monsters = [makeMonster(3, true)];
    updateObjectiveHud();
    const elite = {
      display: getComputedStyle(document.getElementById('objectiveHud')).display,
      text: document.getElementById('objectiveHud').textContent,
    };
    monsters = [makeMonster(7)];
    updateObjectiveHud();
    const boss = {
      display: getComputedStyle(document.getElementById('objectiveHud')).display,
      text: document.getElementById('objectiveHud').textContent,
    };
    return { normalDisplay, elite, boss };
  });
  assert.equal(result.normalDisplay, 'none');
  assert.equal(result.elite.display, 'none');
  assert.match(result.elite.text, /50%/);
  assert.equal(result.boss.display, 'none');
  assert.match(result.boss.text, /BOSS/);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('App Store 布局同时显示蓄力与 Boss 信息时不会重叠', async () => {
  const { context, page, pageErrors } = await openGame('channel=appstore');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    tutorialState = { active: false, step: 0, pulses: 0 };
    state.chapterBossPending = 0;
    resonanceState = BondCatCore.createResonanceState({ charge: 40, skillReady: true });
    const type = MONSTER_TYPES[7];
    monsters = [{
      type: 7, x: 260, y: STAGE_H - type.size - 8,
      hp: 160, maxHp: 320, elite: false, dungeon: false,
      flash: 0, hitReact: 0, frozenTimer: 0,
    }];
    updateResonanceHud();
    updateObjectiveHud();
    const resonance = document.getElementById('resonanceHud').getBoundingClientRect();
    const objective = document.getElementById('objectiveHud').getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(resonance.right, objective.right) - Math.max(resonance.left, objective.left));
    const overlapHeight = Math.max(0, Math.min(resonance.bottom, objective.bottom) - Math.max(resonance.top, objective.top));
    return {
      resonance: { left: resonance.left, right: resonance.right, top: resonance.top, bottom: resonance.bottom },
      objective: { left: objective.left, right: objective.right, top: objective.top, bottom: objective.bottom },
      overlapArea: overlapWidth * overlapHeight,
    };
  });
  assert.equal(result.overlapArea, 0);
  assert.ok(result.resonance.right < result.objective.left || result.resonance.bottom <= result.objective.top);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('当前目标 HUD 与脚下锁定使用同一个最前目标', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    const makeMonster = (type, x, hp, maxHp, elite = false) => ({
      type, x, y: STAGE_H - MONSTER_TYPES[type].size - 8,
      hp, maxHp, elite, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
    });
    monsters = [makeMonster(1, 330, 9, 10), makeMonster(3, 240, 8, 16, true)];
    tutorialState.active = false;
    state.chapterBossPending = 0;
    updateObjectiveHud();
    const target = frontAliveTarget();
    const hud = document.getElementById('objectiveHud');
    return { type: target.type, text: hud.textContent, locked: hud.classList.contains('locked') };
  });
  assert.equal(result.type, 3);
  assert.match(result.text, /50%/);
  assert.equal(result.locked, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('首命远征跨段时先结算本次掉落，再发一次阶段宝箱并清空战斗队列', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.level = 3;
    state.xp = 44;
    state.gold = 100;
    state.inventoryRules = { autoSalvageMaxRarity: 0, protectUpgraded: true };
    state.expeditionStageStats = { stage: 0, kills: 6, items: 0, salvaged: 0, salvageGold: 0 };
    const completedStageStats = state.expeditionStageStats;
    completedStageStats.kills++;
    awardXp(1);
    const beforeLoot = {
      level: state.level,
      queued: [...pendingExpeditionSettlements],
      cleared: [...state.expeditionClearedStages],
      chests: [...state.chests],
    };
    const item = {
      id: 500, slot: 'head', name: 'Test Cap', nameEn: 'Test Cap', icon: 'head',
      dmg: 0, hp: 5, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null, locked: false,
    };
    const received = receiveLootItem(item, completedStageStats);
    monsters = [{ type: 0, x: 200, y: 10, hp: 5, maxHp: 5 }];
    projectiles = [{ x: 100 }];
    pendingMeleeHits = [{ at: 1 }];
    pendingRangedActions = [{ at: 1 }];
    pendingLeapImpacts = [{ at: 1 }];
    const flushed = flushExpeditionSettlements();
    const secondFlush = flushExpeditionSettlements();
    return {
      beforeLoot,
      received,
      flushed,
      secondFlush,
      cleared: [...state.expeditionClearedStages],
      chests: [...state.chests],
      summary: state.lastLootSummary,
      nextStats: state.expeditionStageStats,
      queueSizes: [monsters.length, projectiles.length, pendingMeleeHits.length, pendingRangedActions.length, pendingLeapImpacts.length],
    };
  });
  assert.deepEqual(result.beforeLoot, {
    level: 4,
    queued: [0],
    cleared: [],
    chests: [0, 0, 0],
  });
  assert.equal(result.received.salvaged, true);
  assert.equal(result.flushed, true);
  assert.equal(result.secondFlush, false);
  assert.deepEqual(result.cleared, [0]);
  assert.deepEqual(result.chests, [1, 0, 0]);
  assert.deepEqual({
    stage: result.summary.stage,
    kills: result.summary.kills,
    items: result.summary.items,
    salvaged: result.summary.salvaged,
    salvageGold: result.summary.salvageGold,
  }, {
    stage: 0,
    kills: 7,
    items: 1,
    salvaged: 1,
    salvageGold: result.received.gold,
  });
  assert.deepEqual(result.nextStats, { stage: 1, kills: 0, items: 0, salvaged: 0, salvageGold: 0 });
  assert.deepEqual(result.queueSizes, [0, 0, 0, 0, 0]);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('旧存档恢复到第三段后，Lv10 只开启章节 Boss 门且不产生虚假阶段结算', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = BondCatCore.migrateState({
      saveVersion: 8,
      level: 8,
      lifeNumber: 1,
      expeditionClearedStages: [],
      expeditionStageStats: { stage: 2, kills: 4, items: 1, salvaged: 0, salvageGold: 0 },
    }, defaultState());
    state.classId = 'warrior';
    state.guideSeen = true;
    state.tutorialComplete = true;
    const restored = {
      stage: currentFirstLifeExpeditionStage()?.index,
      cleared: [...state.expeditionClearedStages],
      stats: { ...state.expeditionStageStats },
    };

    state.level = 9;
    state.xp = 134;
    pendingExpeditionSettlements = [];
    awardXp(1);
    const atGate = {
      level: state.level,
      stage: currentFirstLifeExpeditionStage()?.index,
      gate: state.chapterBossPending,
      settlements: [...pendingExpeditionSettlements],
      cleared: [...state.expeditionClearedStages],
    };
    confirmChapterBoss();
    monsters = [];
    spawnMonster();
    const boss = monsters.find(monster => monster.chapterBoss);
    return {
      restored,
      atGate,
      spawned: !!boss && MONSTER_TYPES[boss.type].isBoss,
      inProgress: state.chapterBossInProgress,
    };
  });
  assert.deepEqual(result.restored, {
    stage: 2,
    cleared: [0, 1],
    stats: { stage: 2, kills: 4, items: 1, salvaged: 0, salvageGold: 0 },
  });
  assert.deepEqual(result.atGate, {
    level: 10,
    stage: 2,
    gate: 1,
    settlements: [],
    cleared: [0, 1],
  });
  assert.equal(result.spawned, true);
  assert.equal(result.inProgress, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('自动分解只处理新掉落，撤销幂等，锁定装备不能出售或参与合成', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.classId = 'warrior';
    state.gold = 100;
    state.inventoryRules = { autoSalvageMaxRarity: 1, protectUpgraded: true };
    const makeItem = (id, rarityIdx = 0, locked = false) => ({
      id, slot: 'head', name: `Item ${id}`, nameEn: `Item ${id}`, icon: 'head',
      dmg: 0, hp: 5, rarityIdx, upgradeLevel: 0, affixes: [], setId: null, locked,
    });
    const oldItem = makeItem(700, 0, false);
    state.inventory = [oldItem];
    const received = receiveLootItem(makeItem(701, 0, false));
    const afterReceive = { gold: state.gold, ids: state.inventory.map(item => item.id) };
    const undo1 = undoLastInventoryBatch();
    const afterUndo = { gold: state.gold, ids: state.inventory.map(item => item.id).sort() };
    const undo2 = undoLastInventoryBatch();
    toggleItemLock(701);
    sellItem(701);
    const lockedSurvivedSell = state.inventory.some(item => item.id === 701 && item.locked);
    state.inventory.push(makeItem(702), makeItem(703), makeItem(704));
    mergeSlotRarity('head', 0);
    return {
      received,
      afterReceive,
      undo1,
      afterUndo,
      undo2,
      lockedSurvivedSell,
      lockedSurvivedMerge: state.inventory.some(item => item.id === 701 && item.locked),
      oldItemSurvived: state.inventory.some(item => item.id === 700),
      mergedRares: state.inventory.filter(item => item.slot === 'head' && item.rarityIdx === 1).length,
    };
  });
  assert.equal(result.received.salvaged, true);
  assert.deepEqual(result.afterReceive.ids, [700]);
  assert.equal(result.undo1, true);
  assert.deepEqual(result.afterUndo.ids, [700, 701]);
  assert.equal(result.afterUndo.gold, 100);
  assert.equal(result.undo2, false);
  assert.equal(result.lockedSurvivedSell, true);
  assert.equal(result.lockedSurvivedMerge, true);
  assert.equal(result.oldItemSurvived, false);
  assert.equal(result.mergedRares, 1);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('战斗本能只在真实命中时推进：专注第四击、猎杀阈值、坚守命中减伤', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.level = 1;
    state.catMaxHp = 1000;
    state.catHp = 1000;
    idleSec = 0;
    suppressCombatUntil = 0;
    const target = { type: 0, x: catFrontX() + 10, y: GROUND_Y - 32, hp: 100, maxHp: 100, elite: false };

    state.classId = 'mage';
    resetInstinctTarget(target);
    const syncHit = { dmg: 10, isCrit: false, critDmgMult: 1.5, resonanceSkill: true };
    commitInstinctHit(target, syncHit, 1000);
    const afterSync = instinctState.focusHits;
    for (let i = 0; i < 3; i++) {
      const hit = { dmg: 10, isCrit: false, critDmgMult: 1.5, resonanceSkill: false };
      prepareInstinctAttack(target, hit, 1000 + i);
      commitInstinctHit(target, hit, 1000 + i);
    }
    const fourth = { dmg: 10, isCrit: false, critDmgMult: 1.5, resonanceSkill: false };
    prepareInstinctAttack(target, fourth, 1010);
    const focusBeforeCommit = { hits: instinctState.focusHits, crit: fourth.isCrit, dmg: fourth.dmg, focus: fourth.instinctFocus };
    commitInstinctHit(target, fourth, 1010);
    const focusAfterCommit = instinctState.focusHits;

    state.classId = 'rogue';
    const healthy = { ...target, hp: 36, maxHp: 100 };
    const healthyHit = { dmg: 10, isCrit: false, critDmgMult: 1.5 };
    prepareInstinctAttack(healthy, healthyHit, 2000);
    const weak = { ...target, hp: 35, maxHp: 100 };
    const weakHit = { dmg: 10, isCrit: false, critDmgMult: 1.5 };
    prepareInstinctAttack(weak, weakHit, 2000);
    const bossType = MONSTER_TYPES.findIndex(type => type.isBoss);
    const boss = { type: bossType, x: target.x, y: target.y, hp: 350, maxHp: 1000 };
    const bossHit = { dmg: 1000, isCrit: false, critDmgMult: 1.5 };
    prepareInstinctAttack(boss, bossHit, 2000);

    state.classId = 'warrior';
    instinctState.guardMonster = null;
    instinctState.guardCooldownUntil = 0;
    const guardTarget = { ...target, attackAnim: 0, dungeon: false };
    const guardArmed = armGuardInstinct(guardTarget, performance.now());
    monsterAttack(guardTarget);
    const guardResult = {
      armed: guardArmed,
      damage: 1000 - state.catHp,
      consumed: !guardTarget.instinctGuard && instinctState.guardMonster === null,
      cooldownSet: instinctState.guardCooldownUntil > performance.now(),
    };
    return {
      afterSync,
      focusBeforeCommit,
      focusAfterCommit,
      healthyHunt: !!healthyHit.instinctHunt,
      weak: { hunt: !!weakHit.instinctHunt, bonus: weakHit.instinctBonus, dmg: weakHit.dmg },
      boss: { bonus: bossHit.instinctBonus, dmg: bossHit.dmg },
      guardResult,
    };
  });
  assert.equal(result.afterSync, 0);
  assert.deepEqual(result.focusBeforeCommit, { hits: 3, crit: true, dmg: 15, focus: true });
  assert.equal(result.focusAfterCommit, 0);
  assert.equal(result.healthyHunt, false);
  assert.deepEqual(result.weak, { hunt: true, bonus: 6, dmg: 16 });
  assert.deepEqual(result.boss, { bonus: 60, dmg: 1060 });
  assert.equal(result.guardResult.armed, true);
  assert.equal(result.guardResult.damage, 2);
  assert.equal(result.guardResult.consumed, true);
  assert.equal(result.guardResult.cooldownSet, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('审查回归：死亡怪释放坚守、猎杀不转移、冲突撤销保持原子性', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.catMaxHp = 1000;
    state.catHp = 1000;
    idleSec = 0;
    suppressCombatUntil = 0;
    const makeMonster = (hp = 100) => ({
      type: 0, x: catFrontX() + 10, y: GROUND_Y - 40, hp, maxHp: 100,
      elite: false, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
      attackAnim: 0, attackDidHit: false,
    });

    const first = makeMonster(1);
    const second = makeMonster(100);
    monsters = [first, second];
    instinctState.guardMonster = null;
    instinctState.guardCooldownUntil = 0;
    const firstArmed = armGuardInstinct(first, 1000);
    first.hp = 0;
    const random = Math.random;
    Math.random = () => 0.99;
    killMonster(first);
    const secondArmed = armGuardInstinct(second, 1001);
    const reservedSecond = instinctState.guardMonster === second;

    state.classId = 'rogue';
    releaseGuardReservation();
    const weak = makeMonster(30);
    const healthy = makeMonster(100);
    healthy.x = catFrontX() + 2;
    monsters = [weak];
    const retargetHit = {
      dmg: 10, isCrit: false, critDmgMult: 2, resonanceSkill: false,
      weaponType: 'melee', weapon: null, color: '#ffffff', mult: 1,
    };
    scheduleMeleeHit(weak, retargetHit);
    weak.hp = 0;
    monsters = [healthy];
    pendingMeleeHits[0].impactAt = 0;
    processPendingMeleeHits(performance.now());
    Math.random = random;

    state.gold = 200;
    const conflictItem = {
      id: 900, slot: 'head', name: 'Conflict', nameEn: 'Conflict', icon: 'head',
      dmg: 0, hp: 5, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null, locked: false,
    };
    state.inventory = [{ ...conflictItem }];
    state.lastInventoryBatch = {
      type: 'auto-salvage', batchId: 'conflict-batch', stage: -1,
      items: [{ ...conflictItem }, { ...conflictItem, id: 901 }],
      goldDelta: 40, createdAt: Date.now(), undone: false,
    };
    const undo = undoLastInventoryBatch();
    return {
      guard: {
        firstArmed,
        secondArmed,
        reservedSecond,
        firstReleased: !first.instinctGuard,
      },
      retarget: {
        hp: healthy.hp,
        hunt: !!retargetHit.instinctHunt,
        cooldown: healthy.huntCooldownUntil || 0,
      },
      undo: {
        result: undo,
        gold: state.gold,
        ids: state.inventory.map(item => item.id),
        undone: state.lastInventoryBatch.undone,
      },
    };
  });
  assert.deepEqual(result.guard, {
    firstArmed: true,
    secondArmed: true,
    reservedSecond: true,
    firstReleased: true,
  });
  assert.deepEqual(result.retarget, { hp: 90, hunt: false, cooldown: 0 });
  assert.deepEqual(result.undo, { result: false, gold: 200, ids: [900], undone: false });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('坚守预留在阶段清场、撤退和生命切换后释放，下一只怪可重新架盾', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    const makeMonster = () => ({
      type: 0, x: catFrontX() + 10, y: GROUND_Y - 40, hp: 100, maxHp: 100,
      elite: false, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
      attackAnim: 0, attackDidHit: false,
    });
    const resetGuardScenario = () => {
      state = defaultState();
      state.guideSeen = true;
      state.tutorialComplete = true;
      state.classId = 'warrior';
      state.catMaxHp = 1000;
      state.catHp = 1000;
      idleSec = 0;
      catDead = 0;
      combatState = 'patrol';
      instinctState.guardMonster = null;
      instinctState.guardCooldownUntil = 0;
      monsters = [];
    };

    resetGuardScenario();
    const clearFirst = makeMonster();
    monsters = [clearFirst];
    const clearArmed = armGuardInstinct(clearFirst, 1000);
    clearCombatForExpeditionSettlement();
    const clearNext = makeMonster();
    monsters = [clearNext];
    const clearRearmed = armGuardInstinct(clearNext, 1001);

    resetGuardScenario();
    const retreatFirst = makeMonster();
    retreatFirst.elite = true;
    monsters = [retreatFirst];
    const retreatArmed = armGuardInstinct(retreatFirst, 2000);
    beginSafeRetreat(retreatFirst);
    const retreatReleased = instinctState.guardMonster === null;
    combatState = 'patrol';
    const retreatNext = makeMonster();
    monsters = [retreatNext];
    const retreatRearmed = armGuardInstinct(retreatNext, 2001);

    resetGuardScenario();
    state.level = 50;
    const lifeFirst = makeMonster();
    monsters = [lifeFirst];
    const lifeArmed = armGuardInstinct(lifeFirst, 3000);
    instinctState.guardCooldownUntil = performance.now() + 60000;
    beginLifeMemorySelection('prestige');
    const selectionReleased = instinctState.guardMonster === null;
    chooseLifeMemory('guardian');
    closeModal();
    combatState = 'patrol';
    idleSec = 0;
    const lifeNext = makeMonster();
    monsters = [lifeNext];
    const cooldownReset = instinctState.guardCooldownUntil === 0;
    const lifeRearmed = armGuardInstinct(lifeNext, 3001);

    return {
      clear: { clearArmed, released: !clearFirst.instinctGuard, clearRearmed },
      retreat: { retreatArmed, retreatReleased, retreatRearmed },
      life: { lifeArmed, selectionReleased, cooldownReset, lifeRearmed },
    };
  });
  assert.deepEqual(result.clear, { clearArmed: true, released: true, clearRearmed: true });
  assert.deepEqual(result.retreat, { retreatArmed: true, retreatReleased: true, retreatRearmed: true });
  assert.deepEqual(result.life, { lifeArmed: true, selectionReleased: true, cooldownReset: true, lifeRearmed: true });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('弓释放前与法术飞行中改目标时，满血新目标不继承旧目标猎杀或处决加成', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'rogue';
    suppressCombatUntil = 0;
    catDead = 0;
    const makeMonster = (hp) => ({
      type: 0, x: catFrontX() + 120, y: GROUND_Y - 40, hp, maxHp: 100,
      elite: false, dungeon: false, flash: 0, hitReact: 0, frozenTimer: 0,
    });
    const makeGear = (id, slot) => ({
      id, slot, name: `Execution ${slot}`, nameEn: `Execution ${slot}`, icon: slot,
      weaponType: null, dmg: 0, hp: 0, rarityIdx: 0, upgradeLevel: 0,
      affixes: [], setId: 'execution', locked: false,
    });
    state.equipment.head = makeGear(10, 'head');
    state.equipment.body = makeGear(11, 'body');
    const random = Math.random;
    Math.random = () => 0.99;

    const bow = { id: 1, slot: 'weapon', name: 'Test Bow', icon: 'bowWep', weaponType: 'ranged', dmg: 1, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    const bowWeak = makeMonster(30);
    const bowHealthy = makeMonster(100);
    state.equipment.weapon = bow;
    const bowExpected = buildPlayerHit(bowHealthy).dmg;
    const bowHit = buildPlayerHit(bowWeak);
    monsters = [bowWeak];
    scheduleRangedAction(bowWeak, bowHit);
    bowWeak.hp = 0;
    monsters = [bowHealthy];
    pendingRangedActions[0].releaseAt = 0;
    processPendingRangedActions(performance.now());
    projectiles[0].speed = 10000;
    updateProjectiles(1);
    const bowResult = { hp: bowHealthy.hp, expected: 100 - bowExpected, hunt: !!bowHit.instinctHunt, execute: !!bowHit.executeActive, cooldown: bowHealthy.huntCooldownUntil || 0 };

    const wand = { id: 2, slot: 'weapon', name: 'Test Wand', icon: 'wandWep', weaponType: 'magic', dmg: 1, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    const magicWeak = makeMonster(30);
    const magicHealthy = makeMonster(100);
    state.equipment.weapon = wand;
    const magicExpected = buildPlayerHit(magicHealthy).dmg;
    const magicHit = buildPlayerHit(magicWeak);
    monsters = [magicWeak];
    projectiles = [];
    spawnProjectile(magicWeak, magicHit);
    magicWeak.hp = 0;
    monsters = [magicHealthy];
    projectiles[0].speed = 10000;
    updateProjectiles(1);
    const magicResult = { hp: magicHealthy.hp, expected: 100 - magicExpected, hunt: !!magicHit.instinctHunt, execute: !!magicHit.executeActive, cooldown: magicHealthy.huntCooldownUntil || 0 };
    Math.random = random;
    return { bowResult, magicResult };
  });
  assert.equal(result.bowResult.hp, result.bowResult.expected);
  assert.deepEqual({ hunt: result.bowResult.hunt, execute: result.bowResult.execute, cooldown: result.bowResult.cooldown }, { hunt: false, execute: false, cooldown: 0 });
  assert.equal(result.magicResult.hp, result.magicResult.expected);
  assert.deepEqual({ hunt: result.magicResult.hunt, execute: result.magicResult.execute, cooldown: result.magicResult.cooldown }, { hunt: false, execute: false, cooldown: 0 });
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('匕首、剑和锤只在各自命中帧结算一次伤害', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 1;
    state.skills.tempo = 0;
    suppressCombatUntil = 0;
    catDead = 0;
    const weapons = {
      dagger: null,
      sword: { id: 101, slot: 'weapon', name: '木剑', icon: 'swordWep', weaponType: 'melee', dmg: 2, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
      hammer: { id: 102, slot: 'weapon', name: '铁锤', icon: 'hammerWep', weaponType: 'melee', dmg: 5, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
    };
    const rows = [];
    const random = Math.random;
    Math.random = () => 0.99;

    for (const [key, weapon] of Object.entries(weapons)) {
      state.equipment.weapon = weapon;
      resonanceState = BondCatCore.createResonanceState();
      pendingMeleeHits = [];
      const type = MONSTER_TYPES[0];
      const target = {
        type: 0,
        x: catFrontX() + Math.min(12, meleeReachForWeapon(weapon) - 1),
        y: STAGE_H - type.size - 8,
        hp: 1000,
        maxHp: 1000,
        elite: false,
        dungeon: false,
        flash: 0,
        hitReact: 0,
        hitStun: 0,
        attackAnim: 0,
        attackDidHit: false,
        atkTimer: 0,
        frozenTimer: 0,
      };
      monsters = [target];
      const hit = buildPlayerHit(target);
      hit.dmg = 10;
      hit.isCrit = false;
      hit.resonanceSkill = false;
      hit.ignoreDodge = true;
      attackArc = 0;
      activeAttackVisualHit = null;
      const started = startInputAttack(target);
      const hitAt = WEAPON_ACTIONS[key].hitAt;
      const duration = attackArcDuration;
      advancePlayerActionTimeline(duration * (hitAt - 0.01));
      updateCombatActionState();
      const hpBeforeImpact = target.hp;
      const before = { progress: attackProgress(), state: combatState };
      advancePlayerActionTimeline(duration * 0.02);
      updateCombatActionState();
      const hpAfterImpact = target.hp;
      const after = { progress: attackProgress(), state: combatState };
      advancePlayerActionTimeline(duration * 0.05);
      rows.push({
        key,
        started,
        hitAt,
        before,
        after,
        hpBeforeImpact,
        hpAfterImpact,
        hpAfterRepeat: target.hp,
      });
    }
    Math.random = random;
    return rows;
  });

  for (const row of result) {
    assert.equal(row.started, true, `${row.key} 应启动攻击动作`);
    assert.ok(row.before.progress < row.hitAt, `${row.key} 结算前画面仍应处于命中帧之前`);
    assert.equal(row.before.state, 'windup', `${row.key} 结算前应显示前摇`);
    assert.equal(row.hpBeforeImpact, 1000, `${row.key} 前摇结束前不能提前伤害`);
    assert.ok(row.after.progress >= row.hitAt, `${row.key} 伤害结算时画面必须跨过命中帧`);
    assert.notEqual(row.after.state, 'windup', `${row.key} 命中后不能仍显示前摇`);
    assert.ok(row.hpAfterImpact < row.hpBeforeImpact, `${row.key} 越过命中帧后应造成伤害`);
    assert.equal(row.hpAfterRepeat, row.hpAfterImpact, `${row.key} 同一次动作只能结算一次`);
  }
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('弓箭从弓口发射并跟随原目标，命中时不让猫二次后坐', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'rogue';
    state.level = 1;
    const bow = { id: 201, slot: 'weapon', name: '猎弓', icon: 'bowWep', weaponType: 'ranged', dmg: 4, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    state.equipment.weapon = bow;
    resonanceState = BondCatCore.createResonanceState();
    const type = MONSTER_TYPES[0];
    const makeTarget = (x, hp = 1000) => ({
      type: 0, x, y: STAGE_H - type.size - 8, hp, maxHp: hp,
      elite: false, dungeon: false, flash: 0, hitReact: 0, hitStun: 0,
      attackAnim: 0, attackDidHit: false, atkTimer: 0, frozenTimer: 0,
    });
    const target = makeTarget(catFrontX() + 150);
    monsters = [target];
    const hit = buildPlayerHit(target);
    hit.isCrit = false;
    hit.resonanceSkill = false;
    hit.ignoreDodge = true;
    spawnProjectile(target, hit);
    const arrow = projectiles[0];
    const start = { x: arrow.x, y: arrow.y, catFront: catFrontX(), targetX: monsterCenter(target).x };
    target.x += 24;
    updateProjectiles(0);
    const tracked = { tx: arrow.tx, targetX: monsterCenter(target).x };
    catMotion.attackKick = 0.37;
    catMotion.hitStop = 0.22;
    arrow.speed = 10000;
    const hpBefore = target.hp;
    updateProjectiles(1);
    const impact = {
      hpBefore,
      hpAfter: target.hp,
      attackKick: catMotion.attackKick,
      hitStop: catMotion.hitStop,
    };

    const oldTarget = makeTarget(catFrontX() + 140);
    const newTarget = makeTarget(catFrontX() + 150);
    monsters = [oldTarget, newTarget];
    projectiles = [];
    const staleHit = buildPlayerHit(oldTarget);
    staleHit.isCrit = false;
    staleHit.resonanceSkill = false;
    staleHit.ignoreDodge = true;
    spawnProjectile(oldTarget, staleHit);
    oldTarget.hp = 0;
    const newTargetHp = newTarget.hp;
    projectiles[0].speed = 10000;
    updateProjectiles(1);

    state.equipment.weapon = { id: 202, slot: 'weapon', name: '魔杖', icon: 'wandWep', weaponType: 'magic', dmg: 9, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    const magicTarget = makeTarget(catFrontX() + 160);
    monsters = [magicTarget];
    projectiles = [];
    const magicHit = buildPlayerHit(magicTarget);
    magicHit.isCrit = false;
    magicHit.resonanceSkill = false;
    magicHit.ignoreDodge = true;
    spawnProjectile(magicTarget, magicHit);
    catMotion.attackKick = 0.41;
    catMotion.hitStop = 0.24;
    projectiles[0].speed = 10000;
    updateProjectiles(1);
    const magicImpact = { attackKick: catMotion.attackKick, hitStop: catMotion.hitStop };

    return {
      start,
      tracked,
      impact,
      newTargetHp,
      newTargetHpAfter: newTarget.hp,
      magicImpact,
    };
  });

  assert.ok(result.start.x > result.start.catFront && result.start.x < result.start.targetX, '箭应从猫前方的弓口发射');
  assert.ok(Math.abs(result.tracked.tx - result.tracked.targetX) < 0.01, '箭在飞行中应对准原目标当前位置');
  assert.ok(result.impact.hpAfter < result.impact.hpBefore, '箭抵达后应造成伤害');
  assert.deepEqual(
    { attackKick: result.impact.attackKick, hitStop: result.impact.hitStop },
    { attackKick: 0.37, hitStop: 0.22 },
    '远程命中只能反馈目标，不能让猫再次后坐',
  );
  assert.equal(result.newTargetHpAfter, result.newTargetHp, '原目标死亡后弓箭不能改打另一只怪');
  assert.deepEqual(result.magicImpact, { attackKick: 0.41, hitStop: 0.24 }, '法术命中也不能让猫二次后坐');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('五类武器在长帧恢复时仍由画面命中帧统一触发伤害或发射', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const rows = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 1;
    state.skills.tempo = 0;
    suppressCombatUntil = 0;
    catDead = 0;
    const weapons = {
      dagger: null,
      sword: { id: 301, slot: 'weapon', name: '木剑', icon: 'swordWep', weaponType: 'melee', dmg: 2, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
      hammer: { id: 302, slot: 'weapon', name: '铁锤', icon: 'hammerWep', weaponType: 'melee', dmg: 5, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
      bow: { id: 303, slot: 'weapon', name: '猎弓', icon: 'bowWep', weaponType: 'ranged', dmg: 4, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
      wand: { id: 304, slot: 'weapon', name: '魔杖', icon: 'wandWep', weaponType: 'magic', dmg: 9, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null },
    };
    const result = [];
    const random = Math.random;
    Math.random = () => 0.99;
    for (const [key, weapon] of Object.entries(weapons)) {
      state.equipment.weapon = weapon;
      resonanceState = BondCatCore.createResonanceState();
      pendingInputActions = 0;
      pendingMeleeHits = [];
      pendingRangedActions = [];
      projectiles = [];
      attackArc = 0;
      activeAttackVisualHit = null;
      combatState = 'patrol';
      const type = MONSTER_TYPES[0];
      const weaponType = itemWeaponType(weapon);
      const range = weaponType === 'melee' ? Math.min(12, meleeReachForWeapon(weapon) - 1) : (weaponType === 'ranged' ? 150 : 165);
      const target = {
        type: 0, x: catFrontX() + range, y: STAGE_H - type.size - 8,
        hp: 1000, maxHp: 1000, elite: false, dungeon: false, flash: 0,
        hitReact: 0, hitStun: 0, attackAnim: 0, attackDidHit: false,
        atkTimer: 0, frozenTimer: 0, speed: 0,
      };
      monsters = [target];
      const started = startInputAttack(target);
      const hitAt = WEAPON_ACTIONS[key].hitAt;
      const duration = attackArcDuration;
      update(0.1, duration * (hitAt - 0.02));
      const before = {
        progress: attackProgress(), state: combatState, hp: target.hp,
        projectiles: projectiles.length,
      };
      update(0.1, duration * 0.04);
      const after = {
        progress: attackProgress(), state: combatState, hp: target.hp,
        projectiles: projectiles.length,
      };
      result.push({ key, weaponType, started, hitAt, before, after });
    }
    Math.random = random;
    return result;
  });

  for (const row of rows) {
    assert.equal(row.started, true, `${row.key} 应启动攻击`);
    assert.ok(row.before.progress < row.hitAt, `${row.key} 长帧前仍应在命中帧前`);
    assert.equal(row.before.state, 'windup', `${row.key} 长帧前应为前摇`);
    assert.equal(row.before.hp, 1000, `${row.key} 命中帧前不能伤害`);
    assert.equal(row.before.projectiles, 0, `${row.key} 命中帧前不能发射投射物`);
    assert.ok(row.after.progress >= row.hitAt, `${row.key} 结算后画面应跨过命中帧`);
    assert.notEqual(row.after.state, 'windup', `${row.key} 结算后不能仍处于前摇`);
    if (row.weaponType === 'melee') assert.ok(row.after.hp < 1000, `${row.key} 跨帧后应造成近战伤害`);
    else assert.equal(row.after.projectiles, 1, `${row.key} 跨帧后应只发射一个投射物`);
  }
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('八类怪物按独立前摇命中一次，近战受击会中断普通怪但只延后 Boss', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'mage';
    state.level = 30;
    state.catMaxHp = 5000;
    catDead = 0;
    idleSec = 0;
    const makeMonster = (typeIndex) => {
      const type = MONSTER_TYPES[typeIndex];
      const monster = {
        type: typeIndex,
        x: catFrontX(),
        y: STAGE_H - type.size - 8,
        hp: 5000,
        maxHp: 5000,
        elite: false,
        dungeon: false,
        speed: 0,
        flash: 0,
        hitReact: 0,
        hitStun: 0,
        attackAnim: 0,
        attackDuration: 0,
        attackDidHit: false,
        atkTimer: 0,
        frozenTimer: 0,
      };
      monster.x = catFrontX() + Math.max(6, monsterThreatRange(monster) - 1);
      return monster;
    };

    const attacks = MONSTER_TYPES.map((type, typeIndex) => {
      state.catHp = state.catMaxHp;
      const monster = makeMonster(typeIndex);
      monsters = [monster];
      startMonsterAttack(monster);
      const duration = monster.attackDuration;
      const impactAt = monster.attackImpactAt;
      const hpStart = state.catHp;
      updateMonsterAttack(monster, duration * impactAt - 0.0005);
      const hpBeforeImpact = state.catHp;
      updateMonsterAttack(monster, 0.001);
      const hpAfterImpact = state.catHp;
      const didHit = monster.attackDidHit;
      updateMonsterAttack(monster, duration);
      return {
        name: type.img,
        duration,
        impactAt,
        hpStart,
        hpBeforeImpact,
        hpAfterImpact,
        hpAfterRepeat: state.catHp,
        didHit,
      };
    });

    const sword = { id: 301, slot: 'weapon', name: '木剑', icon: 'swordWep', weaponType: 'melee', dmg: 2, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    state.equipment.weapon = sword;
    resonanceState = BondCatCore.createResonanceState();
    const random = Math.random;
    Math.random = () => 0.99;

    const normal = makeMonster(3);
    monsters = [normal];
    startMonsterAttack(normal);
    updateMonsterAttack(normal, normal.attackDuration * 0.25);
    const normalHit = buildPlayerHit(normal);
    normalHit.dmg = 1;
    normalHit.isCrit = false;
    normalHit.resonanceSkill = false;
    normalHit.ignoreDodge = true;
    applyPlayerHit(normal, normalHit);
    const normalInterrupted = {
      attackAnim: normal.attackAnim,
      hitStun: normal.hitStun,
      atkTimer: normal.atkTimer,
    };
    startMonsterAttack(normal);
    normalInterrupted.restartBlocked = normal.attackAnim === 0;

    const boss = makeMonster(4);
    monsters = [boss];
    startMonsterAttack(boss);
    updateMonsterAttack(boss, boss.attackDuration * 0.25);
    const bossAttackBefore = boss.attackAnim;
    const bossHit = buildPlayerHit(boss);
    bossHit.dmg = 1;
    bossHit.isCrit = false;
    bossHit.resonanceSkill = false;
    bossHit.ignoreDodge = true;
    applyPlayerHit(boss, bossHit);
    const bossDelayed = {
      before: bossAttackBefore,
      after: boss.attackAnim,
      hitStun: boss.hitStun,
    };
    Math.random = random;
    return { attacks, normalInterrupted, bossDelayed };
  });

  assert.deepEqual(result.attacks.map(row => [row.name, row.duration, row.impactAt]), [
    ['slime', 0.52, 0.58],
    ['bat', 0.38, 0.44],
    ['skull', 0.48, 0.54],
    ['goblin', 0.56, 0.60],
    ['dragon', 0.76, 0.64],
    ['skeletonKing', 0.82, 0.67],
    ['shadowBlade', 0.36, 0.40],
    ['elementalLich', 0.92, 0.70],
  ]);
  for (const row of result.attacks) {
    assert.equal(row.hpBeforeImpact, row.hpStart, `${row.name} 前摇结束前不能伤害猫`);
    assert.ok(row.hpAfterImpact < row.hpBeforeImpact, `${row.name} 越过命中帧后应伤害猫`);
    assert.equal(row.hpAfterRepeat, row.hpAfterImpact, `${row.name} 同一攻击周期只能伤害一次`);
    assert.equal(row.didHit, true, `${row.name} 命中帧应登记完成`);
  }
  assert.equal(result.normalInterrupted.attackAnim, 0);
  assert.ok(result.normalInterrupted.hitStun >= 0.16);
  assert.equal(result.normalInterrupted.atkTimer, 0);
  assert.equal(result.normalInterrupted.restartBlocked, true);
  assert.ok(result.bossDelayed.after > 0 && result.bossDelayed.after <= result.bossDelayed.before);
  assert.ok(result.bossDelayed.hitStun > 0 && result.bossDelayed.hitStun < 0.10);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('真实致死攻击只结算一次奖励，死亡动作继承武器力量', async () => {
  const { context, page, pageErrors } = await openGame('channel=steam-full&demo=0');
  const result = await page.evaluate(() => {
    closeModal();
    state = defaultState();
    state.guideSeen = true;
    state.tutorialComplete = true;
    state.classId = 'warrior';
    state.level = 1;
    const hammer = { id: 401, slot: 'weapon', name: '铁锤', icon: 'hammerWep', weaponType: 'melee', dmg: 5, hp: 0, rarityIdx: 0, upgradeLevel: 0, affixes: [], setId: null };
    state.equipment.weapon = hammer;
    resonanceState = BondCatCore.createResonanceState();
    const type = MONSTER_TYPES[3];
    const target = {
      type: 3, x: catFrontX() + 8, y: STAGE_H - type.size - 8,
      hp: 1, maxHp: 50, elite: false, dungeon: false, speed: 0,
      flash: 0, hitReact: 0, hitStun: 0, attackAnim: 0,
      attackDidHit: false, atkTimer: 0, frozenTimer: 0,
    };
    monsters = [target];
    deathEchoes = [];
    const killsBefore = state.kills;
    const random = Math.random;
    Math.random = () => 0.99;
    const hit = buildPlayerHit(target);
    hit.dmg = 10;
    hit.isCrit = false;
    hit.resonanceSkill = false;
    hit.ignoreDodge = true;
    const applied = applyPlayerHit(target, hit);
    const secondKill = killMonster(target);
    Math.random = random;
    return {
      applied,
      secondKill,
      killDelta: state.kills - killsBefore,
      echoCount: deathEchoes.length,
      echoKind: deathEchoes[0]?.kind,
      echoPower: deathEchoes[0]?.power,
      resolved: target.deathResolved,
      rewarded: target.rewardGranted,
    };
  });

  assert.equal(result.applied, true);
  assert.equal(result.secondKill, false);
  assert.equal(result.killDelta, 1);
  assert.equal(result.echoCount, 1);
  assert.equal(result.echoKind, 'hammer');
  assert.ok(result.echoPower >= 1.2);
  assert.equal(result.resolved, true);
  assert.equal(result.rewarded, true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});
