import fs from 'fs';
const html = fs.readFileSync('/index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const code = scriptMatch[1];
  fs.writeFileSync('./temp.js', code);
  import('child_process').then(cp => {
    try {
      cp.execSync('node -c ./temp.js', { stdio: 'inherit' });
      console.log('Syntax OK');
    } catch(e) {
      console.error(e.message);
    }
  });
}
