'use strict';

const { randomUUID } = require('node:crypto');

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 45000;
const REQUEST_TIMEOUT_MS = 25000;

function getEndpoint() {
  const raw = String(process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!raw) throw new Error('GOOGLE_APPS_SCRIPT_URL is required when EMAIL_PROVIDER=google_apps_script.');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('GOOGLE_APPS_SCRIPT_URL must be a valid Google Apps Script web app URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'script.google.com' ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error('GOOGLE_APPS_SCRIPT_URL must be the deployed HTTPS URL ending in /macros/s/DEPLOYMENT_ID/exec.');
  }

  return url.href;
}

function getToken() {
  const token = String(process.env.GOOGLE_APPS_SCRIPT_TOKEN || '');
  if (token.length < 32) {
    throw new Error('GOOGLE_APPS_SCRIPT_TOKEN must be a private random secret of at least 32 characters.');
  }
  return token;
}

async function sendViaGoogleAppsScript({ to, subject, html, text, type }) {
  const endpoint = getEndpoint();
  const token = getToken();

  if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
    throw new Error('Google Apps Script email provider received an invalid recipient address.');
  }

  const normalizedSubject = String(subject || '').trim();
  const htmlBody = String(html || '');
  const textBody = String(text || '');

  if (!normalizedSubject || normalizedSubject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(normalizedSubject)) {
    throw new Error('Email subject must be between 1 and 200 characters and contain no line breaks.');
  }
  if (htmlBody.length > MAX_BODY_LENGTH || textBody.length > MAX_BODY_LENGTH) {
    throw new Error('Email body exceeds the Google Apps Script provider size limit.');
  }
  if (!htmlBody && !textBody) {
    throw new Error('Email must contain an HTML body or plain-text body.');
  }

  const requestId = randomUUID();
  const payload = {
    token,
    requestId,
    to: to.trim(),
    subject: normalizedSubject,
    htmlBody,
    textBody: textBody || 'This email is best viewed in an HTML-capable email client.',
    type: String(type || 'RoleSphere notification').slice(0, 100)
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // Apps Script ContentService returns its response from a googleusercontent
      // URL after a redirect. Fetch follows that response URL automatically.
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    throw new Error(`Unable to reach the Google Apps Script email service: ${error.name === 'TimeoutError' ? 'request timed out' : error.message}`);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Google Apps Script returned an invalid response. Check that the Web App deployment is accessible to anyone.');
  }

  if (!response.ok || !result || result.ok !== true) {
    const reason = result && typeof result.error === 'string'
      ? result.error.slice(0, 240)
      : `HTTP ${response.status}`;
    throw new Error(`Google Apps Script did not accept the email: ${reason}`);
  }

  if (result.requestId && result.requestId !== requestId) {
    throw new Error('Google Apps Script response did not match the email request.');
  }

  return {
    accepted: [to.trim()],
    rejected: [],
    response: 'Accepted by Google Apps Script MailApp',
    provider: 'google_apps_script',
    requestId
  };
}

module.exports = { sendViaGoogleAppsScript };
