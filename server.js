// server.js
const WebSocket = require('ws');

const PORT = process.env.PORT || 5050;

const wss = new WebSocket.Server({ port: PORT });

let clients = new Map(); // Map userId -> ws connection

console.log(`WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (message) => {
    // Messages are expected as JSON strings
    try {
      const data = JSON.parse(message);

      // First message should be { type: 'register', userId: '...' }
      if (data.type === 'register') {
        userId = data.userId;
        clients.set(userId, ws);
        console.log(`User registered: ${userId}`);
        ws.send(JSON.stringify({ type: 'registered', userId }));
        return;
      }

      // For sending chat message
      if (data.type === 'message') {
        // data = { type: 'message', to: 'otherUserId', message: 'Hello', from: 'userId', timestamp: 123 }
        const recipientWs = clients.get(data.to);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'message',
            from: data.from,
            message: data.message,
            timestamp: data.timestamp,
          }));
        } else {
          console.log(`User ${data.to} not connected`);
          // Optional: buffer messages locally or notify sender
        }
      }
    } catch (err) {
      console.error('Invalid JSON message:', err);
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`User disconnected: ${userId}`);
    }
  });
});
