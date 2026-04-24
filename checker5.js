import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
let i = 1;
while ((match = scriptRegex.exec(html)) !== null) {
  if (i === 2) {
    const code = match[1];
    const lines = code.split('\n');
    console.log("Lines 8408 to 8428 of Script 2:");
    for(let j=8408; j<=8428; j++) {
      console.log(j + ": " + lines[j-1]);
    }
  }
  i++;
}
