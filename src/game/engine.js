import { INITIAL } from './constants.js';
import {
  getAction,
  eventId,
  listSelection,
  costBreakdown,
  availableFunds,
  effectiveTransCap,
} from './actions.js';

const usedLand = (team, round) => Object.values(team.actions[round] ?? {})
  .flatMap((record) => record?.actionIds ?? [])
  .reduce((sum, id) => sum + (getAction(id)?.cost?.land ?? 0), 0);

function fundsFloor(team, round) {
  return team.approvals[round]?.type === 'OVERDRAFT5' ? -5 : 0;
}

export function validateSelection(team, round, roleId, actionIds) {
  const record = team.actions[round][roleId];
  if (record?.locked) return { ok: false, reason: '行动已锁定，请联系主持人解锁' };
  if (!Array.isArray(actionIds)) return { ok: false, reason: '行动选择格式非法' };

  const actions = actionIds.map((id) => getAction(id));
  if (actions.some((action) => !action || action.role !== roleId)) {
    return { ok: false, reason: '行动不属于该角色' };
  }
  if (new Set(actionIds).size !== actionIds.length) {
    return { ok: false, reason: '行动重复选择' };
  }

  const dualResearch = eventId(team, round) === 'research_breakthrough'
    && roleId === 'MATERIAL';
  if (actionIds.length > (dualResearch ? 2 : 1)) {
    return {
      ok: false,
      reason: dualResearch ? '最多同时执行2项研发' : '每轮只能选择1项行动',
    };
  }

  const otherRound = round === 'r1' ? 'r2' : 'r1';
  const otherIds = Object.values(team.actions[otherRound] ?? {})
    .flatMap((item) => item?.actionIds ?? []);
  const duplicated = actionIds.filter((id) => otherIds.includes(id));
  if (duplicated.length) {
    return {
      ok: false,
      reason: `与另一轮重复：${duplicated.map((id) => getAction(id).name).join('、')}（两轮不得重复）`,
    };
  }

  const selection = { ...listSelection(team, round), [roleId]: [...actionIds] };
  const transCap = effectiveTransCap(team, round, selection);
  for (const action of actions) {
    const need = action.consume ?? 0;
    if (need > transCap) {
      return {
        ok: false,
        reason: `超输配上限：需 ${need} 点，当前上限 ${transCap} 点（可先扩建智能电网或柔性调度）`,
      };
    }
  }

  const previousLand = otherRound === 'r1' ? usedLand(team, 'r1') : 0;
  const currentLand = actions.reduce((sum, action) => sum + (action.cost?.land ?? 0), 0);
  if (previousLand + currentLand > INITIAL.LAND_TOTAL) {
    return {
      ok: false,
      reason: `土地不足：两轮累计 ${previousLand + currentLand} 超过上限 ${INITIAL.LAND_TOTAL}`,
    };
  }

  const endFunds = availableFunds(team, round, selection);
  const floor = fundsFloor(team, round);
  if (endFunds < floor) {
    const overspend = -endFunds;
    return {
      ok: false,
      reason: floor < 0
        ? `超支 ${overspend} 超过特批上限 5`
        : `资金不足：超支 ${overspend}（可由城长特批：单项减免5资金，或超支≤5放行）`,
    };
  }

  return { ok: true };
}

export function applySelection(team, round, roleId, actionIds) {
  const result = validateSelection(team, round, roleId, actionIds);
  if (!result.ok) return result;
  team.actions[round][roleId] = {
    actionIds: [...actionIds],
    locked: false,
    passed: false,
  };
  return { ok: true };
}

export function lockAction(team, round, roleId) {
  const record = team.actions[round][roleId];
  const actionIds = record?.actionIds ?? [];
  if (!actionIds.length) return passAction(team, round, roleId);

  record.locked = false;
  const result = validateSelection(team, round, roleId, actionIds);
  if (!result.ok) {
    record.locked = true;
    return result;
  }
  record.locked = true;
  record.passed = false;
  return { ok: true };
}

export function passAction(team, round, roleId) {
  team.actions[round][roleId] = {
    actionIds: [],
    locked: true,
    passed: true,
  };
  return { ok: true };
}

export function grantApproval(team, round, approval) {
  if (!approval || !['REDUCE5', 'OVERDRAFT5'].includes(approval.type)) {
    return { ok: false, reason: '特批类型非法' };
  }
  if (approval.type === 'REDUCE5' && !approval.actionId) {
    return { ok: false, reason: '需指定减免的行动' };
  }
  if (team.approvals[round]) {
    return { ok: false, reason: '市长特批权本轮已使用（每轮1次）' };
  }
  team.approvals[round] = { ...approval };
  return { ok: true };
}

export const forceUnlock = (team, round, roleId) => {
  if (team.actions[round][roleId]) team.actions[round][roleId].locked = false;
};

export const forcePass = (team, round, roleId) => passAction(team, round, roleId);

export function finalValidate(team, round) {
  const violations = [];
  const lockedSelection = {};

  for (const [roleId, record] of Object.entries(team.actions[round] ?? {})) {
    if (record?.passed || !record?.actionIds?.length) continue;
    if (!record.locked) {
      violations.push({ roleId, reason: '行动未锁定' });
      continue;
    }
    lockedSelection[roleId] = record.actionIds;
  }

  const cost = costBreakdown(team, round, lockedSelection);
  const endFunds = availableFunds(team, round, lockedSelection);
  const floor = fundsFloor(team, round);
  if (endFunds < floor) {
    violations.push({
      roleId: '*',
      reason: `资金超支 ${-endFunds}（${floor < 0 ? '超特批上限5' : '无特批'}）`,
    });
  }

  const previousLand = round === 'r2' ? usedLand(team, 'r1') : 0;
  const totalLand = previousLand + cost.totalLand;
  if (totalLand > INITIAL.LAND_TOTAL) {
    violations.push({
      roleId: '*',
      reason: `土地超用：累计 ${totalLand} > ${INITIAL.LAND_TOTAL}`,
    });
  }

  const transCap = effectiveTransCap(team, round, lockedSelection);
  for (const [roleId, ids] of Object.entries(lockedSelection)) {
    for (const id of ids) {
      const action = getAction(id);
      const need = action.consume ?? 0;
      if (need > transCap) {
        violations.push({
          roleId,
          reason: `超输配上限：${action.name} 需 ${need} > ${transCap}`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
