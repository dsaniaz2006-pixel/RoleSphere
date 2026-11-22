const Notification = require("../models/Notification");

/**
 * notificationService
 *
 * Central place to create in-app notifications.
 * Also emits a Socket.io event to the recipient in real-time if they're online.
 *
 * Usage:
 *   const { notify } = require("../services/notificationService");
 *   await notify({
 *     recipientId:    user._id,
 *     recipientModel: "Employee",
 *     type:           "leave",
 *     title:          "Leave Approved",
 *     message:        "Your annual leave Jun 20–24 has been approved.",
 *     link:           "/employee/dashboard",
 *     io:             req.app.get("io")   // pass the socket.io instance
 *   });
 */

async function notify({ recipientId, recipientModel, type, title, message, link = null, io = null }) {
  try {
    // 1. Save to DB
    const notification = await Notification.create({
      recipientId,
      recipientModel,
      type,
      title,
      message,
      link
    });

    // 2. Emit real-time event if socket.io is available
    if (io) {
      // Each user joins a room named after their ID when they connect
      io.to(recipientId.toString()).emit("notification:new", {
        _id:       notification._id,
        type:      notification.type,
        title:     notification.title,
        message:   notification.message,
        link:      notification.link,
        createdAt: notification.createdAt
      });

      // Also emit updated unread count
      const unreadCount = await Notification.countDocuments({
        recipientId,
        isRead: false
      });
      io.to(recipientId.toString()).emit("notification:unread_count", { count: unreadCount });
    }

    return notification;
  } catch (err) {
    // Never let a notification failure crash the main request
    console.error("❌ Notification creation failed:", err.message);
    return null;
  }
}

/**
 * Bulk notify — send the same notification to multiple recipients
 * e.g. notify all managers about a system event
 */
async function notifyMany(recipients, { type, title, message, link = null, io = null }) {
  const promises = recipients.map(({ recipientId, recipientModel }) =>
    notify({ recipientId, recipientModel, type, title, message, link, io })
  );
  return Promise.allSettled(promises);
}

module.exports = { notify, notifyMany };
