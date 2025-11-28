// cron/index.js
console.log("Cron jobs initializing...");

require('./autoAbsent');
require('./monthlyEmailCheck');
require('./dailyReport');

console.log("Cron jobs loaded.");
