import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import {
  getAction,
  actionsForRole,
  costBreakdown,
  availableFunds,
  effectiveTransCap,
  storageCapAt,
} from '../src/game/actions.js';

function teamWith(round, event, records) {
  const team = createTeam('t1', '一队');
  team.eventCards[round] = event;
  for (const [roleId, actionIds] of Object.entries(records)) {
    team.actions[round][roleId] = { actionIds, locked: true, passed: false };
  }
  return team;
}

test('行动池按角色过滤', () => {
  const pool = actionsForRole('GENERATION').map((action) => action.id);
  assert.deepEqual(pool.sort(), ['nuclear', 'offshore_wind', 'solar_pv']);
  assert.equal(getAction('ev_v2g').dice.threshold, 3);
});

test('无折扣：基础成本原样', () => {
  const team = teamWith('r1', null, { GENERATION: ['solar_pv'] });
  const cb = costBreakdown(team, 'r1', { GENERATION: ['solar_pv'] });
  assert.equal(cb.items.GENERATION[0].effective, 25);
  assert.equal(cb.totalFunds, 25);
  assert.equal(cb.totalLand, 2);
  assert.equal(cb.materialSavings, 0);
});

test('钙钛矿当轮即生效：发电建造-10，计入材料节省', () => {
  const team = teamWith('r1', null, {
    MATERIAL: ['mat_pv_material'],
    GENERATION: ['offshore_wind'],
  });
  const selection = {
    MATERIAL: ['mat_pv_material'],
    GENERATION: ['offshore_wind'],
  };
  const cb = costBreakdown(team, 'r1', selection);
  assert.equal(cb.items.GENERATION[0].effective, 25);
  assert.equal(cb.materialSavings, 10);
});

test('钙钛矿跨轮生效（第1轮研发、第2轮仍减）', () => {
  const team = teamWith('r2', null, {});
  team.actions.r1.MATERIAL = { actionIds: ['mat_pv_material'], locked: true, passed: false };
  const cb = costBreakdown(team, 'r2', { GENERATION: ['solar_pv'] });
  assert.equal(cb.items.GENERATION[0].effective, 15);
});

test('全链降本当轮生效：全队各减5（含材料自身），上限为剩余成本', () => {
  const team = teamWith('r1', null, {
    MATERIAL: ['mat_chain_reduce'],
    NDRC: ['ndrc_subsidy'],
  });
  const selection = {
    MATERIAL: ['mat_chain_reduce'],
    NDRC: ['ndrc_subsidy'],
  };
  const cb = costBreakdown(team, 'r1', selection);
  assert.equal(cb.items.NDRC[0].effective, 15);
  assert.equal(cb.items.MATERIAL[0].effective, 5);
  assert.equal(cb.materialSavings, 10);
});

test('绿色消费潮：汽车/建筑各-10，不计入材料节省', () => {
  const team = teamWith('r1', 'green_consumption', { EV: ['ev_mass_produce'] });
  const cb = costBreakdown(team, 'r1', { EV: ['ev_mass_produce'] });
  assert.equal(cb.items.EV[0].effective, 15);
  assert.equal(cb.materialSavings, 0);
});

test('产学研：材料研发免费', () => {
  const team = teamWith('r1', 'research_breakthrough', {
    MATERIAL: ['mat_pv_material'],
  });
  const cb = costBreakdown(team, 'r1', { MATERIAL: ['mat_pv_material'] });
  assert.equal(cb.items.MATERIAL[0].effective, 0);
});

test('城长特批REDUCE5：指定行动-5，不计入材料节省', () => {
  const team = teamWith('r1', null, { EV: ['ev_mass_produce'] });
  team.approvals.r1 = { type: 'REDUCE5', actionId: 'ev_mass_produce' };
  const cb = costBreakdown(team, 'r1', { EV: ['ev_mass_produce'] });
  assert.equal(cb.items.EV[0].effective, 20);
  assert.equal(cb.materialSavings, 0);
});

test('地标特效：其后全域立体绿化-10', () => {
  const team = teamWith('r2', null, {});
  team.flags.builtLandmark = true;
  const cb = costBreakdown(team, 'r2', { BUILDING: ['bldg_greening'] });
  assert.equal(cb.items.BUILDING[0].effective, 15);
});

test('结余资金：国债125基数十 招商+30 改造返还+5 减成本', () => {
  const team = teamWith('r1', 'green_bond', {
    GENERATION: ['solar_pv'],
    GRID: ['flex_dispatch'],
    EV: ['ev_mass_produce'],
    BUILDING: ['bldg_retrofit'],
    MATERIAL: ['mat_pv_material'],
    NDRC: ['ndrc_investment'],
  });
  const selection = {
    GENERATION: ['solar_pv'],
    GRID: ['flex_dispatch'],
    EV: ['ev_mass_produce'],
    BUILDING: ['bldg_retrofit'],
    MATERIAL: ['mat_pv_material'],
    NDRC: ['ndrc_investment'],
  };
  assert.equal(availableFunds(team, 'r1', selection), 75);
});

test('输配上限：基建3 + 扩建4 + 当轮柔性2', () => {
  const team = teamWith('r2', null, {});
  team.actions.r1.GRID = { actionIds: ['grid_expand'], locked: true, passed: false };
  const selection = { GRID: ['flex_dispatch'] };
  assert.equal(effectiveTransCap(team, 'r2', selection), 9);
  assert.equal(effectiveTransCap(team, 'r2', {}), 7);
});

test('储能容量：初始2 + 储能电站4 + V2G掷骰', () => {
  const team = teamWith('r2', null, {});
  team.actions.r1.GRID = { actionIds: ['storage_plant'], locked: true, passed: false };
  team.actions.r2.EV = { actionIds: ['ev_v2g'], locked: true, passed: false };
  assert.equal(storageCapAt(team, 'r2', { EV: { success: true } }), 8);
  assert.equal(storageCapAt(team, 'r2', { EV: { success: false } }), 7);
  assert.equal(storageCapAt(team, 'r2', {}), 6);
});
