const fs = require('fs');
let code = fs.readFileSync('NotificationEngine.js', 'utf8');

// remove lines like:
// if (!cfg.discord?.enabled && !cfg.telegram?.enabled && !cfg.googleChat?.enabled) return;
// if (!cfg.discord?.alerts && !cfg.telegram?.alerts && !cfg.googleChat?.alerts) return;
code = code.replace(/if \(!cfg\.discord.*?return;/g, '');

// remove unused variables like:
// const isDiscord = type === 'discord';
code = code.replace(/const isDiscord = type === 'discord';\n/g, '');

// {discord: cfg.discord?.alerts, telegram: cfg.telegram?.alerts, googleChat: cfg.googleChat?.alerts}
code = code.replace(/\{discord: [^,]+, telegram: ([^,]+), googleChat: [^\}]+\}/g, '{telegram: $1}');

// const dFlags = {discord: cfg.discord?.daily, telegram: cfg.telegram?.daily, googleChat: cfg.googleChat?.daily};
code = code.replace(/const dFlags = \{discord: [^,]+, telegram: ([^,]+), googleChat: [^\}]+\};/g, 'const dFlags = {telegram: $1};');

fs.writeFileSync('NotificationEngine.js', code);
