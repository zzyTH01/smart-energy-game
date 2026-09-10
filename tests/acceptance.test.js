import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, assign } from '../src/game/rooms.js';
import { STANDARD_ROLES } from '../src/game/constants.js';
import { startGame, pickGoal, advance, rank } from '../src/game/state.js';
import { applySelection, lockAction } from '../src/game/engine.js';
import { saveSnapshot, loadSnapshot, exportResult } from '../src/persistence.js';

const R1 = [
  ['GENERATION', ['solar_pv']],
  ['GRID', ['flex_dispatch']],
  ['EV', ['ev_mass_produce']],
  ['BUILDING', ['bldg_retrofit']],
  ['MATERIAL', ['mat_pv_material']],
  ['NDRC', ['ndrc_investment']],
];
const R2 = [
  ['GENERATION', ['offshore_wind']],
  ['GRID', ['grid_expand']],
  ['EV', ['ev_v2g']],
  ['BUILDING', ['bldg_zero_carbon']],
  ['MATERIAL', ['mat_green_material']],
  ['NDRC', ['ndrc_capacity_price']],
];

function fullRoom() {
  const room = createRoom('主持人', 2);
  for (const role of STANDARD_ROLES) {
    const player = joinRoom(room, `p-${role}`);
    assign(room, player.token, 't1', role);
  }
  room._rng = () => 5;
  return room;
}

function playRound(room, round, event, selections) {
  const team = room.teams[0];
  team.eventCards[round] = event;
  for (const [role, actionIds] of selections) {
    assert.equal(
      applySelection(team, round, role, actionIds).ok,
      true,
      `${round}/${role}`,
    );
  }
  for (const role of STANDARD_ROLES) {
    assert.equal(lockAction(team, round, role).ok, true, `lock ${role}`);
  }
  const result = advance(room);
  assert.equal(result.ok, true, JSON.stringify(result));
}

test('完整两轮剧本支持快照恢复、重放一致和CSV导出', () => {
  const room = fullRoom();
  assert.equal(startGame(room, {
    teamComplete: (team) => team.id === 't1',
    force: true,
  }).ok, true);
  for (const team of room.teams) team.goalCards = ['funds_steward', 'garden_city'];
  assert.equal(pickGoal(room, 't1', 'funds_steward').ok, true);
  assert.equal(pickGoal(room, 't2', 'funds_steward').ok, true);
  assert.equal(advance(room).ok, true);
  playRound(room, 'r1', 'green_bond', R1);
  assert.equal(room.teams[0].settlement.r1.fundsEnd, 75);

  saveSnapshot(room);
  const restored = loadSnapshot(room.code);
  assert.equal(restored.teams[0].settlement.r1.stored, 1);
  restored._rng = room._rng;
  assert.equal(advance(restored).ok, true);
  playRound(restored, 'r2', 'price_surge', R2);
  assert.equal(restored.phase, 'FINISHED');
  assert.deepEqual(restored.teams[0].settlement.individual, {
    GENERATION: 23,
    GRID: 7,
    EV: 9,
    BUILDING: 6,
    MATERIAL: 6,
    NDRC: 16,
    ACTUARY: 16,
  });
  assert.equal(restored.teams[0].settlement.teamTotal, 58);
  assert.equal(rank(restored)[0].teamId, 't1');

  const { csv } = exportResult(restored);
  assert.ok(csv.includes('58'));
});
