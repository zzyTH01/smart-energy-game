const socket = io();
const auth = JSON.parse(sessionStorage.getItem('ke_auth') ?? 'null');
let state = null;
let selected = [];
let diceText = '';
let steps = [];

const ROLES = {
  GENERATION: '发电企业',
  GRID: '电网企业',
  EV: '汽车企业',
  BUILDING: '建筑企业',
  MATERIAL: '材料企业',
  NDRC: '发改委',
  MAYOR: '城长',
  ACTUARY: '精算师',
};
const ASSIGNABLE = [...Object.keys(ROLES)];
const STATUS = { locked: '已锁定', draft: '考虑中', passed: '已放弃', empty: '未选择' };
const EVENTS = {
  green_bond: ['专项绿色国债', '本轮初始资金提升至125'],
  research_breakthrough: ['产学研大突破', '材料研发免费，且可同时执行2项研发'],
  green_consumption: ['绿色消费潮', '汽车与建筑项目成本各减免10'],
  cold_wave: ['极寒无风寒潮', '光伏-3（无光伏则风电-3），发电个人分-3；有储能电站+5'],
  price_surge: ['现货电价暴涨', '第1轮储能每点+2分，本轮弃电罚分×4'],
  pioneer_cert: ['零碳城市先锋认证', '两轮盈差均≤2且实施过招商，全队+8'],
};
const GOALS = {
  storage_master: ['储能达人', '累计总储能容量≥6，且储能吸收量≥2'],
  load_pioneer: ['负荷先锋', '两轮实际消耗合计≥15'],
  wind_chaser: ['追风者', '选择深远海风电，且两轮实际消耗合计≥10'],
  windfree_city: ['无风之城', '全程未选风电，两轮总绿电≥10且弃电量为0'],
  garden_city: ['花园城市', '执行地标级零碳综合体，且每轮弃电量均≤2'],
  funds_steward: ['资金管家', '第2轮结余资金≥70'],
};
const emit = (event, payload = {}) => new Promise((resolve) => {
  socket.emit(event, payload, resolve);
});

socket.on('connect', () => {
  if (!auth) location.href = '/';
  else socket.emit('room:resume', auth, (result) => {
    if (!result.ok) location.href = '/';
  });
});

socket.on('state:sync', (data) => {
  state = data;
  const own = state.teams.find((team) => team.id === state.you?.teamId);
  const round = state.phase === 'R1_PLAN' ? 'r1' : 'r2';
  const record = own?.detail?.selections?.[state.you.roleId];
  selected = record?.actionIds ?? [];
  if (!isPlanning(state.phase)) {
    diceText = '';
    steps = [];
  }
  render();
});

socket.on('timer:tick', ({ remaining, warning }) => {
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor(remaining % 60000 / 1000);
  const timer = document.getElementById('timer');
  timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  timer.classList.toggle('warn', !!warning);
});

socket.on('alert', ({ message }) => alert(message));

socket.on('dice:result', ({ teamId, roleId, value, success }) => {
  if (state?.you?.teamId !== teamId) return;
  diceText = `${ROLES[roleId]}骰子 ${value} 点 · ${success ? '成功' : '未达标'}`;
  render();
});

socket.on('settle:step', ({ teamId, step }) => {
  if (state?.you?.teamId !== teamId) return;
  steps.push(step);
  render();
});

const isPlanning = (phase) => phase === 'R1_PLAN' || phase === 'R2_PLAN';
const myTeam = () => state?.teams.find((team) => team.id === state.you?.teamId) ?? null;

function lobbyView() {
  return `<div class="card"><b>选择队伍和角色</b><p class="muted">每队7个标准角色，第8人可担任精算师。</p>
    ${state.teams.map((team) => `<div class="card" style="margin:8px 0"><b>${team.name}</b>
      <div class="row">${ASSIGNABLE.map((role) => {
        const member = state.players.find((player) => player.teamId === team.id && player.roleId === role);
        const own = member?.id === state.you.id;
        return `<button class="compact ${own ? '' : 'ghost'}" data-assign="${team.id}:${role}" ${member && !own ? 'disabled' : ''}>
          ${ROLES[role]}${member ? ` · ${own ? '你' : member.name}` : ''}
        </button>`;
      }).join('')}</div></div>`).join('')}</div>`;
}

function goalView() {
  const team = myTeam();
  const isMayor = state.you.roleId === 'MAYOR';
  const candidates = (team.goalCards ?? []).map((id) => {
    const goal = GOALS[id] ?? [id, ''];
    const kept = team.goalKept === id;
    return `<div class="card" style="margin:8px 0"><b>${goal[0]}</b><p class="muted">${goal[1]}</p>
      ${isMayor && !team.goalKept ? `<button class="compact" data-goal="${id}">保留这张</button>` : `<span class="badge ${kept ? '' : 'amber'}">${kept ? '已保留' : '候选'}</span>`}
    </div>`;
  }).join('');
  if (!isMayor) {
    return `<div class="card"><b>本队城市目标卡（公开）</b>${candidates}
      ${team.goalKept ? '' : '<p class="muted">等待城长在玩家端选择保留一张。</p>'}</div>`;
  }
  return `<div class="card"><b>保留一张城市目标卡</b><p class="muted">两张候选卡全场公开，选择后不可更改。</p>${candidates}</div>`;
}

function actionReason(action, detail) {
  const reasons = [];
  const round = detail.round;
  const current = detail.selections[state.you.roleId];
  if (current?.locked) return ['本角色行动已锁定'];
  if (!current?.passed) {
    const count = round === 'r2'
      ? 1 + (state.you.roleId === 'MATERIAL' && myTeam()?.eventCard === 'research_breakthrough' ? 1 : 0)
      : 1;
    if (!current && selected.length > count) reasons.push(`最多选择${count}项`);
  }
  if ((action.consume ?? 0) > detail.transCap) reasons.push(`需电${action.consume}点，超输配上限${detail.transCap}点`);
  if ((action.cost?.funds ?? 0) > detail.fundsEnd + 5) reasons.push(`基础资金${action.cost.funds}，当前结余${detail.fundsEnd}`);
  return reasons;
}

function planningView() {
  const team = myTeam();
  const detail = team.detail;
  const role = state.you.roleId;
  const ownRecord = detail.selections[role] ?? { actionIds: [], locked: false, passed: false };
  const actions = detail.catalog[role] ?? [];
  const approval = detail.approval;
  return `${eventBanner()}
    <div class="card"><b>${team.name} · ${ROLES[role]}</b>
      <div class="row"><span class="badge">资金结余 ${detail.fundsEnd}</span><span class="badge">输配上限 ${detail.transCap}</span>
      ${approval ? `<span class="badge amber">已特批</span>` : ''}</div>
      ${role === 'MAYOR' ? '<p class="muted">城长无行动卡，可给本队特批或声明放弃。</p>' : ''}
      ${ownRecord.passed ? '<p class="muted">本角色本轮已放弃。</p>' : actions.map((action) => {
        const reasons = actionReason(action, detail);
        const disabled = !!ownRecord.locked || ownRecord.passed || reasons.length > 0;
        return `<button class="action ${selected.includes(action.id) ? 'selected' : ''} ${disabled ? 'disabled' : ''}"
          data-action="${action.id}" ${disabled ? 'disabled' : ''}>
          <b>${action.name}</b><small>${action.desc}</small>
          <small>资金${action.cost?.funds ?? 0} · 土地${action.cost?.land ?? 0}${action.consume ? ` · 耗电${action.consume}` : ''}</small>
          ${reasons.length ? `<span class="reason">${reasons.join('；')}</span>` : ''}
        </button>`;
      }).join('')}
      <div class="row"><button class="compact" id="lockBtn" ${ownRecord.locked || ownRecord.passed ? 'disabled' : ''}>锁定行动</button>
      <button class="compact ghost" id="passBtn" ${ownRecord.locked ? 'disabled' : ''}>放弃行动</button></div>
      ${role === 'MAYOR' && !approval ? `<div class="row"><button class="compact ghost" id="overdraftBtn">特批超支5以内</button>
      <button class="compact ghost" id="reduceBtn" ${!selected.length ? 'disabled' : ''}>减免所选行动5资金</button></div>` : ''}
    </div>`;
}

function eventBanner() {
  const team = myTeam();
  const event = EVENTS[team?.eventCard];
  return event ? `<div class="card" style="border-color:#e8a013"><b>突发事件：${event[0]}</b><p class="muted">${event[1]}</p></div>` : '';
}

function settleView() {
  const team = myTeam();
  const detail = team.settlement?.r1 ?? team.settlement?.r2;
  return `<div class="card"><b>结算结果</b>${diceText ? `<p class="dice">${diceText}</p>` : ''}
    <div id="stepsBox" class="steps">${steps.map((step) => `<div><b>${step.label}</b>：${step.text}</div>`).join('')}
    ${detail ? detail.steps.map((step) => `<div><b>${step.label}</b>：${step.text}</div>`).join('') : ''}</div></div>
    ${rankingView()}`;
}

function rankingView() {
  if (!state.ranking) return '';
  return `<div class="card"><b>排行榜</b>${state.ranking.map((item, index) => `
    <div class="row"><span class="badge ${index === 0 ? 'amber' : ''}">第${index + 1}</span>
    <span>${item.name}</span><b>${item.total}</b></div>`).join('')}</div>`;
}

function finalView() {
  const team = myTeam();
  const individual = team.settlement.individual ?? {};
  return `<div class="card"><b>终局成绩</b><p>团队总分 <b style="font-size:28px">${team.settlement.teamTotal}</b></p>
    <table><tbody>${Object.entries(individual).map(([role, score]) => `<tr><td>${ROLES[role]}</td><td>${score}</td></tr>`).join('')}</tbody></table>
    <p class="muted">目标卡：${team.goalKept ? `${GOALS[team.goalKept]?.[0] ?? team.goalKept} ${team.goalAchieved ? '达成' : '未达成'}` : '未选'}；额外分：${(team.settlement.extraBonus ?? []).map((item) => `${item.reason}+${item.points}`).join('，') || '无'}</p></div>
    ${rankingView()}`;
}

function render() {
  if (!state) return;
  document.getElementById('meTitle').textContent = `${state.you?.name ?? '未加入'} · ${ROLES[state.you?.roleId] ?? '未分配'}`;
  const app = document.getElementById('app');
  if (!state.you.teamId || !state.you.roleId) app.innerHTML = lobbyView();
  else if (state.phase === 'GOAL_PICK') app.innerHTML = goalView();
  else if (isPlanning(state.phase)) app.innerHTML = planningView();
  else if (state.phase === 'R1_SETTLE' || state.phase === 'R2_SETTLE') app.innerHTML = settleView();
  else if (state.phase === 'FINISHED') app.innerHTML = finalView();
  else app.innerHTML = '<div class="card">等待主持人开始。</div>';
  bind();
}

function bind() {
  document.querySelectorAll('[data-assign]').forEach((button) => button.addEventListener('click', async () => {
    const [teamId, roleId] = button.dataset.assign.split(':');
    const result = await emit('team:assign', { teamId, roleId });
    if (!result.ok) alert(result.reason);
  }));
  document.querySelectorAll('[data-goal]').forEach((button) => button.addEventListener('click', async () => {
    const result = await emit('goal:pick', { goalId: button.dataset.goal });
    if (!result.ok) alert(result.reason);
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.action;
    const isMaterialDouble = state.you.roleId === 'MATERIAL'
      && myTeam()?.eventCard === 'research_breakthrough';
    selected = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : (isMaterialDouble && selected.length === 1 ? [selected[0], id] : [id]);
    render();
  }));
  document.getElementById('lockBtn')?.addEventListener('click', async () => {
    const result = selected.length ? await emit('action:select', { actionIds: selected }) : { ok: true };
    if (!result.ok) return alert(result.reason);
    const locked = await emit('action:lock');
    if (!locked.ok) alert(locked.reason);
  });
  document.getElementById('passBtn')?.addEventListener('click', async () => {
    const result = await emit('action:pass');
    if (!result.ok) alert(result.reason);
  });
  document.getElementById('overdraftBtn')?.addEventListener('click', async () => {
    const result = await emit('approval:grant', { type: 'OVERDRAFT5' });
    if (!result.ok) alert(result.reason);
  });
  document.getElementById('reduceBtn')?.addEventListener('click', async () => {
    const result = await emit('approval:grant', { type: 'REDUCE5', actionId: selected[0] });
    if (!result.ok) alert(result.reason);
  });
}
