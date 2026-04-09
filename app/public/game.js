const socket = io({ transports: ['polling', 'websocket'] });
let myId = null, gameId = null, opponentName = '', myName = '', phase = 'menu', isMyTurn = false, myHits = 0, enemyHits = 0;
const SHIPS = [
  { id: 'carrier', name: 'Carrier', size: 5, placed: false, positions: [] },
  { id: 'battleship', name: 'Battleship', size: 4, placed: false, positions: [] },
  { id: 'cruiser', name: 'Cruiser', size: 3, placed: false, positions: [] },
  { id: 'submarine', name: 'Submarine', size: 3, placed: false, positions: [] },
  { id: 'destroyer', name: 'Destroyer', size: 2, placed: false, positions: [] },
];
let selectedShipIndex = -1, isHorizontal = true;
let placementBoard = Array(10).fill(null).map(() => Array(10).fill(null));
const enemySunkShips = new Set(), mySunkShips = new Set();
const screens = { menu: document.getElementById('menu-screen'), placement: document.getElementById('placement-screen'), battle: document.getElementById('battle-screen'), gameover: document.getElementById('gameover-screen') };

function showScreen(name) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[name].classList.add('active'); phase = name; }
function getName() { const n = document.getElementById('player-name').value.trim(); return n || 'Anonymous Pirate'; }

function buildBoardHTML(boardId) {
  const board = document.getElementById(boardId); board.innerHTML = '';
  const cols = ' ABCDEFGHIJ';
  const corner = document.createElement('div'); corner.className = 'board-corner board-label'; board.appendChild(corner);
  for (let c = 1; c <= 10; c++) { const l = document.createElement('div'); l.className = 'board-label'; l.textContent = cols[c]; board.appendChild(l); }
  for (let r = 0; r < 10; r++) {
    const rl = document.createElement('div'); rl.className = 'board-label'; rl.textContent = r + 1; board.appendChild(rl);
    for (let c = 0; c < 10; c++) { const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c; board.appendChild(cell); }
  }
}

function getCell(boardId, r, c) { return document.getElementById(boardId).children[(r + 1) * 11 + (c + 1)]; }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function addChatMessage(sender, text, type = 'player') {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div'); msg.className = 'chat-msg ' + type;
  msg.innerHTML = sender ? '<span class="sender">' + escapeHtml(sender) + ':</span> ' + escapeHtml(text) : escapeHtml(text);
  container.appendChild(msg); container.scrollTop = container.scrollHeight;
}

function updateShipsStatus() {
  ['enemy-ships-status', 'my-ships-status'].forEach((id, i) => {
    const el = document.getElementById(id); el.innerHTML = '';
    const sunkSet = i === 0 ? enemySunkShips : mySunkShips;
    SHIPS.forEach(ship => { const item = document.createElement('span'); item.className = 'ship-status-item' + (sunkSet.has(ship.id) ? ' sunk' : ''); item.textContent = ship.name + ' (' + ship.size + ')'; el.appendChild(item); });
  });
}

document.getElementById('btn-create').addEventListener('click', () => { myName = getName(); socket.emit('createGame', { name: myName }); });
document.getElementById('btn-random').addEventListener('click', () => { myName = getName(); socket.emit('findRandom', { name: myName }); document.getElementById('waiting-section').classList.remove('hidden'); document.getElementById('btn-random').disabled = true; document.getElementById('btn-create').disabled = true; });
document.getElementById('btn-cancel-search').addEventListener('click', () => { socket.emit('cancelSearch'); document.getElementById('waiting-section').classList.add('hidden'); document.getElementById('btn-random').disabled = false; document.getElementById('btn-create').disabled = false; });
document.getElementById('btn-copy').addEventListener('click', () => { const input = document.getElementById('invite-link'); input.select(); navigator.clipboard.writeText(input.value).then(() => { const btn = document.getElementById('btn-copy'); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); }); });
document.getElementById('btn-play-again').addEventListener('click', () => window.location.reload());

socket.on('gameCreated', (data) => { gameId = data.gameId; myId = data.playerId; document.getElementById('invite-link').value = window.location.origin + '?join=' + gameId; document.getElementById('invite-section').classList.remove('hidden'); document.getElementById('btn-create').disabled = true; document.getElementById('btn-random').disabled = true; });
socket.on('searchCancelled', () => { document.getElementById('waiting-section').classList.add('hidden'); document.getElementById('btn-random').disabled = false; document.getElementById('btn-create').disabled = false; });
socket.on('gameJoined', (data) => { gameId = data.gameId; myId = data.playerId; opponentName = data.opponentName; document.getElementById('opponent-name-placement').textContent = opponentName; initPlacement(); showScreen('placement'); });
socket.on('opponentJoined', (data) => { opponentName = data.opponentName; document.getElementById('opponent-name-placement').textContent = opponentName; initPlacement(); showScreen('placement'); });
socket.on('error', (data) => { const el = document.getElementById('error-message'); el.textContent = data.message; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 5000); });

(function checkJoinParam() {
  const joinId = new URLSearchParams(window.location.search).get('join');
  if (joinId) {
    document.getElementById('btn-create').disabled = true; document.getElementById('btn-random').disabled = true;
    const section = document.getElementById('join-section'); section.innerHTML = '';
    section.appendChild(Object.assign(document.createElement('p'), { textContent: "Ye've been invited to a battle!" }));
    const joinBtn = document.createElement('button'); joinBtn.className = 'pirate-btn';
    joinBtn.innerHTML = '<span class="btn-icon">\u2693</span> Join the Battle!';
    joinBtn.addEventListener('click', () => { myName = getName(); socket.emit('joinGame', { gameId: joinId, name: myName }); });
    section.appendChild(joinBtn); section.classList.remove('hidden');
    document.getElementById('player-name').focus();
  }
})();

function initPlacement() {
  SHIPS.forEach(s => { s.placed = false; s.positions = []; });
  selectedShipIndex = -1; isHorizontal = true;
  placementBoard = Array(10).fill(null).map(() => Array(10).fill(null));
  buildBoardHTML('placement-board'); renderShipList();
  const board = document.getElementById('placement-board');
  board.addEventListener('click', onPlacementBoardClick);
  board.addEventListener('mousemove', onPlacementBoardHover);
  board.addEventListener('mouseleave', clearPreview);
  document.addEventListener('keydown', (e) => { if ((e.key === 'r' || e.key === 'R') && phase === 'placement') isHorizontal = !isHorizontal; });
  document.getElementById('btn-ready').addEventListener('click', onReady);
  document.getElementById('btn-auto-place').addEventListener('click', autoPlace);
  document.getElementById('btn-clear-ships').addEventListener('click', clearAllShips);
}

function renderShipList() {
  const list = document.getElementById('ship-list'); list.innerHTML = '';
  SHIPS.forEach((ship, idx) => {
    const item = document.createElement('div');
    item.className = 'ship-item' + (ship.placed ? ' placed' : '') + (idx === selectedShipIndex ? ' selected' : '');
    item.innerHTML = '<div class="ship-blocks">' + Array(ship.size).fill('<div class="ship-block"></div>').join('') + '</div><span class="ship-name">' + ship.name + ' (' + ship.size + ')</span>';
    if (!ship.placed) item.addEventListener('click', () => { selectedShipIndex = idx; renderShipList(); });
    list.appendChild(item);
  });
  if (selectedShipIndex === -1 || (SHIPS[selectedShipIndex] && SHIPS[selectedShipIndex].placed)) {
    selectedShipIndex = SHIPS.findIndex(s => !s.placed);
    if (selectedShipIndex >= 0) { renderShipList(); return; }
  }
  document.getElementById('btn-ready').disabled = !SHIPS.every(s => s.placed);
}

function getShipPositions(r, c, size, horiz) { const pos = []; for (let i = 0; i < size; i++) pos.push({ r: horiz ? r : r + i, c: horiz ? c + i : c }); return pos; }
function isValidPlacement(pos) { return pos.every(p => p.r >= 0 && p.r < 10 && p.c >= 0 && p.c < 10 && placementBoard[p.r][p.c] === null); }

function onPlacementBoardClick(e) {
  const cell = e.target.closest('.cell'); if (!cell || selectedShipIndex < 0) return;
  const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c), ship = SHIPS[selectedShipIndex];
  if (ship.placed) return;
  const positions = getShipPositions(r, c, ship.size, isHorizontal);
  if (!isValidPlacement(positions)) return;
  positions.forEach(p => { placementBoard[p.r][p.c] = ship.id; getCell('placement-board', p.r, p.c).classList.add('ship'); });
  ship.placed = true; ship.positions = positions; clearPreview(); renderShipList();
}

function onPlacementBoardHover(e) {
  const cell = e.target.closest('.cell'); if (!cell || selectedShipIndex < 0) return;
  clearPreview();
  const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c), ship = SHIPS[selectedShipIndex];
  if (ship.placed) return;
  const positions = getShipPositions(r, c, ship.size, isHorizontal), valid = isValidPlacement(positions);
  positions.forEach(p => { if (p.r >= 0 && p.r < 10 && p.c >= 0 && p.c < 10) { const pc = getCell('placement-board', p.r, p.c); pc.classList.add('ship-preview'); if (!valid) pc.classList.add('invalid'); } });
}

function clearPreview() { document.querySelectorAll('#placement-board .ship-preview').forEach(c => c.classList.remove('ship-preview', 'invalid')); }

function clearAllShips() {
  SHIPS.forEach(s => { s.placed = false; s.positions = []; }); placementBoard = Array(10).fill(null).map(() => Array(10).fill(null)); selectedShipIndex = 0;
  buildBoardHTML('placement-board');
  const board = document.getElementById('placement-board');
  board.addEventListener('click', onPlacementBoardClick); board.addEventListener('mousemove', onPlacementBoardHover); board.addEventListener('mouseleave', clearPreview);
  renderShipList();
}

function autoPlace() {
  clearAllShips();
  SHIPS.forEach(ship => {
    let placed = false, attempts = 0;
    while (!placed && attempts < 200) {
      const horiz = Math.random() > 0.5, r = Math.floor(Math.random() * 10), c = Math.floor(Math.random() * 10);
      const pos = getShipPositions(r, c, ship.size, horiz);
      if (isValidPlacement(pos)) { pos.forEach(p => { placementBoard[p.r][p.c] = ship.id; getCell('placement-board', p.r, p.c).classList.add('ship'); }); ship.placed = true; ship.positions = pos; placed = true; }
      attempts++;
    }
  });
  renderShipList();
}

function onReady() { socket.emit('placeShips', { ships: SHIPS.map(s => ({ id: s.id, positions: s.positions })) }); document.getElementById('btn-ready').disabled = true; document.getElementById('btn-ready').textContent = 'Waiting for opponent...'; }

socket.on('phaseChange', (data) => { if (data.phase === 'battle') initBattle(data); });

function initBattle(data) {
  showScreen('battle'); buildBoardHTML('enemy-board'); buildBoardHTML('my-board');
  SHIPS.forEach(ship => ship.positions.forEach(p => getCell('my-board', p.r, p.c).classList.add('ship')));
  isMyTurn = data.currentTurn === myId; updateTurnIndicator(); updateShipsStatus();
  document.getElementById('enemy-board').addEventListener('click', onEnemyBoardClick);
  document.getElementById('btn-send-chat').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });
  addChatMessage(null, 'Battle stations! The fight begins!', 'system');
}

function updateTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (isMyTurn) { el.textContent = "YOUR TURN - Fire yer cannons!"; el.style.color = 'var(--gold-bright)'; }
  else { el.textContent = opponentName + "'s turn - Brace yerself!"; el.style.color = 'var(--text-muted)'; }
}

function onEnemyBoardClick(e) {
  const cell = e.target.closest('.cell'); if (!cell || !isMyTurn) return;
  const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
  if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;
  socket.emit('fire', { r, c });
}

function sendChat() { const input = document.getElementById('chat-input'), text = input.value.trim(); if (!text) return; socket.emit('chatMessage', { text }); input.value = ''; }

socket.on('fireResult', (data) => {
  const { shooter, shooterName, r, c, result, sunkShip } = data, isMeShooter = shooter === myId;
  if (isMeShooter) { getCell('enemy-board', r, c).classList.add(result); if (result === 'hit') myHits++; }
  else { getCell('my-board', r, c).classList.add(result); if (result === 'hit') enemyHits++; }
  document.getElementById('my-hits').textContent = 'Hits: ' + myHits;
  document.getElementById('enemy-hits').textContent = 'Enemy Hits: ' + enemyHits;
  addChatMessage(null, shooterName + ' fires... ' + (result === 'hit' ? 'HIT' : 'MISS') + '!' + (sunkShip ? ' ' + sunkShip + ' SUNK!' : ''), 'system');
  if (sunkShip) { const st = SHIPS.find(s => s.name === sunkShip); if (st) { (isMeShooter ? enemySunkShips : mySunkShips).add(st.id); updateShipsStatus(); } }
});

socket.on('turnChange', (data) => { isMyTurn = data.currentTurn === myId; updateTurnIndicator(); });
socket.on('jackMessage', (data) => addChatMessage('Cpt. Jack Sparrow', data.text, 'jack'));
socket.on('chatMessage', (data) => { if (!data.isJack) addChatMessage(data.sender, data.text, 'player'); });

socket.on('gameOver', (data) => {
  const isWinner = data.winner === myId, title = document.getElementById('gameover-title'), message = document.getElementById('gameover-message');
  if (isWinner) { title.textContent = 'VICTORY!'; title.className = 'victory'; message.textContent = 'Ye sank all of ' + data.loserName + "'s ships! A true pirate legend!"; }
  else { title.textContent = 'DEFEAT!'; title.className = 'defeat'; message.textContent = data.winnerName + " sent yer fleet to Davy Jones' locker!"; }
  setTimeout(() => showScreen('gameover'), 2000);
});

socket.on('opponentLeft', (data) => {
  addChatMessage(null, data.message, 'system');
  setTimeout(() => { document.getElementById('gameover-title').textContent = 'VICTORY!'; document.getElementById('gameover-title').className = 'victory'; document.getElementById('gameover-message').textContent = 'Yer opponent fled!'; showScreen('gameover'); }, 2000);
});
