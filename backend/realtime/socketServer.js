/**
 * backend/realtime/socketServer.js
 *
 * Sets up Socket.io on your existing Express HTTP or HTTPS server.
 * Each authenticated user joins a private room = their MongoDB _id (as string).
 *
 * This means when you do:
 *   io.to(userId.toString()).emit("notification:new", payload)
 * Only that specific user receives the event.
 *
 * Usage in server.js:
 *   const { createServer } = require("http");
 *   const setupSocket = require('./backend/realtime/socketServer');
 *   const httpServer = createServer(app);
 *   const io = setupSocket(httpServer, sessionMiddleware);
 *   app.set("io", io);   // so routes can access io via req.app.get("io")
 *   httpServer.listen(PORT);
 */

const { Server } = require("socket.io");
const { registerNotificationHandlers } = require("./notificationHandlers");

function setupSocket(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: {
      origin: require('../config/allowedOrigins').allowedOrigins(),
      credentials: true
    },
    // How long to wait before assuming a disconnected client is gone
    pingTimeout:  60000,
    pingInterval: 25000
  });

  // Share Express session with Socket.io
  // This lets us read req.session inside socket.on("connection")
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
  });

  io.on("connection", (socket) => {
    const session = socket.request.session;
    const sessionUser = session?.admin || session?.user;

    if (!sessionUser) {
      // No valid session — disconnect anonymous sockets
      socket.disconnect(true);
      return;
    }

    const userId = sessionUser.id?.toString();
    const role   = session.admin ? "Admin" : session.user?.role;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // Join the user's private room
    socket.join(userId);

    // Also join a role-based room for broadcasts
    // e.g. io.to("role:HR").emit(...) notifies all HR users
    // Public demo sessions receive only their own demo-scoped notifications, never organization-wide broadcasts.
    if (role && sessionUser.isDemo !== true) socket.join(`role:${role}`);

    console.log(`🔌 Socket connected: ${role} [${userId}] (socketId: ${socket.id})`);

    registerNotificationHandlers(socket, userId, undefined, sessionUser.isDemo === true
      ? { demoKey: sessionUser.demoKey || require('../middleware/demoIsolation').DEMO_KEY }
      : null);

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Socket disconnected: ${role} [${userId}] — reason: ${reason}`);
    });
  });

  return io;
}

module.exports = setupSocket;
