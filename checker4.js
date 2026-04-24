import fs from 'fs';
import * as acorn from 'acorn';

try {
  let htmlPath = process.argv[2] || 'index.html';
  console.log('Checking', htmlPath);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
  let match;
  let i = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    console.log(`Checking script ${i}...`);
    const code = match[1];
    try {
      acorn.parse(code, { ecmaVersion: 2022, locations: true });
      console.log(`Script ${i} Syntax OK`);
    } catch(e) {
      console.error(`Script ${i} Syntax error:`, e.message);
      if (e.loc) {
        console.error(`Line: ${e.loc.line}, Column: ${e.loc.column}`);
        // print offending line
        const lines = code.split('\n');
        console.error(lines[e.loc.line - 1]);
      }
    }
    i++;
  }
} catch (e) {
  console.error('File read error:', e.message);
}
