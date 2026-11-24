/**
 * RoleSphere Google Apps Script mail gateway.
 *
 * Publishes as a Web App. The backend calls doPost() over HTTPS; Gmail is never
 * exposed to the browser and the shared token is stored in Script Properties.
 *
 * Required Script Property:
 *   ROLESPHERE_EMAIL_TOKEN = the same random token configured on Render.
 */

function doGet() {
  return jsonOutput_({
    ok: true,
    service: 'RoleSphere email gateway',
    method: 'POST'
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return jsonOutput_({ ok: false, error: 'Email service is busy. Try again shortly.' });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, error: 'A JSON POST body is required.' });
    }

    if (Number(e.postData.contents.length) > 100000) {
      return jsonOutput_({ ok: false, error: 'Request is too large.' });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (error) {
      return jsonOutput_({ ok: false, error: 'Invalid JSON request.' });
    }

    var configuredToken = PropertiesService.getScriptProperties()
      .getProperty('ROLESPHERE_EMAIL_TOKEN');
    if (!configuredToken || !constantTimeEquals_(String(payload.token || ''), configuredToken)) {
      return jsonOutput_({ ok: false, error: 'Unauthorized email request.' });
    }

    var to = String(payload.to || '').trim();
    var subject = String(payload.subject || '').trim();
    var htmlBody = String(payload.htmlBody || '');
    var textBody = String(payload.textBody || '');
    var requestId = String(payload.requestId || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      return jsonOutput_({ ok: false, error: 'Invalid recipient address.' });
    }
    if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) {
      return jsonOutput_({ ok: false, error: 'Invalid email subject.' });
    }
    if (htmlBody.length > 45000 || textBody.length > 45000 || (!htmlBody && !textBody)) {
      return jsonOutput_({ ok: false, error: 'Email body is empty or too large.' });
    }
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) {
      return jsonOutput_({ ok: false, error: 'Invalid request identifier.' });
    }

    var cache = CacheService.getScriptCache();
    var cacheKey = 'rolesphere-email-' + requestId;
    var previous = cache.get(cacheKey);
    if (previous === 'sent') {
      return jsonOutput_({ ok: true, duplicate: true, requestId: requestId });
    }
    if (previous === 'processing') {
      return jsonOutput_({ ok: false, error: 'This email request is already processing.' });
    }

    cache.put(cacheKey, 'processing', 300);

    try {
      if (MailApp.getRemainingDailyQuota() < 1) {
        cache.remove(cacheKey);
        return jsonOutput_({ ok: false, error: 'Google account daily email quota is exhausted.' });
      }

      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: textBody || 'This email is best viewed in an HTML-capable email client.',
        htmlBody: htmlBody || undefined,
        name: 'RoleSphere'
      });

      cache.put(cacheKey, 'sent', 21600);
      return jsonOutput_({
        ok: true,
        requestId: requestId,
        provider: 'Google Apps Script MailApp',
        remainingRecipientsToday: MailApp.getRemainingDailyQuota()
      });
    } catch (error) {
      cache.remove(cacheKey);
      console.error('RoleSphere email send failed: ' + String(error && error.message || error));
      return jsonOutput_({ ok: false, error: 'Google MailApp could not send this email.' });
    }
  } finally {
    lock.releaseLock();
  }
}

function constantTimeEquals_(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function jsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
