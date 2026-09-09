import { LOAD_ROLES, SCORING_ROLES } from './constants.js';
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

export function computeScores(team, upto = 2) {
  if (!team.settlement.r1) return null;
  const rounds = upto === 1 ? ['r1'] : ['r1', 'r2'];
  const detail = (round) => team.settlement[round];
  const did = (roleId, id) => rounds.some((round) => {
    const record = team.actions[round][roleId];
    return record && !record.passed && record.actionIds.includes(id);
  });

  const subsidy = did('NDRC', 'ndrc_subsidy');
  const capacityPrice = did('NDRC', 'ndrc_capacity_price');
  const coldWave = rounds.includes('r2') && eventId(team, 'r2') === 'cold_wave';

  const generation = rounds.reduce((sum, round) => sum + (detail(round)?.power ?? 0), 0)
    + (subsidy ? 4 : 0)
    + (coldWave ? -3 : 0);
  const grid = (did('GRID', 'grid_expand') ? 4 : 0)
    + (did('GRID', 'storage_plant') ? 4 : 0)
    + (did('GRID', 'flex_dispatch') ? 3 : 0)
    + (subsidy ? 4 : 0);
  const evConsumed = rounds.reduce(
    (sum, round) => sum + (detail(round)?.actualByRole.EV ?? 0),
    0,
  );
  let v2gBonus = 0;
  for (const round of rounds) {
    if (!did('EV', 'ev_v2g')) continue;
    const dice = team.dice[round]?.EV;
    if (dice) v2gBonus += dice.success ? 4 : 1;
  }
  const r2Ev = team.actions.r2.EV;
  const superChargerBonus = (team.actions.r1.EV?.actionIds ?? []).includes('ev_super_charger')
    && r2Ev && !r2Ev.passed && r2Ev.actionIds.includes('ev_mass_produce') ? 2 : 0;
  const ev = evConsumed + v2gBonus + superChargerBonus - (capacityPrice ? 2 : 0);
  const building = rounds.reduce(
    (sum, round) => sum + (detail(round)?.actualByRole.BUILDING ?? 0),
    0,
  ) - (capacityPrice ? 2 : 0);
  const material = Math.floor(
    rounds.reduce((sum, round) => sum + (detail(round)?.materialSavings ?? 0), 0) / 5,
  );
  const otherScores = generation + grid + ev + building + material;
  const ndrc = Math.floor(otherScores / 4)
    + (rounds.includes('r2') ? Math.floor((detail('r2')?.fundsEnd ?? 0) / 10) : 0);
  const individual = {
    GENERATION: generation,
    GRID: grid,
    EV: ev,
    BUILDING: building,
    MATERIAL: material,
    NDRC: ndrc,
    ACTUARY: ndrc,
  };
  if (upto === 1) return { individual };

  const storedTotal = rounds.reduce((sum, round) => sum + (detail(round)?.stored ?? 0), 0);
  const penaltyTotal = rounds.reduce((sum, round) => sum + (detail(round)?.penalty ?? 0), 0);
  const extra = [];
  if (team.flags.didGreening) extra.push({ reason: '全域立体绿化', points: 5 });
  if (detail('r1').penalty === 0 && detail('r2').penalty === 0) {
    extra.push({ reason: '两轮零弃电罚分', points: 5 });
  }
  if (eventId(team, 'r2') === 'cold_wave' && team.flags.builtStoragePlant) {
    extra.push({
      reason: '寒潮中保有储能电站',
      points: eventOf(team, 'r2').storagePlantBonus,
    });
  }
  if (eventId(team, 'r2') === 'price_surge') {
    extra.push({
      reason: '现货暴涨·首轮储能增值',
      points: (detail('r1')?.stored ?? 0) * eventOf(team, 'r2').carriedStorageScore,
    });
  }
  if (eventId(team, 'r2') === 'pioneer_cert' && team.flags.usedInvestment
    && [detail('r1'), detail('r2')].every((item) => item.power - item.actual <= 2)) {
    extra.push({
      reason: '零碳城市先锋认证',
      points: eventOf(team, 'r2').pioneerBonus,
    });
  }

  const extraTotal = extra.reduce((sum, item) => sum + item.points, 0);
  const sum6 = SCORING_ROLES.reduce((sum, role) => sum + individual[role], 0);
  const teamTotal = sum6 + storedTotal - penaltyTotal + extraTotal;
  return {
    individual,
    storedTotal,
    penaltyTotal,
    extra,
    extraTotal,
    sum6,
    teamTotal,
  };
}

export function interimScore(team) {
  const scores = computeScores(team, 1);
  if (!scores) return null;
  const sum6 = SCORING_ROLES.reduce((sum, role) => sum + scores.individual[role], 0);
  return sum6
    + (team.settlement.r1?.stored ?? 0)
    - (team.settlement.r1?.penalty ?? 0);
}

export function rankTeams(teams) {
  return teams.map((team) => {
    const scores = computeScores(team);
    const total = team.settlement.teamTotal ?? scores?.teamTotal ?? 0;
    const individualSum = SCORING_ROLES.reduce(
      (sum, role) => sum + (team.settlement.individual[role] ?? scores?.individual[role] ?? 0),
      0,
    );
    return {
      teamId: team.id,
      name: team.name,
      total,
      module: total - individualSum,
    };
  }).sort((a, b) => b.total - a.total || b.module - a.module);
}
