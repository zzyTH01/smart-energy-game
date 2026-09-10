const socket = io();

document.getElementById('joinBtn').addEventListener('click', () => {
  const code = document.getElementById('code').value.trim();
  const name = document.getElementById('name').value.trim();
  if (!/^\d{4}$/.test(code)) return alert('请输入4位房间码');
  if (!name) return alert('请填写昵称');
  socket.emit('room:join', { code, name }, (result) => {
    if (!result.ok) return alert(result.reason);
    sessionStorage.setItem('ke_auth', JSON.stringify({ code, token: result.token }));
    location.href = '/play/';
  });
});
