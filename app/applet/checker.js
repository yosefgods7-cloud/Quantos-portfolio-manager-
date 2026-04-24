import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const code = scriptMatch[1];
  fs.writeFileSync('temp.js', code);
  try {
    new Function(code);
    console.log('Syntax OK');
  } catch(e) {
    console.error('Syntax error:', e.message);
    const syntaxError = new SyntaxError(e.message);
    // try to find line:
    // the built-in syntax checker doesn't always give line numbers if new Function is used, but we can try building with acorn or just running it through node via child_process.
  }
}
