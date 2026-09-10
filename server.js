import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import * as roomsModule from './src/game/rooms.js';
import * as state from './src/game/state.js';
import * as engine from './src/game/engine.js';
import {
  RULES,
  actionsForRole,
  listSelection,
  availableFunds,
  effectiveTransCap,
} from './src/game/actions.js';
import { loadSnapshot, saveSnapshot, exportResult } from './src/persistence.js';
import { STANDARD_ROLES } from './src/game/constants.js';

export function createAppIo() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));

  app.get('/qr.svg', async (request, response) => {
    response.type('svg').send(await QRCode.toString(
      String(request.query.d ?? ''),
      { type: 'svg', margin: 1, width: 240 },
    ));
  });

  app.get('/export/:code.:format', (request, response) => {
    const room = roomsModule.getRoom(request.params.code);
    if (!room) return response.status(404).send('房间不存在');
    const { json, csv } = exportResult(room);
    if (request.params.format === 'json') {
      return response.type('json').attachment(`${room.code}-成绩.json`).send(json);
    }
    if (request.params.format === 'csv') {
      return response.type('text/csv').attachment(`${room.code}-成绩.csv`).send(csv);
    }
    return response.status(400).send('格式不支持');
  });

  return { app, httpServer, io };
}

const roundOf = (phase) => {
  if (phase.startsWith('R1')) return 'r1';
  if (phase.startsWith('R2')) return 'r2';
  return null;
};

const isPlanning = (phase) => phase === 'R1_PLAN' || phase === 'R2_PLAN';
const isSettledView = (phase) => [
  'R1_SETTLE',
  'R2_SETTLE',
  'FINISHED',
].includes(phase);

function visibleTeam(room, team, viewer) {
  const round = roundOf(room.phase);
  const myPlayer = viewer.kind === 'player'
    ? room.players.find((player) => player.id === viewer.playerId)
    : null;
  const mine = !!myPlayer && myPlayer.teamId === team.id;
  const settled = isSettledView(room.phase);
  const base = {
    id: team.id,
    name: team.name,
    members: room.players
      .filter((player) => player.teamId === team.id)
      .map((player) => ({
        roleId: player.roleId,
        name: player.name,
        connected: player.connected,
      })),
    eventCard: round ? team.eventCards[round] : null,
    goalKeptShown: settled || mine
      ? team.goalKept
      : (team.goalKept ? true : null),
  };

  if (mine && room.phase === 'GOAL_PICK' && myPlayer.roleId === 'MAYOR') {
    base.goalCards = team.goalCards;
  }

  if (mine && isPlanning(room.phase)) {
    const selection = listSelection(team, round);
    base.detail = {
      round,
      fundsEnd: availableFunds(team, round, selection),
      transCap: effectiveTransCap(team, round, selection),
      approval: team.approvals[round],
      selections: team.actions[round],
      catalog: STANDARD_ROLES.reduce((result, role) => {
        result[role] = actionsForRole(role);
        return result;
      }, {}),
    };
  }

  if (settled) {
    base.dice = team.dice;
    base.settlement = team.settlement;
    base.goalAchieved = team.goalAchieved ?? null;
  } else if (round) {
    base.progress = {};
    for (const role of STANDARD_ROLES) {
      const record = team.actions[round]?.[role];
      base.progress[role] = record?.passed ? 'passed'
        : record?.locked ? 'locked'
          : record?.actionIds?.length ? 'draft' : 'empty';
    }
  }
  return base;
}

function visibleState(room, viewer) {
  return {
    code: room.code,
    phase: room.phase,
    deadline: room.deadline,
    now: Date.now(),
    isHost: viewer.kind === 'host',
    you: viewer.kind === 'player'
      ? room.players.find((player) => player.id === viewer.playerId) ?? null
      : null,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      teamId: player.teamId,
      roleId: player.roleId,
      connected: player.connected,
    })),
    teams: room.teams.map((team) => visibleTeam(room, team, viewer)),
    ranking: room.ranking,
  };
}

export function wire(io) {
  const broadcast = (room) => {
    for (const socketId of io.of('/').adapter.rooms.get(room.code) ?? []) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) socket.emit('state:sync', visibleState(room, socket.data));
    }
  };

  const streamSettlement = (room, round) => {
    for (const team of room.teams) {
      for (const [roleId, dice] of Object.entries(team.dice[round] ?? {})) {
        io.to(room.code).emit('dice:result', {
          teamId: team.id,
          roleId,
          ...dice,
        });
      }
    }
    let delay = 1500;
    for (const team of room.teams) {
      for (const step of team.settlement[round].steps) {
        io.to(room.code).emit('settle:step', {
          teamId: team.id,
          round,
          step,
          delay,
        });
        delay += 700;
      }
    }
    setTimeout(() => {
      room.ranking = round === 'r1' ? state.interimRanking(room) : state.rank(room);
      io.to(room.code).emit('ranking:update', room.ranking);
      broadcast(room);
      saveSnapshot(room);
    }, delay + 300).unref();
  };

  io.on('connection', (socket) => {
    socket.data = { kind: null };
    const roomOf = () => roomsModule.getRoom(socket.data.code);

    const hostOnly = (handler) => (payload, ack) => {
      const room = roomOf();
      if (!room || !roomsModule.isHost(room, socket.data.token)) {
        return ack?.({ ok: false, reason: '仅主持人可操作' });
      }
      return handler(room, payload ?? {}, ack);
    };

    const playerOnly = (handler) => (payload, ack) => {
      const room = roomOf();
      const player = room && socket.data.token
        ? roomsModule.playerByToken(room, socket.data.token)
        : null;
      if (!room || !player) {
        return ack?.({ ok: false, reason: '身份失效，请重新加入' });
      }
      return handler(room, player, payload ?? {}, ack);
    };

    const done = (room, result, ack) => {
      ack?.(result);
      broadcast(room);
      if (result?.ok) saveSnapshot(room);
    };

    socket.on('room:create', (payload, ack) => {
      const { hostName, teamCount } = payload ?? {};
      const room = roomsModule.createRoom(
        hostName || '主持人',
        Math.min(8, Math.max(2, teamCount ?? 2)),
      );
      socket.data = { kind: 'host', code: room.code, token: room.hostToken };
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, token: room.hostToken });
      broadcast(room);
    });

    socket.on('room:join', (payload, ack) => {
      const { code, name } = payload ?? {};
      const room = roomsModule.getRoom(String(code ?? '').trim());
      if (!room) return ack?.({ ok: false, reason: '房间不存在，请核对4位房间码' });
      const player = roomsModule.joinRoom(
        room,
        String(name ?? '').slice(0, 12) || '玩家',
      );
      socket.data = {
        kind: 'player',
        code: room.code,
        token: player.token,
        playerId: player.id,
      };
      socket.join(room.code);
      ack?.({ ok: true, token: player.token, playerId: player.id });
      broadcast(room);
    });

    socket.on('room:resume', (payload, ack) => {
      const { code, token } = payload ?? {};
      let room = roomsModule.getRoom(code);
      if (!room && code) {
        room = loadSnapshot(String(code).trim());
        if (room) roomsModule.registerRoom(room);
      }
      if (!room) return ack?.({ ok: false, reason: '房间已不存在' });
      if (roomsModule.isHost(room, token)) {
        socket.data = { kind: 'host', code: room.code, token };
      } else {
        const player = roomsModule.playerByToken(room, token);
        if (!player) return ack?.({ ok: false, reason: '身份已失效，请重新加入' });
        player.connected = true;
        socket.data = {
          kind: 'player',
          code: room.code,
          token,
          playerId: player.id,
        };
      }
      socket.join(room.code);
      ack?.({ ok: true });
      broadcast(room);
    });

    socket.on('team:assign', playerOnly((room, player, payload, ack) => done(
      room,
      roomsModule.assign(room, player.token, payload.teamId, payload.roleId),
      ack,
    )));

    socket.on('game:start', hostOnly((room, payload, ack) => {
      const result = state.startGame(room, {
        force: payload.force,
        teamComplete: (team) => roomsModule.teamComplete(room, team),
      });
      ack?.(result);
      if (result.ok) {
        broadcast(room);
        saveSnapshot(room);
      }
    }));

    socket.on('goal:pick', playerOnly((room, player, payload, ack) => {
      if (player.roleId !== 'MAYOR') {
        return ack?.({ ok: false, reason: '仅城长可拍板目标卡' });
      }
      return done(room, state.pickGoal(room, player.teamId, payload.goalId), ack);
    }));

    const inPlanning = (ack, handler) => {
      const room = roomOf();
      if (!isPlanning(room?.phase)) {
        return ack?.({ ok: false, reason: '当前不在规划阶段' });
      }
      return handler(room, roundOf(room.phase));
    };

    socket.on('action:select', playerOnly((room, player, payload, ack) => inPlanning(
      ack,
      (currentRoom, round) => {
        if (!player.teamId || !player.roleId) {
          return ack?.({ ok: false, reason: '尚未分配队伍与角色' });
        }
        const team = currentRoom.teams.find((item) => item.id === player.teamId);
        return done(
          currentRoom,
          engine.applySelection(team, round, player.roleId, payload.actionIds ?? []),
          ack,
        );
      },
    )));

    socket.on('action:lock', playerOnly((room, player, _, ack) => inPlanning(
      ack,
      (currentRoom, round) => {
        const team = currentRoom.teams.find((item) => item.id === player.teamId);
        return done(currentRoom, engine.lockAction(team, round, player.roleId), ack);
      },
    )));

    socket.on('action:pass', playerOnly((room, player, _, ack) => inPlanning(
      ack,
      (currentRoom, round) => {
        const team = currentRoom.teams.find((item) => item.id === player.teamId);
        return done(currentRoom, engine.passAction(team, round, player.roleId), ack);
      },
    )));

    socket.on('approval:grant', playerOnly((room, player, payload, ack) => inPlanning(
      ack,
      (currentRoom, round) => {
        if (player.roleId !== 'MAYOR') {
          return ack?.({ ok: false, reason: '仅城长可行使市长特批权' });
        }
        const team = currentRoom.teams.find((item) => item.id === player.teamId);
        return done(
          currentRoom,
          engine.grantApproval(team, round, {
            type: payload.type,
            actionId: payload.actionId,
          }),
          ack,
        );
      },
    )));

    socket.on('phase:force_start', hostOnly((room, _, ack) => {
      room.forceStart = true;
      ack?.({ ok: true });
      broadcast(room);
    }));

    socket.on('force:unlock', hostOnly((room, payload, ack) => {
      const team = room.teams.find((item) => item.id === payload.teamId);
      if (!team) return ack?.({ ok: false, reason: '队伍不存在' });
      engine.forceUnlock(team, roundOf(room.phase), payload.roleId);
      roomsModule.audit(team, `主持人解锁 ${payload.roleId}`);
      ack?.({ ok: true });
      broadcast(room);
      saveSnapshot(room);
    }));

    socket.on('force:pass', hostOnly((room, payload, ack) => {
      const team = room.teams.find((item) => item.id === payload.teamId);
      if (!team) return ack?.({ ok: false, reason: '队伍不存在' });
      engine.forcePass(team, roundOf(room.phase), payload.roleId);
      roomsModule.audit(team, `主持人将 ${payload.roleId} 置为放弃`);
      ack?.({ ok: true });
      broadcast(room);
      saveSnapshot(room);
    }));

    socket.on('phase:next', hostOnly((room, _, ack) => {
      const result = state.advance(room);
      if (!result.ok) return ack?.(result);
      ack?.({ ok: true });
      broadcast(room);
      saveSnapshot(room);
      if (result.settled) streamSettlement(room, result.round);
    }));

    socket.on('disconnect', () => {
      const room = roomOf();
      if (!room || socket.data.kind !== 'player') return;
      const player = room.players.find((item) => item.id === socket.data.playerId);
      if (player) {
        player.connected = false;
        broadcast(room);
      }
    });
  });

  setInterval(() => {
    for (const room of roomsModule.allRooms()) {
      if (!room.deadline) continue;
      const remaining = Math.max(0, room.deadline - Date.now());
      io.to(room.code).emit('timer:tick', {
        remaining,
        warning: RULES.config.warnMinutes.includes(Math.ceil(remaining / 60_000)),
      });
      if (remaining === 0 && !room.timeoutAlerted) {
        room.timeoutAlerted = true;
        io.to(room.code).emit('alert', {
          level: 'warn',
          message: '规划时间到！请主持人尽快开始结算',
        });
      }
    }
  }, 1000).unref();
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const { httpServer, io } = createAppIo();
  wire(io);
  httpServer.listen(RULES.config.port, () => {
    const addresses = Object.values(os.networkInterfaces()).flat()
      .filter((item) => item && item.family === 'IPv4' && !item.internal)
      .map((item) => item.address);
    console.log('⚡ 快乐能源 已启动');
    console.log(`   本机:   http://localhost:${RULES.config.port}`);
    for (const address of addresses) {
      console.log(`   局域网: http://${address}:${RULES.config.port}`);
    }
  });
}
