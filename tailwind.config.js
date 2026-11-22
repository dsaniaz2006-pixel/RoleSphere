module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./frontend/views/**/*.ejs', './frontend/public/js/**/*.js', './frontend/src/**/*.{ts,tsx}'],
  safelist: [{ pattern: /(?:bg|text|border)-(?:red|green|blue|yellow|amber|indigo|purple|gray|primary)-(?:50|100|200|500|600|700|800|900)/ }],
  theme: { extend: { fontFamily:{ sans:['Inter','system-ui','sans-serif'] }, colors: { background: '#fafbfc', primary: { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a' } } } },
  plugins: []
};
