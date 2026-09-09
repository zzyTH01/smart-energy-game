import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { settleRound } from '../src/game/settlement.js';

export function buildGolden() {
  const team = createTeam('t1', '一队');
  const put = (round, role, ids) => {
    team.actions[round][role] = { actionIds: ids, locked: true, passed: false };
  };
  team.eventCards.r1 = 'green_bond';
  put('r1', 'GENERATION', ['solar_pv']);
  put('r1', 'GRID', ['flex_dispatch']);
  put('r1', 'EV', ['ev_mass_produce']);
  put('r1', 'BUILDING', ['bldg_retrofit']);
  put('r1', 'MATERIAL', ['mat_pv_material']);
  put('r1', 'NDRC', ['ndrc_investment']);
  team.eventCards.r2 = 'price_surge';
  put('r2', 'GENERATION', ['offshore_wind']);
  put('r2', 'GRID', ['grid_expand']);
  put('r2', 'EV', ['ev_v2g']);
  put('r2', 'BUILDING', ['bldg_zero_carbon']);
  put('r2', 'MATERIAL', ['mat_green_material']);
  put('r2', 'NDRC', ['ndrc_capacity_price']);
  team.dice.r1 = {};
  team.dice.r2 = {
    GENERATION: { value: 5, success: true },
    EV: { value: 5, success: true },
  };
  return team;
}

test('金标准R1：发电8、消耗7、入储1、弃电0、结余75', () => {
  const team = buildGolden();
  const detail = settleRound(team, 'r1');
  assert.equal(detail.power, 8);
  assert.equal(detail.available, 8);
  assert.equal(detail.plannedTotal, 7);
  assert.equal(detail.actual, 7);
  assert.equal(detail.shortage, 0);
  assert.equal(detail.storageCap, 2);
  assert.equal(detail.stored, 1);
  assert.equal(detail.curtailed, 0);
  assert.equal(detail.penalty, 0);
  assert.equal(detail.fundsEnd, 75);
  assert.equal(detail.materialSavings, 10);
});

test('金标准R2：可用16、消耗8、入储4、弃电4、罚分16', () => {
  const team = buildGolden();
  settleRound(team, 'r1');
  const detail = settleRound(team, 'r2');
  assert.equal(detail.power, 15);
  assert.equal(detail.carried, 1);
  assert.equal(detail.available, 16);
  assert.equal(detail.actual, 8);
  assert.equal(detail.storageCap, 4);
  assert.equal(detail.stored, 4);
  assert.equal(detail.curtailed, 4);
  assert.equal(detail.legalQuota, 0);
  assert.equal(detail.penalized, 4);
  assert.equal(detail.penalty, 16);
  assert.equal(detail.fundsEnd, 45);
  assert.equal(detail.materialSavings, 20);
});

test('电力缺口按汽车到建筑顺序分配并显著标注', () => {
  const team = createTeam('t1', '一队');
  const put = (role, ids) => {
    team.actions.r1[role] = { actionIds: ids, locked: true, passed: false };
  };
  put('GENERATION', ['solar_pv']);
  put('EV', ['ev_mass_produce']);
  put('BUILDING', ['bldg_zero_carbon']);
  const detail = settleRound(team, 'r1');
  assert.equal(detail.available, 8);
  assert.equal(detail.plannedTotal, 11);
  assert.deepEqual(detail.actualByRole, { EV: 5, BUILDING: 3 });
  assert.equal(detail.actual, 8);
  assert.equal(detail.shortage, 3);
  assert.ok(detail.steps.some((step) => step.key === 'consume' && /缺口/.test(step.text)));
});

test('寒潮使光伏减3点', () => {
  const team = createTeam('t1', '一队');
  team.eventCards.r1 = 'cold_wave';
  team.actions.r1.GENERATION = {
    actionIds: ['solar_pv'],
    locked: true,
    passed: false,
  };
  assert.equal(settleRound(team, 'r1').power, 5);
});

test('寒潮按骰后风电减3，核电免疫', () => {
  const windTeam = createTeam('t1', '一队');
  windTeam.eventCards.r1 = 'cold_wave';
  windTeam.actions.r1.GENERATION = {
    actionIds: ['offshore_wind'],
    locked: true,
    passed: false,
  };
  windTeam.dice.r1 = { GENERATION: { value: 5, success: true } };
  assert.equal(settleRound(windTeam, 'r1').power, 12);

  const nuclearTeam = createTeam('t2', '二队');
  nuclearTeam.eventCards.r1 = 'cold_wave';
  nuclearTeam.actions.r1.GENERATION = {
    actionIds: ['nuclear'],
    locked: true,
    passed: false,
  };
  assert.equal(settleRound(nuclearTeam, 'r1').power, 10);
});

test('柔性调度合法弃电额度2点免罚', () => {
  const team = createTeam('t1', '一队');
  const put = (role, ids) => {
    team.actions.r1[role] = { actionIds: ids, locked: true, passed: false };
  };
  put('GENERATION', ['solar_pv']);
  put('GRID', ['flex_dispatch']);
  put('EV', ['ev_charging_expand']);
  const detail = settleRound(team, 'r1');
  assert.equal(detail.available, 8);
  assert.equal(detail.actual, 3);
  assert.equal(detail.storageCap, 2);
  assert.equal(detail.stored, 2);
  assert.equal(detail.curtailed, 3);
  assert.equal(detail.legalQuota, 2);
  assert.equal(detail.penalized, 1);
  assert.equal(detail.penalty, 2);
});
