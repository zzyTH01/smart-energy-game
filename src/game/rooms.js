import { randomInt } from 'node:crypto';
import { ROLES, STANDARD_ROLES, createTeam } from './constants.js';
import { roomCode } from './random.js';

const rooms = new Map();

export const getRoom = (code) => rooms.get(code) ?? null;
export const allRooms = () => [...rooms.values()];
export const registerRoom = (room) => rooms.set(room.code, room);

const makeToken = () => randomInt(0, 1e12).toString(36)
  + randomInt(0, 1e12).toString(36);

export function createRoom(hostName, teamCount = 2) {
  const code = roomCode(new Set(rooms.keys()));
  const room = {
    code,
    hostToken: makeToken(),
    hostName,
    phase: 'LOBBY',
    deadline: null,
    forceStart: false,
    timeoutAlerted: false,
    ranking: null,
    teams: Array.from({ length: teamCount }, (_, index) => createTeam(
      `t${index + 1}`,
      `第${index + 1}队`,
    )),
    players: [],
    audit: [],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(room, name) {
  const player = {
    id: `p${room.players.length + 1}-${randomInt(0, 1e6).toString(36)}`,
    name,
    token: makeToken(),
    teamId: null,
    roleId: null,
    connected: true,
  };
  room.players.push(player);
  return player;
}

export const playerByToken = (room, token) => room.players
  .find((player) => player.token === token) ?? null;

export const isHost = (room, token) => token === room.hostToken;

export function assign(room, token, teamId, roleId) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '已开赛，无法更换角色' };
  const player = playerByToken(room, token);
  if (!player) return { ok: false, reason: '未找到玩家' };
  const team = room.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, reason: '队伍不存在' };
  if (!ROLES[roleId]) return { ok: false, reason: '角色非法' };
  const taken = room.players.find((item) => item.teamId === teamId
    && item.roleId === roleId && item.id !== player.id);
  if (taken) return { ok: false, reason: `${ROLES[roleId]} 已被 ${taken.name} 选择` };
  player.teamId = teamId;
  player.roleId = roleId;
  return { ok: true };
}

export function teamComplete(room, team) {
  return STANDARD_ROLES.every((role) => room.players.some(
    (player) => player.teamId === team.id && player.roleId === role,
  ));
}

export function audit(team, message) {
  team.audit.push({ ts: Date.now(), msg: message });
}
