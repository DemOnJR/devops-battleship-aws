const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['polling', 'websocket'],
});

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();
let waitingPlayer = null;

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
};

function randomQuote(cat) {
  const q = JACK_QUOTES[cat];
  return q[Math.floor(Math.random() * q.length)];
}

function createGame(gameId) {
  return { id: gameId, players: {}, playerOrder: [], phase: 'waiting', currentTurn: null, winner: null, idleTimer: null };
}

function createPlayerData(socketId, playerName) {
  return {
    id: socketId, name: playerName || 'Anonymous Pirate',
    board: Array(10).fill(null).map(() => Array(10).fill(null)),
    shots: Array(10).fill(null).map(() => Array(10).fill(null)),
    ships: {}, shipsPlaced: false,
  };
}

function allShipsSunk(p) { return Object.values(p.ships).every(s => s.hits >= s.positions.length); }

function startIdleTimer(game) {
  clearIdleTimer(game);
  game.idleTimer = setTimeout(() => {
    if (game.phase === 'battle') io.to(game.id).emit('jackMessage', { text: randomQuote('idle') });
  }, 15000);
}
function clearIdleTimer(game) { if (game.idleTimer) { clearTimeout(game.idleTimer); game.idleTimer = null; } }

io.on('connection', (socket) => {
  socket.on('createGame', (data) => {
    const gameId = uuidv4().slice(0, 8);
    const game = createGame(gameId);
    game.players[socket.id] = createPlayerData(socket.id, data.name);
    game.playerOrder.push(socket.id);
    games.set(gameId, game);
    socket.join(gameId); socket.gameId = gameId;
    socket.emit('gameCreated', { gameId, playerId: socket.id });
  });

  socket.on('joinGame', (data) => {
    const game = games.get(data.gameId);
    if (!game) { socket.emit('error', { message: 'Game not found!' }); return; }
    if (game.playerOrder.length >= 2) { socket.emit('error', { message: 'Game is full!' }); return; }
    game.players[socket.id] = createPlayerData(socket.id, data.name);
    game.playerOrder.push(socket.id);
    game.phase = 'placing';
    socket.join(data.gameId); socket.gameId = data.gameId;
    const p1 = game.players[game.playerOrder[0]], p2 = game.players[game.playerOrder[1]];
    socket.emit('gameJoined', { gameId: data.gameId, playerId: socket.id, opponentName: p1.name });
    io.to(game.playerOrder[0]).emit('opponentJoined', { opponentName: p2.name });
    io.to(data.gameId).emit('phaseChange', { phase: 'placing' });
    io.to(data.gameId).emit('jackMessage', { text: randomQuote('gameStart') });
  });

  socket.on('findRandom', (data) => {
    if (waitingPlayer && waitingPlayer.connected) {
      const gameId = uuidv4().slice(0, 8);
      const game = createGame(gameId);
      game.players[waitingPlayer.id] = createPlayerData(waitingPlayer.id, waitingPlayer.playerName);
      game.players[socket.id] = createPlayerData(socket.id, data.name);
      game.playerOrder = [waitingPlayer.id, socket.id];
      game.phase = 'placing';
      games.set(gameId, game);
      waitingPlayer.join(gameId); socket.join(gameId);
      waitingPlayer.gameId = gameId; socket.gameId = gameId;
      const p1 = game.players[waitingPlayer.id], p2 = game.players[socket.id];
      waitingPlayer.emit('gameJoined', { gameId, playerId: waitingPlayer.id, opponentName: p2.name });
      socket.emit('gameJoined', { gameId, playerId: socket.id, opponentName: p1.name });
      io.to(gameId).emit('phaseChange', { phase: 'placing' });
      io.to(gameId).emit('jackMessage', { text: randomQuote('gameStart') });
      waitingPlayer = null;
    } else {
      socket.playerName = data.name; waitingPlayer = socket;
      socket.emit('waiting', { message: 'Looking for opponent...' });
    }
  });

  socket.on('cancelSearch', () => { if (waitingPlayer === socket) { waitingPlayer = null; socket.emit('searchCancelled'); } });

  socket.on('placeShips', (data) => {
    const game = games.get(socket.gameId);
    if (!game || game.phase !== 'placing') return;
    const player = game.players[socket.id];
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
    socket.emit('shipsPlaced', { success: true });
    if (game.playerOrder.every(pid => game.players[pid].shipsPlaced)) {
      game.phase = 'battle'; game.currentTurn = game.playerOrder[0];
      io.to(game.id).emit('phaseChange', { phase: 'battle', currentTurn: game.currentTurn, turnName: game.players[game.currentTurn].name });
      startIdleTimer(game);
    }
  });

  socket.on('fire', (data) => {
    const game = games.get(socket.gameId);
    if (!game || game.phase !== 'battle' || game.currentTurn !== socket.id) return;
    const { r, c } = data;
    if (r < 0 || r > 9 || c < 0 || c > 9) return;
    const opId = game.playerOrder.find(pid => pid !== socket.id);
    const opponent = game.players[opId], shooter = game.players[socket.id];
    if (shooter.shots[r][c] !== null) { socket.emit('error', { message: 'Already shot there!' }); return; }
    clearIdleTimer(game);
    const shipId = opponent.board[r][c];
    let result, sunkShip = null;
    if (shipId) {
      result = 'hit'; shooter.shots[r][c] = 'hit'; opponent.ships[shipId].hits++;
      if (opponent.ships[shipId].hits >= opponent.ships[shipId].positions.length) {
        opponent.ships[shipId].sunk = true;
        sunkShip = SHIP_TYPES.find(t => t.id === shipId);
      }
    } else { result = 'miss'; shooter.shots[r][c] = 'miss'; }
    io.to(game.id).emit('fireResult', { shooter: socket.id, shooterName: shooter.name, r, c, result, sunkShip: sunkShip ? sunkShip.name : null });
    setTimeout(() => io.to(game.id).emit('jackMessage', { text: randomQuote(sunkShip ? 'sunk' : result) }), 600);
    if (allShipsSunk(opponent)) {
      game.phase = 'finished'; game.winner = socket.id;
      setTimeout(() => {
        io.to(game.id).emit('gameOver', { winner: socket.id, winnerName: shooter.name, loserName: opponent.name });
        io.to(game.id).emit('jackMessage', { text: randomQuote('gameOver') });
      }, 1200);
      return;
    }
    game.currentTurn = opId;
    io.to(game.id).emit('turnChange', { currentTurn: opId, turnName: opponent.name });
    startIdleTimer(game);
  });

  socket.on('chatMessage', (data) => {
    const game = games.get(socket.gameId);
    if (!game) return;
    const player = game.players[socket.id];
    if (!player) return;
    io.to(game.id).emit('chatMessage', { sender: player.name, text: data.text, isJack: false });
    if (Math.random() < 0.2) setTimeout(() => io.to(game.id).emit('jackMessage', { text: randomQuote('chat') }), 1500);
  });

  socket.on('disconnect', () => {
    if (waitingPlayer === socket) waitingPlayer = null;
    if (socket.gameId) {
      const game = games.get(socket.gameId);
      if (game && game.phase !== 'finished') {
        clearIdleTimer(game);
        io.to(game.id).emit('opponentLeft', { message: 'Opponent abandoned ship! You win!' });
        games.delete(game.id);
      }
    }
  });
});

setInterval(() => { for (const [id, g] of games) { if (g.phase === 'finished' || g.phase === 'waiting') games.delete(id); } }, 30*60*1000);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', instance: process.env.INSTANCE_ID || 'unknown' }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Battleship server on port ${PORT}`));
