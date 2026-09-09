import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLES, SCORING_ROLES, createTeam } from '../src/game/constants.js';

const data = (file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${file}`, import.meta.url)), 'utf8'));
const actions = data('actions.json');
const events = data('events.json');
const goals = data('goals.json');

test('行动共20项，id唯一，角色合法', () => {
  assert.equal(actions.length, 20);
  assert.equal(new Set(actions.map((action) => action.id)).size, 20);
  for (const action of actions) assert.ok(ROLES[action.role], `${action.id} 角色非法`);
});

test('每个计分角色都有行动池', () => {
  for (const role of SCORING_ROLES) assert.ok(actions.some((action) => action.role === role), `${role} 无行动`);
});

test('消耗型行动必属荷侧，发电型必属发电侧', () => {
  for (const action of actions.filter((item) => item.consume)) {
    assert.ok(['EV', 'BUILDING'].includes(action.role));
  }
  for (const action of actions.filter((item) => item.power || item.dice?.success?.power)) {
    assert.equal(action.role, 'GENERATION');
  }
});

test('事件卡：第1轮3张机遇、第2轮3张考验', () => {
  assert.equal(events.r1.length, 3);
  assert.equal(events.r2.length, 3);
});

test('目标卡共6张，id唯一', () => {
  assert.equal(goals.length, 6);
  assert.equal(new Set(goals.map((goal) => goal.id)).size, 6);
});

test('createTeam 初始状态符合 spec', () => {
  const team = createTeam('t1', '一队');
  assert.deepEqual(team.approvals, { r1: null, r2: null });
  assert.equal(team.settlement.teamTotal, null);
});
