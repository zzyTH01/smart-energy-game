export const ROLES = {
  GENERATION: 'GENERATION',
  GRID: 'GRID',
  EV: 'EV',
  BUILDING: 'BUILDING',
  MATERIAL: 'MATERIAL',
  NDRC: 'NDRC',
  MAYOR: 'MAYOR',
  ACTUARY: 'ACTUARY',
};

export const ROLE_NAMES = {
  GENERATION: '新能源发电企业',
  GRID: '电网企业',
  EV: '新能源汽车企业',
  BUILDING: '智能建筑企业',
  MATERIAL: '智能材料企业',
  NDRC: '发改委',
  MAYOR: '自强城城长',
  ACTUARY: '首席精算师',
};

export const SCORING_ROLES = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC'];
export const LOAD_ROLES = ['EV', 'BUILDING'];
export const STANDARD_ROLES = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'MAYOR'];
export const PHASES = ['LOBBY', 'GOAL_PICK', 'R1_PLAN', 'R1_SETTLE', 'R2_PLAN', 'R2_SETTLE', 'FINISHED'];
export const INITIAL = {
  FUNDS_PER_ROUND: 100,
  LAND_TOTAL: 12,
  TRANS_CAP_BASE: 3,
  STORAGE_CAP_BASE: 2,
};

export function createTeam(id, name) {
  return {
    id,
    name,
    goalCards: [],
    goalKept: null,
    approvals: { r1: null, r2: null },
    actions: { r1: {}, r2: {} },
    dice: { r1: {}, r2: {} },
    eventCards: { r1: null, r2: null },
    flags: {
      builtStoragePlant: false,
      builtLandmark: false,
      builtSuperCharger: false,
      didGreening: false,
      hasOffshoreWind: false,
      usedInvestment: false,
      evMassProduce: false,
      isNuclear: false,
    },
    settlement: { r1: null, r2: null, individual: {}, extraBonus: [], teamTotal: null },
    audit: [],
  };
}
