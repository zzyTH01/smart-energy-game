# "快乐能源"联机游戏 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"快乐能源"桌游规则 v2.7.2 数字化为局域网多人联机游戏：服务端权威引擎 + 手机玩家端 + 主持人大屏端。

**Architecture:** 单进程 Node.js，Express 静态文件 + Socket.IO 实时同步。游戏状态全部在服务端内存（唯一权威），每次变更写 JSON 快照。规则（行动/事件/目标卡）全部数据化在 `data/*.json`。客户端为"显示器+操作面板"。

**Tech Stack:** Node.js ≥18（ESM）、Express 4、Socket.IO 4、`qrcode`（局域网二维码 SVG）、Node 内置 `node:test`。

**Spec:** `docs/superpowers/specs/2026-09-02-kuaile-energy-game-design.md`（规则数值、公式、模糊点约定 A1–A8 以 spec 为准，本计划不重复论证）

## Global Constraints

- 全中文界面与提示文案。
- ESM（`"type": "module"`），测试命令统一 `node --test tests/`。
- 随机一律 `node:crypto` 的 `randomInt`，禁止 `Math.random`。
- 所有除法取整用 `Math.floor`（spec 约定 A2）。
- 输配上限硬拦截是"不可选"而非"扣分"（spec 3.5）。
- 规则数值只出现在 `data/*.json`，引擎代码不得硬编码数值（骰子阈值在 JSON 里）。
- 每个任务完成必须 `node --test tests/` 全绿后 commit。

---

### Task 1: 项目脚手架与规则数据

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `data/config.json`, `data/actions.json`, `data/events.json`, `data/goals.json`
- Create: `src/game/constants.js`
- Test: `tests/rules-data.test.js`

**Interfaces:**
- Produces: `constants.js` 导出 `ROLES, ROLE_NAMES, SCORING_ROLES, LOAD_ROLES, PHASES, INITIAL, createTeam(id, name)`；`data/actions.json` 的 20 个行动 id（后续任务按 id 引用）。

- [ ] **Step 1: 写 package.json 与 .gitignore**

```json
{
  "name": "kuaile-energy",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "express": "^4.19.2",
    "qrcode": "^1.5.4",
    "socket.io": "^4.7.5"
  }
}
```

`.gitignore`:

```
node_modules/
data/snapshots/
data/exports/
```

- [ ] **Step 2: 写 data/config.json**

```json
{
  "port": 3000,
  "planningMinutes": 15,
  "warnMinutes": [5, 1],
  "teamCountMin": 2,
  "teamCountMax": 8
}
```

- [ ] **Step 3: 写 data/actions.json（20 项行动，spec 3.3 的完整数据化）**

```json
[
  { "id": "solar_pv", "role": "GENERATION", "name": "集中式光伏", "desc": "稳定产出8点绿电", "cost": { "funds": 25, "land": 2 }, "power": 8, "scoreFlat": 8 },
  { "id": "offshore_wind", "role": "GENERATION", "name": "深远海风电", "desc": "掷骰≥4产出15点，<4保底5点", "cost": { "funds": 35, "land": 3 }, "dice": { "threshold": 4, "success": { "power": 15, "score": 15 }, "fail": { "power": 5, "score": 5 } }, "flags": ["hasOffshoreWind"] },
  { "id": "nuclear", "role": "GENERATION", "name": "先进核电站", "desc": "稳定产出10点绿电（免疫极端气候）", "cost": { "funds": 35, "land": 3 }, "power": 10, "scoreFlat": 10, "flags": ["isNuclear"] },

  { "id": "grid_expand", "role": "GRID", "name": "扩建智能电网", "desc": "输配上限+4（永久）", "cost": { "funds": 20, "land": 1 }, "effects": [{ "type": "TRANS_CAP", "value": 4 }], "scoreFlat": 4 },
  { "id": "storage_plant", "role": "GRID", "name": "建设储能电站", "desc": "储能容量+4（免疫寒潮，吸收弃电）", "cost": { "funds": 25, "land": 2 }, "effects": [{ "type": "STORAGE_CAP", "value": 4 }, { "type": "FLAG", "flag": "builtStoragePlant" }], "scoreFlat": 4 },
  { "id": "flex_dispatch", "role": "GRID", "name": "柔性电网调度", "desc": "当轮输配上限+2；合法弃电额度+2", "cost": { "funds": 15, "land": 0 }, "effects": [{ "type": "FLEX_DISPATCH" }], "scoreFlat": 3 },

  { "id": "ev_mass_produce", "role": "EV", "name": "批量生产电动车", "desc": "当轮消耗绿电5点", "cost": { "funds": 25, "land": 0 }, "consume": 5, "score": "CONSUME", "flags": ["evMassProduce"] },
  { "id": "ev_charging_expand", "role": "EV", "name": "扩建快充网络", "desc": "当轮消耗绿电3点", "cost": { "funds": 15, "land": 1 }, "consume": 3, "score": "CONSUME" },
  { "id": "ev_v2g", "role": "EV", "name": "车网互动V2G研发", "desc": "消耗2点；掷骰≥3储能+2，<3储能+1", "cost": { "funds": 15, "land": 0 }, "consume": 2, "score": "CONSUME", "dice": { "threshold": 3, "success": { "storageCap": 2, "scoreBonus": 4 }, "fail": { "storageCap": 1, "scoreBonus": 1 } } },
  { "id": "ev_super_charger", "role": "EV", "name": "新建超级快充网络", "desc": "消耗7点；其后批量生产电动车+2分", "cost": { "funds": 40, "land": 3 }, "consume": 7, "score": "CONSUME", "flags": ["builtSuperCharger"] },

  { "id": "bldg_zero_carbon", "role": "BUILDING", "name": "新建零碳楼宇", "desc": "当轮消耗绿电6点", "cost": { "funds": 20, "land": 2 }, "consume": 6, "score": "CONSUME" },
  { "id": "bldg_retrofit", "role": "BUILDING", "name": "既有建筑节能改造", "desc": "消耗2点；返还全队5资金", "cost": { "funds": 20, "land": 0 }, "consume": 2, "score": "CONSUME", "effects": [{ "type": "TEAM_FUNDS_RETURN", "value": 5 }] },
  { "id": "bldg_greening", "role": "BUILDING", "name": "全域立体绿化", "desc": "消耗4点；终局全队+5分", "cost": { "funds": 25, "land": 0 }, "consume": 4, "score": "CONSUME", "flags": ["didGreening"], "effects": [{ "type": "TEAM_BONUS_FINAL", "reason": "全域立体绿化", "value": 5 }] },
  { "id": "bldg_landmark", "role": "BUILDING", "name": "地标级零碳综合体", "desc": "消耗7点；其后全域立体绿化资金-10", "cost": { "funds": 45, "land": 3 }, "consume": 7, "score": "CONSUME", "flags": ["builtLandmark"] },

  { "id": "mat_pv_material", "role": "MATERIAL", "name": "钙钛矿光伏材料", "desc": "本轮及后续发电建造成本-10", "cost": { "funds": 10, "land": 0 }, "effects": [{ "type": "MATERIAL_DISCOUNT", "target": "GENERATION", "value": 10 }] },
  { "id": "mat_green_material", "role": "MATERIAL", "name": "轻质绿色建材", "desc": "本轮及后续建筑建造成本-10", "cost": { "funds": 10, "land": 0 }, "effects": [{ "type": "MATERIAL_DISCOUNT", "target": "BUILDING", "value": 10 }] },
  { "id": "mat_chain_reduce", "role": "MATERIAL", "name": "全链降本工艺", "desc": "本轮全队行动成本各减5", "cost": { "funds": 10, "land": 0 }, "effects": [{ "type": "CHAIN_REDUCE", "value": 5 }] },

  { "id": "ndrc_subsidy", "role": "NDRC", "name": "绿电补贴政策", "desc": "发电、电网各+4分", "cost": { "funds": 20, "land": 0 }, "effects": [{ "type": "SCORE_BUFF", "targets": ["GENERATION", "GRID"], "value": 4 }] },
  { "id": "ndrc_capacity_price", "role": "NDRC", "name": "容量电价机制", "desc": "全队+25资金；汽车、建筑各-2分", "cost": { "funds": 0, "land": 0 }, "effects": [{ "type": "TEAM_FUNDS", "value": 25 }, { "type": "SCORE_DEBUFF", "targets": ["EV", "BUILDING"], "value": 2 }] },
  { "id": "ndrc_investment", "role": "NDRC", "name": "绿色招商引资", "desc": "全队+30资金（当轮）", "cost": { "funds": 0, "land": 2 }, "effects": [{ "type": "TEAM_FUNDS", "value": 30 }, { "type": "FLAG", "flag": "usedInvestment" }] }
]
```

- [ ] **Step 4: 写 data/events.json（spec 3.6）**

```json
{
  "r1": [
    { "id": "green_bond", "name": "专项绿色国债", "desc": "全队初始资金提升至125", "fundsBase": 125 },
    { "id": "research_breakthrough", "name": "产学研大突破", "desc": "材料本轮研发免费，且可同时执行2项研发", "materialFree": true, "dualResearch": true },
    { "id": "green_consumption", "name": "绿色消费潮", "desc": "本轮汽车与建筑项目成本各减免10", "eventDiscount": 10, "eventDiscountRoles": ["EV", "BUILDING"] }
  ],
  "r2": [
    { "id": "cold_wave", "name": "极寒无风寒潮", "desc": "光伏-3（无光伏则风电-3），核电免疫；发电个人分-3；有储能电站额外+5", "coldWave": true, "storagePlantBonus": 5 },
    { "id": "price_surge", "name": "现货电价暴涨", "desc": "第1轮储能电量每点+2分；本轮弃电罚分每点扣4", "penaltyMultiplier": 4, "carriedStorageScore": 2 },
    { "id": "pioneer_cert", "name": "零碳城市先锋认证", "desc": "两轮发电产出-实际消耗均≤2且实施过绿色招商引资，全队+8", "pioneerBonus": 8 }
  ]
}
```

- [ ] **Step 5: 写 data/goals.json（spec 3.7）**

```json
[
  { "id": "storage_master", "name": "储能达人", "desc": "累计总储能容量≥6，且储能吸收量≥2" },
  { "id": "load_pioneer", "name": "负荷先锋", "desc": "两轮实际消耗合计≥15" },
  { "id": "wind_chaser", "name": "追风者", "desc": "选择了深远海风电，且两轮实际消耗合计≥10" },
  { "id": "windfree_city", "name": "无风之城", "desc": "全程未选深远海风电，两轮总绿电≥10且弃电量为0" },
  { "id": "garden_city", "name": "花园城市", "desc": "执行了地标级零碳综合体，且每轮弃电量均≤2" },
  { "id": "funds_steward", "name": "资金管家", "desc": "第2轮结余资金≥70" }
]
```

- [ ] **Step 6: 写 src/game/constants.js**

```js
export const ROLES = {
  GENERATION: 'GENERATION', GRID: 'GRID', EV: 'EV', BUILDING: 'BUILDING',
  MATERIAL: 'MATERIAL', NDRC: 'NDRC', MAYOR: 'MAYOR', ACTUARY: 'ACTUARY',
};
export const ROLE_NAMES = {
  GENERATION: '新能源发电企业', GRID: '电网企业', EV: '新能源汽车企业',
  BUILDING: '智能建筑企业', MATERIAL: '智能材料企业', NDRC: '发改委',
  MAYOR: '自强城城长', ACTUARY: '首席精算师',
};
export const SCORING_ROLES = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC'];
export const LOAD_ROLES = ['EV', 'BUILDING']; // 电力缺口分配顺序（spec A1）
export const STANDARD_ROLES = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'MAYOR'];
export const PHASES = ['LOBBY', 'GOAL_PICK', 'R1_PLAN', 'R1_SETTLE', 'R2_PLAN', 'R2_SETTLE', 'FINISHED'];
export const INITIAL = { FUNDS_PER_ROUND: 100, LAND_TOTAL: 12, TRANS_CAP_BASE: 3, STORAGE_CAP_BASE: 2 };

export function createTeam(id, name) {
  return {
    id, name,
    goalCards: [], goalKept: null,
    approvals: { r1: null, r2: null },       // {type:'REDUCE5'|'OVERDRAFT5', actionId?}
    actions: { r1: {}, r2: {} },             // roleId -> {actionIds:[], locked, passed}
    dice: { r1: {}, r2: {} },                // roleId -> {value, success}
    eventCards: { r1: null, r2: null },
    flags: { builtStoragePlant: false, builtLandmark: false, builtSuperCharger: false,
             didGreening: false, hasOffshoreWind: false, usedInvestment: false,
             evMassProduce: false, isNuclear: false },
    settlement: { r1: null, r2: null, individual: {}, extraBonus: [], teamTotal: null },
    audit: [],
  };
}
```

- [ ] **Step 7: 安装依赖并写数据完整性测试**

Run: `npm install`

```js
// tests/rules-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLES, SCORING_ROLES, createTeam } from '../src/game/constants.js';

const data = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${f}`, import.meta.url)), 'utf8'));
const actions = data('actions.json');
const events = data('events.json');
const goals = data('goals.json');

test('行动共20项，id唯一，角色合法', () => {
  assert.equal(actions.length, 20);
  assert.equal(new Set(actions.map(a => a.id)).size, 20);
  for (const a of actions) assert.ok(ROLES[a.role], `${a.id} 角色非法`);
});

test('每个计分角色都有行动池', () => {
  for (const r of SCORING_ROLES) assert.ok(actions.some(a => a.role === r), `${r} 无行动`);
});

test('消耗型行动必属荷侧，发电型必属发电侧', () => {
  for (const a of actions.filter(a => a.consume)) assert.ok(['EV', 'BUILDING'].includes(a.role));
  for (const a of actions.filter(a => a.power || a.dice?.success?.power)) assert.equal(a.role, 'GENERATION');
});

test('事件卡：第1轮3张机遇、第2轮3张考验', () => {
  assert.equal(events.r1.length, 3);
  assert.equal(events.r2.length, 3);
});

test('目标卡共6张，id唯一', () => {
  assert.equal(goals.length, 6);
  assert.equal(new Set(goals.map(g => g.id)).size, 6);
});

test('createTeam 初始状态符合 spec', () => {
  const t = createTeam('t1', '一队');
  assert.deepEqual(t.approvals, { r1: null, r2: null });
  assert.equal(t.settlement.teamTotal, null);
});
```

- [ ] **Step 8: 运行测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore data/ src/ tests/
git commit -m "feat: 项目脚手架与规则数据表（20行动/6事件/6目标卡）"
```

---

### Task 2: 服务端权威随机 random.js

**Files:**
- Create: `src/game/random.js`
- Test: `tests/random.test.js`

**Interfaces:**
- Produces: `rollDice(): 1..6`、`shuffle(arr): 新数组`、`sample(arr, n): n个不重复`、`roomCode(existingSet): 4位字符串`

- [ ] **Step 1: 写失败测试**

```js
// tests/random.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDice, shuffle, sample, roomCode } from '../src/game/random.js';

test('骰子值域1-6且两值都可能出现', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const v = rollDice();
    assert.ok(v >= 1 && v <= 6 && Number.isInteger(v));
    seen.add(v);
  }
  assert.ok(seen.size >= 3, '300次应出现至少3种值');
});

test('shuffle 不改原数组、元素不变', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src);
  assert.deepEqual([...src].sort(), [...out].sort());
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
});

test('sample 抽n个不重复', () => {
  const out = sample(['a', 'b', 'c', 'd', 'e', 'f'], 2);
  assert.equal(out.length, 2);
  assert.equal(new Set(out).size, 2);
  for (const x of out) assert.ok(['a', 'b', 'c', 'd', 'e', 'f'].includes(x));
});

test('roomCode 为4位且避开已存在', () => {
  const existing = new Set();
  const c1 = roomCode(existing);
  assert.match(c1, /^\d{4}$/);
  existing.add(c1);
  assert.notEqual(roomCode(existing), c1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/random.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/game/random.js
import { randomInt } from 'node:crypto';

export const rollDice = () => randomInt(1, 7);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr, n) => shuffle(arr).slice(0, n);

export function roomCode(existing) {
  let code;
  do { code = String(randomInt(0, 10000)).padStart(4, '0'); } while (existing.has(code));
  return code;
}
```

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/random.js tests/random.test.js
git commit -m "feat: 服务端权威随机（骰子/洗牌/房间码）"
```

---

### Task 3: 成本管线与资源核算 actions.js

**Files:**
- Create: `src/game/actions.js`
- Test: `tests/actions.test.js`

**Interfaces:**
- Consumes: Task 1 的 `data/*.json`、`constants.js`；team 结构见 `createTeam`。
- Produces:
  - `RULES`：`{actions: Map<id,action>, events, goals, config}`
  - `getAction(id)`, `actionsForRole(role): action[]`
  - `listSelection(team, round): {roleId: actionId[]}`（读 `team.actions[round]`，跳过 passed）
  - `eventId(team, round): string|null`
  - `costBreakdown(team, round, selection): {items:{roleId:[{actionId,name,base,discounts,effective,land}]}, totalFunds, totalLand, materialSavings}`
  - `availableFunds(team, round, selection): number`（轮末结余，可为负）
  - `effectiveTransCap(team, round, selection): number`
  - `storageCapAt(team, round, dice): number`（dice: `{EV:{success:boolean}|undefined}`）

- [ ] **Step 1: 写失败测试**

```js
// tests/actions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { getAction, actionsForRole, costBreakdown, availableFunds, effectiveTransCap, storageCapAt } from '../src/game/actions.js';

function teamWith(round, event, records) {
  const t = createTeam('t1', '一队');
  t.eventCards[round] = event;
  for (const [roleId, actionIds] of Object.entries(records))
    t.actions[round][roleId] = { actionIds, locked: true, passed: false };
  return t;
}

test('行动池按角色过滤', () => {
  const pool = actionsForRole('GENERATION').map(a => a.id);
  assert.deepEqual(pool.sort(), ['nuclear', 'offshore_wind', 'solar_pv']);
  assert.equal(getAction('ev_v2g').dice.threshold, 3);
});

test('无折扣：基础成本原样', () => {
  const t = teamWith('r1', null, { GENERATION: ['solar_pv'] });
  const cb = costBreakdown(t, 'r1', { GENERATION: ['solar_pv'] });
  assert.equal(cb.items.GENERATION[0].effective, 25);
  assert.equal(cb.totalFunds, 25);
  assert.equal(cb.totalLand, 2);
  assert.equal(cb.materialSavings, 0);
});

test('钙钛矿当轮即生效：发电建造-10，计入材料节省', () => {
  const t = teamWith('r1', null, { MATERIAL: ['mat_pv_material'], GENERATION: ['offshore_wind'] });
  const sel = { MATERIAL: ['mat_pv_material'], GENERATION: ['offshore_wind'] };
  const cb = costBreakdown(t, 'r1', sel);
  assert.equal(cb.items.GENERATION[0].effective, 25); // 35-10
  assert.equal(cb.materialSavings, 10);
});

test('钙钛矿跨轮生效（第1轮研发、第2轮仍减）', () => {
  const t = teamWith('r2', null, {});
  t.actions.r1.MATERIAL = { actionIds: ['mat_pv_material'], locked: true, passed: false };
  const cb = costBreakdown(t, 'r2', { GENERATION: ['solar_pv'] });
  assert.equal(cb.items.GENERATION[0].effective, 15); // 25-10
});

test('全链降本当轮生效：全队各减5（含材料自身），上限为剩余成本', () => {
  const t = teamWith('r1', null, { MATERIAL: ['mat_chain_reduce'], NDRC: ['ndrc_subsidy'] });
  const sel = { MATERIAL: ['mat_chain_reduce'], NDRC: ['ndrc_subsidy'] };
  const cb = costBreakdown(t, 'r1', sel);
  assert.equal(cb.items.NDRC[0].effective, 15);           // 20-5
  assert.equal(cb.items.MATERIAL[0].effective, 5);        // 10-5
  assert.equal(cb.materialSavings, 10);                   // 5+5
});

test('绿色消费潮：汽车/建筑各-10，不计入材料节省', () => {
  const t = teamWith('r1', 'green_consumption', { EV: ['ev_mass_produce'] });
  const cb = costBreakdown(t, 'r1', { EV: ['ev_mass_produce'] });
  assert.equal(cb.items.EV[0].effective, 15);
  assert.equal(cb.materialSavings, 0);
});

test('产学研：材料研发免费', () => {
  const t = teamWith('r1', 'research_breakthrough', { MATERIAL: ['mat_pv_material'] });
  const cb = costBreakdown(t, 'r1', { MATERIAL: ['mat_pv_material'] });
  assert.equal(cb.items.MATERIAL[0].effective, 0);
});

test('城长特批REDUCE5：指定行动-5，不计入材料节省', () => {
  const t = teamWith('r1', null, { EV: ['ev_mass_produce'] });
  t.approvals.r1 = { type: 'REDUCE5', actionId: 'ev_mass_produce' };
  const cb = costBreakdown(t, 'r1', { EV: ['ev_mass_produce'] });
  assert.equal(cb.items.EV[0].effective, 20);
  assert.equal(cb.materialSavings, 0);
});

test('地标特效：其后全域立体绿化-10', () => {
  const t = teamWith('r2', null, {});
  t.flags.builtLandmark = true; // 第1轮执行过
  const cb = costBreakdown(t, 'r2', { BUILDING: ['bldg_greening'] });
  assert.equal(cb.items.BUILDING[0].effective, 15); // 25-10
});

test('结余资金：国债125基数十 招商+30 改造返还+5 减成本', () => {
  const t = teamWith('r1', 'green_bond', {
    GENERATION: ['solar_pv'], GRID: ['flex_dispatch'], EV: ['ev_mass_produce'],
    BUILDING: ['bldg_retrofit'], MATERIAL: ['mat_pv_material'], NDRC: ['ndrc_investment'],
  });
  const sel = {
    GENERATION: ['solar_pv'], GRID: ['flex_dispatch'], EV: ['ev_mass_produce'],
    BUILDING: ['bldg_retrofit'], MATERIAL: ['mat_pv_material'], NDRC: ['ndrc_investment'],
  };
  // 125 + 30 + 5 - (15+15+25+20+10+0) = 75
  assert.equal(availableFunds(t, 'r1', sel), 75);
});

test('输配上限：基建3 + 扩建4 + 当轮柔性2', () => {
  const t = teamWith('r2', null, {});
  t.actions.r1.GRID = { actionIds: ['grid_expand'], locked: true, passed: false };
  const sel = { GRID: ['flex_dispatch'] };
  assert.equal(effectiveTransCap(t, 'r2', sel), 9); // 3+4+2
  assert.equal(effectiveTransCap(t, 'r2', {}), 7);  // 3+4
});

test('储能容量：初始2 + 储能电站4 + V2G掷骰', () => {
  const t = teamWith('r2', null, {});
  t.actions.r1.GRID = { actionIds: ['storage_plant'], locked: true, passed: false };
  t.actions.r2.EV = { actionIds: ['ev_v2g'], locked: true, passed: false };
  assert.equal(storageCapAt(t, 'r2', { EV: { success: true } }), 8);  // 2+4+2
  assert.equal(storageCapAt(t, 'r2', { EV: { success: false } }), 7); // 2+4+1
  assert.equal(storageCapAt(t, 'r2', {}), 6);                         // 尚未掷骰
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/actions.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```js
// src/game/actions.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INITIAL } from './constants.js';

const load = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../data/${f}`, import.meta.url)), 'utf8'));
export const RULES = {
  actions: new Map(load('actions.json').map(a => [a.id, a])),
  events: load('events.json'),
  goals: load('goals.json'),
  config: load('config.json'),
};

export const getAction = (id) => RULES.actions.get(id) ?? null;
export const actionsForRole = (role) => [...RULES.actions.values()].filter(a => a.role === role);
export const eventId = (team, round) => team.eventCards[round] ?? null;

export function listSelection(team, round) {
  const sel = {};
  for (const [roleId, rec] of Object.entries(team.actions[round] ?? {}))
    if (!rec.passed && rec.actionIds?.length) sel[roleId] = rec.actionIds;
  return sel;
}

function eventCard(team, round) {
  const id = eventId(team, round);
  return RULES.events[round].find(e => e.id === id) ?? null;
}

// 材料定向折扣（钙钛矿/轻质）："本轮及后续"（spec 3.4）
function materialActive(team, round, id) {
  const rounds = round === 'r1' ? ['r1'] : ['r1', 'r2'];
  return rounds.some(r => (team.actions[r]?.MATERIAL?.actionIds ?? []).includes(id));
}

// 全链降本仅当轮生效（"本轮全队所有行动"）
function chainReduceActive(team, round, selection) {
  if ((selection.MATERIAL ?? []).includes('mat_chain_reduce')) return true;
  const rec = team.actions[round]?.MATERIAL;
  return !rec?.passed && (rec?.actionIds ?? []).includes('mat_chain_reduce');
}

export function effectiveTransCap(team, round, selection) {
  let cap = INITIAL.TRANS_CAP_BASE;
  for (const r of round === 'r1' ? ['r1'] : ['r1', 'r2']) {
    const ids = r === round ? (selection.GRID ?? []) : (team.actions[r]?.GRID?.actionIds ?? []);
    if (ids.includes('grid_expand')) cap += 4;
    if (r === round && ids.includes('flex_dispatch')) cap += 2;
  }
  return cap;
}

export function storageCapAt(team, round, dice = {}) {
  let cap = INITIAL.STORAGE_CAP_BASE;
  for (const r of round === 'r1' ? ['r1'] : ['r1', 'r2']) {
    const ids = team.actions[r]?.GRID?.actionIds ?? [];
    if (ids.includes('storage_plant')) cap += 4;
    if (team.actions[r]?.EV?.actionIds?.includes('ev_v2g')) {
      const d = dice.EV;
      cap += d ? (d.success ? 2 : 1) : 0; // 未掷骰不计入
    }
  }
  return cap;
}

// 成本管线（spec 3.4）：材料定向 → 全链 → 事件 → 特效 → 特批 → 下限0
export function costBreakdown(team, round, selection) {
  const ev = eventCard(team, round);
  const approval = team.approvals[round];
  const items = {};
  let totalFunds = 0, totalLand = 0, materialSavings = 0;

  for (const [roleId, ids] of Object.entries(selection)) {
    items[roleId] = ids.map(id => {
      const act = getAction(id);
      let funds = act.cost?.funds ?? 0;
      const land = act.cost?.land ?? 0;
      const discounts = [];
      // 产学研：研发免费（归0，后续折扣按0处理）
      if (ev?.materialFree && act.role === 'MATERIAL') {
        discounts.push({ source: '事件·产学研', amount: funds });
        funds = 0;
      }
      if (funds > 0) {
        if (act.role === 'GENERATION' && materialActive(team, round, 'mat_pv_material')) {
          discounts.push({ source: '材料·钙钛矿', amount: 10 });
          funds -= 10;
        }
        if (act.role === 'BUILDING' && materialActive(team, round, 'mat_green_material')) {
          discounts.push({ source: '材料·轻质建材', amount: 10 });
          funds -= 10;
        }
        if (chainReduceActive(team, round, selection)) {
          const amt = Math.min(5, Math.max(0, funds)); // 成本不足5按实际；零成本不减
          if (amt > 0) { discounts.push({ source: '材料·全链降本', amount: amt }); funds -= amt; }
        }
        if (ev?.eventDiscount && (ev.eventDiscountRoles ?? []).includes(act.role)) {
          const amt = Math.min(ev.eventDiscount, Math.max(0, funds));
          if (amt > 0) { discounts.push({ source: `事件·${ev.name}`, amount: amt }); funds -= amt; }
        }
        if (team.flags.builtLandmark && act.id === 'bldg_greening') {
          const amt = Math.min(10, Math.max(0, funds));
          if (amt > 0) { discounts.push({ source: '特效·地标综合体', amount: amt }); funds -= amt; }
        }
        if (approval?.type === 'REDUCE5' && approval.actionId === act.id) {
          const amt = Math.min(5, Math.max(0, funds));
          if (amt > 0) { discounts.push({ source: '城长特批', amount: amt }); funds -= amt; }
        }
      }
      const effective = Math.max(0, funds);
      for (const d of discounts)
        if (d.source.startsWith('材料')) materialSavings += d.amount; // 仅材料科技计入（spec 3.3）
      totalFunds += effective;
      totalLand += land;
      return { actionId: id, name: act.name, base: act.cost?.funds ?? 0, discounts, effective, land };
    });
  }
  return { items, totalFunds, totalLand, materialSavings };
}

// 轮末结余 = 基数(事件可改) + 资金类效果 + 返还 − 总成本（可为负，超支需特批）
export function availableFunds(team, round, selection) {
  const ev = eventCard(team, round);
  let funds = ev?.fundsBase ?? INITIAL.FUNDS_PER_ROUND;
  for (const ids of Object.values(selection)) {
    for (const id of ids) {
      const act = getAction(id);
      for (const eff of act.effects ?? []) {
        if (eff.type === 'TEAM_FUNDS') funds += eff.value;
        if (eff.type === 'TEAM_FUNDS_RETURN') funds += eff.value;
      }
    }
  }
  funds -= costBreakdown(team, round, selection).totalFunds;
  return funds;
}
```

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS（注意 `storageCapAt` 未掷骰不计 V2G 增量的约定）

- [ ] **Step 5: Commit**

```bash
git add src/game/actions.js tests/actions.test.js
git commit -m "feat: 成本管线与资源核算（材料/全链/事件/特效/特批五级折扣）"
```

---

### Task 4: 行动校验与执行 engine.js

**Files:**
- Create: `src/game/engine.js`
- Test: `tests/engine.test.js`

**Interfaces:**
- Consumes: Task 3 全部导出。
- Produces:
  - `validateSelection(team, round, roleId, actionIds): {ok, reason?}`
  - `applySelection(team, round, roleId, actionIds): {ok, reason?}`
  - `lockAction(team, round, roleId): {ok, reason?}`
  - `passAction(team, round, roleId): {ok, reason?}`
  - `grantApproval(team, round, approval): {ok, reason?}`
  - `forceUnlock(team, round, roleId)` / `forcePass(team, round, roleId)`
  - `finalValidate(team, round): {ok, violations:[{roleId, reason}]}`

- [ ] **Step 1: 写失败测试**

```js
// tests/engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { applySelection, lockAction, passAction, grantApproval, finalValidate } from '../src/game/engine.js';

const mk = () => createTeam('t1', '一队');

test('输配上限硬拦截：耗电5 > 上限3 不可选', () => {
  const t = mk();
  const r = applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  assert.equal(r.ok, false);
  assert.match(r.reason, /输配上限/);
});

test('柔性调度+2后 5点耗电可选', () => {
  const t = mk();
  applySelection(t, 'r1', 'GRID', ['flex_dispatch']);
  const r = applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  assert.equal(r.ok, true);
});

test('两轮不得重复', () => {
  const t = mk();
  t.actions.r1.GENERATION = { actionIds: ['solar_pv'], locked: true, passed: false };
  const r = applySelection(t, 'r2', 'GENERATION', ['solar_pv']);
  assert.equal(r.ok, false);
  assert.match(r.reason, /重复/);
});

test('每轮1项行动；产学研下材料可2项', () => {
  const t = mk();
  assert.equal(applySelection(t, 'r1', 'GRID', ['flex_dispatch', 'grid_expand']).ok, false);
  t.eventCards.r1 = 'research_breakthrough';
  assert.equal(applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material', 'mat_green_material']).ok, true);
  assert.equal(applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material', 'mat_pv_material']).ok, false); // 重复id
});

test('资金不足需特批；OVERDRAFT5 允许超支≤5', () => {
  const t = mk();
  applySelection(t, 'r1', 'GENERATION', ['offshore_wind']); // 35
  applySelection(t, 'r1', 'GRID', ['storage_plant']);       // 25
  applySelection(t, 'r1', 'EV', ['ev_mass_produce']);       // 25
  applySelection(t, 'r1', 'BUILDING', ['bldg_zero_carbon']);// 20
  const r = applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material']); // +10 → 115 > 100
  assert.equal(r.ok, false);
  assert.match(r.reason, /资金/);
  assert.equal(grantApproval(t, 'r1', { type: 'OVERDRAFT5' }).ok, true);
  const r2 = applySelection(t, 'r1', 'NDRC', ['ndrc_subsidy']); // +20 → 135 超支35
  assert.equal(r2.ok, false); // 远超5
});

test('特批每轮仅1次', () => {
  const t = mk();
  assert.equal(grantApproval(t, 'r1', { type: 'OVERDRAFT5' }).ok, true);
  const r = grantApproval(t, 'r1', { type: 'REDUCE5', actionId: 'ev_v2g' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /特批/);
});

test('锁定后不可改，主持人可解锁', () => {
  const t = mk();
  applySelection(t, 'r1', 'GRID', ['grid_expand']);
  lockAction(t, 'r1', 'GRID');
  const r = applySelection(t, 'r1', 'GRID', ['flex_dispatch']);
  assert.equal(r.ok, false);
  t.actions.r1.GRID.locked = false; // forceUnlock 的效果
  assert.equal(applySelection(t, 'r1', 'GRID', ['flex_dispatch']).ok, true);
});

test('放弃行动合法且终审通过', () => {
  const t = mk();
  applySelection(t, 'r1', 'GRID', ['grid_expand']);
  passAction(t, 'r1', 'EV');
  const fv = finalValidate(t, 'r1');
  assert.equal(fv.ok, true);
});

test('终审拦截：土地超用（两轮累计>12）', () => {
  const t = mk();
  t.actions.r1.GENERATION = { actionIds: ['offshore_wind'], locked: true, passed: false }; // 3
  t.actions.r1.EV = { actionIds: ['ev_super_charger'], locked: true, passed: false };      // 3
  t.actions.r1.BUILDING = { actionIds: ['bldg_zero_carbon'], locked: true, passed: false }; // 2
  t.actions.r2.GRID = { actionIds: ['storage_plant'], locked: true, passed: false };        // 2
  t.actions.r2.EV = { actionIds: ['ev_super_charger'], locked: true, passed: false };       // 3
  t.actions.r2.BUILDING = { actionIds: ['bldg_landmark'], locked: true, passed: false };    // 3 → 累计16>12
  const fv = finalValidate(t, 'r2');
  assert.equal(fv.ok, false);
  assert.ok(fv.violations.some(v => /土地/.test(v.reason)));
});

test('终审拦截：无特批超支', () => {
  const t = mk();
  applySelection(t, 'r1', 'GENERATION', ['offshore_wind']);
  applySelection(t, 'r1', 'GRID', ['storage_plant']);
  applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  applySelection(t, 'r1', 'BUILDING', ['bldg_zero_carbon']);
  applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material']);
  applySelection(t, 'r1', 'NDRC', ['ndrc_subsidy']); // 合计135 超支35
  for (const role of ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC']) lockAction(t, 'r1', role);
  const fv = finalValidate(t, 'r1');
  assert.equal(fv.ok, false);
  assert.ok(fv.violations.some(v => /资金/.test(v.reason)));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/engine.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// src/game/engine.js
import { INITIAL } from './constants.js';
import { getAction, eventId, listSelection, costBreakdown, availableFunds, effectiveTransCap } from './actions.js';

export function validateSelection(team, round, roleId, actionIds) {
  const rec = team.actions[round][roleId];
  if (rec?.locked) return { ok: false, reason: '行动已锁定，请联系主持人解锁' };
  const acts = actionIds.map(getAction);
  if (acts.some(a => !a || a.role !== roleId)) return { ok: false, reason: '行动不属于该角色' };
  if (new Set(actionIds).size !== actionIds.length) return { ok: false, reason: '行动重复选择' };

  const dual = eventId(team, round) === 'research_breakthrough' && roleId === 'MATERIAL';
  if (actionIds.length > (dual ? 2 : 1)) return { ok: false, reason: dual ? '最多同时执行2项研发' : '每轮只能选择1项行动' };

  const other = round === 'r1' ? 'r2' : 'r1';
  const otherIds = Object.values(team.actions[other] ?? {}).flatMap(r => r.actionIds ?? []);
  const dup = actionIds.filter(id => otherIds.includes(id));
  if (dup.length) return { ok: false, reason: `与另一轮重复：${dup.map(id => getAction(id).name).join('、')}（两轮不得重复）` };

  const sel = { ...listSelection(team, round), [roleId]: actionIds };
  const cap = effectiveTransCap(team, round, sel);
  for (const a of acts) {
    const need = a.consume ?? 0;
    if (need > cap) return { ok: false, reason: `超输配上限：需 ${need} 点，当前上限 ${cap} 点（可先扩建智能电网或柔性调度）` };
  }

  const prevLand = other === 'r1'
    ? Object.values(team.actions.r1 ?? {}).flatMap(r => r.actionIds ?? []).reduce((s, id) => s + (getAction(id).cost?.land ?? 0), 0)
    : 0;
  const nowLand = acts.reduce((s, a) => s + (a.cost?.land ?? 0), 0);
  if (prevLand + nowLand > INITIAL.LAND_TOTAL) return { ok: false, reason: `土地不足：本轮需 ${nowLand}，两轮累计 ${prevLand + nowLand} 超过上限 ${INITIAL.LAND_TOTAL}` };

  const cb = costBreakdown(team, round, sel);
  const end = availableFunds(team, round, sel);
  const approval = team.approvals[round];
  const floor = approval?.type === 'OVERDRAFT5' ? -5 : 0;
  if (end < floor) {
    const overspend = -end;
    return {
      ok: false,
      reason: approval?.type === 'OVERDRAFT5'
        ? `超支 ${overspend} 超过特批上限 5`
        : `资金不足：超支 ${overspend}（可由城长特批：单项减免5资金，或超支≤5放行）`,
    };
  }
  return { ok: true };
}

export function applySelection(team, round, roleId, actionIds) {
  const v = validateSelection(team, round, roleId, actionIds);
  if (!v.ok) return v;
  team.actions[round][roleId] = { actionIds: [...actionIds], locked: false, passed: false };
  return { ok: true };
}

export function lockAction(team, round, roleId) {
  const rec = team.actions[round][roleId];
  const actionIds = rec?.actionIds ?? [];
  if (!actionIds.length) return passAction(team, round, roleId); // 空锁定=确认放弃
  const v = validateSelection(team, round, roleId, actionIds);
  if (!v.ok) return v;
  team.actions[round][roleId] = { actionIds: [...actionIds], locked: true, passed: false };
  return { ok: true };
}

export function passAction(team, round, roleId) {
  team.actions[round][roleId] = { actionIds: [], locked: true, passed: true };
  return { ok: true };
}

export function grantApproval(team, round, approval) {
  if (!['REDUCE5', 'OVERDRAFT5'].includes(approval.type)) return { ok: false, reason: '特批类型非法' };
  if (approval.type === 'REDUCE5' && !approval.actionId) return { ok: false, reason: '需指定减免的行动' };
  if (team.approvals[round]) return { ok: false, reason: '市长特批权本轮已使用（每轮1次）' };
  team.approvals[round] = { ...approval };
  return { ok: true };
}

export const forceUnlock = (team, round, roleId) => {
  if (team.actions[round][roleId]) team.actions[round][roleId].locked = false;
};
export const forcePass = (team, round, roleId) => { passAction(team, round, roleId); };

export function finalValidate(team, round) {
  const sel = listSelection(team, round);
  const violations = [];
  const lockedSel = {};
  for (const [roleId, rec] of Object.entries(team.actions[round] ?? {})) {
    if (rec.passed || !rec.actionIds?.length) continue;
    if (!rec.locked) { violations.push({ roleId, reason: '行动未锁定' }); continue; }
    lockedSel[roleId] = rec.actionIds;
  }
  const cb = costBreakdown(team, round, lockedSel);
  const end = availableFunds(team, round, lockedSel);
  const floor = team.approvals[round]?.type === 'OVERDRAFT5' ? -5 : 0;
  if (end < floor) violations.push({ roleId: '*', reason: `资金超支 ${-end}（${floor < 0 ? '超特批上限5' : '无特批'}）` });
  const prevLand = round === 'r2'
    ? Object.values(team.actions.r1 ?? {}).flatMap(r => r.actionIds ?? []).reduce((s, id) => s + (getAction(id).cost?.land ?? 0), 0)
    : 0;
  if (prevLand + cb.totalLand > INITIAL.LAND_TOTAL)
    violations.push({ roleId: '*', reason: `土地超用：累计 ${prevLand + cb.totalLand} > ${INITIAL.LAND_TOTAL}` });
  const cap = effectiveTransCap(team, round, lockedSel);
  for (const [roleId, ids] of Object.entries(lockedSel))
    for (const id of ids) {
      const need = getAction(id).consume ?? 0;
      if (need > cap) violations.push({ roleId, reason: `超输配上限：${getAction(id).name} 需 ${need} > ${cap}` });
    }
  return { ok: violations.length === 0, violations };
}
```

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/engine.js tests/engine.test.js
git commit -m "feat: 行动校验引擎（输配硬拦截/资金特批/土地/重复/双研发/终审）"
```

---

### Task 5: 轮结算引擎 settlement.js（结算部分）

**Files:**
- Create: `src/game/settlement.js`
- Test: `tests/settlement.test.js`

**Interfaces:**
- Consumes: `actions.js` 的 `getAction/eventId/listSelection/costBreakdown/availableFunds/storageCapAt/RULES`；`constants.js` 的 `LOAD_ROLES`。
- Produces: `settleRound(team, round): detail`。detail 字段：`round, eventId, powerParts, power, carried, available, plannedByRole, plannedTotal, actualByRole, actual, shortage, storageCap, stored, curtailed, legalQuota, penalized, penalty, fundsEnd, materialSavings, steps`；副作用：写入 `team.settlement[round]`、更新 `team.flags`。计分函数在 Task 6 追加进同一文件。

- [ ] **Step 1: 写失败测试（含手工核算的金标准场景，两轮数值全部断言）**

```js
// tests/settlement.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { settleRound } from '../src/game/settlement.js';

// 金标准场景（数值经手工按规则核算，见 spec 3.9/3.4）：
// R1 事件 green_bond(资金基数125)：光伏(钙钛矿减价后15) 柔性15 批量25 改造20 钙钛矿10 招商0
//   → 结余75；发电8 消耗7 入储1(容量2) 弃电0
// R2 事件 price_surge：风电(骰5成功15，钙钛矿跨轮减价后25) 扩建20 V2G(骰5成功)15 零碳楼宇(轻质减价10) 轻质10 容量电价0
//   → 结余45；可用16(15+结转1) 消耗8 入储4(容量2+V2G2) 弃电4 罚4×4=16
export function buildGolden() {
  const t = createTeam('t1', '一队');
  const put = (round, role, ids) => { t.actions[round][role] = { actionIds: ids, locked: true, passed: false }; };
  t.eventCards.r1 = 'green_bond';
  put('r1', 'GENERATION', ['solar_pv']); put('r1', 'GRID', ['flex_dispatch']);
  put('r1', 'EV', ['ev_mass_produce']); put('r1', 'BUILDING', ['bldg_retrofit']);
  put('r1', 'MATERIAL', ['mat_pv_material']); put('r1', 'NDRC', ['ndrc_investment']);
  t.eventCards.r2 = 'price_surge';
  put('r2', 'GENERATION', ['offshore_wind']); put('r2', 'GRID', ['grid_expand']);
  put('r2', 'EV', ['ev_v2g']); put('r2', 'BUILDING', ['bldg_zero_carbon']);
  put('r2', 'MATERIAL', ['mat_green_material']); put('r2', 'NDRC', ['ndrc_capacity_price']);
  t.dice.r1 = {};
  t.dice.r2 = { GENERATION: { value: 5, success: true }, EV: { value: 5, success: true } };
  return t;
}

test('金标准 R1：发电8 消耗7 入储1 弃电0 结余75 材料节省10', () => {
  const t = buildGolden();
  const d = settleRound(t, 'r1');
  assert.equal(d.power, 8);
  assert.equal(d.available, 8);
  assert.equal(d.plannedTotal, 7);
  assert.equal(d.actual, 7);
  assert.equal(d.shortage, 0);
  assert.equal(d.storageCap, 2);
  assert.equal(d.stored, 1);
  assert.equal(d.curtailed, 0);
  assert.equal(d.penalty, 0);
  assert.equal(d.fundsEnd, 75);
  assert.equal(d.materialSavings, 10);
});

test('金标准 R2：可用16 消耗8 入储4 弃电4 罚分16(现货×4) 结余45', () => {
  const t = buildGolden();
  settleRound(t, 'r1');
  const d = settleRound(t, 'r2');
  assert.equal(d.power, 15);
  assert.equal(d.carried, 1);
  assert.equal(d.available, 16);
  assert.equal(d.actual, 8);
  assert.equal(d.storageCap, 4);      // 初始2 + V2G成功2
  assert.equal(d.stored, 4);
  assert.equal(d.curtailed, 4);
  assert.equal(d.legalQuota, 0);
  assert.equal(d.penalized, 4);
  assert.equal(d.penalty, 16);        // price_surge ×4
  assert.equal(d.fundsEnd, 45);
  assert.equal(d.materialSavings, 10); // 轻质对零碳楼宇
});

test('电力缺口：消耗按 汽车→建筑 顺序分配，缺口显著标注', () => {
  const t = createTeam('t1', '一队');
  const put = (role, ids) => { t.actions.r1[role] = { actionIds: ids, locked: true, passed: false }; };
  put('GENERATION', ['solar_pv']); put('EV', ['ev_mass_produce']); put('BUILDING', ['bldg_zero_carbon']);
  const d = settleRound(t, 'r1');
  assert.equal(d.available, 8);
  assert.equal(d.plannedTotal, 11);
  assert.deepEqual(d.actualByRole, { EV: 5, BUILDING: 3 });
  assert.equal(d.actual, 8);
  assert.equal(d.shortage, 3);
  assert.ok(d.steps.some(s => s.key === 'consume' && /缺口/.test(s.text)));
});

test('寒潮：光伏-3', () => {
  const t = createTeam('t1', '一队');
  t.eventCards.r1 = 'cold_wave'; // 池本属r2，测试直接注入验证机制
  t.actions.r1.GENERATION = { actionIds: ['solar_pv'], locked: true, passed: false };
  assert.equal(settleRound(t, 'r1').power, 5); // 8-3
});

test('寒潮：风电按骰后产出-3，核电免疫', () => {
  const t = createTeam('t1', '一队');
  t.eventCards.r1 = 'cold_wave';
  t.actions.r1.GENERATION = { actionIds: ['offshore_wind'], locked: true, passed: false };
  t.dice.r1 = { GENERATION: { value: 5, success: true } };
  assert.equal(settleRound(t, 'r1').power, 12); // 15-3

  const t2 = createTeam('t2', '二队');
  t2.eventCards.r1 = 'cold_wave';
  t2.actions.r1.GENERATION = { actionIds: ['nuclear'], locked: true, passed: false };
  assert.equal(settleRound(t2, 'r1').power, 10);
});

test('柔性调度合法弃电额度：弃电6中2点免罚', () => {
  const t = createTeam('t1', '一队');
  t.actions.r1.GENERATION = { actionIds: ['solar_pv'], locked: true, passed: false };
  t.actions.r1.GRID = { actionIds: ['flex_dispatch'], locked: true, passed: false };
  t.actions.r1.EV = { actionIds: ['ev_charging_expand'], locked: true, passed: false };
  const d = settleRound(t, 'r1');
  assert.equal(d.available, 8);
  assert.equal(d.actual, 3);
  assert.equal(d.storageCap, 2);
  assert.equal(d.stored, 2);
  assert.equal(d.curtailed, 3);
  assert.equal(d.legalQuota, 2);
  assert.equal(d.penalized, 1);
  assert.equal(d.penalty, 2);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/settlement.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 settleRound**

```js
// src/game/settlement.js
import { LOAD_ROLES } from './constants.js';
import { getAction, eventId, listSelection, costBreakdown, availableFunds, storageCapAt, RULES } from './actions.js';

export const eventOf = (team, round) =>
  RULES.events[round].find(e => e.id === eventId(team, round)) ?? null;

function lockedSelection(team, round) {
  const locked = {};
  for (const [roleId, rec] of Object.entries(team.actions[round] ?? {}))
    if (rec.locked && !rec.passed && rec.actionIds.length) locked[roleId] = rec.actionIds;
  return locked;
}

export function settleRound(team, round) {
  const locked = lockedSelection(team, round);
  const dice = team.dice[round] ?? {};
  const ev = eventOf(team, round);

  // 1) 发电产出（寒潮作用于掷骰后产出，spec A3）
  const powerParts = [];
  let power = 0;
  for (const id of locked.GENERATION ?? []) {
    const a = getAction(id);
    let p = a.power ?? 0;
    if (a.dice) p = dice.GENERATION?.success ? a.dice.success.power : a.dice.fail.power;
    if (ev?.coldWave && (id === 'solar_pv' || id === 'offshore_wind')) p = Math.max(0, p - 3);
    powerParts.push({ id, name: a.name, power: p });
    power += p;
  }

  // 2) 可用绿电
  const carried = round === 'r2' ? (team.settlement.r1?.stored ?? 0) : 0;
  const available = power + carried;

  // 3) 消耗（缺口按 LOAD_ROLES 顺序分配，spec A1）
  const plannedByRole = {};
  for (const [roleId, ids] of Object.entries(locked))
    plannedByRole[roleId] = ids.reduce((s, id) => s + (getAction(id).consume ?? 0), 0);
  const plannedTotal = Object.values(plannedByRole).reduce((a, b) => a + b, 0);
  let remain = available;
  const actualByRole = {};
  for (const roleId of LOAD_ROLES) {
    actualByRole[roleId] = Math.min(plannedByRole[roleId] ?? 0, remain);
    remain -= actualByRole[roleId];
  }
  const actual = Math.min(available, plannedTotal);
  const shortage = plannedTotal - actual;

  // 4) 储能与弃电（先入蓄水池，蓄满才计弃电）
  const storageCap = storageCapAt(team, round, dice);
  const stored = Math.min(Math.max(0, available - actual), storageCap);
  const curtailed = available - actual - stored;
  const legalQuota = (locked.GRID ?? []).includes('flex_dispatch') ? 2 : 0;
  const penalized = Math.max(0, curtailed - legalQuota);
  const penalty = penalized * (ev?.penaltyMultiplier ?? 2);

  // 5) 资金结余与材料节省
  const fundsEnd = availableFunds(team, round, locked);
  const materialSavings = costBreakdown(team, round, locked).materialSavings;

  // 6) 跨轮标记（"其后"特效与目标卡判定依据）
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
    round, eventId: eventId(team, round),
    powerParts, power, carried, available,
    plannedByRole, plannedTotal, actualByRole, actual, shortage,
    storageCap, stored, curtailed, legalQuota, penalized, penalty,
    fundsEnd, materialSavings,
    steps: [
      { key: 'power', label: '发电产出', text: `${power} 点${carried ? `（含上轮结转 ${carried}）` : ''}` },
      { key: 'consume', label: '实际消耗', text: `${actual} 点${shortage > 0 ? `（缺口 ${shortage} 点：电力不足！）` : ''}` },
      { key: 'stored', label: '储能入量', text: `${stored} 点（容量 ${storageCap}）` },
      { key: 'curtail', label: '弃电', text: `${curtailed} 点${legalQuota ? `（合法弃电 ${legalQuota}）` : ''} → 罚分 ${penalty}` },
      { key: 'funds', label: '资金结余', text: `${fundsEnd}` },
    ],
  };
  team.settlement[round] = detail;
  return detail;
}
```

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/settlement.js tests/settlement.test.js
git commit -m "feat: 轮结算引擎（发电/消耗缺口/储能蓄水/弃电罚分）+金标准场景"
```

---

### Task 6: 计分与排名 settlement.js（计分部分）

**Files:**
- Modify: `src/game/settlement.js`（追加函数）
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: Task 5 的 `settleRound`、`eventOf`；`constants.js` 的 `SCORING_ROLES`。
- Produces:
  - `computeScores(team, upto=2): {individual, storedTotal?, penaltyTotal?, extra?, extraTotal?, sum6?, teamTotal?}`（`upto=1` 只返回 `individual`，发改委不含资金项）
  - `interimScore(team): number|null`（第1轮小计 = Σ个人分 + 入储 − 罚分）
  - `rankTeams(teams): [{teamId, name, total, module}]`（total 优先读 `team.settlement.teamTotal`；并列比 `module = total − 个人分和`，spec 3.11）

- [ ] **Step 1: 写失败测试（个人分公式逐角色断言 + 团队总分金标准）**

```js
// tests/scoring.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScores, interimScore, rankTeams } from '../src/game/settlement.js';
import { settleRound } from '../src/game/settlement.js';
import { buildGolden } from './settlement.test.js';
import { createTeam } from '../src/game/constants.js';

test('金标准个人分：发23 网7 车9 建6 材4 发改16（精算师同发改）', () => {
  const t = buildGolden();
  settleRound(t, 'r1'); settleRound(t, 'r2');
  const s = computeScores(t);
  assert.deepEqual(s.individual, {
    GENERATION: 23,  // 8+15，无补贴无寒潮
    GRID: 7,         // 扩建4 + 柔性3
    EV: 9,           // 消耗(5+2) + V2G成功4 − 容量电价2
    BUILDING: 6,     // 消耗(2+6) − 容量电价2
    MATERIAL: 4,     // floor((10+10)/5)
    NDRC: 16,        // floor(49/4)=12 + floor(45/10)=4
    ACTUARY: 16,
  });
  assert.equal(s.sum6, 65);
  assert.equal(s.storedTotal, 5);
  assert.equal(s.penaltyTotal, 16);
  assert.deepEqual(s.extra, [{ reason: '现货暴涨·首轮储能增值', points: 2 }]);
  assert.equal(s.teamTotal, 56); // 65 + 5 − 16 + 2
});

test('第1轮小计：25个人分 + 入储1 − 罚0 = 26', () => {
  const t = buildGolden();
  settleRound(t, 'r1');
  assert.equal(interimScore(t), 26);
});

test('绿电补贴 +4（发电、电网），容量电价 −2（汽车、建筑）', () => {
  const t = createTeam('t1', '一队');
  const put = (round, role, ids) => { t.actions[round][role] = { actionIds: ids, locked: true, passed: false }; };
  put('r1', 'GENERATION', ['solar_pv']); put('r1', 'NDRC', ['ndrc_subsidy']);
  put('r2', 'GENERATION', ['nuclear']); put('r2', 'EV', ['ev_mass_produce']); put('r2', 'NDRC', ['ndrc_capacity_price']);
  // 未行动的角色手动置为放弃（上层 autoPassMissing 的效果）
  for (const [r, role] of [['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'GRID'], ['r1', 'MATERIAL'],
                            ['r2', 'GRID'], ['r2', 'BUILDING'], ['r2', 'MATERIAL']])
    t.actions[r][role] = { actionIds: [], locked: true, passed: true };
  settleRound(t, 'r1'); settleRound(t, 'r2');
  const s = computeScores(t);
  assert.equal(s.individual.GENERATION, 8 + 10 + 4); // 产出18 + 补贴4
  assert.equal(s.individual.EV, 5 - 2);              // 消耗5 − 容量电价2
  assert.equal(s.individual.BUILDING, -2);           // 无消耗 − 容量电价2
});

test('寒潮：发电个人分同步-3；储能电站额外+5', () => {
  const t = createTeam('t1', '一队');
  const put = (round, role, ids) => { t.actions[round][role] = { actionIds: ids, locked: true, passed: false }; };
  put('r1', 'GENERATION', ['solar_pv']); put('r1', 'GRID', ['storage_plant']);
  put('r2', 'GENERATION', ['nuclear']);
  for (const [r, role] of [['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'MATERIAL'], ['r1', 'NDRC'],
                            ['r2', 'GRID'], ['r2', 'EV'], ['r2', 'BUILDING'], ['r2', 'MATERIAL'], ['r2', 'NDRC']])
    t.actions[r][role] = { actionIds: [], locked: true, passed: true };
  t.eventCards.r2 = 'cold_wave';
  settleRound(t, 'r1'); settleRound(t, 'r2');
  const s = computeScores(t);
  assert.equal(s.individual.GENERATION, 8 + 10 - 3); // 15
  assert.deepEqual(s.extra.find(e => /储能电站/.test(e.reason)), { reason: '寒潮中保有储能电站', points: 5 });
});

test('超充→批量 +2；两轮零罚分 +5；立体绿化 +5', () => {
  const t = createTeam('t1', '一队');
  const put = (round, role, ids) => { t.actions[round][role] = { actionIds: ids, locked: true, passed: false }; };
  put('r1', 'GENERATION', ['nuclear']); put('r1', 'EV', ['ev_super_charger']);
  put('r1', 'BUILDING', ['bldg_retrofit']);
  put('r2', 'GENERATION', ['nuclear']); put('r2', 'EV', ['ev_mass_produce']); put('r2', 'BUILDING', ['bldg_greening']);
  for (const [r, role] of [['r1', 'GRID'], ['r1', 'MATERIAL'], ['r1', 'NDRC'],
                            ['r2', 'GRID'], ['r2', 'MATERIAL'], ['r2', 'NDRC']])
    t.actions[r][role] = { actionIds: [], locked: true, passed: true };
  settleRound(t, 'r1'); settleRound(t, 'r2');
  const s = computeScores(t);
  // r1: 产10 耗9(EV7+建2) 入储1 弃0；r2: 产10+结转1 耗9(EV5+建4) 入储2 弃0
  assert.equal(s.individual.EV, (7 + 5) + 2);     // 消耗12 + 超充后批量+2
  assert.ok(s.extra.some(e => e.reason === '两轮零弃电罚分' && e.points === 5));
  assert.ok(s.extra.some(e => e.reason === '全域立体绿化' && e.points === 5));
});

test('排名：总分降序，并列比消纳模块净值', () => {
  const a = buildGolden(); a.id = 'a';
  const b = buildGolden(); b.id = 'b'; b.name = '二队';
  settleRound(a, 'r1'); settleRound(a, 'r2');
  settleRound(b, 'r1'); settleRound(b, 'r2');
  const ranking = rankTeams([b, a]);
  assert.equal(ranking.length, 2);
  assert.equal(ranking[0].total, 56);
});

test('先锋认证：两轮盈差≤2且招商 → +8', () => {
  const t = createTeam('t1', '一队');
  const put = (round, role, ids) => { t.actions[round][role] = { actionIds: ids, locked: true, passed: false }; };
  put('r1', 'GENERATION', ['nuclear']); put('r1', 'NDRC', ['ndrc_investment']);
  put('r2', 'GENERATION', ['nuclear']);
  for (const [r, role] of [['r1', 'GRID'], ['r1', 'EV'], ['r1', 'BUILDING'], ['r1', 'MATERIAL'],
                            ['r2', 'GRID'], ['r2', 'EV'], ['r2', 'BUILDING'], ['r2', 'MATERIAL'], ['r2', 'NDRC']])
    t.actions[r][role] = { actionIds: [], locked: true, passed: true };
  t.eventCards.r2 = 'pioneer_cert';
  settleRound(t, 'r1'); settleRound(t, 'r2');
  const s = computeScores(t);
  // r1 盈差 10-0=10 >2 → 不达成
  assert.equal(s.extra.find(e => /先锋/.test(e.reason)), undefined);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/scoring.test.js`
Expected: FAIL（函数未定义）

- [ ] **Step 3: 在 settlement.js 末尾追加实现**

```js
// —— 计分（spec 3.10/3.11）——
import { SCORING_ROLES } from './constants.js'; // 与文件顶部 import 合并

export function computeScores(team, upto = 2) {
  if (!team.settlement.r1) return null;
  const rounds = upto === 1 ? ['r1'] : ['r1', 'r2'];
  const d = (r) => team.settlement[r];
  const did = (roleId, id) => rounds.some(r => {
    const rec = team.actions[r][roleId];
    return rec && !rec.passed && rec.actionIds.includes(id);
  });

  const subsidy = did('NDRC', 'ndrc_subsidy');
  const capacity = did('NDRC', 'ndrc_capacity_price');
  const coldWave = rounds.includes('r2') && eventId(team, 'r2') === 'cold_wave';

  const generation = rounds.reduce((s, r) => s + (d(r)?.power ?? 0), 0) + (subsidy ? 4 : 0) + (coldWave ? -3 : 0);
  const grid = (did('GRID', 'grid_expand') ? 4 : 0) + (did('GRID', 'storage_plant') ? 4 : 0)
    + (did('GRID', 'flex_dispatch') ? 3 : 0) + (subsidy ? 4 : 0);
  const evConsumed = rounds.reduce((s, r) => s + (d(r)?.actualByRole.EV ?? 0), 0);
  let v2gBonus = 0;
  for (const r of rounds) {
    if (!did('EV', 'ev_v2g')) continue;
    const dv = team.dice[r]?.EV;
    if (dv) v2gBonus += dv.success ? 4 : 1;
  }
  const evR2 = team.actions.r2.EV;
  const superBonus = (team.actions.r1.EV?.actionIds ?? []).includes('ev_super_charger')
    && evR2 && !evR2.passed && evR2.actionIds.includes('ev_mass_produce') ? 2 : 0;
  const ev = evConsumed + v2gBonus + superBonus - (capacity ? 2 : 0);
  const building = rounds.reduce((s, r) => s + (d(r)?.actualByRole.BUILDING ?? 0), 0) - (capacity ? 2 : 0);
  const material = Math.floor(rounds.reduce((s, r) => s + (d(r)?.materialSavings ?? 0), 0) / 5);
  const others = generation + grid + ev + building + material;
  const ndrc = Math.floor(others / 4) + (rounds.includes('r2') ? Math.floor((d('r2')?.fundsEnd ?? 0) / 10) : 0);
  const individual = { GENERATION: generation, GRID: grid, EV: ev, BUILDING: building, MATERIAL: material, NDRC: ndrc, ACTUARY: ndrc };
  if (upto === 1) return { individual };

  const storedTotal = rounds.reduce((s, r) => s + (d(r)?.stored ?? 0), 0);
  const penaltyTotal = rounds.reduce((s, r) => s + (d(r)?.penalty ?? 0), 0);
  const extra = [];
  if (team.flags.didGreening) {
    const eff = (getAction('bldg_greening').effects ?? []).find(e => e.type === 'TEAM_BONUS_FINAL');
    if (eff) extra.push({ reason: eff.reason, points: eff.value });
  }
  if (d('r1').penalty === 0 && d('r2').penalty === 0) extra.push({ reason: '两轮零弃电罚分', points: 5 });
  if (eventId(team, 'r2') === 'cold_wave' && team.flags.builtStoragePlant)
    extra.push({ reason: '寒潮中保有储能电站', points: eventOf(team, 'r2').storagePlantBonus });
  if (eventId(team, 'r2') === 'price_surge')
    extra.push({ reason: '现货暴涨·首轮储能增值', points: (d('r1')?.stored ?? 0) * eventOf(team, 'r2').carriedStorageScore });
  if (eventId(team, 'r2') === 'pioneer_cert' && team.flags.usedInvestment
    && [d('r1'), d('r2')].every(x => x.power - x.actual <= 2))
    extra.push({ reason: '零碳城市先锋认证', points: eventOf(team, 'r2').pioneerBonus });
  const extraTotal = extra.reduce((s, e) => s + e.points, 0);
  const sum6 = SCORING_ROLES.reduce((s, r) => s + individual[r], 0);
  const teamTotal = sum6 + storedTotal - penaltyTotal + extraTotal;
  return { individual, storedTotal, penaltyTotal, extra, extraTotal, sum6, teamTotal };
}

export function interimScore(team) {
  const s = computeScores(team, 1);
  if (!s) return null;
  const sum6 = SCORING_ROLES.reduce((a, r) => a + s.individual[r], 0);
  return sum6 + (team.settlement.r1?.stored ?? 0) - (team.settlement.r1?.penalty ?? 0);
}

export function rankTeams(teams) {
  return teams.map(t => {
    const s = computeScores(t);
    const total = t.settlement.teamTotal ?? s.teamTotal;
    const indSum = SCORING_ROLES.reduce((a, r) => a + (t.settlement.individual[r] ?? s.individual[r]), 0);
    return { teamId: t.id, name: t.name, total, module: total - indSum };
  }).sort((a, b) => b.total - a.total || b.module - a.module);
}
```

注意：文件顶部 import 行需合并为
`import { LOAD_ROLES, SCORING_ROLES } from './constants.js';` 与
`import { getAction, eventId, listSelection, costBreakdown, availableFunds, storageCapAt, RULES } from './actions.js';`

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/settlement.js tests/scoring.test.js
git commit -m "feat: 个人分/团队总分/排名（含全部加成与金标准56分校验）"
```

---

### Task 7: 目标卡 goals.js 与事件卡 events.js

**Files:**
- Create: `src/game/goals.js`, `src/game/events.js`
- Test: `tests/goals.test.js`

**Interfaces:**
- Consumes: `random.js` 的 `sample`；`actions.js` 的 `RULES`。
- Produces:
  - `dealGoals(): [id, id]`（6张中随机2张不重复）
  - `goalById(id): card|null`
  - `checkGoal(id, team): boolean`（只读 `team.settlement.r1/r2` 与 `team.flags`）
  - `drawEvent(round): cardId`（从当轮池抽1张）
  - `eventCardById(round, id): card|null`

- [ ] **Step 1: 写失败测试**

```js
// tests/goals.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTeam } from '../src/game/constants.js';
import { dealGoals, goalById, checkGoal } from '../src/game/goals.js';
import { drawEvent, eventCardById } from '../src/game/events.js';

const settle = (o = {}) => ({
  round: 'r2', eventId: null, powerParts: [], power: 0, carried: 0, available: 0,
  plannedByRole: {}, plannedTotal: 0, actualByRole: { EV: 0, BUILDING: 0 }, actual: 0, shortage: 0,
  storageCap: 2, stored: 0, curtailed: 0, legalQuota: 0, penalized: 0, penalty: 0,
  fundsEnd: 0, materialSavings: 0, steps: [], ...o,
});
const teamWith = (r1, r2, flags = {}) => {
  const t = createTeam('t1', '一队');
  t.settlement.r1 = settle({ round: 'r1', ...r1 });
  t.settlement.r2 = settle(r2);
  Object.assign(t.flags, flags);
  return t;
};

test('发2张不重复目标卡，且都在6张池内', () => {
  const pool = new Set(['storage_master', 'load_pioneer', 'wind_chaser', 'windfree_city', 'garden_city', 'funds_steward']);
  for (let i = 0; i < 20; i++) {
    const [a, b] = dealGoals();
    assert.notEqual(a, b);
    assert.ok(pool.has(a) && pool.has(b));
  }
  assert.equal(goalById('storage_master').name, '储能达人');
});

test('抽事件卡：第1轮从机遇池、第2轮从考验池', () => {
  const r1Pool = new Set(['green_bond', 'research_breakthrough', 'green_consumption']);
  const r2Pool = new Set(['cold_wave', 'price_surge', 'pioneer_cert']);
  for (let i = 0; i < 20; i++) {
    assert.ok(r1Pool.has(drawEvent('r1')));
    assert.ok(r2Pool.has(drawEvent('r2')));
  }
  assert.equal(eventCardById('r1', 'green_bond').fundsBase, 125);
});

test('储能达人：容量≥6且入储≥2', () => {
  assert.equal(checkGoal('storage_master', teamWith({ stored: 1 }, { stored: 1, storageCap: 6 })), true);
  assert.equal(checkGoal('storage_master', teamWith({ stored: 1 }, { stored: 0, storageCap: 6 })), false);
  assert.equal(checkGoal('storage_master', teamWith({ stored: 1 }, { stored: 1, storageCap: 4 })), false);
});

test('负荷先锋：两轮实际消耗合计≥15', () => {
  assert.equal(checkGoal('load_pioneer', teamWith({ actual: 8 }, { actual: 7 })), true);
  assert.equal(checkGoal('load_pioneer', teamWith({ actual: 8 }, { actual: 6 })), false);
});

test('追风者：选过风电且消耗≥10', () => {
  assert.equal(checkGoal('wind_chaser', teamWith({ actual: 6 }, { actual: 5 }, { hasOffshoreWind: true })), true);
  assert.equal(checkGoal('wind_chaser', teamWith({ actual: 6 }, { actual: 5 }, { hasOffshoreWind: false })), false);
  assert.equal(checkGoal('wind_chaser', teamWith({ actual: 6 }, { actual: 3 }, { hasOffshoreWind: true })), false);
});

test('无风之城：未选风电、总绿电≥10、弃电0', () => {
  assert.equal(checkGoal('windfree_city', teamWith({ power: 5, curtailed: 0 }, { power: 6, curtailed: 0 }, { hasOffshoreWind: false })), true);
  assert.equal(checkGoal('windfree_city', teamWith({ power: 5, curtailed: 0 }, { power: 6, curtailed: 1 }, { hasOffshoreWind: false })), false);
  assert.equal(checkGoal('windfree_city', teamWith({ power: 5, curtailed: 0 }, { power: 6, curtailed: 0 }, { hasOffshoreWind: true })), false);
});

test('花园城市：建过地标且每轮弃电≤2', () => {
  assert.equal(checkGoal('garden_city', teamWith({ curtailed: 2 }, { curtailed: 2 }, { builtLandmark: true })), true);
  assert.equal(checkGoal('garden_city', teamWith({ curtailed: 3 }, { curtailed: 0 }, { builtLandmark: true })), false);
  assert.equal(checkGoal('garden_city', teamWith({ curtailed: 0 }, { curtailed: 0 }, { builtLandmark: false })), false);
});

test('资金管家：第2轮结余≥70', () => {
  assert.equal(checkGoal('funds_steward', teamWith({}, { fundsEnd: 70 })), true);
  assert.equal(checkGoal('funds_steward', teamWith({}, { fundsEnd: 69 })), false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/goals.test.js`
Expected: FAIL

- [ ] **Step 3: 实现**

```js
// src/game/goals.js
import { sample } from './random.js';
import { RULES } from './actions.js';

export const dealGoals = () => sample(RULES.goals.map(g => g.id), 2);
export const goalById = (id) => RULES.goals.find(g => g.id === id) ?? null;

export function checkGoal(id, team) {
  const r1 = team.settlement.r1, r2 = team.settlement.r2;
  if (!r1 || !r2) return false;
  const consumed = r1.actual + r2.actual;
  const power = r1.power + r2.power;
  switch (id) {
    case 'storage_master': return r2.storageCap >= 6 && (r1.stored + r2.stored) >= 2;
    case 'load_pioneer': return consumed >= 15;
    case 'wind_chaser': return !!team.flags.hasOffshoreWind && consumed >= 10;
    case 'windfree_city': return !team.flags.hasOffshoreWind && power >= 10 && (r1.curtailed + r2.curtailed) === 0;
    case 'garden_city': return !!team.flags.builtLandmark && r1.curtailed <= 2 && r2.curtailed <= 2;
    case 'funds_steward': return r2.fundsEnd >= 70;
    default: return false;
  }
}
```

```js
// src/game/events.js
import { sample } from './random.js';
import { RULES } from './actions.js';

export const drawEvent = (round) => sample(RULES.events[round], 1)[0].id;
export const eventCardById = (round, id) => RULES.events[round].find(e => e.id === id) ?? null;
```

- [ ] **Step 4: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/goals.js src/game/events.js tests/goals.test.js
git commit -m "feat: 目标卡判定与事件卡抽取"
```

---

### Task 8: 房间管理 rooms.js 与持久化 persistence.js

**Files:**
- Create: `src/game/rooms.js`, `src/persistence.js`
- Test: `tests/rooms.test.js`

**Interfaces:**
- Consumes: `random.js` 的 `roomCode`；`constants.js` 的 `createTeam/STANDARD_ROLES/ROLES`。
- Produces（rooms.js）:
  - `createRoom(hostName, teamCount=2): room`（room 含 `code, hostToken, hostName, phase:'LOBBY', deadline:null, teams[], players[], forceStart:false, timeoutAlerted:false, ranking:null, audit:[], createdAt`）
  - `getRoom(code): room|null`、`allRooms(): room[]`
  - `joinRoom(room, name): player`（player: `{id, name, token, teamId:null, roleId:null, connected:true}`）
  - `playerByToken(room, token)`、`isHost(room, token)`
  - `assign(room, token, teamId, roleId): {ok, reason?}`（仅 LOBBY；同队同角色唯一）
  - `teamComplete(room, team): boolean`（7 标准角色齐备）
  - `audit(team, msg)`（追加 `{ts, msg}` 到 `team.audit`）
- Produces（persistence.js）:
  - `saveSnapshot(room)`（写 `data/snapshots/<code>.json`）
  - `loadSnapshot(code): room|null`
  - `exportResult(room): {json, csv}`（同时落盘 `data/exports/`）
  - `paths`：`{snapshots, exports}`（测试用）

- [ ] **Step 1: 写失败测试**

```js
// tests/rooms.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, getRoom, joinRoom, playerByToken, isHost, assign, teamComplete, audit } from '../src/game/rooms.js';
import { saveSnapshot, loadSnapshot, exportResult } from '../src/persistence.js';
import { STANDARD_ROLES } from '../src/game/constants.js';

test('建房：4位房间码可取回，两队初始', () => {
  const room = createRoom('主持人', 2);
  assert.match(room.code, /^\d{4}$/);
  assert.equal(getRoom(room.code), room);
  assert.equal(room.teams.length, 2);
  assert.equal(room.phase, 'LOBBY');
  assert.ok(isHost(room, room.hostToken));
});

test('加入与角色分派：同队同角色唯一，仅LOBBY可换', () => {
  const room = createRoom('主持人', 2);
  const p1 = joinRoom(room, '小明');
  const p2 = joinRoom(room, '小红');
  assert.ok(playerByToken(room, p1.token));
  assert.equal(assign(room, p2.token, 't1', 'GENERATION').ok, true);
  const dup = assign(room, p1.token, 't1', 'GENERATION');
  assert.equal(dup.ok, false);
  assert.match(dup.reason, /已被/);
  assert.equal(assign(room, p1.token, 't1', 'GRID').ok, true);
  room.phase = 'R1_PLAN';
  assert.equal(assign(room, p1.token, 't2', 'EV').ok, false);
});

test('teamComplete：7标准角色齐备才true', () => {
  const room = createRoom('主持人', 1);
  for (const role of STANDARD_ROLES) {
    const p = joinRoom(room, `p-${role}`);
    assign(room, p.token, 't1', role);
  }
  assert.equal(teamComplete(room, room.teams[0]), true);
  const p8 = joinRoom(room, '精算师');
  assign(room, p8.token, 't1', 'ACTUARY');
  assert.equal(teamComplete(room, room.teams[0]), true); // 第8人不影响
});

test('audit 追加留痕', () => {
  const room = createRoom('主持人', 1);
  audit(room.teams[0], '测试留痕');
  assert.equal(room.teams[0].audit.length, 1);
  assert.equal(room.teams[0].audit[0].msg, '测试留痕');
});

test('快照保存与恢复：字段一致', () => {
  const room = createRoom('主持人', 2);
  const p = joinRoom(room, '小明');
  assign(room, p.token, 't1', 'MAYOR');
  room.teams[0].fundsNote = '测试'; // 任意扩展字段跟随序列化
  saveSnapshot(room);
  const restored = loadSnapshot(room.code);
  assert.equal(restored.code, room.code);
  assert.equal(restored.players.length, 1);
  assert.equal(restored.teams[0].audit.length, 0); // createTeam 结构完整保留
  assert.deepEqual(restored.players[0], room.players[0]);
});

test('exportResult：JSON含队伍，CSV含表头与队名', () => {
  const room = createRoom('主持人', 2);
  room.teams[0].name = '猛虎队';
  room.teams[0].settlement.teamTotal = 88;
  const { json, csv } = exportResult(room);
  assert.ok(json.includes('猛虎队'));
  assert.ok(csv.includes('队伍'));
  assert.ok(csv.includes('猛虎队'));
  assert.ok(csv.includes('88'));
});

test('loadSnapshot 不存在时返回null', () => {
  assert.equal(loadSnapshot('0000'), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/rooms.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 rooms.js**

```js
// src/game/rooms.js
import { randomInt } from 'node:crypto';
import { createTeam, STANDARD_ROLES, ROLES } from './constants.js';
import { roomCode } from './random.js';

const rooms = new Map();
export const getRoom = (code) => rooms.get(code) ?? null;
export const allRooms = () => [...rooms.values()];

const makeToken = () => randomInt(0, 1e12).toString(36) + randomInt(0, 1e12).toString(36);

export function createRoom(hostName, teamCount = 2) {
  const code = roomCode(new Set(rooms.keys()));
  const room = {
    code,
    hostToken: makeToken(),
    hostName,
    phase: 'LOBBY',
    deadline: null,
    forceStart: false,
    timeoutAlerted: false,
    ranking: null,
    teams: Array.from({ length: teamCount }, (_, i) => createTeam(`t${i + 1}`, `第${i + 1}队`)),
    players: [],
    audit: [],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(room, name) {
  const player = { id: `p${room.players.length + 1}-${randomInt(0, 1e6).toString(36)}`, name, token: makeToken(), teamId: null, roleId: null, connected: true };
  room.players.push(player);
  return player;
}

export const playerByToken = (room, token) => room.players.find(p => p.token === token) ?? null;
export const isHost = (room, token) => token === room.hostToken;

export function assign(room, token, teamId, roleId) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '已开赛，无法更换角色' };
  const p = playerByToken(room, token);
  if (!p) return { ok: false, reason: '未找到玩家' };
  const team = room.teams.find(t => t.id === teamId);
  if (!team) return { ok: false, reason: '队伍不存在' };
  if (!ROLES[roleId]) return { ok: false, reason: '角色非法' };
  const taken = room.players.find(q => q.teamId === teamId && q.roleId === roleId && q.id !== p.id);
  if (taken) return { ok: false, reason: `${ROLES[roleId]} 已被 ${taken.name} 选择` };
  p.teamId = teamId;
  p.roleId = roleId;
  return { ok: true };
}

export function teamComplete(room, team) {
  return STANDARD_ROLES.every(role =>
    room.players.some(p => p.teamId === team.id && p.roleId === role));
}

export function audit(team, msg) {
  team.audit.push({ ts: Date.now(), msg });
}
```

- [ ] **Step 4: 实现 persistence.js**

```js
// src/persistence.js
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SCORING_ROLES, ROLE_NAMES } from './game/constants.js';

const root = new URL('..', import.meta.url).pathname;
export const paths = { snapshots: join(root, 'data/snapshots'), exports: join(root, 'data/exports') };
mkdirSync(paths.snapshots, { recursive: true });
mkdirSync(paths.exports, { recursive: true });

export const snapshotPath = (code) => join(paths.snapshots, `${code}.json`);
export function saveSnapshot(room) {
  writeFileSync(snapshotPath(room.code), JSON.stringify(room, null, 2));
}
export function loadSnapshot(code) {
  const p = snapshotPath(code);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

function toCsv(room) {
  const head = ['队伍', ...SCORING_ROLES.map(r => ROLE_NAMES[r]), '精算师(同发改)',
    '储能电量', '弃电罚分', '额外加分', '目标卡', '终极总分', '名次'];
  const sorted = [...room.teams].sort((a, b) => (b.settlement.teamTotal ?? -1) - (a.settlement.teamTotal ?? -1));
  const rankOf = (id) => sorted.findIndex(t => t.id === id) + 1;
  const rows = room.teams.map(t => [
    t.name,
    ...SCORING_ROLES.map(r => t.settlement.individual?.[r] ?? ''),
    t.settlement.individual?.ACTUARY ?? '',
    (t.settlement.r1?.stored ?? 0) + (t.settlement.r2?.stored ?? 0),
    (t.settlement.r1?.penalty ?? 0) + (t.settlement.r2?.penalty ?? 0),
    (t.settlement.extraBonus ?? []).map(e => `${e.reason}+${e.points}`).join(' ') || '无',
    t.goalKept ? (t.goalAchieved ? `达成·${t.goalKept}` : `未达成·${t.goalKept}`) : '未选',
    t.settlement.teamTotal ?? '',
    rankOf(t.id),
  ]);
  return [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function exportResult(room) {
  const json = JSON.stringify(room, null, 2);
  const csv = toCsv(room);
  writeFileSync(join(paths.exports, `${room.code}-成绩.json`), json);
  writeFileSync(join(paths.exports, `${room.code}-成绩.csv`), csv);
  return { json, csv };
}
```

- [ ] **Step 5: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/rooms.js src/persistence.js tests/rooms.test.js
git commit -m "feat: 房间/队伍/角色管理与JSON快照持久化+成绩导出"
```

---

### Task 9: 协议 protocol.js、状态机 state.js 与服务器 server.js

**Files:**
- Create: `src/net/protocol.js`, `src/game/state.js`, `server.js`
- Test: `tests/state-machine.test.js`

**Interfaces:**
- Consumes: Task 2–8 全部导出。
- Produces:
  - `protocol.js`：`C2S`、`S2C` 事件名数组（前后端共用常量）
  - `state.js`：`startGame(room, force=false)`、`pickGoal(room, teamId, goalId)`、`allGoalsPicked(room)`、`beginPlanning(room, round, forcedEvent=null)`、`advance(room)`（统一推进：返回 `{ok}` 或 `{ok:false, reason}` 或 `{ok:false, teamId, teamName, violations}`；结算成功返回 `{ok:true, settled:true, round}`）、`runSettlement(room, round)`、`interimRanking(room)`、`rank(room)`、`rollTeamDice(t, round, rng)`、`autoPassMissing(t, round)`
  - `server.js`：`createAppIo()` 返回 `{app, io}`（测试可启动于临时端口）；`node server.js` 启动后打印局域网地址
- 骰子可注入：`advance` 内掷骰用 `room._rng ?? rollDice`（测试注入 `() => 5`）

- [ ] **Step 1: 写 protocol.js（无逻辑，直接写）**

```js
// src/net/protocol.js
export const C2S = [
  'room:create', 'room:join', 'room:resume',
  'team:assign', 'game:start', 'goal:pick',
  'action:select', 'action:lock', 'action:pass', 'approval:grant',
  'phase:next', 'phase:force_start', 'force:unlock', 'force:pass',
];
export const S2C = [
  'state:sync', 'timer:tick', 'event:drawn', 'dice:result',
  'settle:step', 'ranking:update', 'alert',
];
```

- [ ] **Step 2: 写失败的状态机测试**

```js
// tests/state-machine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, assign } from '../src/game/rooms.js';
import { STANDARD_ROLES } from '../src/game/constants.js';
import { startGame, pickGoal, allGoalsPicked, beginPlanning, advance } from '../src/game/state.js';
import { applySelection, lockAction, forcePass } from '../src/game/engine.js';
import { settleRound } from '../src/game/settlement.js';

function readyRoom() {
  const room = createRoom('主持人', 1);
  for (const role of STANDARD_ROLES) {
    const p = joinRoom(room, `p-${role}`);
    assign(room, p.token, 't1', role);
  }
  room._rng = () => 5; // 注入骰子：全部成功
  return room;
}

test('LOBBY→GOAL_PICK：发2张，城长选1后可推进', () => {
  const room = readyRoom();
  startGame(room);
  assert.equal(room.phase, 'GOAL_PICK');
  assert.equal(room.teams[0].goalCards.length, 2);
  assert.equal(pickGoal(room, 't1', room.teams[0].goalCards[0]).ok, true);
  const again = pickGoal(room, 't1', room.teams[0].goalCards[1]);
  assert.equal(again.ok, false); // 已选定不可改（简化：选定即锁定）
  assert.ok(allGoalsPicked(room));
});

test('GOAL_PICK→R1_PLAN：抽事件卡、设倒计时', () => {
  const room = readyRoom();
  startGame(room);
  pickGoal(room, 't1', room.teams[0].goalCards[0]);
  const r = advance(room);
  assert.equal(r.ok, true);
  assert.equal(room.phase, 'R1_PLAN');
  assert.ok(room.teams[0].eventCards.r1); // 已抽事件
  assert.ok(room.deadline > Date.now());
});

test('R1_PLAN 结算被终审拦截：超支未处理时 advance 返回违规', () => {
  const room = readyRoom();
  startGame(room);
  pickGoal(room, 't1', room.teams[0].goalCards[0]);
  advance(room);
  const t = room.teams[0];
  t.eventCards.r1 = null; // 无事件，基数100
  applySelection(t, 'r1', 'GENERATION', ['offshore_wind']);
  applySelection(t, 'r1', 'GRID', ['storage_plant']);
  applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  applySelection(t, 'r1', 'BUILDING', ['bldg_zero_carbon']);
  applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material']);
  applySelection(t, 'r1', 'NDRC', ['ndrc_subsidy']); // 135 > 100
  for (const role of STANDARD_ROLES) if (role !== 'MAYOR') lockAction(t, 'r1', role);
  lockAction(t, 'r1', 'MAYOR');
  const r = advance(room);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some(v => /资金/.test(v.reason)));
  assert.equal(room.phase, 'R1_PLAN'); // 未推进
});

test('主持人强制放弃违规行动后可结算：R1→R1_SETTLE（金标准R1数字）', () => {
  const room = readyRoom();
  startGame(room);
  pickGoal(room, 't1', room.teams[0].goalCards[0]);
  advance(room);
  room.teams[0].eventCards.r1 = 'green_bond';
  const t = room.teams[0];
  applySelection(t, 'r1', 'GENERATION', ['solar_pv']);
  applySelection(t, 'r1', 'GRID', ['flex_dispatch']);
  applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  applySelection(t, 'r1', 'BUILDING', ['bldg_retrofit']);
  applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material']);
  applySelection(t, 'r1', 'NDRC', ['ndrc_investment']);
  for (const role of STANDARD_ROLES) lockAction(t, 'r1', role);
  const r = advance(room);
  assert.equal(r.ok, true);
  assert.equal(r.settled, true);
  assert.equal(room.phase, 'R1_SETTLE');
  assert.equal(t.settlement.r1.fundsEnd, 75);
  assert.equal(t.settlement.r1.interim, 26);
});

test('R2 全流程到 FINISHED：金标准终局56分与排名', () => {
  const room = readyRoom();
  startGame(room);
  pickGoal(room, 't1', room.teams[0].goalCards[0]);
  advance(room); // → R1_PLAN
  const t = room.teams[0];
  // —— R1（与上一测试相同）——
  t.eventCards.r1 = 'green_bond';
  applySelection(t, 'r1', 'GENERATION', ['solar_pv']);
  applySelection(t, 'r1', 'GRID', ['flex_dispatch']);
  applySelection(t, 'r1', 'EV', ['ev_mass_produce']);
  applySelection(t, 'r1', 'BUILDING', ['bldg_retrofit']);
  applySelection(t, 'r1', 'MATERIAL', ['mat_pv_material']);
  applySelection(t, 'r1', 'NDRC', ['ndrc_investment']);
  for (const role of STANDARD_ROLES) lockAction(t, 'r1', role);
  advance(room); // → R1_SETTLE
  advance(room); // → R2_PLAN
  assert.equal(room.phase, 'R2_PLAN');
  // —— R2 ——
  t.eventCards.r2 = 'price_surge';
  applySelection(t, 'r2', 'GENERATION', ['offshore_wind']);
  applySelection(t, 'r2', 'GRID', ['grid_expand']);
  applySelection(t, 'r2', 'EV', ['ev_v2g']);
  applySelection(t, 'r2', 'BUILDING', ['bldg_zero_carbon']);
  applySelection(t, 'r2', 'MATERIAL', ['mat_green_material']);
  applySelection(t, 'r2', 'NDRC', ['ndrc_capacity_price']);
  for (const role of STANDARD_ROLES) lockAction(t, 'r2', role);
  const r = advance(room); // → 结算
  assert.equal(r.ok, true);
  assert.equal(room.phase, 'FINISHED');
  assert.deepEqual(t.settlement.individual, {
    GENERATION: 23, GRID: 7, EV: 9, BUILDING: 6, MATERIAL: 4, NDRC: 16, ACTUARY: 16,
  });
  assert.equal(t.settlement.teamTotal, 56);
  const ranking = room.ranking;
  assert.equal(ranking[0].teamId, 't1');
  assert.equal(ranking[0].total, 56);
});

test('startGame 7人未满默认拒绝，force=true 放行', () => {
  const room = createRoom('主持人', 1);
  const r1c = startGame(room, { teamComplete: () => false });
  assert.equal(r1c.ok, false);
  assert.match(r1c.reason, /未满7/);
  const r2c = startGame(room, { teamComplete: () => false, force: true });
  assert.equal(r2c.ok, true);
  assert.equal(room.phase, 'GOAL_PICK');
});
```

- [ ] **Step 3: 运行确认失败**

Run: `node --test tests/state-machine.test.js`
Expected: FAIL

- [ ] **Step 4: 实现 state.js**

```js
// src/game/state.js
import { STANDARD_ROLES } from './constants.js';
import { getAction, RULES } from './actions.js';
import { rollDice } from './random.js';
import { dealGoals, checkGoal, goalById } from './goals.js';
import { drawEvent } from './events.js';
import { settleRound, computeScores, interimScore, rankTeams } from './settlement.js';
import { finalValidate } from './engine.js';

export function startGame(room, opts = {}) {
  if (room.phase !== 'LOBBY') return { ok: false, reason: '游戏已开始' };
  const incomplete = room.teams.filter(t => !(opts.teamComplete?.(t) ?? true));
  if (incomplete.length && !opts.force)
    return { ok: false, reason: `以下队伍未满7个标准角色：${incomplete.map(t => t.name).join('、')}（可强制开始）` };
  room.forceStart = !!opts.force;
  for (const t of room.teams) t.goalCards = dealGoals();
  room.phase = 'GOAL_PICK';
  return { ok: true };
}

export function pickGoal(room, teamId, goalId) {
  const t = room.teams.find(x => x.id === teamId);
  if (!t) return { ok: false, reason: '队伍不存在' };
  if (room.phase !== 'GOAL_PICK') return { ok: false, reason: '当前不在选卡阶段' };
  if (t.goalKept) return { ok: false, reason: '本队已选定目标卡' };
  if (!t.goalCards.includes(goalId)) return { ok: false, reason: '该卡不在你的两张候选中' };
  t.goalKept = goalId;
  return { ok: true };
}

export const allGoalsPicked = (room) => room.teams.every(t => t.goalKept);

export function beginPlanning(room, round, forcedEvent = null) {
  room.phase = round === 'r1' ? 'R1_PLAN' : 'R2_PLAN';
  for (const t of room.teams) t.eventCards[round] = forcedEvent ?? drawEvent(round);
  room.deadline = Date.now() + RULES.config.planningMinutes * 60_000;
  room.timeoutAlerted = false;
}

export function autoPassMissing(team, round) {
  for (const role of STANDARD_ROLES) {
    const rec = team.actions[round][role];
    if (!rec || rec.passed || !rec.actionIds?.length)
      team.actions[round][role] = { actionIds: [], locked: true, passed: true };
  }
}

export function rollTeamDice(team, round, rng = rollDice) {
  team.dice[round] = {};
  const rollFor = (roleId, actionId) => {
    const rec = team.actions[round][roleId];
    if (!rec || rec.passed || !rec.actionIds.includes(actionId)) return;
    const v = rng();
    team.dice[round][roleId] = { value: v, success: v >= getAction(actionId).dice.threshold };
  };
  rollFor('GENERATION', 'offshore_wind');
  rollFor('EV', 'ev_v2g');
}

export function runSettlement(room, round) {
  for (const t of room.teams) {
    settleRound(t, round);
    if (round === 'r1') {
      t.settlement.r1.interim = interimScore(t);
    } else {
      const s = computeScores(t);
      t.settlement.individual = s.individual;
      t.settlement.extraBonus = s.extra;
      t.settlement.teamTotal = s.teamTotal;
      t.goalAchieved = t.goalKept ? checkGoal(t.goalKept, t) : false;
      if (t.goalAchieved) {
        t.settlement.extraBonus.push({ reason: `目标卡·${goalById(t.goalKept).name}`, points: 5 });
        t.settlement.teamTotal += 5;
      }
    }
  }
  if (round === 'r2') room.phase = 'FINISHED';
}

function settle(room, round) {
  for (const t of room.teams) {
    autoPassMissing(t, round);
    const fv = finalValidate(t, round);
    if (!fv.ok) return { ok: false, teamId: t.id, teamName: t.name, violations: fv.violations };
  }
  for (const t of room.teams) rollTeamDice(t, round, room._rng);
  room.phase = round === 'r1' ? 'R1_SETTLE' : 'R2_SETTLE';
  room.deadline = null;
  runSettlement(room, round);
  return { ok: true, settled: true, round };
}

export function advance(room) {
  switch (room.phase) {
    case 'GOAL_PICK':
      if (!allGoalsPicked(room)) return { ok: false, reason: '还有队伍未选定目标卡' };
      beginPlanning(room, 'r1');
      return { ok: true };
    case 'R1_PLAN': return settle(room, 'r1');
    case 'R1_SETTLE':
      beginPlanning(room, 'r2');
      return { ok: true };
    case 'R2_PLAN': return settle(room, 'r2');
    default: return { ok: false, reason: '当前阶段没有可推进的操作' };
  }
}

export const interimRanking = (room) => room.teams
  .map(t => ({ teamId: t.id, name: t.name, total: t.settlement.r1?.interim ?? 0 }))
  .sort((a, b) => b.total - a.total);
export const rank = (room) => rankTeams(room.teams);
```

注意：`startGame` 通过 `opts.teamComplete` 回调注入完整性检查（server 层传 `rooms.teamComplete`），state 层自身不依赖 rooms；未传回调时视为全部就绪（单元测试即用此行为）。`readyRoom()` 填满 7 角色后 `startGame(room)` 直接成功。

- [ ] **Step 5: 实现 server.js**

```js
// server.js
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as roomsMod from './src/game/rooms.js';
import * as state from './src/game/state.js';
import * as engine from './src/game/engine.js';
import { RULES, actionsForRole, listSelection, availableFunds, effectiveTransCap } from './src/game/actions.js';
import { saveSnapshot, exportResult } from './src/persistence.js';
import { STANDARD_ROLES } from './src/game/constants.js';

export function createAppIo() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.get('/qr.svg', async (req, res) =>
    res.type('svg').send(await QRCode.toString(String(req.query.d ?? ''), { type: 'svg', margin: 1, width: 240 })));
  app.get('/export/:code.:fmt', (req, res) => {
    const room = roomsMod.getRoom(req.params.code);
    if (!room) return res.status(404).send('房间不存在');
    const { json, csv } = exportResult(room);
    if (req.params.fmt === 'json') res.type('json').attachment(`${room.code}-成绩.json`).send(json);
    else if (req.params.fmt === 'csv') res.type('text/csv').attachment(`${room.code}-成绩.csv`).send(csv);
    else res.status(400).send('格式不支持');
  });
  return { app, httpServer, io };
}

const roundOf = (phase) => (phase.startsWith('R1') ? 'r1' : 'r2');
const isPlan = (phase) => phase === 'R1_PLAN' || phase === 'R2_PLAN';
const SETTLED = ['R1_SETTLE', 'R2_PLAN', 'R2_SETTLE', 'FINISHED'];

function visibleTeam(room, t, v) {
  const mine = v.kind === 'player'
    && room.players.find(p => p.id === v.playerId)?.teamId === t.id;
  const settled = SETTLED.includes(room.phase);
  const round = roundOf(room.phase);
  const base = {
    id: t.id, name: t.name,
    members: room.players.filter(p => p.teamId === t.id)
      .map(p => ({ roleId: p.roleId, name: p.name, connected: p.connected })),
    eventCard: t.eventCards[round] ?? null,
    goalKeptShown: settled || mine ? t.goalKept : (t.goalKept ? true : null),
  };
  if (mine) base.goalCards = t.goalCards; // 城长选卡需要看到本队两张候选
  if (mine && isPlan(room.phase)) {
    const sel = listSelection(t, round);
    base.detail = {
      round,
      fundsEnd: availableFunds(t, round, sel),
      transCap: effectiveTransCap(t, round, sel),
      approval: t.approvals[round],
      selections: t.actions[round],
      catalog: STANDARD_ROLES.reduce((m, r) => (m[r] = actionsForRole(r), m), {}),
    };
  }
  if (settled) {
    base.dice = t.dice;
    base.settlement = t.settlement;
    base.goalAchieved = t.goalAchieved ?? null;
  } else {
    base.progress = {};
    for (const role of STANDARD_ROLES) {
      const rec = t.actions[round]?.[role];
      base.progress[role] = rec?.passed ? 'passed' : rec?.locked ? 'locked'
        : rec?.actionIds?.length ? 'draft' : 'empty';
    }
  }
  return base;
}

function visibleState(room, v) {
  return {
    code: room.code, phase: room.phase, deadline: room.deadline, now: Date.now(),
    isHost: v.kind === 'host',
    you: v.kind === 'player' ? room.players.find(p => p.id === v.playerId) ?? null : null,
    players: room.players.map(p => ({ id: p.id, name: p.name, teamId: p.teamId, roleId: p.roleId, connected: p.connected })),
    teams: room.teams.map(t => visibleTeam(room, t, v)),
    ranking: room.ranking,
  };
}

export function wire(io) {
  const broadcast = (room) => {
    for (const sid of io.of('/').adapter.rooms.get(room.code) ?? []) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) sock.emit('state:sync', visibleState(room, sock.data));
    }
  };
  const streamSettlement = (room, round) => {
    for (const t of room.teams)
      for (const [roleId, d] of Object.entries(t.dice[round] ?? {}))
        io.to(room.code).emit('dice:result', { teamId: t.id, roleId, ...d });
    let delay = 1500; // 留出骰子动画时间
    for (const t of room.teams)
      for (const step of t.settlement[round].steps) {
        io.to(room.code).emit('settle:step', { teamId: t.id, round, step, delay });
        delay += 700;
      }
    setTimeout(() => {
      room.ranking = round === 'r1' ? state.interimRanking(room) : state.rank(room);
      io.to(room.code).emit('ranking:update', room.ranking);
      broadcast(room);
      saveSnapshot(room);
    }, delay + 300);
  };

  io.on('connection', (socket) => {
    socket.data = { kind: null };
    const roomOf = () => roomsMod.getRoom(socket.data.code);
    const hostOnly = (fn) => (payload, ack) => {
      const room = roomOf();
      if (!room || !roomsMod.isHost(room, socket.data.token)) return ack?.({ ok: false, reason: '仅主持人可操作' });
      return fn(room, payload ?? {}, ack);
    };
    const playerOnly = (fn) => (payload, ack) => {
      const room = roomOf();
      const p = room && socket.data.token ? roomsMod.playerByToken(room, socket.data.token) : null;
      if (!room || !p) return ack?.({ ok: false, reason: '身份失效，请重新加入' });
      return fn(room, p, payload ?? {}, ack);
    };
    const done = (room, r, ack) => { ack?.(r); broadcast(room); if (r?.ok) saveSnapshot(room); };

    socket.on('room:create', ({ hostName, teamCount }, ack) => {
      const room = roomsMod.createRoom(hostName || '主持人', Math.min(8, Math.max(2, teamCount ?? 2)));
      socket.data = { kind: 'host', code: room.code, token: room.hostToken };
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, token: room.hostToken });
      broadcast(room);
    });

    socket.on('room:join', ({ code, name }, ack) => {
      const room = roomsMod.getRoom(String(code ?? '').trim());
      if (!room) return ack?.({ ok: false, reason: '房间不存在，请核对4位房间码' });
      const player = roomsMod.joinRoom(room, String(name ?? '').slice(0, 12) || '玩家');
      socket.data = { kind: 'player', code: room.code, token: player.token, playerId: player.id };
      socket.join(room.code);
      ack?.({ ok: true, token: player.token, playerId: player.id });
      broadcast(room);
    });

    socket.on('room:resume', ({ code, token }, ack) => {
      const room = roomsMod.getRoom(code);
      if (!room) return ack?.({ ok: false, reason: '房间已不存在' });
      if (roomsMod.isHost(room, token)) socket.data = { kind: 'host', code, token };
      else {
        const p = roomsMod.playerByToken(room, token);
        if (!p) return ack?.({ ok: false, reason: '身份已失效，请重新加入' });
        p.connected = true;
        socket.data = { kind: 'player', code, token, playerId: p.id };
      }
      socket.join(code);
      ack?.({ ok: true });
      broadcast(room);
    });

    socket.on('team:assign', playerOnly((room, p, { teamId, roleId }, ack) =>
      done(room, roomsMod.assign(room, p.token, teamId, roleId), ack)));

    socket.on('game:start', hostOnly((room, { force }, ack) => {
      const r = state.startGame(room, { force, teamComplete: (t) => roomsMod.teamComplete(room, t) });
      ack?.(r);
      if (r.ok) broadcast(room);
    }));

    socket.on('goal:pick', playerOnly((room, p, { goalId }, ack) => {
      if (p.roleId !== 'MAYOR') return ack?.({ ok: false, reason: '仅城长可拍板目标卡' });
      done(room, state.pickGoal(room, p.teamId, goalId), ack);
    }));

    const inPlan = (ack, fn) => {
      const room = roomOf();
      if (!isPlan(room?.phase)) return ack?.({ ok: false, reason: '当前不在规划阶段' });
      fn(room, roundOf(room.phase));
    };
    socket.on('action:select', playerOnly((room, p, { actionIds }, ack) => inPlan(ack, (r2, round) => {
      if (!p.teamId || !p.roleId) return ack?.({ ok: false, reason: '尚未分配队伍与角色' });
      const t = room.teams.find(x => x.id === p.teamId);
      done(room, engine.applySelection(t, round, p.roleId, actionIds ?? []), ack);
    })));
    socket.on('action:lock', playerOnly((room, p, _, ack) => inPlan(ack, (r2, round) => {
      const t = room.teams.find(x => x.id === p.teamId);
      done(room, engine.lockAction(t, round, p.roleId), ack);
    })));
    socket.on('action:pass', playerOnly((room, p, _, ack) => inPlan(ack, (r2, round) => {
      const t = room.teams.find(x => x.id === p.teamId);
      done(room, engine.passAction(t, round, p.roleId), ack);
    })));
    socket.on('approval:grant', playerOnly((room, p, { type, actionId }, ack) => inPlan(ack, (r2, round) => {
      if (p.roleId !== 'MAYOR') return ack?.({ ok: false, reason: '仅城长可行使市长特批权' });
      const t = room.teams.find(x => x.id === p.teamId);
      done(room, engine.grantApproval(t, round, { type, actionId }), ack);
    })));

    socket.on('phase:force_start', hostOnly((room, _, ack) => { room.forceStart = true; ack?.({ ok: true }); }));
    socket.on('force:unlock', hostOnly((room, { teamId, roleId }, ack) => {
      const t = room.teams.find(x => x.id === teamId);
      if (!t) return ack?.({ ok: false, reason: '队伍不存在' });
      engine.forceUnlock(t, roundOf(room.phase), roleId);
      roomsMod.audit(t, `主持人解锁 ${roleId}`);
      ack?.({ ok: true }); broadcast(room);
    }));
    socket.on('force:pass', hostOnly((room, { teamId, roleId }, ack) => {
      const t = room.teams.find(x => x.id === teamId);
      if (!t) return ack?.({ ok: false, reason: '队伍不存在' });
      engine.forcePass(t, roundOf(room.phase), roleId);
      roomsMod.audit(t, `主持人将 ${roleId} 置为放弃`);
      ack?.({ ok: true }); broadcast(room); saveSnapshot(room);
    }));

    socket.on('phase:next', hostOnly((room, _, ack) => {
      const r = state.advance(room);
      if (!r.ok) return ack?.(r);
      ack?.({ ok: true });
      broadcast(room);
      saveSnapshot(room);
      if (r.settled) {
        for (const t of room.teams)
          io.to(room.code).emit('event:drawn', { round: r.round, teamId: t.id, eventId: null }); // 事件卡已随 state:sync 公布
        streamSettlement(room, r.round);
      }
    }));
  });

  setInterval(() => {
    for (const room of roomsMod.allRooms()) {
      if (!room.deadline) continue;
      const remaining = Math.max(0, room.deadline - Date.now());
      io.to(room.code).emit('timer:tick', {
        remaining,
        warning: RULES.config.warnMinutes.includes(Math.ceil(remaining / 60000)),
      });
      if (remaining === 0 && !room.timeoutAlerted) {
        room.timeoutAlerted = true;
        io.to(room.code).emit('alert', { level: 'warn', message: '规划时间到！请主持人尽快开始结算' });
      }
    }
  }, 1000).unref();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { httpServer, io } = createAppIo();
  wire(io);
  httpServer.listen(RULES.config.port, () => {
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
    console.log('⚡ 快乐能源 已启动');
    console.log(`   本机:   http://localhost:${RULES.config.port}`);
    for (const ip of ips) console.log(`   局域网: http://${ip}:${RULES.config.port}`);
  });
}
```

- [ ] **Step 6: 运行测试通过并全量回归**

Run: `npm test`
Expected: PASS（server.js 的 wire/createAppIo 由 Task 12 的集成测试或手动 curl 验证）

- [ ] **Step 7: 手动冒烟：启动服务确认页面与二维码可访问**

Run: `node server.js &`，然后：
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/play/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/host/
curl -s http://localhost:3000/qr.svg | head -c 100
```
Expected: 200/200/200 与 `<svg` 开头。随后 `kill %1`。
（此时 play/host 页面文件尚未创建，404 属预期——先创建占位 `public/index.html`、`public/play/index.html`、`public/host/index.html` 空壳，完整页面在 Task 10/11 实现。）

- [ ] **Step 8: Commit**

```bash
git add src/net/protocol.js src/game/state.js server.js public/ tests/state-machine.test.js
git commit -m "feat: 状态机推进/服务器Socket接线/协议常量（含终审拦截与金标准流程测试）"
```

---

### Task 10: 前端公共样式、加入页与玩家手机端

**Files:**
- Create: `public/common.css`, `public/index.html`, `public/join.js`
- Create: `public/play/index.html`, `public/play/play.js`

**Interfaces:**
- Consumes: Task 9 的全部 S2C/C2S 事件与 `visibleState` 载荷（`teams[].detail`、`teams[].progress`、`ranking`、`you` 等）。
- Produces: 玩家可完成 加队→选角色→选目标卡(城长)→选/锁/放弃行动→特批(城长)→看骰子与结算→看终局 的完整闭环。前端事件/角色名映射表在此定义，Task 11 复用同名常量。

- [ ] **Step 1: 写 public/common.css（主题与组件，双端共用）**

```css
:root {
  --bg: #f4f7f4; --card: #fff; --ink: #1c2b21; --muted: #6b7f72;
  --green: #1d9e57; --green-dark: #14683c; --red: #d64545; --line: #dbe5dd;
  --big-bg: #0e1f16; --big-card: #16301f;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: var(--bg); color: var(--ink); }
button { font-size: 16px; border: 0; border-radius: 10px; padding: 12px 16px; background: var(--green); color: #fff; width: 100%; margin: 4px 0; }
button:disabled { background: #b9c8bd; }
button.ghost { background: #fff; color: var(--green-dark); border: 1px solid var(--green); }
button.danger { background: var(--red); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 10px; }
.card.selected { border-color: var(--green); box-shadow: 0 0 0 2px var(--green) inset; }
.badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; background: #e7f2ea; color: var(--green-dark); margin: 2px 6px 2px 0; }
.badge.red { background: #fde8e8; color: var(--red); }
.badge.amber { background: #fdf3dc; color: #8a6100; }
.muted { color: var(--muted); font-size: 13px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.topbar { position: sticky; top: 0; background: var(--green-dark); color: #fff; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; z-index: 9; }
.timer { font-variant-numeric: tabular-nums; font-size: 20px; font-weight: 700; }
.timer.warn { color: #ffd479; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: left; font-size: 14px; }
body.big { background: var(--big-bg); color: #e8f2ea; }
body.big .card { background: var(--big-card); border-color: #234634; }
body.big button { background: #2fbe6e; }
body.big button.ghost { background: transparent; color: #7ee2a8; border-color: #2fbe6e; }
.podium { display: flex; gap: 16px; align-items: flex-end; justify-content: center; padding: 30px 10px; }
.podium .bar { width: 120px; border-radius: 10px 10px 0 0; background: linear-gradient(#2fbe6e, #14683c); font-size: 28px; font-weight: 800; color: #fff; text-align: center; padding-top: 10px; }
.dice { font-size: 44px; }
@keyframes shake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-20deg); } 75% { transform: rotate(20deg); } }
.dice.rolling { display: inline-block; animation: shake .4s infinite; }
.qr { background: #fff; padding: 8px; border-radius: 10px; }
input { font-size: 16px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; width: 100%; margin: 6px 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; }
```

- [ ] **Step 2: 写加入页 public/index.html 与 public/join.js**

```html
<!-- public/index.html -->
<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>快乐能源 · 加入</title><link rel="stylesheet" href="/common.css"></head>
<body>
<div class="card" style="max-width:420px;margin:40px auto">
  <h1>⚡ 快乐能源</h1><p class="muted">自强城能源规划竞赛 · 玩家加入</p>
  <input id="code" inputmode="numeric" maxlength="4" placeholder="4位房间码">
  <input id="name" maxlength="12" placeholder="你的昵称">
  <button id="joinBtn">加入游戏</button>
  <a href="/host/" class="muted">我是主持人 →</a>
</div>
<script src="/socket.io/socket.io.js"></script>
<script type="module" src="/join.js"></script>
</body></html>
```

```js
// public/join.js
const socket = io();
document.getElementById('joinBtn').onclick = () => {
  const code = document.getElementById('code').value.trim();
  const name = document.getElementById('name').value.trim();
  if (!/^\d{4}$/.test(code)) return alert('请输入4位房间码');
  if (!name) return alert('请填写昵称');
  socket.emit('room:join', { code, name }, (res) => {
    if (!res.ok) return alert(res.reason);
    sessionStorage.setItem('ke_auth', JSON.stringify({ code, token: res.token }));
    location.href = '/play/';
  });
};
```

- [ ] **Step 3: 写玩家端 public/play/index.html**

```html
<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>快乐能源 · 玩家</title><link rel="stylesheet" href="/common.css"></head>
<body>
<div class="topbar"><div id="meTitle">连接中…</div><div class="timer" id="timer">--:--</div></div>
<div id="app"></div>
<script src="/socket.io/socket.io.js"></script>
<script type="module" src="/play/play.js"></script>
</body></html>
```

- [ ] **Step 4: 写玩家端逻辑 public/play/play.js**

```js
// public/play/play.js
const socket = io();
const auth = JSON.parse(sessionStorage.getItem('ke_auth') ?? 'null');
let S = null;

const ROLE = { GENERATION: '发电企业', GRID: '电网企业', EV: '汽车企业', BUILDING: '建筑企业', MATERIAL: '材料企业', NDRC: '发改委', MAYOR: '城长', ACTUARY: '精算师' };
const ALL_ROLES = Object.keys(ROLE);
const STATE_TXT = { locked: '✅已锁定', draft: '💭考虑中', passed: '🚫已放弃', empty: '未选择' };
const EVENTS = {
  green_bond: { name: '专项绿色国债', desc: '本轮初始资金提升至125' },
  research_breakthrough: { name: '产学研大突破', desc: '材料研发免费且可双研发' },
  green_consumption: { name: '绿色消费潮', desc: '汽车/建筑成本各减10' },
  cold_wave: { name: '极寒无风寒潮', desc: '光伏-3(或风电-3)，发电分-3；有储能电站+5' },
  price_surge: { name: '现货电价暴涨', desc: '上轮储能每点+2分；本轮弃电罚×4' },
  pioneer_cert: { name: '零碳城市先锋认证', desc: '两轮盈差≤2且招商过 → 全队+8' },
};
const emit = (ev, payload = {}) => new Promise(res => socket.emit(ev, payload, res));

socket.on('connect', () => { if (!auth) location.href = '/'; else socket.emit('room:resume', auth, r => { if (!r.ok) location.href = '/'; }); });
socket.on('state:sync', (s) => { S = s; render(); });
socket.on('alert', ({ message }) => { const d = document.createElement('div'); d.className = 'card'; d.style.borderColor = '#d64545'; d.textContent = message; document.getElementById('app').prepend(d); setTimeout(() => d.remove(), 6000); });
socket.on('timer:tick', ({ remaining, warning }) => {
  const m = Math.floor(remaining / 60000), s = Math.floor(remaining % 60000 / 1000);
  const el = document.getElementById('timer');
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warn', !!warning);
});
socket.on('dice:result', ({ teamId, roleId, value, success }) => {
  if (S?.you?.teamId !== teamId) return;
  const box = document.getElementById('diceBox');
  if (!box) return;
  box.innerHTML = `<span class="dice rolling">🎲</span> ${ROLE[roleId]}掷骰中…`;
  setTimeout(() => { box.innerHTML = `<span class="dice">🎲 ${value}</span> <b>${success ? '成功！' : '未达标'}</b>`; }, 1200);
});
socket.on('settle:step', ({ teamId, step }) => {
  if (S?.you?.teamId !== teamId) return;
  const box = document.getElementById('stepsBox');
  if (box) box.insertAdjacentHTML('beforeend', `<div class="card"><b>${step.label}</b>：${step.text}</div>`);
});

const myTeam = () => S?.teams.find(t => t.id === S.you?.teamId) ?? null;
const isPlan = (p) => p === 'R1_PLAN' || p === 'R2_PLAN';

function render() {
  if (!S) return;
  const t = myTeam();
  document.getElementById('meTitle').textContent =
    `${S.you?.name ?? '未加入'} · ${ROLE[S.you?.roleId] ?? '未分配'} · ${t?.name ?? ''}`;
  const app = document.getElementById('app');
  const banner = S.teams[0]?.eventCard && isPlan(S.phase)
    ? `<div class="card" style="border-color:#e8a013">📢 突发事件：<b>${EVENTS[S.teams[0].eventCard]?.name}</b> — ${EVENTS[S.teams[0].eventCard]?.desc}</div>` : '';
  let body = '';
  if (S.phase === 'LOBBY') body = lobbyHtml();
  else if (S.phase === 'GOAL_PICK') body = goalHtml();
  else if (isPlan(S.phase)) body = planHtml();
  else body = settleHtml() + rankingHtml();
  app.innerHTML = banner + body;
  bind();
}

function lobbyHtml() {
  return `<h3 style="margin-left:12px">选择队伍与角色（7标准角色，精算师为第8人可选）</h3>` + S.teams.map(team => `
  <div class="card"><b>${team.name}</b> <span class="muted">${team.members.length} 人</span>
    <div class="row">${ALL_ROLES.map(r => {
      const taken = team.members.find(m => m.roleId === r);
      const mine = S.you?.teamId === team.id && S.you?.roleId === r;
      return `<button class="${mine ? '' : 'ghost'}" style="width:auto" data-assign="${team.id}:${r}"
        ${taken && !mine ? 'disabled' : ''}>${ROLE[r]}${taken ? `·${taken.name}` : ''}</button>`;
    }).join('')}</div>
  </div>`).join('');
}

function goalHtml() {
  const t = myTeam();
  if (!t) return '<div class="card">请等待主持人分配队伍</div>';
  if (t.goalKeptShown) return `<div class="card">✅ 城长已选定目标卡（内容对局内保密，终局公开）</div>`;
  if (S.you?.roleId !== 'MAYOR') return `<div class="card">等待城长选定目标卡…</div>`;
  const GOALS = { storage_master: '储能达人：容量≥6且入储≥2', load_pioneer: '负荷先锋：消耗合计≥15', wind_chaser: '追风者：选过风电且消耗≥10', windfree_city: '无风之城：不选风电、绿电≥10、弃电0', garden_city: '花园城市：建过地标且每轮弃电≤2', funds_steward: '资金管家：第2轮结余≥70' };
  return `<h3 style="margin-left:12px">城长拍板：保留1张目标卡（终局达成+5）</h3>` +
    (t.goalKeptShown === null ? (t.goalCards ?? []).map(g => `<div class="card"><b>${GOALS[g] ?? g}</b><button class="ghost" data-goal="${g}">保留这张</button></div>`).join('') : '');
}

function planHtml() {
  const t = myTeam();
  if (!t?.detail) return '<div class="card">等待规划开始…</div>';
  const d = t.detail;
  const me = S.you.roleId;
  const sel = d.selections[me];
  let html = `<div class="card row">
    <span class="badge">轮末资金 ≈ ${d.fundsEnd}</span>
    <span class="badge">输配上限 ${d.transCap}</span>
    <span class="badge ${d.approval ? 'amber' : ''}">特批：${d.approval ? (d.approval.type === 'REDUCE5' ? '已用·减5' : '已用·超支放行') : '未用'}</span>
  </div>`;
  if (me !== 'MAYOR' && me !== 'ACTUARY') {
    html += d.catalog[me].map(a => {
      const picked = sel?.actionIds?.includes(a.id);
      const overCap = (a.consume ?? 0) > d.transCap;
      return `<div class="card ${picked ? 'selected' : ''}">
        <b>${a.name}</b> <span class="muted">${a.desc}</span>
        <div class="row">
          <span class="badge">资金${a.cost?.funds ?? 0} 土地${a.cost?.land ?? 0}</span>
          ${a.power ? `<span class="badge">产出${a.power}绿电</span>` : ''}
          ${a.consume ? `<span class="badge">消耗${a.consume}绿电</span>` : ''}
          ${a.dice ? `<span class="badge amber">掷骰≥${a.dice.threshold}成功</span>` : ''}
          ${overCap ? '<span class="badge red">超输配上限·不可选</span>' : ''}
        </div>
        ${overCap ? '' : `<button class="${picked ? '' : 'ghost'}" data-pick="${a.id}">${picked ? '✓ 已选（再点换其他）' : '选择'}</button>`}
      </div>`;
    }).join('');
  }
  if (me === 'MAYOR') {
    const actions = Object.entries(d.selections).flatMap(([r, rec]) => (rec.actionIds ?? []).map(id => ({ r, id })));
    html += `<div class="card"><b>市长特批权（每轮1次）</b>
      <button class="ghost" data-approval="OVERDRAFT5" ${d.approval ? 'disabled' : ''}>总预算超支≤5 特批放行</button>
      ${actions.map(({ r, id }) => `<button class="ghost" data-approval="REDUCE5:${id}" ${d.approval ? 'disabled' : ''}>为「${nameOf(d.catalog, id)}」（${ROLE[r]}）减免5资金</button>`).join('')}
    </div>`;
  }
  if (me === 'ACTUARY') html += '<div class="card"><b>首席精算师</b><p>本角色不执行行动：请通报资金、土地、输配与源荷匹配情况，与发改委同分。</p></div>';
  html += `<div class="card"><div class="row">
      <button data-lock>锁定行动</button>
      <button class="ghost" data-pass>声明放弃</button>
    </div><p class="muted">我的状态：${STATE_TXT[t.progress?.[me] ?? 'empty']}</p></div>
  <div class="card"><b>队友动态（队内可见）</b>
    ${t.members.map(m => `<div>${ROLE[m.roleId] ?? '—'} · ${m.name}　<span class="muted">${STATE_TXT[t.progress?.[m.roleId] ?? 'empty']}</span></div>`).join('')}
  </div>`;
  return html;
}

function settleHtml() {
  const t = myTeam();
  const round = S.phase.startsWith('R1') ? 'r1' : 'r2';
  const d = t?.settlement?.[round];
  let html = `<h3 style="margin-left:12px">${round === 'r1' ? '第1轮' : '终局'}结算 · ${t?.name ?? ''}</h3>
    <div class="card" id="diceBox">${d ? '' : '等待当众掷骰…'}</div><div id="stepsBox">`;
  if (d) html += (d.steps ?? []).map(s => `<div class="card"><b>${s.label}</b>：${s.text}</div>`).join('');
  html += '</div>';
  if (S.phase === 'FINISHED' && t) {
    const ind = t.settlement.individual ?? {};
    const order = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'ACTUARY'];
    html += `<div class="card"><b>个人分</b><table><tr>${order.map(k => `<th>${ROLE[k]}</th>`).join('')}</tr>
      <tr>${order.map(k => `<td>${ind[k] ?? '—'}</td>`).join('')}</tr></table>
      <p><b>额外加分</b>：${(t.settlement.extraBonus ?? []).map(e => `${e.reason}+${e.points}`).join('　') || '无'}</p>
      <p><b>目标卡</b>：${t.goalKeptShown ? (t.goalAchieved ? '✓ 达成 +5' : '✗ 未达成') : '未选'}</p></div>`;
  }
  return html;
}

const rankingHtml = () => S.ranking ? `<div class="card"><b>排行榜</b>${
  S.ranking.map((r, i) => `<div class="row"><span class="badge ${i === 0 ? 'amber' : ''}">第${i + 1}</span>${r.name} — <b>${r.total}</b>分</div>`).join('')}</div>` : '';

function nameOf(catalog, id) {
  for (const list of Object.values(catalog)) { const a = (list ?? []).find(x => x.id === id); if (a) return a.name; }
  return id;
}

function bind() {
  document.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => {
    const [teamId, roleId] = b.dataset.assign.split(':');
    emit('team:assign', { teamId, roleId });
  });
  document.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => emit('goal:pick', { goalId: b.dataset.goal }));
  document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => emit('action:select', { actionIds: [b.dataset.pick] }));
  document.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => emit('action:lock'));
  document.querySelectorAll('[data-pass]').forEach(b => b.onclick = () => { if (confirm('确定声明放弃本轮行动？')) emit('action:pass'); });
  document.querySelectorAll('[data-approval]').forEach(b => b.onclick = () => {
    const [type, actionId] = b.dataset.approval.split(':');
    emit('approval:grant', { type, actionId });
  });
}
```

- [ ] **Step 5: 手动验证（手机视口）**

Run: `node server.js`
1. 浏览器开 `http://localhost:3000/`（DevTools 切手机视口）：建房另开 `/host/`，输入房间码加入。
2. 走一遍：加入 → 选队/角色 → （主持人开始）→ 城长选卡 → 选行动（验证"超输配上限"置灰与红色原因）→ 锁定 → 放弃 → 特批 → 观察结算骰子与步骤流 → 终局表。
Expected: 各步无报错，校验提示文案正确。

- [ ] **Step 6: Commit**

```bash
git add public/
git commit -m "feat: 玩家手机端（加入/目标卡/规划/特批/结算/终局）"
```

---

### Task 11: 主持人大屏

**Files:**
- Create: `public/host/index.html`, `public/host/host.js`

**Interfaces:**
- Consumes: 同 Task 10 的协议与 `visibleState`；复用 ROLE/STATE_TXT/EVENTS 映射（在大屏文件内重新定义，与前端口径一致）。
- Produces: 建房（房间码+二维码）、开始/推进/强制操作、全场进度矩阵、骰子与结算轮播、排行榜、颁奖与导出入口。**大屏不显示任何队伍的行动草案**（现场人人可见）。

- [ ] **Step 1: 写 public/host/index.html**

```html
<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>快乐能源 · 主持台</title><link rel="stylesheet" href="/common.css"></head>
<body class="big">
<div id="setup" class="card" style="max-width:420px;margin:40px auto">
  <h1>⚡ 快乐能源 · 主持台</h1>
  <input id="hostName" placeholder="主持人称呼" value="主持人">
  <div class="row">队伍数 <input id="teamCount" type="number" min="2" max="8" value="2" style="width:70px"></div>
  <button id="createBtn">创建房间</button>
  <button class="ghost" id="resumeBtn">恢复上次房间</button>
</div>
<div id="app" style="display:none">
  <div class="topbar"><div id="phaseTitle"></div><div class="timer" id="timer">--:--</div></div>
  <div id="view"></div>
</div>
<script src="/socket.io/socket.io.js"></script>
<script type="module" src="/host/host.js"></script>
</body></html>
```

- [ ] **Step 2: 写 public/host/host.js**

```js
// public/host/host.js
const socket = io();
const HOST_KEY = 'ke_host_auth';
let S = null;

const ROLE = { GENERATION: '发电', GRID: '电网', EV: '汽车', BUILDING: '建筑', MATERIAL: '材料', NDRC: '发改', MAYOR: '城长', ACTUARY: '精算' };
const STD = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'MAYOR'];
const STATE_TXT = { locked: '✅', draft: '💭', passed: '🚫', empty: '—' };
const EVENTS = { green_bond: '专项绿色国债', research_breakthrough: '产学研大突破', green_consumption: '绿色消费潮', cold_wave: '极寒无风寒潮', price_surge: '现货电价暴涨', pioneer_cert: '零碳城市先锋认证' };
const PHASE_TXT = { LOBBY: '等待加入', GOAL_PICK: '目标卡选择', R1_PLAN: '第1轮 · 规划', R1_SETTLE: '第1轮 · 结算', R2_PLAN: '第2轮 · 规划', R2_SETTLE: '终局结算', FINISHED: '终局颁奖' };
const emit = (ev, payload = {}) => new Promise(res => socket.emit(ev, payload, res));

document.getElementById('createBtn').onclick = () => {
  socket.emit('room:create', { hostName: document.getElementById('hostName').value, teamCount: +document.getElementById('teamCount').value }, (res) => {
    if (!res.ok) return alert(res.reason);
    localStorage.setItem(HOST_KEY, JSON.stringify({ code: res.code, token: res.token }));
  });
};
document.getElementById('resumeBtn').onclick = resume;
function resume() {
  const auth = JSON.parse(localStorage.getItem(HOST_KEY) ?? 'null');
  if (auth) socket.emit('room:resume', auth, (res) => { if (!res.ok) { localStorage.removeItem(HOST_KEY); alert(res.reason); } });
}
socket.on('connect', resume);

socket.on('state:sync', (s) => {
  S = s;
  if (!S?.isHost) return;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = '';
  render();
});
socket.on('timer:tick', ({ remaining, warning }) => {
  const m = Math.floor(remaining / 60000), s = Math.floor(remaining % 60000 / 1000);
  const el = document.getElementById('timer');
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warn', !!warning);
});
socket.on('dice:result', ({ teamId, roleId, value, success }) => {
  const box = document.getElementById(`dice-${teamId}`);
  if (!box) return;
  box.innerHTML = '<span class="dice rolling">🎲</span>';
  setTimeout(() => { box.innerHTML = `<span class="dice">🎲${value}</span> <small>${ROLE[roleId]} ${success ? '成功' : '未达标'}</small>`; }, 1300);
});
socket.on('settle:step', ({ teamId, step }) => {
  const box = document.getElementById(`steps-${teamId}`);
  if (box) box.insertAdjacentHTML('beforeend', `<div><b>${step.label}</b>：${step.text}</div>`);
});
socket.on('ranking:update', (r) => { if (S) { S.ranking = r; render(); } });

const nextLabel = () => ({ GOAL_PICK: '进入第1轮规划', R1_PLAN: '开始第1轮结算', R1_SETTLE: '进入第2轮规划', R2_PLAN: '终局结算' }[S.phase] ?? null);

function render() {
  document.getElementById('phaseTitle').textContent = `房间 ${S.code} · ${PHASE_TXT[S.phase]}`;
  const v = document.getElementById('view');
  if (S.phase === 'LOBBY') v.innerHTML = lobbyView();
  else if (S.phase === 'GOAL_PICK') v.innerHTML = `<div class="card"><b>各队目标卡选定情况（内容保密）</b>${
      S.teams.map(t => `<div>${t.name}：${t.goalKeptShown ? '✅ 已拍板' : '⏳ 待城长选择'}</div>`).join('')}
      ${nextLabel() ? `<button id="nextBtn">${nextLabel()}</button>` : ''}</div>${bindNext()}`;
  else if (S.phase === 'R1_PLAN' || S.phase === 'R2_PLAN') v.innerHTML = planView();
  else if (S.phase === 'R1_SETTLE' || S.phase === 'R2_SETTLE') v.innerHTML = settleView();
  else v.innerHTML = finalView();
  bindNext();
}

function lobbyView() {
  const url = `${location.origin}/`;
  const filled = (t) => STD.filter(r => t.members.some(m => m.roleId === r)).length;
  return `<div class="card row"><h1>房间码 ${S.code}</h1>
      <img class="qr" src="/qr.svg?d=${encodeURIComponent(url)}" width="180" height="180">
      <div>玩家访问 <b>${url}</b><br>输入房间码 <b>${S.code}</b></div></div>
    <div class="card"><b>队伍 · 角色（每队需7个标准角色）</b>
      ${S.teams.map(t => `<div>${t.name}（${filled(t)}/7）：${t.members.map(m => `${ROLE[m.roleId] ?? '?'}·${m.name}`).join('　') || '暂无人'}</div>`).join('')}
      <div class="row" style="margin-top:8px">
        <button style="width:auto" id="startBtn">开始游戏（发目标卡）</button>
        <button class="ghost" style="width:auto" id="forceBtn">缺员强制开始</button>
      </div></div>`;
}

function planView() {
  return `<div class="card"><b>事件卡（全场相同）</b>：${EVENTS[S.teams[0]?.eventCard] ?? '—'}</div>
  <div class="card"><b>全场进度（不显示队伍决策内容）</b>
    <table><tr><th>队伍</th>${STD.map(r => `<th>${ROLE[r]}</th>`).join('')}</tr>
    ${S.teams.map(t => `<tr><td>${t.name}</td>${STD.map(r => `<td style="text-align:center">${STATE_TXT[t.progress?.[r] ?? 'empty']}</td>`).join('')}</tr>`).join('')}
    </table><p class="muted">✅已锁定　💭考虑中　🚫放弃　—未选择</p></div>
  <div class="card"><div class="row">
    <button style="width:auto" id="nextBtn">${nextLabel()}</button>
    <span class="muted">若结算被违规拦截，下方逐个处理</span></div>
    <div id="violationBox"></div></div>`;
}

function settleView() {
  return `<div class="grid2">${S.teams.map(t => `<div class="card"><b>${t.name}</b>
    <div id="dice-${t.id}">🎲</div><div id="steps-${t.id}"></div></div>`).join('')}</div>
    ${S.ranking ? `<div class="card"><b>排行榜</b>${S.ranking.map((r, i) => `<div><span class="badge ${i === 0 ? 'amber' : ''}">第${i + 1}</span>${r.name} — <b style="font-size:22px">${r.total}</b></div>`).join('')}</div>` : ''}
    ${S.phase === 'R1_SETTLE' ? '<div class="card"><button style="width:auto" id="nextBtn">进入第2轮规划</button></div>' : ''}`;
}

function finalView() {
  const rank = S.ranking ?? [];
  const heights = { 0: 170, 1: 130, 2: 100 };
  const order = [rank[1], rank[0], rank[2]].filter(Boolean);
  return `<div class="podium">${order.map((r) => {
    const idx = rank.indexOf(r);
    return `<div style="text-align:center"><div class="bar" style="height:${heights[idx] ?? 90}px">${r.total}</div>${idx === 0 ? '🏆 ' : ''}${r.name}</div>`;
  }).join('')}</div>
  <div class="card"><table><tr><th>队伍</th>${Object.values(ROLE).map(n => `<th>${n}</th>`).join('')}<th>总分</th><th>目标卡</th></tr>
    ${S.teams.map(t => `<tr><td>${t.name}</td>${['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'ACTUARY'].map(k => `<td>${t.settlement?.individual?.[k] ?? '—'}</td>`).join('')}
      <td><b>${t.settlement?.teamTotal ?? '—'}</b></td><td>${t.goalAchieved ? '✓达成' : t.goalKeptShown ? '✗' : '未选'}</td></tr>`).join('')}
  </table></div>
  <div class="card row">
    <a href="/export/${S.code}.json"><button style="width:auto">导出 JSON</button></a>
    <a href="/export/${S.code}.csv"><button style="width:auto">导出 CSV</button></a>
  </div>`;
}

function bindNext() {
  const nb = document.getElementById('nextBtn');
  if (nb) nb.onclick = async () => {
    const res = await emit('phase:next');
    if (!res.ok && res.violations) {
      document.getElementById('violationBox').innerHTML = `<div class="card"><b>${res.teamName} 存在违规，无法结算</b>
        ${res.violations.map(x => `<div class="row">${x.roleId === '*' ? '全队' : ROLE[x.roleId] ?? x.roleId}：${x.reason}
          ${x.roleId !== '*' ? `<button class="danger" style="width:auto" data-fp="${res.teamId}:${x.roleId}">强制放弃</button>` : ''}</div>`).join('')}</div>`;
      document.querySelectorAll('[data-fp]').forEach(b => b.onclick = async () => {
        const [teamId, roleId] = b.dataset.fp.split(':');
        await emit('force:pass', { teamId, roleId });
        b.onclick(null);
      });
    } else if (!res.ok) alert(res.reason);
  };
  const sb = document.getElementById('startBtn');
  if (sb) sb.onclick = async () => { const r = await emit('game:start', { force: false }); if (!r.ok) alert(r.reason); };
  const fb = document.getElementById('forceBtn');
  if (fb) fb.onclick = async () => { const r = await emit('game:start', { force: true }); if (!r.ok) alert(r.reason); };
}
```

- [ ] **Step 3: 手动验证（大屏视口 + 双手机视口）**

Run: `node server.js`
1. `/host/` 建房 → 确认房间码与二维码显示、手机可扫码加入。
2. 两个手机视口加入并分派两队角色；主持人开始 → 选卡 → 规划（确认大屏只显示进度✅/💭/🚫，不显示草案）。
3. 主持人结算：确认骰子动画 → 各队步骤流 → 排行榜；进入第 2 轮 → 终局：颁奖台 + 导出链接可用。
Expected: 全流程顺畅，大屏无队伍草案信息。

- [ ] **Step 4: Commit**

```bash
git add public/host/
git commit -m "feat: 主持人大屏（建房/二维码/进度矩阵/结算轮播/颁奖/导出）"
```

---

### Task 12: 端到端剧本验收（含崩溃恢复与导出）

**Files:**
- Test: `tests/acceptance.test.js`

**Interfaces:**
- Consumes: Task 2–9、11 的全部能力。

- [ ] **Step 1: 写端到端剧本测试**

```js
// tests/acceptance.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, assign } from '../src/game/rooms.js';
import { STANDARD_ROLES } from '../src/game/constants.js';
import { startGame, pickGoal, advance, rank } from '../src/game/state.js';
import { applySelection, lockAction } from '../src/game/engine.js';
import { saveSnapshot, loadSnapshot, exportResult } from '../src/persistence.js';

function fullRoom() {
  const room = createRoom('主持人', 2);
  for (const role of STANDARD_ROLES) assign(room, joinRoom(room, `p-${role}`).token, 't1', role);
  room._rng = () => 5;
  return room;
}
const R1 = [['GENERATION', ['solar_pv']], ['GRID', ['flex_dispatch']], ['EV', ['ev_mass_produce']],
  ['BUILDING', ['bldg_retrofit']], ['MATERIAL', ['mat_pv_material']], ['NDRC', ['ndrc_investment']]];
const R2 = [['GENERATION', ['offshore_wind']], ['GRID', ['grid_expand']], ['EV', ['ev_v2g']],
  ['BUILDING', ['bldg_zero_carbon']], ['MATERIAL', ['mat_green_material']], ['NDRC', ['ndrc_capacity_price']]];

function playRound(room, round, event, list) {
  const t = room.teams[0];
  t.eventCards[round] = event;
  for (const [role, ids] of list) assert.equal(applySelection(t, round, role, ids).ok, true, `${round}/${role}`);
  for (const role of STANDARD_ROLES) assert.equal(lockAction(t, round, role).ok, true, `lock ${role}`);
  const r = advance(room);
  assert.equal(r.ok, true, JSON.stringify(r));
}

test('完整两轮剧本：终局56分、排名正确、快照恢复后重放一致、CSV可导出', () => {
  const room = fullRoom();
  assert.equal(startGame(room).ok, true);
  pickGoal(room, 't1', room.teams[0].goalCards[0]);
  assert.equal(advance(room).ok, true);            // → R1_PLAN
  playRound(room, 'r1', 'green_bond', R1);          // → R1_SETTLE（含掷骰与结算）
  assert.equal(room.teams[0].settlement.r1.fundsEnd, 75);

  // 崩溃恢复：此刻快照，从磁盘载入后继续推进R2
  saveSnapshot(room);
  const restored = loadSnapshot(room.code);
  assert.equal(restored.teams[0].settlement.r1.stored, 1);
  restored._rng = room._rng;                        // 随机函数不可序列化，重注入

  assert.equal(advance(restored).ok, true);         // → R2_PLAN
  playRound(restored, 'r2', 'price_surge', R2);     // → FINISHED
  assert.equal(restored.phase, 'FINISHED');
  assert.deepEqual(restored.teams[0].settlement.individual, {
    GENERATION: 23, GRID: 7, EV: 9, BUILDING: 6, MATERIAL: 4, NDRC: 16, ACTUARY: 16,
  });
  assert.equal(restored.teams[0].settlement.teamTotal, 56);
  assert.equal(rank(restored.teams)[0].teamId, 't1');

  const { csv } = exportResult(restored);
  assert.ok(csv.includes('56'));
});
```

- [ ] **Step 2: 全量测试回归**

Run: `npm test`
Expected: 全部 PASS（9 个测试文件）

- [ ] **Step 3: 真机验收（3 窗口完整对局）**

Run: `node server.js`
1. `http://localhost:3000/host/` 建房（2 队）；用两个手机（或 DevTools 手机视口）各加入 7 人分派两队角色。
2. 完整走完：目标卡 → R1 规划（故意触发一次"超支"与"超输配上限"验证拦截与特批/换行动解法）→ R1 结算核对明细 → R2 → 终局颁奖。
3. 手工按规则文档复算其中一队终局总分，与软件一致。
4. 中途刷新玩家页面验证断线重连；`Ctrl+C` 重启服务后在主持台"恢复上次房间"验证快照恢复。
Expected: 全部通过；导出的 JSON/CSV 可打开且数字正确。

- [ ] **Step 4: Commit**

```bash
git add tests/acceptance.test.js
git commit -m "test: 端到端剧本验收（金标准56分/崩溃恢复/CSV导出）"
```

---

## 计划自审记录

- **Spec 覆盖**：spec §3 全部规则（20行动/6事件/6目标卡/掷骰/结算/个人分/团队分）→ Task 1–7；§4 架构 → Task 1/9；§5 流程 → Task 9；§6 协议与可见性 → Task 9/10/11；§7 数据模型 → Task 1/8；§8 界面 → Task 10/11；§9 错误处理 → Task 9（重连/快照/服务端时间）；§10 测试 → 各任务 + Task 12；§11 决策 A1–A8 → Task 3–6 对应实现与测试。
- **无占位符**：所有步骤含完整代码或明确命令。
- **类型一致性**：`team/room/detail` 字段名在各任务 Interfaces 处对齐（`actualByRole`、`storageCap`、`fundsEnd`、`goalKeptShown`、`progress` 等）；前后端共用 `ROLE/STATE_TXT/EVENTS` 口径一致。

