/**
 * VJ Remote Server — standalone Node.js WebSocket server for VJ remote control.
 * Runs alongside the Vite dev server on a separate port.
 * Relays messages between connected VJ app instances and remote control pages.
 *
 * Usage: npx tsx src/remote/vj-remote-server.ts
 */

import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.VJ_REMOTE_PORT ?? "9876", 10);

const wss = new WebSocketServer({ port: PORT });

console.log(`VJ Remote Server listening on ws://localhost:${PORT}`);

/** Track connected clients */
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`Client connected (${clients.size} total)`);

  // Broadcast client count to all
  broadcastClientCount();

  ws.on("message", (data) => {
    const message = data.toString();

    // Relay to all other clients
    for (const client of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`Client disconnected (${clients.size} total)`);
    broadcastClientCount();
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    clients.delete(ws);
  });

  // Send ping every 30s to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  ws.on("close", () => clearInterval(pingInterval));
});

function broadcastClientCount() {
  const msg = JSON.stringify({
    type: "state_delta",
    payload: { remoteClientCount: clients.size },
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
