const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const os = require('os');

const PORT = process.env.PORT || 5050;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map of connected clients: userId => WebSocket
let clients = new Map();

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'register') {
        userId = data.userId;
        clients.set(userId, ws);
        console.log(`✅ User registered: ${userId}`);
        ws.send(JSON.stringify({ type: 'registered', userId }));
        return;
      }

      if (data.type === 'message') {
        const recipientWs = clients.get(data.to);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'message',
            from: data.from,
            message: data.message,
            timestamp: data.timestamp,
          }));
        } else {
          console.log(`⚠️ User ${data.to} not connected`);
        }
      }
    } catch (err) {
      console.error('❌ Invalid JSON message:', err);
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`👋 User disconnected: ${userId}`);
    }
  });
});

// Utility route to get public IPv4 addresses (including Tailscale)
app.get('/get-ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    });
  });

  res.json({ ips });
});

// Basic status route
app.get('/', (req, res) => {
  res.send('🚀 WebSocket server is running!');
});

server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
  console.log(`🌐 Access locally: ws://localhost:${PORT}`);
  console.log(`🌐 Access via Ngrok: wss://3e32-102-89-23-157.ngrok-free.app`);
});
