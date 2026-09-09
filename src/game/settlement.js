import { LOAD_ROLES } from './constants.js';
import {
  getAction,
  eventId,
  costBreakdown,
  availableFunds,
  storageCapAt,
  RULES,
} from './actions.js';

export const eventOf = (team, round) => {
  const id = eventId(team, round);
  if (!id) return null;
  return Object.values(RULES.events)
    .flat()
    .find((event) => event.id === id) ?? null;
};

function lockedSelection(team, round) {
  const locked = {};
  for (const [roleId, record] of Object.entries(team.actions[round] ?? {})) {
    if (record?.locked && !record?.passed && record?.actionIds?.length) {
      locked[roleId] = record.actionIds;
    }
  }
  return locked;
}

export function settleRound(team, round) {
  const locked = lockedSelection(team, round);
  const dice = team.dice[round] ?? {};
  const event = eventOf(team, round);

  const powerParts = [];
  let power = 0;
  for (const id of locked.GENERATION ?? []) {
    const action = getAction(id);
    let amount = action.power ?? 0;
    if (action.dice) {
      amount = dice.GENERATION?.success
        ? action.dice.success.power
        : action.dice.fail.power;
    }
    if (event?.coldWave && ['solar_pv', 'offshore_wind'].includes(id)) {
      amount = Math.max(0, amount - 3);
    }
    powerParts.push({ id, name: action.name, power: amount });
    power += amount;
  }

  const carried = round === 'r2' ? (team.settlement.r1?.stored ?? 0) : 0;
  const available = power + carried;

  const plannedByRole = {};
  for (const [roleId, ids] of Object.entries(locked)) {
    plannedByRole[roleId] = ids.reduce(
      (sum, id) => sum + (getAction(id).consume ?? 0),
      0,
    );
  }
  const plannedTotal = Object.values(plannedByRole).reduce((sum, item) => sum + item, 0);
  let remaining = available;
  const actualByRole = {};
  for (const roleId of LOAD_ROLES) {
    actualByRole[roleId] = Math.min(plannedByRole[roleId] ?? 0, remaining);
    remaining -= actualByRole[roleId];
  }
  const actual = Math.min(available, plannedTotal);
  const shortage = plannedTotal - actual;

  const storageCap = storageCapAt(team, round, dice);
  const stored = Math.min(Math.max(0, available - actual), storageCap);
  const curtailed = available - actual - stored;
  const legalQuota = (locked.GRID ?? []).includes('flex_dispatch') ? 2 : 0;
  const penalized = Math.max(0, curtailed - legalQuota);
  const penalty = penalized * (event?.penaltyMultiplier ?? 2);
  const fundsEnd = availableFunds(team, round, locked);
  const materialSavings = costBreakdown(team, round, locked).materialSavings;

  const has = (roleId, id) => (locked[roleId] ?? []).includes(id);
  Object.assign(team.flags, {
    hasOffshoreWind: team.flags.hasOffshoreWind || has('GENERATION', 'offshore_wind'),
    builtStoragePlant: team.flags.builtStoragePlant || has('GRID', 'storage_plant'),
    builtLandmark: team.flags.builtLandmark || has('BUILDING', 'bldg_landmark'),
    builtSuperCharger: team.flags.builtSuperCharger || has('EV', 'ev_super_charger'),
    didGreening: team.flags.didGreening || has('BUILDING', 'bldg_greening'),
    usedInvestment: team.flags.usedInvestment || has('NDRC', 'ndrc_investment'),
  });

  const detail = {
    round,
    eventId: eventId(team, round),
    powerParts,
    power,
    carried,
    available,
    plannedByRole,
    plannedTotal,
    actualByRole,
    actual,
    shortage,
    storageCap,
    stored,
    curtailed,
    legalQuota,
    penalized,
    penalty,
    fundsEnd,
    materialSavings,
    steps: [
      {
        key: 'power',
        label: '发电产出',
        text: `${power} 点${carried ? `（含上轮结转 ${carried}）` : ''}`,
      },
      {
        key: 'consume',
        label: '实际消耗',
        text: `${actual} 点${shortage > 0 ? `（缺口 ${shortage} 点：电力不足！）` : ''}`,
      },
      { key: 'stored', label: '储能入量', text: `${stored} 点（容量 ${storageCap}）` },
      {
        key: 'curtail',
        label: '弃电',
        text: `${curtailed} 点${legalQuota ? `（合法弃电 ${legalQuota}）` : ''} → 罚分 ${penalty}`,
      },
      { key: 'funds', label: '资金结余', text: `${fundsEnd}` },
    ],
  };
  team.settlement[round] = detail;
  return detail;
}
