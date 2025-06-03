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

// Use Map of userId => { ws, tailscaleIp }
let clients = new Map();

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 📌 User registration
      if (data.type === 'register') {
        userId = data.userId;
        const tailscaleIp = data.tailscaleIp || 'N/A';

        clients.set(userId, { ws, tailscaleIp });
        console.log(`✅ User registered: ${userId} (Tailscale IP: ${tailscaleIp})`);

        ws.send(JSON.stringify({ type: 'registered', userId, tailscaleIp }));
        return;
      }

      // 💬 Handle chat messages
      if (data.type === 'message') {
        const recipient = clients.get(data.to);
        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'message',
            from: data.from,
            message: data.message,
            timestamp: data.timestamp,
          }));
        } else {
          console.log(`❌ User ${data.to} not connected`);
        }
        return;
      }

      // 🔄 WebRTC signaling
      if (['offer', 'answer', 'ice-candidate'].includes(data.type)) {
        const recipient = clients.get(data.to);
        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify(data));
          console.log(`📡 Signaling: ${data.type} from ${data.from} to ${data.to}`);
        } else {
          console.log(`❌ Peer ${data.to} not connected`);
        }
        return;
      }

    } catch (err) {
      console.error('❌ Invalid JSON message:', err);
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`🔌 User disconnected: ${userId}`);
    }
  });
});

// 🌐 Get all server IPs (including Tailscale)
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

// 📡 Endpoint to get IPs
app.get('/get-ip', (req, res) => {
  const serverIps = getServerIps();

  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

  res.json({ serverIps, clientIp });
});

// 🔍 Endpoint to ping an IP (Tailscale check)
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

// 🌍 Root health check
app.get('/', (req, res) => {
  res.send('🚀 WebSocket signaling server is running!');
});

// 🟢 Start server
server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 WebSocket endpoint ws://localhost:${PORT}`);
});
