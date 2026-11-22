const TZ = 'Asia/Kolkata';
const ymd = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const time = (date = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
const sunday = (date = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date) === 'Sun';
const late = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m > 9 * 60 + 15; };
const workingDays = (start, end) => {
  let count = 0;
  for (let d = new Date(start + 'T00:00:00Z'); d <= new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    if (![0, 6].includes(d.getUTCDay())) count++;
  }
  return count;
};
module.exports = { TZ, ymd, time, sunday, late, workingDays };
