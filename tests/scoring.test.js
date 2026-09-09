import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { settleRound, computeScores, interimScore, rankTeams } from '../src/game/settlement.js';
import { buildGolden } from './settlement.test.js';

test('金标准个人分、总分和精算师同分', () => {
  const team = buildGolden();
  settleRound(team, 'r1');
  settleRound(team, 'r2');
  const scores = computeScores(team);
  assert.deepEqual(scores.individual, {
    GENERATION: 23,
    GRID: 7,
    EV: 9,
    BUILDING: 6,
    MATERIAL: 6,
    NDRC: 16,
    ACTUARY: 16,
  });
  assert.equal(scores.sum6, 67);
  assert.equal(scores.storedTotal, 5);
  assert.equal(scores.penaltyTotal, 16);
  assert.deepEqual(scores.extra, [{ reason: '现货暴涨·首轮储能增值', points: 2 }]);
  assert.equal(scores.teamTotal, 58);
});

test('第1轮小计为个人分加储能减罚分', () => {
  const team = buildGolden();
  settleRound(team, 'r1');
  assert.equal(interimScore(team), 26);
});

test('绿电补贴加分，容量电价影响汽车和建筑', () => {
  const team = createTeam('t1', '一队');
  const put = (round, role, ids) => {
    team.actions[round][role] = { actionIds: ids, locked: true, passed: false };
  };
  put('r1', 'GENERATION', ['solar_pv']);
  put('r1', 'NDRC', ['ndrc_subsidy']);
  put('r2', 'GENERATION', ['nuclear']);
  put('r2', 'EV', ['ev_mass_produce']);
  put('r2', 'NDRC', ['ndrc_capacity_price']);
  for (const [round, role] of [
    ['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'GRID'], ['r1', 'MATERIAL'],
    ['r2', 'GRID'], ['r2', 'BUILDING'], ['r2', 'MATERIAL'],
  ]) {
    team.actions[round][role] = { actionIds: [], locked: true, passed: true };
  }
  settleRound(team, 'r1');
  settleRound(team, 'r2');
  const scores = computeScores(team);
  assert.equal(scores.individual.GENERATION, 22);
  assert.equal(scores.individual.EV, 3);
  assert.equal(scores.individual.BUILDING, -2);
});

test('寒潮发电个人分减3，储能电站额外加5', () => {
  const team = createTeam('t1', '一队');
  const put = (round, role, ids) => {
    team.actions[round][role] = { actionIds: ids, locked: true, passed: false };
  };
  put('r1', 'GENERATION', ['solar_pv']);
  put('r1', 'GRID', ['storage_plant']);
  put('r2', 'GENERATION', ['nuclear']);
  for (const [round, role] of [
    ['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'MATERIAL'], ['r1', 'NDRC'],
    ['r2', 'GRID'], ['r2', 'EV'], ['r2', 'BUILDING'], ['r2', 'MATERIAL'], ['r2', 'NDRC'],
  ]) {
    team.actions[round][role] = { actionIds: [], locked: true, passed: true };
  }
  team.eventCards.r2 = 'cold_wave';
  settleRound(team, 'r1');
  settleRound(team, 'r2');
  const scores = computeScores(team);
  assert.equal(scores.individual.GENERATION, 15);
  assert.deepEqual(scores.extra.find((item) => /储能电站/.test(item.reason)), {
    reason: '寒潮中保有储能电站',
    points: 5,
  });
});

test('超充后批量加分、零罚分和立体绿化加分', () => {
  const team = createTeam('t1', '一队');
  const put = (round, role, ids) => {
    team.actions[round][role] = { actionIds: ids, locked: true, passed: false };
  };
  put('r1', 'GENERATION', ['solar_pv']);
  put('r1', 'EV', ['ev_super_charger']);
  put('r1', 'BUILDING', ['bldg_retrofit']);
  put('r2', 'GENERATION', ['nuclear']);
  put('r2', 'EV', ['ev_mass_produce']);
  put('r2', 'BUILDING', ['bldg_greening']);
  for (const [round, role] of [
    ['r1', 'GRID'], ['r1', 'MATERIAL'], ['r1', 'NDRC'],
    ['r2', 'GRID'], ['r2', 'MATERIAL'], ['r2', 'NDRC'],
  ]) {
    team.actions[round][role] = { actionIds: [], locked: true, passed: true };
  }
  settleRound(team, 'r1');
  settleRound(team, 'r2');
  const scores = computeScores(team);
  assert.equal(scores.individual.EV, 14);
  assert.ok(scores.extra.some((item) => item.reason === '两轮零弃电罚分' && item.points === 5));
  assert.ok(scores.extra.some((item) => item.reason === '全域立体绿化' && item.points === 5));
});

test('排名按总分降序并携带消纳模块净值', () => {
  const first = buildGolden();
  first.id = 'a';
  const second = buildGolden();
  second.id = 'b';
  second.name = '二队';
  settleRound(first, 'r1');
  settleRound(first, 'r2');
  settleRound(second, 'r1');
  settleRound(second, 'r2');
  const ranking = rankTeams([second, first]);
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].total, 58);
  assert.equal(ranking[0].module, 58 - 67);
});

test('先锋认证要求两轮盈差均不超过2且使用招商', () => {
  const team = createTeam('t1', '一队');
  const put = (round, role, ids) => {
    team.actions[round][role] = { actionIds: ids, locked: true, passed: false };
  };
  put('r1', 'GENERATION', ['solar_pv']);
  put('r1', 'NDRC', ['ndrc_investment']);
  put('r2', 'GENERATION', ['nuclear']);
  for (const [round, role] of [
    ['r1', 'GRID'], ['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'MATERIAL'],
    ['r2', 'GRID'], ['r2', 'EV'], ['r2', 'BUILDING'], ['r2', 'MATERIAL'], ['r2', 'NDRC'],
  ]) {
    team.actions[round][role] = { actionIds: [], locked: true, passed: true };
  }
  team.eventCards.r2 = 'pioneer_cert';
  settleRound(team, 'r1');
  settleRound(team, 'r2');
  const scores = computeScores(team);
  assert.equal(scores.extra.find((item) => /先锋/.test(item.reason)), undefined);
});
