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

let clients = new Map(); // userId => { ws, tailscaleIp }

wss.on('connection', (ws) => {
  let userId = null;

  ws.on('message', (message) => {
    const stringMessage = message.toString();
    console.log('📨 Received string message:', stringMessage);

    try {
      const data = JSON.parse(stringMessage);

      // ✅ Registration
      if (data.type === 'register') {
        userId = data.userId;
        const tailscaleIp = data.tailscaleIP && data.tailscaleIP !== 'null' ? data.tailscaleIP : 'N/A';
        clients.set(userId, { ws, tailscaleIp });

        console.log(`✅ User registered: ${userId} (Tailscale IP: ${tailscaleIp})`);
        logConnectedUsers();

        ws.send(JSON.stringify({ type: 'registered', userId, tailscaleIp }));
        return;
      }

      // 💬 Regular chat message
      if (data.type === 'message') {
        console.log(`📩 Message from ${data.from} to ${data.to}: ${data.message}`);

        const recipient = clients.get(data.to);

        console.log("🧭 Current clients:");
        for (const [id, client] of clients.entries()) {
          console.log(` - ${id}: WebSocket readyState = ${client.ws.readyState}`);
        }

        if (recipient) {
          console.log(`📡 Found recipient "${data.to}" → readyState: ${recipient.ws.readyState}`);
        } else {
          console.log(`❌ Recipient "${data.to}" not found in clients map.`);
        }

        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'message',
            to: data.to,
            from: data.from,
            message: data.message,
            timestamp: data.timestamp,
          }));
          console.log(`📤 Message sent to ${data.to}`);
        } else {
          console.log(`❌ Could not send message to ${data.to} — not connected or socket not open`);
        }
        return;
      }

      // 🔄 WebRTC signaling wrapper
      if (data.type === 'webrtc-signal') {
        const { from, to, data: signalData } = data;
        const recipient = clients.get(to);

        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: 'webrtc-signal',
            from,
            to,
            data: signalData,
          }));
          console.log(`📡 Relayed WebRTC signal (${signalData.type}) from ${from} to ${to}`);
        } else {
          console.log(`❌ Could not relay signal: recipient ${to} not connected`);
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
      logConnectedUsers();
    }
  });
});

function logConnectedUsers() {
  console.log("👥 Connected users:");
  for (const [uid, client] of clients.entries()) {
    console.log(` - ${uid} (${client.tailscaleIp}) | ReadyState: ${client.ws.readyState}`);
  }
}

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

app.get('/get-ip', (req, res) => {
  const serverIps = getServerIps();

  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
  if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');

  res.json({ serverIps, clientIp });
});

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
  res.send('🚀 WebSocket signaling server is running!');
});

server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 WebSocket endpoint ws://localhost:${PORT}`);
});
