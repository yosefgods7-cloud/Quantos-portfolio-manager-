import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/g);
const code = scriptMatch[1].replace(/<script>|<\/script>/g, '');

let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;

for (let i = 0; i < code.length; i++) {
  const c = code[i];
  // Ignore inside strings and comments
  // This is a naive check but good enough for a rough idea
  // Actually, better to just print the stack
}

// Let's rely on acorn to tell us roughly where the context is open
// We can parse line by line or use a real tokenizer.
