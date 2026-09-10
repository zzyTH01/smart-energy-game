import { STANDARD_ROLES } from './constants.js';
import { getAction, RULES } from './actions.js';
import { rollDice } from './random.js';
import { checkGoal, dealGoals, goalById } from './goals.js';
import { drawEvent } from './events.js';
import {
  settleRound,
  computeScores,
  interimScore,
  rankTeams,
} from './settlement.js';
import { finalValidate } from './engine.js';

export function startGame(room, options = {}) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '游戏已开始' };
  const incomplete = room.teams.filter((team) => !(
    options.teamComplete?.(team) ?? true
  ));
  if (incomplete.length && !options.force) {
    return {
      ok: false,
      reason: `以下队伍未满7个标准角色：${incomplete.map((team) => team.name).join('、')}（可强制开始）`,
    };
  }
  room.forceStart = !!options.force;
  for (const team of room.teams) team.goalCards = dealGoals();
  room.phase = 'GOAL_PICK';
  return { ok: true };
}

export function pickGoal(room, teamId, goalId) {
  const team = room.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, reason: '队伍不存在' };
  if (room.phase !== 'GOAL_PICK') return { ok: false, reason: '当前不在选卡阶段' };
  if (team.goalKept) return { ok: false, reason: '本队已选定目标卡' };
  if (!team.goalCards.includes(goalId)) {
    return { ok: false, reason: '该卡不在你的两张候选中' };
  }
  team.goalKept = goalId;
  return { ok: true };
}

export const allGoalsPicked = (room) => room.teams.every((team) => team.goalKept);

export function beginPlanning(room, round, forcedEvent = null) {
  room.phase = round === 'r1' ? 'R1_PLAN' : 'R2_PLAN';
  for (const team of room.teams) {
    team.eventCards[round] = forcedEvent ?? drawEvent(round);
  }
  room.deadline = Date.now() + RULES.config.planningMinutes * 60_000;
  room.timeoutAlerted = false;
}

export function autoPassMissing(team, round) {
  for (const role of STANDARD_ROLES) {
    const record = team.actions[round][role];
    if (!record || record.passed || !record.actionIds?.length) {
      team.actions[round][role] = {
        actionIds: [],
        locked: true,
        passed: true,
      };
    }
  }
}

export function rollTeamDice(team, round, rng = rollDice) {
  team.dice[round] = {};
  const rollFor = (roleId, actionId) => {
    const record = team.actions[round][roleId];
    if (!record || record.passed || !record.actionIds.includes(actionId)) return;
    const value = rng();
    team.dice[round][roleId] = {
      value,
      success: value >= getAction(actionId).dice.threshold,
    };
  };
  rollFor('GENERATION', 'offshore_wind');
  rollFor('EV', 'ev_v2g');
}

export function runSettlement(room, round) {
  for (const team of room.teams) {
    settleRound(team, round);
    if (round === 'r1') {
      team.settlement.r1.interim = interimScore(team);
    } else {
      const scores = computeScores(team);
      team.settlement.individual = scores.individual;
      team.settlement.extraBonus = scores.extra;
      team.settlement.teamTotal = scores.teamTotal;
      team.goalAchieved = team.goalKept ? checkGoal(team.goalKept, team) : false;
      if (team.goalAchieved) {
        team.settlement.extraBonus.push({
          reason: `目标卡·${goalById(team.goalKept).name}`,
          points: 5,
        });
        team.settlement.teamTotal += 5;
      }
    }
  }
  if (round === 'r2') room.phase = 'FINISHED';
}

function settle(room, round) {
  for (const team of room.teams) {
    autoPassMissing(team, round);
    const validation = finalValidate(team, round);
    if (!validation.ok) {
      return {
        ok: false,
        teamId: team.id,
        teamName: team.name,
        violations: validation.violations,
      };
    }
  }
  for (const team of room.teams) rollTeamDice(team, round, room._rng);
  room.phase = round === 'r1' ? 'R1_SETTLE' : 'R2_SETTLE';
  room.deadline = null;
  runSettlement(room, round);
  room.ranking = round === 'r1' ? interimRanking(room) : rankTeams(room.teams);
  return { ok: true, settled: true, round };
}

export function advance(room) {
  switch (room.phase) {
    case 'GOAL_PICK':
      if (!allGoalsPicked(room)) {
        return { ok: false, reason: '还有队伍未选定目标卡' };
      }
      beginPlanning(room, 'r1');
      return { ok: true };
    case 'R1_PLAN':
      return settle(room, 'r1');
    case 'R1_SETTLE':
      beginPlanning(room, 'r2');
      return { ok: true };
    case 'R2_PLAN':
      return settle(room, 'r2');
    default:
      return { ok: false, reason: '当前阶段没有可推进的操作' };
  }
}

export const interimRanking = (room) => room.teams
  .map((team) => ({
    teamId: team.id,
    name: team.name,
    total: team.settlement.r1?.interim ?? 0,
  }))
  .sort((a, b) => b.total - a.total);

export const rank = (room) => rankTeams(room.teams);
