"use strict";

module.exports = {
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async (message) => ({
      messageId: "<rolesphere-jest@example.test>",
      accepted: [message.to],
      rejected: [],
      response: "MOCK ONLY - no real email was sent",
    })),
    verify: jest.fn(async () => true),
    close: jest.fn(),
  })),
};
