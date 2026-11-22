const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { ymd,time,sunday,late,workingDays } = require('../backend/utils/dates');
const { previousMonth } = require('../backend/services/monthlyReports');
test('IST rolls date forward at 18:30 UTC', () => { expect(ymd(new Date('2026-10-17T19:00:00Z'))).toBe('2026-10-18'); expect(time(new Date('2026-10-17T19:00:00Z'))).toBe('00:30:00'); expect(sunday(new Date('2026-10-17T19:00:00Z'))).toBe(true); });
test('late cutoff uses IST time and allows 09:15', () => { expect(late('09:15:59')).toBe(false); expect(late(time(new Date('2026-10-17T03:46:00Z')))).toBe(true); });
test('working days use UTC arithmetic independent of host zone', () => { expect(workingDays('2030-01-31','2030-02-04')).toBe(3); expect(workingDays('2030-02-02','2030-02-03')).toBe(0); });
test('scheduled reports target previous month including year rollover', () => { expect(previousMonth(new Date('2027-01-01T02:30:00Z'))).toBe('2026-12'); });
function browser() {
  const dom=new JSDOM('<!doctype html><body><div id="target"></div></body>',{ url:'http://localhost',runScripts:'outside-only' });
  dom.window.fetch=async()=>({ ok:false });
  dom.window.eval(fs.readFileSync(require.resolve('dompurify/dist/purify.min.js'),'utf8'));
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../frontend/public/js/ui.js'),'utf8'));
  return dom;
}
test('all legacy HTML sinks remove scripts, event attributes and unsafe URLs', () => { const dom=browser(); const target=dom.window.document.getElementById('target'); target.innerHTML='<img src=x onerror="window.pwned=true"><script>alert(1)</script><a href="javascript:alert(1)">Click</a>'; expect(target.innerHTML).not.toContain('onerror'); expect(target.innerHTML).not.toContain('<script'); expect(target.innerHTML).not.toContain('javascript:'); expect(dom.window.pwned).toBeUndefined(); dom.window.close(); });
test('escapeHtml handles quotes and null safely', () => { const dom=browser(); expect(dom.window.escapeHtml('<a "x">&\'')).toBe('&lt;a &quot;x&quot;&gt;&amp;&#39;'); expect(dom.window.escapeHtml(null)).toBe(''); dom.window.close(); });
test('delegated legacy handlers receive data as values', () => { const dom=browser(); const target=dom.window.document.getElementById('target'); let received; dom.window.rsHandlers.test=function(){received=this.dataset.value;}; target.innerHTML='<button data-rs-click="test" data-value="&#39;);alert(1)//">Open</button>'; target.querySelector('button').click(); expect(received).toBe("');alert(1)//"); dom.window.close(); });
