const fs = require('fs');
let code = fs.readFileSync('NotificationEngine.js', 'utf8');

// The remaining discord branches:
code = code.replace(/if\s*\(type === 'discord'\)\s*\{\s*return \{\s*embeds:(?:.|\n)*?\}\s*\} else \{\s*(?:return )?(`.*`);\s*\}/g, 'return $1;');
code = code.replace(/if\s*\(type\s*===\s*'discord'\)\s*\{\s*return \{\s*embeds:(?:.|\n)*?\}\s*\} else \{\s*(?:return )?(`.*`);\s*\}/g, 'return $1;');
code = code.replace(/if\(type\s*===\s*'discord'\)\s*\{\s*return \{\s*embeds:(?:.|\n)*?\}\s*\}\s*else\s*\{\s*(?:return )?(`.*`);\s*\}/g, 'return $1;');

code = code.replace(/type === 'discord' \? \{ embeds.*?\}\} \: /g, '');

fs.writeFileSync('NotificationEngine.js', code);
