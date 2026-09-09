import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDice, shuffle, sample, roomCode } from '../src/game/random.js';

test('骰子值域1-6且两值都可能出现', () => {
  const seen = new Set();
  for (let index = 0; index < 300; index += 1) {
    const value = rollDice();
    assert.ok(value >= 1 && value <= 6 && Number.isInteger(value));
    seen.add(value);
  }
  assert.ok(seen.size >= 3, '300次应出现至少3种值');
});

test('shuffle 不改原数组、元素不变', () => {
  const source = [1, 2, 3, 4, 5];
  const output = shuffle(source);
  assert.deepEqual([...source].sort(), [...output].sort());
  assert.deepEqual(source, [1, 2, 3, 4, 5]);
});

test('sample 抽n个不重复', () => {
  const source = ['a', 'b', 'c', 'd', 'e', 'f'];
  const output = sample(source, 2);
  assert.equal(output.length, 2);
  assert.equal(new Set(output).size, 2);
  for (const item of output) assert.ok(source.includes(item));
});

test('roomCode 为4位且避开已存在', () => {
  const existing = new Set();
  const first = roomCode(existing);
  assert.match(first, /^\d{4}$/);
  existing.add(first);
  assert.notEqual(roomCode(existing), first);
});
