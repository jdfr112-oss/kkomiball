const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 정적 파일 (HTML)
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'kkomi-volleyball-online.html')));

const rooms = {};
const WINPT = 15;

class GameRoom {
  constructor(code) {
    this.code = code;
    this.players = {};
    this.state = 'waiting'; // waiting | play | point | over
    this.score = [0, 0];
    this.ball = { x: 108, y: 42, vx: 0, vy: 0, power: 0 };
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
    this.players[side] = { ws, nick, input: 0, lastSeen: Date.now() };
    return Object.keys(this.players).length === 2;
  }

  broadcast(msg) {
    Object.values(this.players).forEach(p => {
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg));
    });
  }

step() {
  this.tick++;
  const inp0 = this.players[0]?.input || 0;
  const inp1 = this.players[1]?.input || 0;

  // 브로드캐스트 (클라이언트가 게임 계산하도록)
  const msg = {
    t: 's',
    p0: this.packP(this.p[0]),
    p1: this.packP(this.p[1]),
    b: [this.ball.x, this.ball.y, this.ball.vx, this.ball.vy, this.ball.power],
    sc: this.score,
    st: this.state,
    sv: this.serveT,
    sr: this.server,
    wn: this.winner,
    i0: inp0,
    i1: inp1
  };
  this.broadcast(msg);
}

  packP(p) {
    return [
      Math.round(p.x * 10) / 10,
      Math.round(p.y * 10) / 10,
      p.vx,
      p.vy,
      p.onGround ? 1 : 0,
      p.pose,
      p.poseT,
      Math.round(p.spin * 100) / 100
    ];
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
        // 방 생성
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
      } else if (msg.t === 'join') {
        // 방 참가
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
      } else if (msg.t === 'i' && room) {
        // 입력
        if (room.players[mySide]) room.players[mySide].input = msg.k;
      } else if (msg.t === 'c' && room) {
  // 채팅 — 자신 제외 다른 사람에게만 전송
  Object.values(room.players).forEach(p => {
    if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({ t: 'c', from: nick, m: msg.m }));
    }
  });
}
    } catch (e) {
      console.error(e);
    }
  });

  ws.on('close', () => {
    if (room) {
      delete room.players[mySide];
      if (Object.keys(room.players).length === 0) {
        delete rooms[Object.keys(rooms).find(k => rooms[k] === room)];
      } else {
        room.broadcast({ t: 'bye', m: '상대가 나갔어요.' });
      }
    }
  });
});

// 게임 루프 (모든 방에 대해 60fps)
setInterval(() => {
  Object.values(rooms).forEach(room => {
    if (room.state !== 'waiting') room.step();
  });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`서버 시작: http://localhost:${PORT}`));
