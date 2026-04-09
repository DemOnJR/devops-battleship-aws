const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);

// Redis clients - one for pub, one for sub (required by adapter), one for data
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();
const redis = new Redis(REDIS_URL);

const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
});

// Socket.IO Redis adapter - shares events across app-1 and app-2
io.adapter(createAdapter(pubClient, subClient));

app.use(express.static(path.join(__dirname, 'public')));

const SHIP_TYPES = [
  { name: 'Carrier',    size: 5, id: 'carrier' },
  { name: 'Battleship', size: 4, id: 'battleship' },
  { name: 'Cruiser',    size: 3, id: 'cruiser' },
  { name: 'Submarine',  size: 3, id: 'submarine' },
  { name: 'Destroyer',  size: 2, id: 'destroyer' },
];

const JACK_QUOTES = {
  hit: [
    "That's got to be the best shot I've ever seen!",
    "Oi! That one had rum on it!",
    "Bloody brilliant! Right in the hull!",
    "Now THAT'S what I call negotiation with a cannonball!",
    "You've got the aim of a proper pirate, I'll give ye that.",
    "Boom! ...I mean, I knew that was coming. Definitely.",
    "Me compass is spinning! That was magnificent!",
    "Direct hit! Even Barbossa would be impressed. Almost.",
    "Strike me down, that was beautiful! Well, not for the ship.",
    "Ah, the sweet sound of splintering wood! Music to me ears!",
    "That ship didn't stand a chance. Much like sobriety around me.",
    "HIT! And they said you couldn't aim! Well, I said it. But I was wrong!",
    "The sea giveth and the cannonball taketh away!",
    "That's gonna leave a mark. A very wet, sinky mark.",
    "I've seen a lot of destruction in me time, and that... was adequate.",
  ],
  miss: [
    "You missed?! I could've hit that blindfolded... and drunk... which I usually am.",
    "The ocean called. It says it doesn't appreciate being shot at for nothing.",
    "Splash! That's the saddest sound since they ran out of rum.",
    "You missed! But hey, at least you hydrated a fish.",
    "That cannonball is now a reef. You're welcome, marine life.",
    "Miss! Even the Kraken is embarrassed for you, mate.",
    "That went about as well as me last escape plan. The one before the good one.",
    "The sea is vast, and you somehow managed to hit... ALL of it. Except the ship.",
    "Not all treasure is silver and gold... and not all shots hit things.",
    "I've seen monkeys with better aim. And I would know - I sailed with one.",
    "MISS! Don't worry, the fish needed a wake-up call anyway.",
    "Ah, a warning shot! Very diplomatic of you. ...It WAS a warning shot, right?",
    "You just shot the ocean! The OCEAN! What did it ever do to you?",
    "That splash was so big, I thought the Kraken was back!",
    "Close! And by close, I mean not even remotely close.",
  ],
  sunk: [
    "That ship had rum on it, you MONSTER!",
    "Down she goes! Davy Jones has a new decoration!",
    "SUNK! That's worse than what happened to the Black Pearl... the first time.",
    "Ship destroyed! I'd pour one out, but I'm not wasting rum.",
    "To the depths! ...That's where I keep me good rum, actually.",
    "She's gone to Davy Jones' locker! Hope she packed a swimsuit.",
    "SUNK! That captain is going to need a bigger bathtub.",
    "That ship is now an underwater tourist attraction. Congratulations!",
    "Another ship sunk! You're making the ocean floor very crowded.",
    "Rest in pieces! ...I mean, peace. No, I meant pieces.",
  ],
  gameStart: [
    "This is the day you will always remember as the day you ALMOST beat Captain Jack Sparrow!",
    "Gentlemen... you will always remember this as the day you played Battleship!",
    "The seas be treacherous and the rum be... wait, where's the rum?!",
    "Welcome aboard, ye scallywags! May the best pirate win... which is obviously me.",
    "Ahoy! Ready your cannons and prepare for some seriously questionable naval strategy!",
    "Right then! Two pirates enter, one pirate leaves. The other one swims.",
    "Let the battle commence! And remember: it's Captain Jack Sparrow. CAPTAIN.",
    "Ships placed! Cannons loaded! Dignity... optional!",
  ],
  gameOver: [
    "The problem is not the problem. The problem is your attitude about the problem. Savvy?",
    "This is the day you will always remember... as quite embarrassing, actually.",
    "The seas have spoken! And they said 'blub blub blub' because ships are sinking.",
    "Good game! Now, where's the rum gone? ...WHY IS THE RUM ALWAYS GONE?!",
    "Victory! Or defeat! Either way, I'm taking credit for making it entertaining.",
    "And THAT is how legends are made. Or at least mildly amusing stories.",
    "Game over! Time to drink rum and pretend this never happened.",
    "Well fought! Now let's do what any proper pirate would do - blame the wind.",
  ],
  idle: [
    "Are you going to shoot or just stare at the sea like a confused pelican?",
    "Hello? Anyone home? The cannonballs are getting cold!",
    "I've looted three islands in the time you've been thinking about this.",
    "Take your time! ...Actually, don't. The rum's getting warm.",
    "Even the barnacles on me hull are bored, and they LIVE there.",
    "If you're waiting for the wind to change, mate, that's not how this works.",
    "I've seen glaciers move faster. And they're made of ice. In the Arctic.",
    "Tick tock, mate! Even the Kraken has a bedtime!",
  ],
  chat: [
    "Parley? PARLEY! ...No? Fine, keep shooting then.",
    "Why is the rum ALWAYS gone?!",
    "I'm dishonest, and a dishonest man you can always trust to be dishonest.",
    "Not all treasure is silver and gold, mate.",
    "Drink up, me hearties, yo ho!",
  ],
  reconnect: [
    "Ah, you're back! Thought the Kraken got ya!",
    "Welcome back, mate! The sea doesn't wait, but I did.",
    "Returned from the dead, have we? Very on-brand for a pirate.",
    "Back so soon? Did ye forget yer cannonballs?",
  ],
};

function randomQuote(cat) {
  const q = JACK_QUOTES[cat];
  return q[Math.floor(Math.random() * q.length)];
}

// ─── Redis helpers ──────────────────────────────────────────
// All game state is stored in Redis so both app instances share it.
// Keys: game:{gameId} = JSON game object
//       player:{playerId} = gameId (maps player to their game)
//       waiting = JSON waiting player info

const GAME_TTL = 3600; // 1 hour expiry for game data

async function getGame(gameId) {
  const data = await redis.get(`game:${gameId}`);
  return data ? JSON.parse(data) : null;
}

async function saveGame(game) {
  await redis.set(`game:${game.id}`, JSON.stringify(game), 'EX', GAME_TTL);
  // Also map each player to this game
  for (const pid of game.playerOrder) {
    await redis.set(`player:${pid}`, game.id, 'EX', GAME_TTL);
  }
}

async function deleteGame(gameId) {
  const game = await getGame(gameId);
  if (game) {
    for (const pid of game.playerOrder) {
      await redis.del(`player:${pid}`);
    }
  }
  await redis.del(`game:${gameId}`);
}

async function getWaiting() {
  const data = await redis.get('waiting');
  return data ? JSON.parse(data) : null;
}

async function setWaiting(data) {
  if (data) {
    await redis.set('waiting', JSON.stringify(data), 'EX', 300); // 5 min expiry
  } else {
    await redis.del('waiting');
  }
}

function createGame(gameId) {
  return {
    id: gameId,
    players: {},
    playerOrder: [],
    phase: 'waiting',
    currentTurn: null,
    winner: null,
    chatLog: [],
    disconnectTimestamps: {}, // playerId -> timestamp when disconnected
  };
}

function createPlayerData(playerId, playerName) {
  return {
    id: playerId,
    name: playerName || 'Anonymous Pirate',
    board: Array(10).fill(null).map(() => Array(10).fill(null)),
    shots: Array(10).fill(null).map(() => Array(10).fill(null)),
    ships: {},
    shipsPlaced: false,
    connected: true,
  };
}

function allShipsSunk(p) {
  return Object.values(p.ships).every(s => s.hits >= s.positions.length);
}

function addChatLog(game, sender, text, type) {
  game.chatLog.push({ sender, text, type });
  if (game.chatLog.length > 100) game.chatLog.shift();
}

function getStateForPlayer(game, playerId) {
  const me = game.players[playerId];
  const opponentId = game.playerOrder.find(pid => pid !== playerId);
  const opponent = opponentId ? game.players[opponentId] : null;

  return {
    gameId: game.id,
    playerId: playerId,
    phase: game.phase,
    opponentName: opponent ? opponent.name : null,
    currentTurn: game.currentTurn,
    myBoard: me.board,
    myShips: me.shipsPlaced ? Object.entries(me.ships).map(([id, s]) => ({
      id, positions: s.positions, sunk: s.sunk
    })) : null,
    myShipsPlaced: me.shipsPlaced,
    myShots: me.shots,
    enemyShots: opponent ? opponent.shots : null,
    enemySunkShips: opponent ? Object.entries(opponent.ships)
      .filter(([, s]) => s.sunk)
      .map(([id]) => SHIP_TYPES.find(t => t.id === id)?.name) : [],
    mySunkShips: Object.entries(me.ships)
      .filter(([, s]) => s.sunk)
      .map(([id]) => SHIP_TYPES.find(t => t.id === id)?.name),
    chatLog: game.chatLog.slice(-50),
    winner: game.winner,
    winnerName: game.winner ? game.players[game.winner]?.name : null,
  };
}

// Idle timers are per-instance (not shared), but that's fine -
// they just send a Jack quote, not critical state
const idleTimers = new Map();

function startIdleTimer(gameId) {
  clearIdleTimer(gameId);
  idleTimers.set(gameId, setTimeout(async () => {
    const game = await getGame(gameId);
    if (game && game.phase === 'battle') {
      io.to(gameId).emit('jackMessage', { text: randomQuote('idle') });
    }
  }, 15000));
}

function clearIdleTimer(gameId) {
  const timer = idleTimers.get(gameId);
  if (timer) { clearTimeout(timer); idleTimers.delete(gameId); }
}

// Disconnect timers - per instance, checks Redis state
const disconnectTimers = new Map();

function startDisconnectTimer(gameId, playerId) {
  const key = `${gameId}:${playerId}`;
  disconnectTimers.set(key, setTimeout(async () => {
    const game = await getGame(gameId);
    if (game && game.players[playerId] && !game.players[playerId].connected) {
      clearIdleTimer(gameId);
      io.to(gameId).emit('opponentLeft', { message: 'Opponent abandoned ship! You win!' });
      io.to(gameId).emit('jackMessage', { text: "They've fled! Probably heard I was watching. Can't blame 'em, really." });
      await deleteGame(gameId);
    }
    disconnectTimers.delete(key);
  }, 60000));
}

function clearDisconnectTimer(gameId, playerId) {
  const key = `${gameId}:${playerId}`;
  const timer = disconnectTimers.get(key);
  if (timer) { clearTimeout(timer); disconnectTimers.delete(key); }
}

// ─── Socket.IO Events ──────────────────────────────────────
io.on('connection', (socket) => {
  let playerId = null;

  socket.on('register', (data) => {
    playerId = data.playerId;
  });

  socket.on('reconnect_game', async (data) => {
    playerId = data.playerId;
    const targetGameId = data.gameId;

    const game = await getGame(targetGameId);
    if (!game || !game.players[playerId]) {
      socket.emit('reconnect_failed');
      return;
    }

    clearDisconnectTimer(targetGameId, playerId);
    game.players[playerId].connected = true;
    await saveGame(game);

    socket.join(game.id);
    socket.gameId = game.id;
    socket.playerId = playerId;

    socket.emit('reconnect_state', getStateForPlayer(game, playerId));

    const opId = game.playerOrder.find(pid => pid !== playerId);
    if (opId) {
      io.to(game.id).emit('opponentReconnected', { name: game.players[playerId].name });
    }

    const jackMsg = { text: randomQuote('reconnect') };
    io.to(game.id).emit('jackMessage', jackMsg);
    addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
    await saveGame(game);

    if (game.phase === 'battle') startIdleTimer(game.id);
  });

  socket.on('createGame', async (data) => {
    playerId = data.playerId || playerId;
    const gameId = uuidv4().slice(0, 8);
    const game = createGame(gameId);
    game.players[playerId] = createPlayerData(playerId, data.name);
    game.playerOrder.push(playerId);
    await saveGame(game);
    socket.join(gameId);
    socket.gameId = gameId;
    socket.playerId = playerId;
    socket.emit('gameCreated', { gameId, playerId });
  });

  socket.on('joinGame', async (data) => {
    playerId = data.playerId || playerId;
    const game = await getGame(data.gameId);
    if (!game) { socket.emit('error', { message: 'Game not found!' }); return; }
    if (game.playerOrder.length >= 2) { socket.emit('error', { message: 'Game is full!' }); return; }
    game.players[playerId] = createPlayerData(playerId, data.name);
    game.playerOrder.push(playerId);
    game.phase = 'placing';
    await saveGame(game);
    socket.join(data.gameId);
    socket.gameId = data.gameId;
    socket.playerId = playerId;
    const p1 = game.players[game.playerOrder[0]], p2 = game.players[game.playerOrder[1]];
    socket.emit('gameJoined', { gameId: data.gameId, playerId, opponentName: p1.name });
    io.to(data.gameId).emit('opponentJoined', { opponentName: p2.name });
    io.to(data.gameId).emit('phaseChange', { phase: 'placing' });
    const jackMsg = { text: randomQuote('gameStart') };
    io.to(data.gameId).emit('jackMessage', jackMsg);
    addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
    await saveGame(game);
  });

  socket.on('findRandom', async (data) => {
    playerId = data.playerId || playerId;
    const waiting = await getWaiting();

    if (waiting && waiting.playerId !== playerId) {
      // Check if waiting player's socket is still connected somewhere
      const gameId = uuidv4().slice(0, 8);
      const game = createGame(gameId);
      game.players[waiting.playerId] = createPlayerData(waiting.playerId, waiting.name);
      game.players[playerId] = createPlayerData(playerId, data.name);
      game.playerOrder = [waiting.playerId, playerId];
      game.phase = 'placing';
      await saveGame(game);
      await setWaiting(null);

      // Join rooms - the waiting player needs to be notified via Redis adapter
      socket.join(gameId);
      socket.gameId = gameId;
      socket.playerId = playerId;

      const p1 = game.players[waiting.playerId], p2 = game.players[playerId];

      // Emit to waiting player via their socket ID stored in Redis
      const waitingSocketId = waiting.socketId;
      if (waitingSocketId) {
        io.to(waitingSocketId).emit('gameJoined', { gameId, playerId: waiting.playerId, opponentName: p2.name });
        // Make the waiting player's socket join the game room
        const waitingSockets = await io.in(waitingSocketId).fetchSockets();
        for (const ws of waitingSockets) {
          ws.join(gameId);
          ws.gameId = gameId;
          ws.playerId = waiting.playerId;
        }
      }

      socket.emit('gameJoined', { gameId, playerId, opponentName: p1.name });
      io.to(gameId).emit('phaseChange', { phase: 'placing' });
      const jackMsg = { text: randomQuote('gameStart') };
      io.to(gameId).emit('jackMessage', jackMsg);
      addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
      await saveGame(game);
    } else {
      await setWaiting({ playerId, name: data.name, socketId: socket.id });
      socket.emit('waiting', { message: 'Looking for opponent...' });
    }
  });

  socket.on('cancelSearch', async () => {
    const waiting = await getWaiting();
    if (waiting && waiting.playerId === playerId) {
      await setWaiting(null);
      socket.emit('searchCancelled');
    }
  });

  socket.on('placeShips', async (data) => {
    const game = await getGame(socket.gameId);
    if (!game || game.phase !== 'placing') return;
    const pid = socket.playerId;
    const player = game.players[pid];
    if (!player || player.shipsPlaced) return;
    const board = Array(10).fill(null).map(() => Array(10).fill(null));
    const ships = {};
    for (const ship of data.ships) {
      const type = SHIP_TYPES.find(t => t.id === ship.id);
      if (!type || ship.positions.length !== type.size) { socket.emit('error', { message: 'Invalid ship!' }); return; }
      for (const pos of ship.positions) {
        if (pos.r < 0 || pos.r > 9 || pos.c < 0 || pos.c > 9 || board[pos.r][pos.c] !== null) {
          socket.emit('error', { message: 'Invalid placement!' }); return;
        }
        board[pos.r][pos.c] = ship.id;
      }
      ships[ship.id] = { positions: ship.positions, hits: 0, sunk: false };
    }
    player.board = board; player.ships = ships; player.shipsPlaced = true;
    await saveGame(game);
    socket.emit('shipsPlaced', { success: true });
    if (game.playerOrder.every(pid => game.players[pid].shipsPlaced)) {
      game.phase = 'battle'; game.currentTurn = game.playerOrder[0];
      await saveGame(game);
      io.to(game.id).emit('phaseChange', {
        phase: 'battle', currentTurn: game.currentTurn,
        turnName: game.players[game.currentTurn].name,
      });
      startIdleTimer(game.id);
    }
  });

  socket.on('fire', async (data) => {
    const game = await getGame(socket.gameId);
    const pid = socket.playerId;
    if (!game || game.phase !== 'battle' || game.currentTurn !== pid) return;
    const { r, c } = data;
    if (r < 0 || r > 9 || c < 0 || c > 9) return;
    const opId = game.playerOrder.find(p => p !== pid);
    const opponent = game.players[opId], shooter = game.players[pid];
    if (shooter.shots[r][c] !== null) { socket.emit('error', { message: 'Already shot there!' }); return; }
    clearIdleTimer(game.id);
    const shipId = opponent.board[r][c];
    let result, sunkShip = null;
    if (shipId) {
      result = 'hit'; shooter.shots[r][c] = 'hit'; opponent.ships[shipId].hits++;
      if (opponent.ships[shipId].hits >= opponent.ships[shipId].positions.length) {
        opponent.ships[shipId].sunk = true;
        sunkShip = SHIP_TYPES.find(t => t.id === shipId);
      }
    } else { result = 'miss'; shooter.shots[r][c] = 'miss'; }
    await saveGame(game);
    const fireData = { shooter: pid, shooterName: shooter.name, r, c, result, sunkShip: sunkShip ? sunkShip.name : null };
    io.to(game.id).emit('fireResult', fireData);
    addChatLog(game, null, `${shooter.name} fires... ${result === 'hit' ? 'HIT' : 'MISS'}!${sunkShip ? ' ' + sunkShip.name + ' SUNK!' : ''}`, 'system');
    setTimeout(() => {
      const jackMsg = { text: randomQuote(sunkShip ? 'sunk' : result) };
      io.to(game.id).emit('jackMessage', jackMsg);
      addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
      saveGame(game);
    }, 600);
    if (allShipsSunk(opponent)) {
      game.phase = 'finished'; game.winner = pid;
      await saveGame(game);
      setTimeout(() => {
        io.to(game.id).emit('gameOver', { winner: pid, winnerName: shooter.name, loserName: opponent.name });
        const jackMsg = { text: randomQuote('gameOver') };
        io.to(game.id).emit('jackMessage', jackMsg);
        addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
        saveGame(game);
      }, 1200);
      return;
    }
    game.currentTurn = opId;
    await saveGame(game);
    io.to(game.id).emit('turnChange', { currentTurn: opId, turnName: opponent.name });
    startIdleTimer(game.id);
  });

  socket.on('chatMessage', async (data) => {
    const game = await getGame(socket.gameId);
    if (!game) return;
    const pid = socket.playerId;
    const player = game.players[pid];
    if (!player) return;
    const chatData = { sender: player.name, text: data.text, isJack: false };
    io.to(game.id).emit('chatMessage', chatData);
    addChatLog(game, player.name, data.text, 'player');
    if (Math.random() < 0.2) {
      setTimeout(() => {
        const jackMsg = { text: randomQuote('chat') };
        io.to(game.id).emit('jackMessage', jackMsg);
        addChatLog(game, 'Cpt. Jack Sparrow', jackMsg.text, 'jack');
        saveGame(game);
      }, 1500);
    }
    await saveGame(game);
  });

  socket.on('disconnect', async () => {
    const waiting = await getWaiting();
    if (waiting && waiting.playerId === playerId) {
      await setWaiting(null);
    }

    if (socket.gameId && socket.playerId) {
      const game = await getGame(socket.gameId);
      if (game && game.phase !== 'finished' && game.players[socket.playerId]) {
        game.players[socket.playerId].connected = false;
        await saveGame(game);

        startDisconnectTimer(game.id, socket.playerId);

        const opId = game.playerOrder.find(p => p !== socket.playerId);
        if (opId) {
          io.to(game.id).emit('opponentDisconnected', {
            message: 'Yer opponent lost connection! Waiting 60s for them to return...',
          });
        }
      }
    }
  });
});

// Cleanup finished games every 30 minutes
setInterval(async () => {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'game:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const data = await redis.get(key);
      if (!data) continue;
      const game = JSON.parse(data);
      if (game.phase === 'finished') await deleteGame(game.id);
      if (game.phase === 'waiting' && game.playerOrder.length < 2) await deleteGame(game.id);
    }
  } while (cursor !== '0');
}, 30 * 60 * 1000);

app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({ status: 'ok', instance: process.env.INSTANCE_ID || 'unknown', redis: 'connected' });
  } catch (e) {
    res.status(503).json({ status: 'error', instance: process.env.INSTANCE_ID || 'unknown', redis: 'disconnected' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Battleship server on port ${PORT} (Redis: ${REDIS_URL})`));
