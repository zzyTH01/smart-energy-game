import { sample } from './random.js';
import { RULES } from './actions.js';

export const drawEvent = (round) => sample(RULES.events[round], 1)[0].id;

export const eventCardById = (round, id) => RULES.events[round]
  .find((event) => event.id === id) ?? null;
