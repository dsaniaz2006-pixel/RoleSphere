'use strict';
const { Types } = require('mongoose');
const Notification = require('../models/Notification');
const { runWithDemoContext } = require('../middleware/demoIsolation');

/** Notification events live outside the Socket.IO connection/bootstrap layer. */
function registerNotificationHandlers(socket, userId, model = Notification, demoScope = null) {
  async function inScope(callback) {
    return demoScope ? runWithDemoContext(demoScope, callback) : callback();
  }

  async function count() {
    const unread = await inScope(() => model.countDocuments({ recipientId: userId, isRead: false }));
    socket.emit('notification:unread_count', { count: unread });
  }

  function fail() {
    socket.emit('notification:error', { error: 'Unable to update notifications. Please try again.' });
  }

  socket.on('notifications:get_count', async () => {
    try { await count(); }
    catch (error) { console.error('Socket notifications:get_count error:', error.message); fail(); }
  });

  socket.on('notifications:mark_read', async (payload) => {
    const notificationId = payload && typeof payload === 'object' ? payload.notificationId : null;
    if (typeof notificationId !== 'string' || !Types.ObjectId.isValid(notificationId)) {
      socket.emit('notification:error', { error: 'Invalid notification ID.' });
      return;
    }
    try {
      await inScope(() => model.findOneAndUpdate(
        { _id: notificationId, recipientId: userId },
        { isRead: true, readAt: new Date() }
      ));
      await count();
    } catch (error) { console.error('Socket notifications:mark_read error:', error.message); fail(); }
  });
}
module.exports = { registerNotificationHandlers };
