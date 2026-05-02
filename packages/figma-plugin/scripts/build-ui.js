/**
 * Build script to inline UI JavaScript into HTML
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const htmlPath = path.join(__dirname, '..', 'src', 'ui.html');
const jsPath = path.join(distDir, 'ui.js');
const outputPath = path.join(distDir, 'ui.html');

// Read files
let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// Replace external script reference with inline script
html = html.replace(
  '<script src="ui.js"></script>',
  `<script>${js}</script>`
);

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write output
fs.writeFileSync(outputPath, html);

console.log('UI HTML built successfully');
