import { sample } from './random.js';
import { RULES } from './actions.js';

export const dealGoals = () => sample(RULES.goals.map((goal) => goal.id), 2);

export const goalById = (id) => RULES.goals.find((goal) => goal.id === id) ?? null;

export function checkGoal(id, team) {
  const r1 = team.settlement.r1;
  const r2 = team.settlement.r2;
  if (!r1 || !r2) return false;
  const consumed = r1.actual + r2.actual;
  const power = r1.power + r2.power;
  switch (id) {
    case 'storage_master':
      return r2.storageCap >= 6 && r1.stored + r2.stored >= 2;
    case 'load_pioneer':
      return consumed >= 15;
    case 'wind_chaser':
      return !!team.flags.hasOffshoreWind && consumed >= 10;
    case 'windfree_city':
      return !team.flags.hasOffshoreWind && power >= 10
        && r1.curtailed + r2.curtailed === 0;
    case 'garden_city':
      return !!team.flags.builtLandmark
        && r1.curtailed <= 2 && r2.curtailed <= 2;
    case 'funds_steward':
      return r2.fundsEnd >= 70;
    default:
      return false;
  }
}
