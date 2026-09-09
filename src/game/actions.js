import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INITIAL } from './constants.js';

const load = (name) => JSON.parse(
  readFileSync(fileURLToPath(new URL(`../../data/${name}`, import.meta.url)), 'utf8'),
);

const actionList = load('actions.json');
export const RULES = {
  actions: actionList,
  events: load('events.json'),
  goals: load('goals.json'),
  config: load('config.json'),
};

const actionMap = new Map(actionList.map((action) => [action.id, action]));
export const getAction = (id) => actionMap.get(id);
export const actionsForRole = (role) => actionList.filter((action) => action.role === role);

export function listSelection(team, round) {
  const selection = {};
  for (const [roleId, record] of Object.entries(team.actions[round] ?? {})) {
    if (!record?.passed && record?.actionIds?.length) selection[roleId] = [...record.actionIds];
  }
  return selection;
}

export const eventId = (team, round) => team.eventCards?.[round] ?? null;

function eventCard(team, round) {
  const id = eventId(team, round);
  return id ? RULES.events[round]?.find((event) => event.id === id) : null;
}

function materialActive(team, round, id) {
  const rounds = round === 'r1' ? ['r1'] : ['r1', 'r2'];
  return rounds.some((current) => (
    team.actions[current]?.MATERIAL?.actionIds ?? []
  ).includes(id));
}

function chainReduceActive(team, round, selection) {
  if ((selection.MATERIAL ?? []).includes('mat_chain_reduce')) return true;
  const record = team.actions[round]?.MATERIAL;
  return !record?.passed && (record?.actionIds ?? []).includes('mat_chain_reduce');
}

export function effectiveTransCap(team, round, selection = {}) {
  let cap = INITIAL.TRANS_CAP_BASE;
  const rounds = round === 'r1' ? ['r1'] : ['r1', 'r2'];
  for (const current of rounds) {
    const ids = current === round
      ? (selection.GRID ?? [])
      : (team.actions[current]?.GRID?.actionIds ?? []);
    if (ids.includes('grid_expand')) cap += 4;
    if (current === round && ids.includes('flex_dispatch')) cap += 2;
  }
  return cap;
}

export function storageCapAt(team, round, dice = {}) {
  let cap = INITIAL.STORAGE_CAP_BASE;
  const rounds = round === 'r1' ? ['r1'] : ['r1', 'r2'];
  for (const current of rounds) {
    if ((team.actions[current]?.GRID?.actionIds ?? []).includes('storage_plant')) cap += 4;
    if ((team.actions[current]?.EV?.actionIds ?? []).includes('ev_v2g')) {
      const result = dice.EV;
      if (result) cap += result.success ? 2 : 1;
    }
  }
  return cap;
}

function discount(funds, amount, source, discounts) {
  const applied = Math.min(amount, Math.max(0, funds));
  if (applied > 0) discounts.push({ source, amount: applied });
  return funds - applied;
}

export function costBreakdown(team, round, selection = {}) {
  const event = eventCard(team, round);
  const approval = team.approvals[round];
  const items = {};
  let totalFunds = 0;
  let totalLand = 0;
  let materialSavings = 0;

  for (const [roleId, ids] of Object.entries(selection)) {
    items[roleId] = ids.map((id) => {
      const action = getAction(id);
      const base = action.cost?.funds ?? 0;
      let funds = base;
      const discounts = [];

      if (event?.materialFree && action.role === 'MATERIAL') {
        discounts.push({ source: '事件·产学研', amount: funds });
        funds = 0;
      }
      if (funds > 0) {
        if (action.role === 'GENERATION' && materialActive(team, round, 'mat_pv_material')) {
          funds = discount(funds, 10, '材料·钙钛矿', discounts);
        }
        if (action.role === 'BUILDING' && materialActive(team, round, 'mat_green_material')) {
          funds = discount(funds, 10, '材料·轻质建材', discounts);
        }
        if (chainReduceActive(team, round, selection)) {
          funds = discount(funds, 5, '材料·全链降本', discounts);
        }
        if (event?.eventDiscount && (event.eventDiscountRoles ?? []).includes(action.role)) {
          funds = discount(funds, event.eventDiscount, `事件·${event.name}`, discounts);
        }
        if (team.flags.builtLandmark && id === 'bldg_greening') {
          funds = discount(funds, 10, '特效·地标综合体', discounts);
        }
        if (approval?.type === 'REDUCE5' && approval.actionId === id) {
          funds = discount(funds, 5, '城长特批', discounts);
        }
      }

      const effective = Math.max(0, funds);
      for (const item of discounts) {
        if (item.source.startsWith('材料')) materialSavings += item.amount;
      }
      const land = action.cost?.land ?? 0;
      totalFunds += effective;
      totalLand += land;
      return { actionId: id, name: action.name, base, discounts, effective, land };
    });
  }

  return { items, totalFunds, totalLand, materialSavings };
}

export function availableFunds(team, round, selection = {}) {
  const event = eventCard(team, round);
  let funds = event?.fundsBase ?? INITIAL.FUNDS_PER_ROUND;
  for (const ids of Object.values(selection)) {
    for (const id of ids) {
      for (const effect of getAction(id).effects ?? []) {
        if (effect.type === 'TEAM_FUNDS' || effect.type === 'TEAM_FUNDS_RETURN') {
          funds += effect.value;
        }
      }
    }
  }
  return funds - costBreakdown(team, round, selection).totalFunds;
}
