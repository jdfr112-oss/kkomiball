const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const rooms = {};

class GameRoom {
  constructor(code) {
    this.code = code;
    this.players = {};
    this.state = 'waiting';
    this.score = [0, 0];
    this.ball = { x: 216, y: 40, vx: 0, vy: 0, power: 0 };
    this.p = [
      { x: 108, y: 250, vx: 0, vy: 0, onGround: true, pose: 'stand', poseT: 0, spin: 0 },
      { x: 324, y: 250, vx: 0, vy: 0, onGround: true, pose: 'stand', poseT: 0, spin: 0 }
    ];
    this.server = 0;
    this.serveT = 70;
    this.tick = 0;
    this.winner = -1;
  }

  addPlayer(ws, side, nick) {
    this.players[side] = { ws, nick, input: 0 };
    return Object.keys(this.players).length === 2;
  }

  broadcast(msg) {
    Object.values(this.players).forEach(p => {
      if (p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify(msg));
      }
    });
  }

  broadcastExcept(ws, msg) {
    Object.values(this.players).forEach(p => {
      if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify(msg));
      }
    });
  }

  step() {
    this.tick++;
    if (this.state === 'waiting' || Object.keys(this.players).length < 2) return;

    const msg = {
      t: 's',
      p0: [this.p[0].x, this.p[0].y, this.p[0].vx, this.p[0].vy, this.p[0].onGround ? 1 : 0, this.p[0].pose, this.p[0].poseT, this.p[0].spin],
      p1: [this.p[1].x, this.p[1].y, this.p[1].vx, this.p[1].vy, this.p[1].onGround ? 1 : 0, this.p[1].pose, this.p[1].poseT, this.p[1].spin],
      b: [this.ball.x, this.ball.y, this.ball.vx, this.ball.vy, this.ball.power],
      sc: this.score,
      st: this.state,
      sv: this.serveT,
      sr: this.server,
      wn: this.winner,
      i0: Object.values(this.players)[0]?.input || 0
    };
    this.broadcast(msg);
  }
}

wss.on('connection', (ws) => {
  let room = null;
  let mySide = null;
  let nick = '꼬미집사';

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.t === 'create') {
        const code = msg.code || Math.random().toString(36).slice(2, 6).toUpperCase();
        if (!rooms[code]) rooms[code] = new GameRoom(code);
        room = rooms[code];
        mySide = 0;
        nick = (msg.n || '꼬미집사').slice(0, 10);

        if (room.addPlayer(ws, 0, nick)) {
          room.state = 'play';
          room.broadcast({ t: 'start', code });
        } else {
          ws.send(JSON.stringify({ t: 'wait', code }));
        }
      } 
      else if (msg.t === 'join') {
        const code = msg.code;
        if (!rooms[code]) {
          ws.send(JSON.stringify({ t: 'err', m: '방을 찾을 수 없어요.' }));
          return;
        }
        room = rooms[code];
        mySide = 1;
        nick = (msg.n || '꼬미집사').slice(0, 10);

        if (room.addPlayer(ws, 1, nick)) {
          room.state = 'play';
          room.broadcast({ t: 'start', code });
        } else {
          ws.send(JSON.stringify({ t: 'err', m: '이미 2명이 참가했어요.' }));
        }
      } 
      else if (msg.t === 'i' && room) {
        if (room.players[mySide]) room.players[mySide].input = msg.k;
      } 
      else if (msg.t === 'c' && room) {
        room.broadcastExcept(ws, { t: 'c', from: nick, m: msg.m });
      }
    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    if (room) {
      delete room.players[mySide];
      if (Object.keys(room.players).length === 0) {
        const code = Object.keys(rooms).find(k => rooms[k] === room);
        if (code) delete rooms[code];
      } else {
        room.broadcast({ t: 'bye', m: '상대가 나갔어요.' });
      }
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

setInterval(() => {
  Object.values(rooms).forEach(room => room.step());
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 꼬미배구 서버 시작: http://localhost:${PORT}`);
});
