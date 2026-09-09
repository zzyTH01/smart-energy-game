import { randomInt } from 'node:crypto';

export const rollDice = () => randomInt(1, 7);

export function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export const sample = (items, count) => shuffle(items).slice(0, count);

export function roomCode(existingCodes) {
  let code;
  do {
    code = String(randomInt(0, 10000)).padStart(4, '0');
  } while (existingCodes.has(code));
  return code;
}
