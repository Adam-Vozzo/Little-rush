const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');

test('portable build preserves every script literally, including vendor replacement tokens', () => {
  const root=path.join(__dirname,'..');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'little-rush-build-'));
  const output=path.join(directory,'game.html');
  try {
    execFileSync(process.execPath,[path.join(root,'build.cjs'),output]);
    const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const html=fs.readFileSync(output,'utf8');
    assert.doesNotMatch(html,/<script src=|<link rel="stylesheet"/);
    const names=[...source.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match=>match[1]);
    const scripts=[...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(match=>match[1]);
    assert.equal(scripts.length,names.length);
    names.forEach((name,index)=>{
      const expected=fs.readFileSync(path.join(root,name),'utf8').replace(/<\/script/gi,'<\\/script');
      assert.equal(scripts[index],expected,`${name} changed while being embedded`);
      assert.doesNotThrow(()=>new vm.Script(scripts[index],{filename:name}));
    });
  } finally {
    if(fs.existsSync(output))fs.unlinkSync(output);
    fs.rmdirSync(directory);
  }
});
