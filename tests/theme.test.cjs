const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment(reduced = false) {
  const events = new Map(), classes = new Set(), properties = new Map(); let measures = 0;
  const target = prefix => ({
    addEventListener(name, callback, options) { events.set(prefix + name, {callback, options}); },
    removeEventListener(name) { events.delete(prefix + name); },
  });
  const tile = {dataset:{game:'pegs'}, style:{setProperty:(key,value)=>properties.set(key,value), removeProperty:key=>properties.delete(key)},
    classList:{contains:key=>classes.has(key), add:key=>classes.add(key), remove:key=>classes.delete(key)},
    getBoundingClientRect() { measures++; return {left:0,top:0,width:200,height:200}; },
  };
  const document = {...target('doc:'), documentElement:{dataset:{}}, body:{}, hidden:false, querySelector:()=>null, querySelectorAll:()=>[]};
  const window = {...target('win:'), matchMedia:()=>({matches:reduced}), requestAnimationFrame:()=>1, cancelAnimationFrame() {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../theme.js'),'utf8'), {window, document});
  window.LittleRushTheme.setTheme('holofoil');
  return {window, tile, properties, classes, get measures(){return measures;},
    fire(name, x = 100, y = 100, pointerId = 1) { events.get('doc:' + name)?.callback({target:{closest:()=>tile},clientX:x,clientY:y,pointerId}); },
    blur() { events.get('win:blur')?.callback(); }, events,
  };
}

test('holofoil follows every owned pointer move immediately using one stable measurement', () => {
  const e = environment(); e.fire('pointerdown', 10, 10);
  assert.ok(e.classes.has('foil-touch')); assert.equal(e.measures,1);
  assert.equal(e.events.get('doc:pointermove').options.capture,true);
  for (let x = 20; x <= 180; x += 10) {
    e.fire('pointermove', x, 50);
    assert.equal(e.properties.get('--foil-ry'),`${((x/200-.5)*4).toFixed(2)}deg`);
  }
  assert.equal(e.measures,1, 'Dragging must not remeasure a transformed card');
  const before=e.properties.get('--foil-ry');
  e.fire('pointerdown', 5, 5, 2); e.fire('pointermove', 5, 5, 2); e.fire('pointerup', 5, 5, 2);
  assert.equal(e.properties.get('--foil-ry'),before);
  e.fire('pointerup'); assert.equal(e.properties.size,0); assert.equal(e.classes.size,0);
  e.window.LittleRushTheme.destroy(); assert.equal(e.events.size,0);
});

test('holofoil cancellation, blur and reduced motion leave cards level', () => {
  for(const release of ['pointercancel','blur']) {
    const e=environment(); e.fire('pointerdown',10,10);
    if(release==='blur')e.blur(); else e.fire(release);
    assert.equal(e.properties.size,0); assert.equal(e.classes.size,0); e.window.LittleRushTheme.destroy();
  }
  const e=environment(true); e.fire('pointerdown',10,10); e.fire('pointermove',180,180);
  assert.equal(e.properties.size,0); assert.equal(e.measures,0); e.window.LittleRushTheme.destroy();
});
