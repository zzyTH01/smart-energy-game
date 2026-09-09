import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROLE_NAMES, SCORING_ROLES } from './game/constants.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export const paths = {
  snapshots: join(root, 'data', 'snapshots'),
  exports: join(root, 'data', 'exports'),
};

mkdirSync(paths.snapshots, { recursive: true });
mkdirSync(paths.exports, { recursive: true });

export const snapshotPath = (code) => join(paths.snapshots, `${code}.json`);

export function saveSnapshot(room) {
  writeFileSync(snapshotPath(room.code), JSON.stringify(room, null, 2));
}

export function loadSnapshot(code) {
  const path = snapshotPath(code);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(room) {
  const head = [
    '队伍',
    ...SCORING_ROLES.map((role) => ROLE_NAMES[role]),
    '精算师(同发改)',
    '储能电量',
    '弃电罚分',
    '额外加分',
    '目标卡',
    '终极总分',
    '名次',
  ];
  const sorted = [...room.teams].sort((a, b) => (
    (b.settlement.teamTotal ?? -1) - (a.settlement.teamTotal ?? -1)
  ));
  const rankOf = (id) => sorted.findIndex((team) => team.id === id) + 1;
  const rows = room.teams.map((team) => [
    team.name,
    ...SCORING_ROLES.map((role) => team.settlement.individual?.[role] ?? ''),
    team.settlement.individual?.ACTUARY ?? '',
    (team.settlement.r1?.stored ?? 0) + (team.settlement.r2?.stored ?? 0),
    (team.settlement.r1?.penalty ?? 0) + (team.settlement.r2?.penalty ?? 0),
    (team.settlement.extraBonus ?? []).map((item) => `${item.reason}+${item.points}`).join(' ') || '无',
    team.goalKept
      ? `${team.goalAchieved ? '达成' : '未达成'}·${team.goalKept}`
      : '未选',
    team.settlement.teamTotal ?? '',
    rankOf(team.id),
  ]);
  return [head, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function exportResult(room) {
  const json = JSON.stringify(room, null, 2);
  const csv = toCsv(room);
  writeFileSync(join(paths.exports, `${room.code}-成绩.json`), json);
  writeFileSync(join(paths.exports, `${room.code}-成绩.csv`), csv);
  return { json, csv };
}
