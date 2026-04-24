import fs from 'fs';
import * as acorn from 'acorn';

try {
  let htmlPath = process.argv[2] || '/index.html';
  console.log('Checking', htmlPath);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const code = scriptMatch[1];
    try {
      acorn.parse(code, { ecmaVersion: 2022, locations: true });
      console.log('Syntax OK');
    } catch(e) {
      console.error('Syntax error:', e.message);
      if (e.loc) {
        console.error(`Line: ${e.loc.line}, Column: ${e.loc.column}`);
        // print offending line
        const lines = code.split('\n');
        console.error(lines[e.loc.line - 1]);
      }
    }
  } else {
    console.error('No script tag found');
  }
} catch (e) {
  console.error('File read error:', e.message);
}
