import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { dealGoals, goalById, checkGoal } from '../src/game/goals.js';
import { drawEvent, eventCardById } from '../src/game/events.js';

const settlement = (overrides = {}) => ({
  round: 'r2',
  eventId: null,
  powerParts: [],
  power: 0,
  carried: 0,
  available: 0,
  plannedByRole: {},
  plannedTotal: 0,
  actualByRole: { EV: 0, BUILDING: 0 },
  actual: 0,
  shortage: 0,
  storageCap: 2,
  stored: 0,
  curtailed: 0,
  legalQuota: 0,
  penalized: 0,
  penalty: 0,
  fundsEnd: 0,
  materialSavings: 0,
  steps: [],
  ...overrides,
});

const teamWith = (r1Overrides, r2Overrides, flags = {}) => {
  const team = createTeam('t1', '一队');
  team.settlement.r1 = settlement({ round: 'r1', ...r1Overrides });
  team.settlement.r2 = settlement(r2Overrides);
  Object.assign(team.flags, flags);
  return team;
};

test('发2张不重复目标卡，且都在6张池内', () => {
  const pool = new Set([
    'storage_master',
    'load_pioneer',
    'wind_chaser',
    'windfree_city',
    'garden_city',
    'funds_steward',
  ]);
  for (let index = 0; index < 20; index += 1) {
    const [first, second] = dealGoals();
    assert.notEqual(first, second);
    assert.ok(pool.has(first) && pool.has(second));
  }
  assert.equal(goalById('storage_master').name, '储能达人');
});

test('抽事件卡按轮次池选取', () => {
  const r1Pool = new Set(['green_bond', 'research_breakthrough', 'green_consumption']);
  const r2Pool = new Set(['cold_wave', 'price_surge', 'pioneer_cert']);
  for (let index = 0; index < 20; index += 1) {
    assert.ok(r1Pool.has(drawEvent('r1')));
    assert.ok(r2Pool.has(drawEvent('r2')));
  }
  assert.equal(eventCardById('r1', 'green_bond').fundsBase, 125);
});

test('储能达人要求容量6以上且入储2以上', () => {
  assert.equal(checkGoal('storage_master', teamWith(
    { stored: 1 },
    { stored: 1, storageCap: 6 },
  )), true);
  assert.equal(checkGoal('storage_master', teamWith(
    { stored: 1 },
    { stored: 0, storageCap: 6 },
  )), false);
  assert.equal(checkGoal('storage_master', teamWith(
    { stored: 1 },
    { stored: 1, storageCap: 4 },
  )), false);
});

test('负荷先锋要求两轮消耗15以上', () => {
  assert.equal(checkGoal('load_pioneer', teamWith({ actual: 8 }, { actual: 7 })), true);
  assert.equal(checkGoal('load_pioneer', teamWith({ actual: 8 }, { actual: 6 })), false);
});

test('追风者要求选过风电且消耗10以上', () => {
  assert.equal(checkGoal('wind_chaser', teamWith(
    { actual: 6 },
    { actual: 5 },
    { hasOffshoreWind: true },
  )), true);
  assert.equal(checkGoal('wind_chaser', teamWith(
    { actual: 6 },
    { actual: 5 },
    { hasOffshoreWind: false },
  )), false);
  assert.equal(checkGoal('wind_chaser', teamWith(
    { actual: 6 },
    { actual: 3 },
    { hasOffshoreWind: true },
  )), false);
});

test('无风之城要求无风电、总绿电10以上且零弃电', () => {
  assert.equal(checkGoal('windfree_city', teamWith(
    { power: 5, curtailed: 0 },
    { power: 6, curtailed: 0 },
    { hasOffshoreWind: false },
  )), true);
  assert.equal(checkGoal('windfree_city', teamWith(
    { power: 5, curtailed: 0 },
    { power: 6, curtailed: 1 },
    { hasOffshoreWind: false },
  )), false);
  assert.equal(checkGoal('windfree_city', teamWith(
    { power: 5, curtailed: 0 },
    { power: 6, curtailed: 0 },
    { hasOffshoreWind: true },
  )), false);
});

test('花园城市要求建过地标且每轮弃电不超过2', () => {
  assert.equal(checkGoal('garden_city', teamWith(
    { curtailed: 2 },
    { curtailed: 2 },
    { builtLandmark: true },
  )), true);
  assert.equal(checkGoal('garden_city', teamWith(
    { curtailed: 3 },
    { curtailed: 0 },
    { builtLandmark: true },
  )), false);
  assert.equal(checkGoal('garden_city', teamWith(
    { curtailed: 0 },
    { curtailed: 0 },
    { builtLandmark: false },
  )), false);
});

test('资金管家要求第2轮结余70以上', () => {
  assert.equal(checkGoal('funds_steward', teamWith({}, { fundsEnd: 70 })), true);
  assert.equal(checkGoal('funds_steward', teamWith({}, { fundsEnd: 69 })), false);
});
