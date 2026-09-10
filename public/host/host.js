const socket = io();
let state = null;
const HOST_KEY = 'ke_host_auth';

const ROLES = {
  GENERATION: '发电', GRID: '电网', EV: '汽车', BUILDING: '建筑',
  MATERIAL: '材料', NDRC: '发改', MAYOR: '城长', ACTUARY: '精算',
};
const STANDARD = ['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'MAYOR'];
const STATUS = { locked: '锁定', draft: '考虑', passed: '放弃', empty: '—' };
const EVENTS = {
  green_bond: '专项绿色国债',
  research_breakthrough: '产学研大突破',
  green_consumption: '绿色消费潮',
  cold_wave: '极寒无风寒潮',
  price_surge: '现货电价暴涨',
  pioneer_cert: '零碳城市先锋认证',
};
const GOALS = {
  storage_master: '储能达人',
  load_pioneer: '负荷先锋',
  wind_chaser: '追风者',
  windfree_city: '无风之城',
  garden_city: '花园城市',
  funds_steward: '资金管家',
};
const PHASES = {
  LOBBY: '等待加入', GOAL_PICK: '目标卡选择', R1_PLAN: '第1轮 · 规划',
  R1_SETTLE: '第1轮 · 结算', R2_PLAN: '第2轮 · 规划', R2_SETTLE: '终局结算', FINISHED: '终局颁奖',
};
const emit = (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));

function createRoom() {
  socket.emit('room:create', {
    hostName: document.getElementById('hostName').value,
    teamCount: Number(document.getElementById('teamCount').value),
  }, (result) => {
    if (!result.ok) return alert(result.reason);
    localStorage.setItem(HOST_KEY, JSON.stringify({ code: result.code, token: result.token }));
  });
}

document.getElementById('createBtn').addEventListener('click', createRoom);
document.getElementById('newRoomBtn').addEventListener('click', () => {
  localStorage.removeItem(HOST_KEY);
  document.getElementById('setup').style.display = '';
  document.getElementById('app').style.display = 'none';
});

document.getElementById('resumeBtn').addEventListener('click', resume);

function resume() {
  const auth = JSON.parse(localStorage.getItem(HOST_KEY) ?? 'null');
  if (auth) socket.emit('room:resume', auth, (result) => {
    if (!result.ok) {
      localStorage.removeItem(HOST_KEY);
      alert(result.reason);
    }
  });
}

socket.on('connect', resume);

socket.on('state:sync', (data) => {
  state = data;
  if (!state?.isHost) return;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('app').style.display = '';
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
  const box = document.getElementById(`dice-${teamId}`);
  if (!box) return;
  box.innerHTML = `<span class="dice rolling">0</span>`;
  setTimeout(() => {
    box.innerHTML = `<span class="dice">${value}</span><small>${ROLES[roleId]} ${success ? '成功' : '未达标'}</small>`;
  }, 1300);
});

socket.on('settle:step', ({ teamId, step }) => {
  const box = document.getElementById(`steps-${teamId}`);
  if (box) box.insertAdjacentHTML('beforeend', `<div><b>${step.label}</b>：${step.text}</div>`);
});

socket.on('ranking:update', (ranking) => {
  if (state) {
    state.ranking = ranking;
    render();
  }
});

const nextLabel = () => ({
  GOAL_PICK: '进入第1轮规划',
  R1_PLAN: '开始第1轮结算',
  R1_SETTLE: '进入第2轮规划',
  R2_PLAN: '终局结算',
}[state.phase] ?? null);

function lobbyView() {
  const url = location.origin;
  const filled = (team) => STANDARD.filter((role) => team.members.some((member) => member.roleId === role)).length;
  const assigned = (team) => team.members.length;
  return `<div class="card row"><div><small>玩家访问</small><h1>${url}</h1><p>房间码 <b style="font-size:38px">${state.code}</b></p></div>
    <img class="qr" src="/qr.svg?d=${encodeURIComponent(url)}" width="180" height="180" alt="加入二维码"></div>
    <div class="card"><div class="row"><b>队伍 · 角色</b>
      <button class="compact ghost" id="addTeamBtn" ${state.teams.length >= 8 ? 'disabled' : ''}>添加队伍</button>
      <span class="muted">${state.teams.length}/8 队</span></div>
      ${state.teams.map((team) => `<p><b>${team.name}</b>
        <span class="badge">已分配 ${assigned(team)}/8</span>
        <span class="badge ${filled(team) === 7 ? '' : 'amber'}">标准角色 ${filled(team)}/7</span>
        <button class="compact danger" data-remove-team="${team.id}"
          ${state.teams.length <= 2 || assigned(team) > 0 ? 'disabled' : ''}>移除</button><br>
      ${team.members.map((member) => `${ROLES[member.roleId] ?? '未分配'}·${member.name}`).join('　') || '暂无人'}</p>`).join('')}
      <div class="row"><button class="compact" id="startBtn">开始游戏</button>
      <button class="compact ghost" id="forceStartBtn">缺员强制开始</button></div></div>`;
}

function planView() {
  return `<div class="card"><b>事件卡（全场相同）</b>：${EVENTS[state.teams[0]?.eventCard] ?? '—'}</div>
    <div class="card"><b>全场进度</b><table><thead><tr><th>队伍</th>${STANDARD.map((role) => `<th>${ROLES[role]}</th>`).join('')}</tr></thead>
    <tbody>${state.teams.map((team) => `<tr><td>${team.name}</td>${STANDARD.map((role) => `<td>${STATUS[team.progress?.[role] ?? 'empty']}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted">大屏不显示队伍决策内容。</p></div>
    <div class="card"><div class="row"><button class="compact" id="nextBtn">${nextLabel()}</button></div><div id="violationBox"></div></div>`;
}

function settleView() {
  return `<div class="grid2">${state.teams.map((team) => `<div class="card"><b>${team.name}</b>
    <div id="dice-${team.id}"></div><div id="steps-${team.id}" class="steps"></div></div>`).join('')}</div>
    ${rankingView()}
    ${state.phase === 'R1_SETTLE' ? '<div class="card"><button class="compact" id="nextBtn">进入第2轮规划</button></div>' : ''}`;
}

function rankingView() {
  if (!state.ranking) return '';
  return `<div class="card"><b>排行榜</b>${state.ranking.map((item, index) => `
    <div class="row"><span class="badge ${index === 0 ? 'amber' : ''}">第${index + 1}</span>
    <span>${item.name}</span><b>${item.total}</b></div>`).join('')}</div>`;
}

function finalView() {
  const ranking = state.ranking ?? [];
  const heights = [170, 130, 100];
  const order = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  return `<div class="podium">${order.map((item) => {
    const index = ranking.indexOf(item);
    return `<div><div class="bar" style="height:${heights[index] ?? 90}px">${item.total}</div>${item.name}</div>`;
  }).join('')}</div>
  <div class="card"><table><thead><tr><th>队伍</th><th>发电</th><th>电网</th><th>汽车</th><th>建筑</th><th>材料</th><th>发改</th><th>精算</th><th>总分</th><th>目标</th></tr></thead>
  <tbody>${state.teams.map((team) => `<tr><td>${team.name}</td>
    ${['GENERATION', 'GRID', 'EV', 'BUILDING', 'MATERIAL', 'NDRC', 'ACTUARY'].map((role) => `<td>${team.settlement?.individual?.[role] ?? '—'}</td>`).join('')}
    <td><b>${team.settlement?.teamTotal ?? '—'}</b></td><td>${team.goalKept ? `${GOALS[team.goalKept] ?? team.goalKept} ${team.goalAchieved ? '达成' : '未达成'}` : '未选'}</td></tr>`).join('')}</tbody></table></div>
  <div class="card row"><a href="/export/${state.code}.json"><button class="compact">导出 JSON</button></a>
  <a href="/export/${state.code}.csv"><button class="compact">导出 CSV</button></a></div>`;
}

function render() {
  document.getElementById('phaseTitle').textContent = `房间 ${state.code} · ${PHASES[state.phase]}`;
  const view = document.getElementById('view');
  if (state.phase === 'LOBBY') view.innerHTML = lobbyView();
  else if (state.phase === 'GOAL_PICK') view.innerHTML = `<div class="card"><b>城市目标卡（全场公开）</b>
    ${state.teams.map((team) => `<div><b>${team.name}</b>：${(team.goalCards ?? []).map((id) => GOALS[id] ?? id).join('、')}
      <span class="badge ${team.goalKept ? '' : 'amber'}">${team.goalKept ? `已保留 ${GOALS[team.goalKept] ?? team.goalKept}` : '待城长在玩家端选择'}</span></div>`).join('')}
    <button class="compact" id="nextBtn">${nextLabel()}</button></div>`;
  else if (state.phase === 'R1_PLAN' || state.phase === 'R2_PLAN') view.innerHTML = planView();
  else if (state.phase === 'R1_SETTLE' || state.phase === 'R2_SETTLE') view.innerHTML = settleView();
  else view.innerHTML = finalView();
  bind();
}

function bind() {
  document.getElementById('addTeamBtn')?.addEventListener('click', async () => {
    const result = await emit('team:add');
    if (!result.ok) alert(result.reason);
  });
  document.querySelectorAll('[data-remove-team]').forEach((button) => button.addEventListener('click', async () => {
    const result = await emit('team:remove', { teamId: button.dataset.removeTeam });
    if (!result.ok) alert(result.reason);
  }));
  document.getElementById('startBtn')?.addEventListener('click', async () => {
    const result = await emit('game:start');
    if (!result.ok) alert(result.reason);
  });
  document.getElementById('forceStartBtn')?.addEventListener('click', async () => {
    await emit('game:start', { force: true });
  });
  document.getElementById('nextBtn')?.addEventListener('click', async () => {
    const result = await emit('phase:next');
    if (!result.ok) {
      if (result.violations) showViolations(result);
      else alert(result.reason);
    }
  });
}

function showViolations(result) {
  document.getElementById('violationBox').innerHTML = `<div class="card"><b>${result.teamName} 存在违规</b>
    ${result.violations.map((item) => `<div class="row">${item.roleId === '*' ? '全队' : ROLES[item.roleId] ?? item.roleId}：${item.reason}
      ${item.roleId !== '*' ? `<button class="compact danger" data-fp="${result.teamId}:${item.roleId}">强制放弃</button>` : ''}</div>`).join('')}</div>`;
  document.querySelectorAll('[data-fp]').forEach((button) => button.addEventListener('click', async () => {
    const [teamId, roleId] = button.dataset.fp.split(':');
    const response = await emit('force:pass', { teamId, roleId });
    if (response.ok) {
      document.getElementById('violationBox').innerHTML = '';
      const next = await emit('phase:next');
      if (!next.ok && next.violations) showViolations(next);
      else if (!next.ok) alert(next.reason);
    }
  }));
}
