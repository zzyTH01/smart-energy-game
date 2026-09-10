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

function renumberTeams(room) {
  const oldIds = new Map(room.teams.map((team, index) => [
    team.id,
    `t${index + 1}`,
  ]));
  room.teams.forEach((team, index) => {
    team.id = `t${index + 1}`;
    team.name = `第${index + 1}队`;
  });
  for (const player of room.players) {
    player.teamId = oldIds.get(player.teamId) ?? null;
  }
}

export function addTeam(room) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '已开赛，无法调整队伍' };
  if (room.teams.length >= 8) return { ok: false, reason: '最多支持8支队伍' };
  room.teams.push(createTeam(`t${room.teams.length + 1}`, `第${room.teams.length + 1}队`));
  renumberTeams(room);
  return { ok: true };
}

export function removeTeam(room, teamId) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '已开赛，无法调整队伍' };
  if (room.teams.length <= 2) return { ok: false, reason: '至少需要保留2支队伍' };
  const teamIndex = room.teams.findIndex((team) => team.id === teamId);
  if (teamIndex === -1) return { ok: false, reason: '队伍不存在' };
  const hasMember = room.players.some((player) => player.teamId === teamId);
  if (hasMember) return { ok: false, reason: '队伍已有成员，不能移除' };
  room.teams.splice(teamIndex, 1);
  renumberTeams(room);
  return { ok: true };
}

export function audit(team, message) {
  team.audit.push({ ts: Date.now(), msg: message });
}
