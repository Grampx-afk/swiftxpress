const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
const obfPath = path.join(__dirname, 'sx-script-obf.js');

const indexContent = fs.readFileSync(indexPath, 'utf8');
const obfContent = fs.readFileSync(obfPath, 'utf8');

const lines = indexContent.split(/\r?\n/);

// Replacement range: lines 4575 to 6034 (1-indexed)
// which is index 4574 to 6033
const startIdx = 4574;
const endIdx = 6033;

const head = lines.slice(0, startIdx);
const tail = lines.slice(endIdx + 1);

const newContent = head.join('\n') + '\n  <script>\n' + obfContent + '\n  </script>\n' + tail.join('\n');

fs.writeFileSync(indexPath, newContent, 'utf8');
console.log('Successfully patched index.html');
