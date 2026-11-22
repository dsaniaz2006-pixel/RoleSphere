const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { buildSummaryWorkbook } = require('./reportBuilder');
const { ymd } = require('../utils/dates');
function previousMonth(now = new Date()) {
  const [year, month] = ymd(now).slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}
async function sendMonthlyReport() {
  const recipients = (process.env.MONTHLY_REPORT_TO || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!recipients.length || !process.env.EMAIL_USER) throw new Error('Monthly report recipients and SMTP credentials are required');
  const month = previousMonth(); const workbook = await buildSummaryWorkbook(month);
  const transporter = nodemailer.createTransport(process.env.EMAIL_SERVICE ? {
    service: process.env.EMAIL_SERVICE, auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  } : { host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT || 587), secure: process.env.EMAIL_PORT === '465', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
  await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, to: recipients,
    subject: `RoleSphere monthly report: ${month}`, text: `Summary for ${month} is attached.`,
    attachments: [{ filename: `rolesphere-${month}.xlsx`, content: Buffer.from(await workbook.xlsx.writeBuffer()) }] });
}
function startMonthlyReports() {
  if (process.env.ENABLE_MONTHLY_REPORTS !== 'true') return null;
  if (!process.env.MONTHLY_REPORT_TO || !process.env.EMAIL_USER) throw new Error('Configure recipients and SMTP before enabling monthly reports');
  return cron.schedule('0 8 1 * *', () => sendMonthlyReport().catch(e => console.error('Monthly report failed:', e.message)), { timezone: 'Asia/Kolkata', noOverlap: true });
}
module.exports = { previousMonth, sendMonthlyReport, startMonthlyReports };
