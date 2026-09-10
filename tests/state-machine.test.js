import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, assign } from '../src/game/rooms.js';
import { STANDARD_ROLES } from '../src/game/constants.js';
import {
  startGame,
  pickGoal,
  allGoalsPicked,
  advance,
} from '../src/game/state.js';
import { applySelection, lockAction } from '../src/game/engine.js';

function readyRoom() {
  const room = createRoom('主持人', 1);
  for (const role of STANDARD_ROLES) {
    const player = joinRoom(room, `p-${role}`);
    assign(room, player.token, 't1', role);
  }
  room._rng = () => 5;
  return room;
}

function selectAll(team, round, selections) {
  for (const [role, actionIds] of Object.entries(selections)) {
    assert.equal(applySelection(team, round, role, actionIds).ok, true);
  }
  for (const role of STANDARD_ROLES) assert.equal(lockAction(team, round, role).ok, true);
}

const goldenR1 = {
  GENERATION: ['solar_pv'],
  GRID: ['flex_dispatch'],
  EV: ['ev_mass_produce'],
  BUILDING: ['bldg_retrofit'],
  MATERIAL: ['mat_pv_material'],
  NDRC: ['ndrc_investment'],
};

const goldenR2 = {
  GENERATION: ['offshore_wind'],
  GRID: ['grid_expand'],
  EV: ['ev_v2g'],
  BUILDING: ['bldg_zero_carbon'],
  MATERIAL: ['mat_green_material'],
  NDRC: ['ndrc_capacity_price'],
};

test('开局发两张目标卡，城长选一张后不可更改', () => {
  const room = readyRoom();
  assert.equal(startGame(room).ok, true);
  assert.equal(room.phase, 'GOAL_PICK');
  assert.equal(room.teams[0].goalCards.length, 2);
  const team = room.teams[0];
  assert.equal(pickGoal(room, 't1', team.goalCards[0]).ok, true);
  assert.equal(pickGoal(room, 't1', team.goalCards[1]).ok, false);
  assert.equal(allGoalsPicked(room), true);
});

test('目标卡选完后进入第1轮规划并抽事件卡', () => {
  const room = readyRoom();
  startGame(room);
  const team = room.teams[0];
  team.goalCards = ['funds_steward', 'garden_city'];
  pickGoal(room, 't1', 'funds_steward');
  assert.equal(advance(room).ok, true);
  assert.equal(room.phase, 'R1_PLAN');
  assert.ok(team.eventCards.r1);
  assert.ok(room.deadline > Date.now());
});

test('终审拦截无特批超支且阶段不推进', () => {
  const room = readyRoom();
  startGame(room);
  const team = room.teams[0];
  team.goalCards = ['funds_steward', 'garden_city'];
  pickGoal(room, 't1', 'funds_steward');
  advance(room);
  team.eventCards.r1 = null;
  const invalidSelections = {
    GENERATION: ['offshore_wind'],
    GRID: ['storage_plant'],
    EV: ['ev_charging_expand'],
    BUILDING: ['bldg_retrofit'],
    MATERIAL: ['mat_pv_material'],
    NDRC: ['ndrc_subsidy'],
  };
  for (const [role, actionIds] of Object.entries(invalidSelections)) {
    team.actions.r1[role] = { actionIds, locked: true, passed: false };
  }
  const result = advance(room);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => /资金/.test(item.reason)));
  assert.equal(room.phase, 'R1_PLAN');
});

test('金标准第1轮结算并给出小计', () => {
  const room = readyRoom();
  startGame(room);
  const team = room.teams[0];
  team.goalCards = ['funds_steward', 'garden_city'];
  pickGoal(room, 't1', 'funds_steward');
  advance(room);
  team.eventCards.r1 = 'green_bond';
  selectAll(team, 'r1', goldenR1);
  const result = advance(room);
  assert.equal(result.ok, true);
  assert.equal(result.settled, true);
  assert.equal(room.phase, 'R1_SETTLE');
  assert.equal(team.settlement.r1.fundsEnd, 75);
  assert.equal(team.settlement.r1.interim, 26);
});

test('金标准两轮流程到终局，总分58并生成排名', () => {
  const room = readyRoom();
  startGame(room);
  const team = room.teams[0];
  team.goalCards = ['funds_steward', 'garden_city'];
  pickGoal(room, 't1', 'funds_steward');
  advance(room);
  team.eventCards.r1 = 'green_bond';
  selectAll(team, 'r1', goldenR1);
  advance(room);
  advance(room);
  assert.equal(room.phase, 'R2_PLAN');
  team.eventCards.r2 = 'price_surge';
  selectAll(team, 'r2', goldenR2);
  const result = advance(room);
  assert.equal(result.ok, true);
  assert.equal(room.phase, 'FINISHED');
  assert.deepEqual(team.settlement.individual, {
    GENERATION: 23,
    GRID: 7,
    EV: 9,
    BUILDING: 6,
    MATERIAL: 6,
    NDRC: 16,
    ACTUARY: 16,
  });
  assert.equal(team.settlement.teamTotal, 58);
  assert.equal(room.ranking[0].teamId, 't1');
  assert.equal(room.ranking[0].total, 58);
});

test('队伍不完整默认拒绝开局，强制开始可放行', () => {
  const room = createRoom('主持人', 1);
  const refused = startGame(room, { teamComplete: () => false });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /未满7/);
  const forced = startGame(room, { teamComplete: () => false, force: true });
  assert.equal(forced.ok, true);
  assert.equal(room.phase, 'GOAL_PICK');
});
