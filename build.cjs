const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const name of ['styles.css', 'microgames.css', 'extra-games.css', 'arcade-games.css', 'butterfly.css', 'theme.css', 'aero.css']) {
  html = html.replace(`<link rel="stylesheet" href="${name}">`, `<style>\n${fs.readFileSync(path.join(root, name), 'utf8')}\n</style>`);
}
for (const name of ['engine.js', 'microgames.js', 'extra-games.js', 'arcade-games.js', 'butterfly.js', 'previews.js', 'theme.js', 'vendor/three.min.js', 'aero.js', 'app.js']) {
  const js = fs.readFileSync(path.join(root, name), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(`<script src="${name}"></script>`, `<script>\n${js}\n</script>`);
}
html = html.replace('href="icon.svg"', 'href="data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'icon.svg')).toString('base64') + '"');
html = html.replace('href="./"', 'href="#"');
const output = path.resolve(root, process.argv[2] || 'dist/little-rush.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log('Built portable ' + path.relative(root, output) + ' (' + Buffer.byteLength(html) + ' bytes)');
