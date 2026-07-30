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

wss.on('connection', (ws) => {
  let roomCode = null;
  let mySide = null;
  let nick = '꼬미집사';

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // 방 생성
      if (msg.t === 'create') {
        const code = msg.code;
        nick = (msg.n || '꼬미집사').slice(0, 10);
        if (!rooms[code]) {
          rooms[code] = { players: {} };
        }
        rooms[code].players[0] = { ws, nick };
        roomCode = code;
        mySide = 0;
        ws.send(JSON.stringify({ t: 'wait', code }));

        if (rooms[code].players[1]) {
          const oppNick = rooms[code].players[1].nick;
          rooms[code].players[0].ws.send(JSON.stringify({ t: 'start', code, side: 0, oppNick }));
          rooms[code].players[1].ws.send(JSON.stringify({ t: 'start', code, side: 1, oppNick: nick }));
        }
        return;
      }

      // 방 참가
      if (msg.t === 'join') {
        const code = msg.code;
        nick = (msg.n || '꼬미집사').slice(0, 10);
        if (!rooms[code] || !rooms[code].players[0]) {
          ws.send(JSON.stringify({ t: 'err', m: '방을 찾을 수 없어요.' }));
          return;
        }
        if (rooms[code].players[1]) {
          ws.send(JSON.stringify({ t: 'err', m: '이미 2명이 참가했어요.' }));
          return;
        }
        rooms[code].players[1] = { ws, nick };
        roomCode = code;
        mySide = 1;

        const hostNick = rooms[code].players[0].nick;
        rooms[code].players[0].ws.send(JSON.stringify({ t: 'start', code, side: 0, oppNick: nick }));
        rooms[code].players[1].ws.send(JSON.stringify({ t: 'start', code, side: 1, oppNick: hostNick }));
        return;
      }

      // 채팅
      if (msg.t === 'c' && roomCode && rooms[roomCode]) {
        const oppSide = mySide === 0 ? 1 : 0;
        const opp = rooms[roomCode].players[oppSide];
        if (opp && opp.ws.readyState === WebSocket.OPEN) {
          opp.ws.send(JSON.stringify({ t: 'c', from: nick, m: msg.m }));
        }
        return;
      }

      // 그 외 모든 메시지 — 상대방에게 그대로 전달
      if (roomCode && rooms[roomCode]) {
        const oppSide = mySide === 0 ? 1 : 0;
        const opp = rooms[roomCode].players[oppSide];
        if (opp && opp.ws.readyState === WebSocket.OPEN) {
          opp.ws.send(data.toString());
        }
      }

    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    if (roomCode && rooms[roomCode]) {
      const oppSide = mySide === 0 ? 1 : 0;
      const opp = rooms[roomCode].players[oppSide];
      if (opp && opp.ws.readyState === WebSocket.OPEN) {
        opp.ws.send(JSON.stringify({ t: 'bye', m: '상대가 나갔어요.' }));
      }
      delete rooms[roomCode].players[mySide];
      if (!rooms[roomCode].players[0] && !rooms[roomCode].players[1]) {
        delete rooms[roomCode];
      }
    }
  });

  ws.on('error', (err) => console.error('WS error:', err));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('꼬미배구 서버 시작: http://localhost:' + PORT);
});
