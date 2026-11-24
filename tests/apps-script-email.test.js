"use strict";

const { sendViaGoogleAppsScript } = require("../backend/services/appsScriptEmail");

describe("Google Apps Script email transport", () => {
  const originalFetch = global.fetch;
  const originalEndpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  const originalToken = process.env.GOOGLE_APPS_SCRIPT_TOKEN;

  beforeEach(() => {
    process.env.GOOGLE_APPS_SCRIPT_URL =
      "https://script.google.com/macros/s/test-deployment-id/exec";
    process.env.GOOGLE_APPS_SCRIPT_TOKEN = "a".repeat(64);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, provider: "Google Apps Script MailApp" })
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.GOOGLE_APPS_SCRIPT_URL;
    else process.env.GOOGLE_APPS_SCRIPT_URL = originalEndpoint;
    if (originalToken === undefined) delete process.env.GOOGLE_APPS_SCRIPT_TOKEN;
    else process.env.GOOGLE_APPS_SCRIPT_TOKEN = originalToken;
  });

  test("sends the rendered email and private token to the deployed Apps Script URL", async () => {
    const result = await sendViaGoogleAppsScript({
      to: "employee@example.com",
      subject: "RoleSphere notification",
      html: "<h1>Hello</h1>",
      text: "Hello",
      type: "Test notification"
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(process.env.GOOGLE_APPS_SCRIPT_URL);
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("follow");

    const payload = JSON.parse(options.body);
    expect(payload.token).toBe("a".repeat(64));
    expect(payload.to).toBe("employee@example.com");
    expect(payload.subject).toBe("RoleSphere notification");
    expect(payload.htmlBody).toBe("<h1>Hello</h1>");
    expect(payload.requestId).toMatch(/^[\w-]{16,80}$/);

    expect(result.accepted).toEqual(["employee@example.com"]);
    expect(result.provider).toBe("google_apps_script");
  });

  test("rejects missing endpoint or short token before making a request", async () => {
    delete process.env.GOOGLE_APPS_SCRIPT_URL;
    await expect(sendViaGoogleAppsScript({
      to: "employee@example.com", subject: "Subject", text: "Text"
    })).rejects.toThrow("GOOGLE_APPS_SCRIPT_URL is required");

    process.env.GOOGLE_APPS_SCRIPT_URL =
      "https://script.google.com/macros/s/test-deployment-id/exec";
    process.env.GOOGLE_APPS_SCRIPT_TOKEN = "too-short";
    await expect(sendViaGoogleAppsScript({
      to: "employee@example.com", subject: "Subject", text: "Text"
    })).rejects.toThrow("at least 32 characters");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects non-HTTPS or non-deployment URLs", async () => {
    process.env.GOOGLE_APPS_SCRIPT_URL =
      "http://script.google.com/macros/s/test-deployment-id/exec";
    await expect(sendViaGoogleAppsScript({
      to: "employee@example.com", subject: "Subject", text: "Text"
    })).rejects.toThrow("deployed HTTPS URL");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects an Apps Script response that reports a send failure", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "Daily email quota exhausted." })
    });

    await expect(sendViaGoogleAppsScript({
      to: "employee@example.com",
      subject: "Subject",
      text: "Text"
    })).rejects.toThrow("Daily email quota exhausted.");
  });

  test("does not accept a mismatched request ID in the response", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, requestId: "another-request-id" })
    });

    await expect(sendViaGoogleAppsScript({
      to: "employee@example.com",
      subject: "Subject",
      text: "Text"
    })).rejects.toThrow("did not match the email request");
  });
});
