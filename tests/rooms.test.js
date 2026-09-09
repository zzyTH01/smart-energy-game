import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  getRoom,
  joinRoom,
  playerByToken,
  isHost,
  assign,
  teamComplete,
  audit,
} from '../src/game/rooms.js';
import { saveSnapshot, loadSnapshot, exportResult } from '../src/persistence.js';
import { STANDARD_ROLES } from '../src/game/constants.js';

test('建房：4位房间码可取回，默认两队', () => {
  const room = createRoom('主持人', 2);
  assert.match(room.code, /^\d{4}$/);
  assert.equal(getRoom(room.code), room);
  assert.equal(room.teams.length, 2);
  assert.equal(room.phase, 'LOBBY');
  assert.ok(isHost(room, room.hostToken));
});

test('加入与角色分派：同队同角色唯一，仅大厅可换', () => {
  const room = createRoom('主持人', 2);
  const first = joinRoom(room, '小明');
  const second = joinRoom(room, '小红');
  assert.ok(playerByToken(room, first.token));
  assert.equal(assign(room, second.token, 't1', 'GENERATION').ok, true);
  const duplicate = assign(room, first.token, 't1', 'GENERATION');
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.reason, /已被/);
  assert.equal(assign(room, first.token, 't1', 'GRID').ok, true);
  room.phase = 'R1_PLAN';
  assert.equal(assign(room, first.token, 't2', 'EV').ok, false);
});

test('七个标准角色齐备才算完整，精算师不影响', () => {
  const room = createRoom('主持人', 1);
  for (const role of STANDARD_ROLES) {
    const player = joinRoom(room, `p-${role}`);
    assign(room, player.token, 't1', role);
  }
  assert.equal(teamComplete(room, room.teams[0]), true);
  const actuary = joinRoom(room, '精算师');
  assign(room, actuary.token, 't1', 'ACTUARY');
  assert.equal(teamComplete(room, room.teams[0]), true);
});

test('审计记录追加留痕', () => {
  const room = createRoom('主持人', 1);
  audit(room.teams[0], '测试留痕');
  assert.equal(room.teams[0].audit.length, 1);
  assert.equal(room.teams[0].audit[0].msg, '测试留痕');
});

test('快照保存与恢复保持字段一致', () => {
  const room = createRoom('主持人', 2);
  const player = joinRoom(room, '小明');
  assign(room, player.token, 't1', 'MAYOR');
  room.teams[0].fundsNote = '测试';
  saveSnapshot(room);
  const restored = loadSnapshot(room.code);
  assert.equal(restored.code, room.code);
  assert.equal(restored.players.length, 1);
  assert.equal(restored.teams[0].audit.length, 0);
  assert.deepEqual(restored.players[0], room.players[0]);
});

test('导出结果包含 JSON 和 CSV 成绩', () => {
  const room = createRoom('主持人', 2);
  room.teams[0].name = '猛虎队';
  room.teams[0].settlement.teamTotal = 88;
  const { json, csv } = exportResult(room);
  assert.ok(json.includes('猛虎队'));
  assert.ok(csv.includes('队伍'));
  assert.ok(csv.includes('猛虎队'));
  assert.ok(csv.includes('88'));
});

test('读取不存在的快照返回 null', () => {
  assert.equal(loadSnapshot('no-such-room'), null);
});
