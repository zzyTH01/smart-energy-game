import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import {
  applySelection,
  lockAction,
  passAction,
  grantApproval,
  finalValidate,
} from '../src/game/engine.js';

const makeTeam = () => createTeam('t1', '一队');

test('输配上限硬拦截：耗电5大于上限3时不可选', () => {
  const team = makeTeam();
  const result = applySelection(team, 'r1', 'EV', ['ev_mass_produce']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /输配上限/);
});

test('柔性调度+2后5点耗电可选', () => {
  const team = makeTeam();
  applySelection(team, 'r1', 'GRID', ['flex_dispatch']);
  const result = applySelection(team, 'r1', 'EV', ['ev_mass_produce']);
  assert.equal(result.ok, true);
});

test('两轮不得重复', () => {
  const team = makeTeam();
  team.actions.r1.GENERATION = {
    actionIds: ['solar_pv'],
    locked: true,
    passed: false,
  };
  const result = applySelection(team, 'r2', 'GENERATION', ['solar_pv']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /重复/);
});

test('每轮1项行动；产学研下材料可2项', () => {
  const team = makeTeam();
  assert.equal(
    applySelection(team, 'r1', 'GRID', ['flex_dispatch', 'grid_expand']).ok,
    false,
  );
  team.eventCards.r1 = 'research_breakthrough';
  assert.equal(applySelection(team, 'r1', 'MATERIAL', [
    'mat_pv_material',
    'mat_green_material',
  ]).ok, true);
  assert.equal(applySelection(team, 'r1', 'MATERIAL', [
    'mat_pv_material',
    'mat_pv_material',
  ]).ok, false);
});

test('资金不足需特批；OVERDRAFT5只允许超支5以内', () => {
  const team = makeTeam();
  applySelection(team, 'r1', 'GENERATION', ['nuclear']);
  applySelection(team, 'r1', 'GRID', ['storage_plant']);
  applySelection(team, 'r1', 'EV', ['ev_charging_expand']);
  applySelection(team, 'r1', 'NDRC', ['ndrc_subsidy']);
  const result = applySelection(team, 'r1', 'MATERIAL', ['mat_pv_material']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /资金/);
  assert.equal(grantApproval(team, 'r1', { type: 'OVERDRAFT5' }).ok, true);
  assert.equal(applySelection(team, 'r1', 'MATERIAL', ['mat_pv_material']).ok, true);
  const further = applySelection(team, 'r1', 'BUILDING', ['bldg_retrofit']);
  assert.equal(further.ok, false);
  assert.match(further.reason, /特批上限/);
});

test('特批每轮仅1次', () => {
  const team = makeTeam();
  assert.equal(grantApproval(team, 'r1', { type: 'OVERDRAFT5' }).ok, true);
  const result = grantApproval(team, 'r1', {
    type: 'REDUCE5',
    actionId: 'ev_v2g',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /特批/);
});

test('锁定后不可改，主持人可解锁', () => {
  const team = makeTeam();
  applySelection(team, 'r1', 'GRID', ['grid_expand']);
  lockAction(team, 'r1', 'GRID');
  assert.equal(applySelection(team, 'r1', 'GRID', ['flex_dispatch']).ok, false);
  team.actions.r1.GRID.locked = false;
  assert.equal(applySelection(team, 'r1', 'GRID', ['flex_dispatch']).ok, true);
});

test('放弃行动合法且终审通过', () => {
  const team = makeTeam();
  applySelection(team, 'r1', 'GRID', ['grid_expand']);
  lockAction(team, 'r1', 'GRID');
  passAction(team, 'r1', 'EV');
  assert.equal(finalValidate(team, 'r1').ok, true);
});

test('终审拦截两轮土地超用', () => {
  const team = makeTeam();
  team.actions.r1.GENERATION = { actionIds: ['offshore_wind'], locked: true, passed: false };
  team.actions.r1.EV = { actionIds: ['ev_super_charger'], locked: true, passed: false };
  team.actions.r1.BUILDING = { actionIds: ['bldg_zero_carbon'], locked: true, passed: false };
  team.actions.r2.GRID = { actionIds: ['storage_plant'], locked: true, passed: false };
  team.actions.r2.EV = { actionIds: ['ev_super_charger'], locked: true, passed: false };
  team.actions.r2.BUILDING = { actionIds: ['bldg_landmark'], locked: true, passed: false };
  const result = finalValidate(team, 'r2');
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /土地/.test(item.reason)));
});

test('终审拦截无特批超支', () => {
  const team = makeTeam();
  const selections = {
    GENERATION: ['offshore_wind'],
    GRID: ['storage_plant'],
    EV: ['ev_mass_produce'],
    BUILDING: ['bldg_zero_carbon'],
    MATERIAL: ['mat_pv_material'],
    NDRC: ['ndrc_subsidy'],
  };
  for (const [role, actionIds] of Object.entries(selections)) {
    team.actions.r1[role] = { actionIds, locked: true, passed: false };
  }
  const result = finalValidate(team, 'r1');
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /资金/.test(item.reason)));
});
