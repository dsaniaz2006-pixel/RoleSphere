'use strict';
const { registerNotificationHandlers } = require('../backend/realtime/notificationHandlers');
const mongoose = require('mongoose');
function mockSocket() {
  const handlers = new Map();
  const emissions = [];
  return {
    on: (event, handler) => handlers.set(event, handler),
    emit: (event, payload) => emissions.push({event, payload}),
    fire: (event, payload) => handlers.get(event)(payload),
    emissions
  };
}
test('malformed websocket notification payload is rejected rather than crashing the listener',async()=>{
  const socket = mockSocket();
  const model = { findOneAndUpdate: jest.fn(), countDocuments: jest.fn().mockResolvedValue(0) };
  registerNotificationHandlers(socket,'507f1f77bcf86cd799439011',model);
  await expect(socket.fire('notifications:mark_read', undefined)).resolves.toBeUndefined();
  await expect(socket.fire('notifications:mark_read', { notificationId: { $ne:null } })).resolves.toBeUndefined();
  await expect(socket.fire('notifications:mark_read', { notificationId: 'wrong' })).resolves.toBeUndefined();
  expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  expect(socket.emissions.filter(x=>x.event==='notification:error')).toHaveLength(3);
});
test('valid notification ID is scoped to signed-in owner and refreshes the unread count',async()=>{
  const socket = mockSocket();
  const id = new mongoose.Types.ObjectId().toString();
  const model = { findOneAndUpdate: jest.fn().mockResolvedValue({}), countDocuments: jest.fn().mockResolvedValue(3) };
  registerNotificationHandlers(socket,'507f1f77bcf86cd799439011',model);
  await socket.fire('notifications:mark_read', {notificationId:id});
  expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id:id, recipientId:'507f1f77bcf86cd799439011' },expect.objectContaining({isRead:true}));
  expect(socket.emissions).toContainEqual({event:'notification:unread_count',payload:{count:3}});
});
