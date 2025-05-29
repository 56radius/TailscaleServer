const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const os = require('os');
const { exec } = require('child_process');

const PORT = process.env.PORT || 5050;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map(); // Map userId => ws connection

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'register') {
        userId = data.userId;
        clients.set(userId, ws);
        console.log(`User registered: ${userId}`);
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
          console.log(`User ${data.to} not connected`);
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

// Helper to get all server IPs (including tailscale)
function getServerIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  Object.keys(interfaces).forEach((name) => {
    interfaces[name].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    });
  });

  return ips;
}

// Get IPs endpoint — shows server IPs + client IP
app.get('/get-ip', (req, res) => {
  const serverIps = getServerIps();

  // Get client IP address:
  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  if (clientIp.includes(',')) {
    clientIp = clientIp.split(',')[0].trim();
  }

  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.replace('::ffff:', '');
  }

  res.json({
    serverIps,
    clientIp,
  });
});

// ✅ Actual working ping endpoint
app.get('/ping', (req, res) => {
  const ip = req.query.ip;
  if (!ip) {
    return res.status(400).json({ success: false, message: 'Missing IP address' });
  }

  const platform = os.platform();
  const pingCommand = platform === 'win32' ? `ping -n 1 ${ip}` : `ping -c 1 ${ip}`;

  exec(pingCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Ping failed: ${stderr}`);
      return res.status(500).json({ success: false, message: 'Ping failed', error: stderr });
    }

    return res.json({ success: true, message: 'Ping successful', ip });
  });
});

app.get('/', (req, res) => {
  res.send('🚀 WebSocket server is running!');
});

server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 WebSocket endpoint ws://localhost:${PORT}`);
});
