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

// ─── Persistent Player ID ──────────────────────────────────────
function getPlayerId() {
  let id = localStorage.getItem('battleship_playerId');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('battleship_playerId', id);
  }
  return id;
}
function saveSession(gameId, playerId) {
  localStorage.setItem('battleship_gameId', gameId);
  localStorage.setItem('battleship_playerId', playerId);
}
function clearSession() {
  localStorage.removeItem('battleship_gameId');
}
function getSavedSession() {
  return {
    gameId: localStorage.getItem('battleship_gameId'),
    playerId: localStorage.getItem('battleship_playerId'),
  };
}

myId = getPlayerId();

// Register with server on connect
socket.on('connect', () => {
  socket.emit('register', { playerId: myId });
  // Try to reconnect to existing game
  const session = getSavedSession();
  if (session.gameId && session.playerId) {
    socket.emit('reconnect_game', { playerId: session.playerId, gameId: session.gameId });
  }
});

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

// ─── Sound Controls ────────────────────────────────────────────
document.getElementById('btn-sound-toggle').addEventListener('click', () => {
  const muted = SoundEngine.toggleMute();
  document.getElementById('btn-sound-toggle').textContent = muted ? '\u{1F507}' : '\u{1F50A}';
  document.getElementById('btn-sound-toggle').classList.toggle('muted', muted);
});
// Start ambient on first user interaction
let bgStarted = false;
function startBgOnInteraction() {
  if (!bgStarted) { bgStarted = true; SoundEngine.startBackground(); }
}
document.addEventListener('click', startBgOnInteraction, { once: true });

// ─── Menu Buttons ──────────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => { myName = getName(); socket.emit('createGame', { name: myName, playerId: myId }); });
document.getElementById('btn-random').addEventListener('click', () => { myName = getName(); socket.emit('findRandom', { name: myName, playerId: myId }); document.getElementById('waiting-section').classList.remove('hidden'); document.getElementById('btn-random').disabled = true; document.getElementById('btn-create').disabled = true; });
document.getElementById('btn-cancel-search').addEventListener('click', () => { socket.emit('cancelSearch'); document.getElementById('waiting-section').classList.add('hidden'); document.getElementById('btn-random').disabled = false; document.getElementById('btn-create').disabled = false; });
document.getElementById('btn-copy').addEventListener('click', () => { const input = document.getElementById('invite-link'); input.select(); navigator.clipboard.writeText(input.value).then(() => { const btn = document.getElementById('btn-copy'); btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 2000); }); });
document.getElementById('btn-play-again').addEventListener('click', () => { clearSession(); window.location.href = window.location.origin; });

// ─── Socket Events: Menu ───────────────────────────────────────
socket.on('gameCreated', (data) => { gameId = data.gameId; myId = data.playerId; saveSession(gameId, myId); document.getElementById('invite-link').value = window.location.origin + '?join=' + gameId; document.getElementById('invite-section').classList.remove('hidden'); document.getElementById('btn-create').disabled = true; document.getElementById('btn-random').disabled = true; });
socket.on('searchCancelled', () => { document.getElementById('waiting-section').classList.add('hidden'); document.getElementById('btn-random').disabled = false; document.getElementById('btn-create').disabled = false; });
socket.on('gameJoined', (data) => { gameId = data.gameId; myId = data.playerId; opponentName = data.opponentName; saveSession(gameId, myId); document.getElementById('opponent-name-placement').textContent = opponentName; initPlacement(); showScreen('placement'); SoundEngine.notify(); });
socket.on('opponentJoined', (data) => { opponentName = data.opponentName; document.getElementById('opponent-name-placement').textContent = opponentName; initPlacement(); showScreen('placement'); SoundEngine.notify(); });
socket.on('error', (data) => { const el = document.getElementById('error-message'); el.textContent = data.message; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 5000); });

// ─── Reconnect State Restore ───────────────────────────────────
socket.on('reconnect_state', (state) => {
  gameId = state.gameId;
  myId = state.playerId;
  opponentName = state.opponentName || '???';
  saveSession(gameId, myId);

  if (state.phase === 'waiting') {
    // Still waiting for opponent in lobby
    document.getElementById('invite-link').value = window.location.origin + '?join=' + gameId;
    document.getElementById('invite-section').classList.remove('hidden');
    document.getElementById('btn-create').disabled = true;
    document.getElementById('btn-random').disabled = true;
    return;
  }

  if (state.phase === 'placing') {
    document.getElementById('opponent-name-placement').textContent = opponentName;
    initPlacement();
    // Restore already placed ships
    if (state.myShipsPlaced && state.myShips) {
      state.myShips.forEach(ship => {
        const s = SHIPS.find(sh => sh.id === ship.id);
        if (s) {
          s.placed = true;
          s.positions = ship.positions;
          ship.positions.forEach(p => {
            placementBoard[p.r][p.c] = ship.id;
            getCell('placement-board', p.r, p.c).classList.add('ship');
          });
        }
      });
      renderShipList();
      document.getElementById('btn-ready').disabled = true;
      document.getElementById('btn-ready').textContent = 'Waiting for opponent...';
    }
    showScreen('placement');
    return;
  }

  if (state.phase === 'battle' || state.phase === 'finished') {
    // Restore ship placement data for local SHIPS array
    if (state.myShips) {
      state.myShips.forEach(ship => {
        const s = SHIPS.find(sh => sh.id === ship.id);
        if (s) { s.placed = true; s.positions = ship.positions; }
      });
    }

    // Init battle screen
    showScreen('battle');
    buildBoardHTML('enemy-board');
    buildBoardHTML('my-board');

    // Draw my ships
    SHIPS.forEach(ship => {
      if (ship.positions) ship.positions.forEach(p => getCell('my-board', p.r, p.c).classList.add('ship'));
    });

    // Restore my shots on enemy board
    if (state.myShots) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          if (state.myShots[r][c]) {
            getCell('enemy-board', r, c).classList.add(state.myShots[r][c]);
            if (state.myShots[r][c] === 'hit') myHits++;
          }
        }
      }
    }

    // Restore enemy shots on my board
    if (state.enemyShots) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          if (state.enemyShots[r][c]) {
            getCell('my-board', r, c).classList.add(state.enemyShots[r][c]);
            if (state.enemyShots[r][c] === 'hit') enemyHits++;
          }
        }
      }
    }

    // Restore sunk ships
    if (state.enemySunkShips) state.enemySunkShips.forEach(name => {
      const s = SHIPS.find(sh => sh.name === name);
      if (s) enemySunkShips.add(s.id);
    });
    if (state.mySunkShips) state.mySunkShips.forEach(name => {
      const s = SHIPS.find(sh => sh.name === name);
      if (s) mySunkShips.add(s.id);
    });

    document.getElementById('my-hits').textContent = 'Hits: ' + myHits;
    document.getElementById('enemy-hits').textContent = 'Enemy Hits: ' + enemyHits;

    isMyTurn = state.currentTurn === myId;
    updateTurnIndicator();
    updateShipsStatus();

    document.getElementById('enemy-board').addEventListener('click', onEnemyBoardClick);
    document.getElementById('btn-send-chat').addEventListener('click', sendChat);
    document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

    // Restore chat history
    if (state.chatLog) {
      state.chatLog.forEach(msg => {
        if (msg.type === 'jack') addChatMessage(msg.sender, msg.text, 'jack');
        else if (msg.type === 'system') addChatMessage(null, msg.text, 'system');
        else addChatMessage(msg.sender, msg.text, 'player');
      });
    }

    addChatMessage(null, 'Reconnected! Welcome back, Captain!', 'system');

    // If game already finished
    if (state.phase === 'finished' && state.winner) {
      const isWinner = state.winner === myId;
      const title = document.getElementById('gameover-title'), message = document.getElementById('gameover-message');
      if (isWinner) { title.textContent = 'VICTORY!'; title.className = 'victory'; message.textContent = 'Ye won the battle!'; }
      else { title.textContent = 'DEFEAT!'; title.className = 'defeat'; message.textContent = state.winnerName + " sank yer fleet!"; }
      setTimeout(() => showScreen('gameover'), 1000);
    }
  }
});

socket.on('reconnect_failed', () => {
  clearSession();
  // Stay on menu, no active game to restore
});

socket.on('opponentDisconnected', (data) => {
  addChatMessage(null, data.message, 'system');
});

socket.on('opponentReconnected', (data) => {
  addChatMessage(null, data.name + ' is back!', 'system');
});

// ─── Join via URL ──────────────────────────────────────────────
(function checkJoinParam() {
  const joinId = new URLSearchParams(window.location.search).get('join');
  if (joinId) {
    document.getElementById('btn-create').disabled = true; document.getElementById('btn-random').disabled = true;
    const section = document.getElementById('join-section'); section.innerHTML = '';
    section.appendChild(Object.assign(document.createElement('p'), { textContent: "Ye've been invited to a battle!" }));
    const joinBtn = document.createElement('button'); joinBtn.className = 'pirate-btn';
    joinBtn.innerHTML = '<span class="btn-icon">\u2693</span> Join the Battle!';
    joinBtn.addEventListener('click', () => { myName = getName(); clearSession(); socket.emit('joinGame', { gameId: joinId, name: myName, playerId: myId }); });
    section.appendChild(joinBtn); section.classList.remove('hidden');
    document.getElementById('player-name').focus();
  }
})();

// ─── Ship Placement ────────────────────────────────────────────
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

// ─── Battle Phase ──────────────────────────────────────────────
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

// ─── Battle Events ─────────────────────────────────────────────
socket.on('fireResult', (data) => {
  const { shooter, shooterName, r, c, result, sunkShip } = data, isMeShooter = shooter === myId;
  if (isMeShooter) { getCell('enemy-board', r, c).classList.add(result); if (result === 'hit') myHits++; }
  else { getCell('my-board', r, c).classList.add(result); if (result === 'hit') enemyHits++; }
  document.getElementById('my-hits').textContent = 'Hits: ' + myHits;
  document.getElementById('enemy-hits').textContent = 'Enemy Hits: ' + enemyHits;
  addChatMessage(null, shooterName + ' fires... ' + (result === 'hit' ? 'HIT' : 'MISS') + '!' + (sunkShip ? ' ' + sunkShip + ' SUNK!' : ''), 'system');
  // Play sounds
  if (sunkShip) { SoundEngine.sunk(); } else if (result === 'hit') { SoundEngine.hit(); } else { SoundEngine.cannonFire(); setTimeout(() => SoundEngine.splash(), 400); }
  if (sunkShip) { const st = SHIPS.find(s => s.name === sunkShip); if (st) { (isMeShooter ? enemySunkShips : mySunkShips).add(st.id); updateShipsStatus(); } triggerMonkeyExcited(); }
  triggerJackExcited();
});

socket.on('turnChange', (data) => { isMyTurn = data.currentTurn === myId; updateTurnIndicator(); if (isMyTurn) SoundEngine.reload(); });
socket.on('jackMessage', (data) => addChatMessage('Cpt. Jack Sparrow', data.text, 'jack'));
socket.on('chatMessage', (data) => { if (!data.isJack) addChatMessage(data.sender, data.text, 'player'); });

socket.on('gameOver', (data) => {
  const isWinner = data.winner === myId, title = document.getElementById('gameover-title'), message = document.getElementById('gameover-message');
  if (isWinner) { title.textContent = 'VICTORY!'; title.className = 'victory'; message.textContent = 'Ye sank all of ' + data.loserName + "'s ships! A true pirate legend!"; }
  else { title.textContent = 'DEFEAT!'; title.className = 'defeat'; message.textContent = data.winnerName + " sent yer fleet to Davy Jones' locker!"; }
  clearSession();
  setTimeout(() => showScreen('gameover'), 2000);
});

// ─── Pirate character reactions ────────────────────────────────
function triggerJackExcited() {
  const jack = document.getElementById('jack-character');
  if (!jack) return;
  jack.classList.remove('jack-idle'); jack.classList.add('jack-excited');
  setTimeout(() => { jack.classList.remove('jack-excited'); jack.classList.add('jack-idle'); }, 1800);
}
function triggerMonkeyExcited() {
  const monkey = document.getElementById('monkey-character');
  if (!monkey) return;
  monkey.classList.remove('monkey-swing'); monkey.classList.add('monkey-excited');
  setTimeout(() => { monkey.classList.remove('monkey-excited'); monkey.classList.add('monkey-swing'); }, 2000);
}

socket.on('opponentLeft', (data) => {
  addChatMessage(null, data.message, 'system');
  clearSession();
  setTimeout(() => { document.getElementById('gameover-title').textContent = 'VICTORY!'; document.getElementById('gameover-title').className = 'victory'; document.getElementById('gameover-message').textContent = 'Yer opponent fled!'; showScreen('gameover'); }, 2000);
});
