const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Event/clock double; browser checks cover actual SVG layout and pointer capture.
class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parentElement = null;
    this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = new Map();
    this.className = ''; this.disabled = false; this.hidden = false; this._text = '';
    this.clientWidth = 400; this.clientHeight = 800;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force === undefined ? !this.classList.contains(name) : !!force; this.classList[on ? 'add' : 'remove'](name); return on; },
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(html) {
    this.children = []; this._text = '';
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const element = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(match[1], match[2]);
      for (const name of ['checked', 'disabled', 'hidden']) element[name] = new RegExp(`\\s${name}(?=[\\s/>])`).test(token);
      stack.at(-1).append(element);
      if (!token.endsWith('/>') && !['input', 'br', 'hr', 'img'].includes(tag)) stack.push(element);
    }
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
  }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  querySelectorAll(selector) {
    const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    const matches = element => attribute ? element.getAttribute(attribute[1]) !== null && (attribute[2] === undefined || element.getAttribute(attribute[1]) === attribute[2])
      : selector.startsWith('.') ? element.classList.contains(selector.slice(1)) : element.tagName === selector;
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(name, handler) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(handler); }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  dispatch(name, values = {}) {
    if (name === 'click' && this.disabled) return;
    const event = { preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, detail: 1, clientX: 20, clientY: 20, ...values };
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }
  click(values) { this.dispatch('click', values); }
  setPointerCapture(id) { this.pointerId = id; }
  hasPointerCapture(id) { return this.pointerId === id; }
  releasePointerCapture(id) { if (this.pointerId === id) { this.pointerId = null; this.dispatch('lostpointercapture', { pointerId: id }); } }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() {
    if (this.rect) return this.rect;
    if (this.classList.contains('board-butterfly')) {
      const x = parseFloat(this.style.left) || 0, y = parseFloat(this.style.top) || 0;
      return { left: x - 30, right: x + 30, top: y - 27, bottom: y + 27, width: 60, height: 54 };
    }
    return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight };
  }
}

let catalog, mount;
const window = {LittleRushGames: {register(entries, mounter) { catalog = entries; mount = mounter; }}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../arcade-games.js'), 'utf8'), {window, document: {createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag)}});
const rules = window.LittleRushArcade;
const seeded = initial => { let seed = initial; return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32); };
function game(type, options = {}) {
  const container = new Element('div'), feedback = []; let completions = 0, age = 0;
  const api = mount(container, type, {random: () => 0, onComplete: () => completions++, onFeedback: kind => feedback.push(kind), ...options});
  return {...api, container, feedback, get completions() { return completions; }, get age() { return age; },
    advance(ms, frame = 1000 / 60) { const target = age + ms; while (age < target - 1e-8) { const dt = Math.min(frame, target - age); age += dt; api.tick(age, dt); } },
    all: selector => container.querySelectorAll(selector),
    one(selector) { const el = container.querySelector(selector); assert.ok(el, `Missing ${selector}`); return el; },
    label(label) { const el = container.querySelectorAll('button').find(el => el.getAttribute('aria-label') === label); assert.ok(el, `Missing ${label}`); return el; },
  };
}
function setAngle(g, angle) {
  const isPegs = !!g.container.querySelector('.mg-pegs');
  const field = g.one('.arc-scene'); field.rect = {left: 0, top: 0, width: 200, height: 150};
  const a = angle * Math.PI / 180, target = {clientX: 100 + Math.sin(a) * 80, clientY: (isPegs ? 5 : 138) + Math.cos(a) * 80 * (isPegs ? 1 : -1)};
  field.dispatch('pointerdown', target); field.dispatch('pointerup', target);
}
test('all six games register, mount in demo without reacting, and clean up', () => {
  assert.equal(catalog.length, 6); assert.equal(new Set(catalog.map(item => item.id)).size, 6);
  for (const item of catalog) {
    const g = game(item.id, {demo: true}); g.all('button').forEach(el => el.click()); g.advance(15000);
    assert.equal(g.completions, 0); assert.equal(g.feedback.length, 0); g.destroy(); assert.equal(g.container.children.length, 0);
  }
});
test('500 jewel boards have no pre-existing matches and always have a legal swap', () => {
  const boards = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const board = rules.generateJewels(seeded(seed)); boards.add(board.join());
    assert.equal(rules.matches(board).length, 0); assert.ok(rules.swaps(board).length);
  }
  assert.ok(boards.size > 450);
  assert.ok(rules.swaps(rules.generateJewels(() => 0)).length);
});
test('jewels support tap swaps, retain the swap animation, then clear only the matched pieces', () => {
  const g = game('jewels'), [a, b] = rules.swaps(rules.generateJewels(() => 0))[0], pieces = g.all('.arc-gem');
  pieces[a].click(); pieces[b].click(); assert.equal(g.completions, 0); assert.notEqual(pieces[a].style.transform, '');
  g.advance(179); assert.equal(g.completions, 0); g.advance(2); assert.equal(g.completions, 1);
  assert.ok(g.all('.is-cleared').length >= 3); pieces.forEach(piece => piece.click()); g.advance(1000); assert.equal(g.completions, 1);
});
test('invalid jewel swaps animate back and leave a solvable unchanged board', () => {
  const g = game('jewels'), pieces = g.all('.arc-gem'), before = pieces.map(p => p.getAttribute('aria-label'));
  pieces[0].click(); pieces[4].click(); g.advance(400);
  assert.equal(g.completions, 0); assert.deepEqual(pieces.map(p => p.getAttribute('aria-label')), before); assert.ok(g.feedback.includes('error'));
  const [a, b] = rules.swaps(rules.generateJewels(() => 0))[0]; pieces[a].click(); pieces[b].click(); g.advance(200); assert.equal(g.completions, 1);
});
test('jewel swipes own one pointer and canceled drags never swap', () => {
  const g = game('jewels'), pieces = g.all('.arc-gem'), [a, b] = rules.swaps(rules.generateJewels(() => 0))[0];
  pieces[a].dispatch('pointerdown', {pointerId: 4, clientX: 20, clientY: 20});
  pieces[a].dispatch('pointerup', {pointerId: 5, clientX: 60, clientY: 20}); assert.equal(pieces[a].pointerId, 4);
  pieces[a].dispatch('pointercancel', {pointerId: 4}); assert.equal(pieces[a].pointerId, null); g.advance(500); assert.equal(g.completions, 0);
  pieces[a].dispatch('pointerdown', {clientX: 20, clientY: 20});
  pieces[a].dispatch('pointerup', {clientX: 20 + (b % 4 - a % 4) * 30, clientY: 20 + (Math.floor(b / 4) - Math.floor(a / 4)) * 30});
  pieces[a].click(); g.advance(200); assert.equal(g.completions, 1);
});
test('jewel dragging follows one cardinal axis and displaces its neighbor before release', () => {
  const g = game('jewels'), pieces = g.all('.arc-gem');
  pieces[5].dispatch('pointerdown', {clientX:20, clientY:20, pointerId:7});
  pieces[5].dispatch('pointermove', {clientX:40, clientY:35, pointerId:7});
  assert.equal(pieces[5].style.transform, 'translate(20px,0px)'); assert.equal(pieces[6].style.transform, 'translate(-20px,0px)');
  pieces[5].dispatch('pointermove', {clientX:22, clientY:90, pointerId:7});
  assert.equal(pieces[5].style.transform, 'translate(2px,0px)');
  g.suspend(); assert.equal(pieces[5].style.transform,''); assert.equal(pieces[6].style.transform,''); assert.equal(pieces[5].pointerId,null);
  g.advance(500); assert.equal(g.completions,0);
});
test('drag aiming responds immediately, owns one pointer, and cancels safely without firing', () => {
  for (const type of ['bubbles', 'pegs']) {
    const g = game(type), field = g.one('.arc-scene'), angle = () => Number(field.getAttribute('aria-valuenow'));
    assert.equal(g.all('button').length, 1); field.rect = {left: 0, top: 0, width: 200, height: 150};
    field.dispatch('pointerdown', {pointerId: 7, clientX: 130, clientY: 75}); assert.ok(angle() > 0);
    const initial = angle(); field.dispatch('pointermove', {pointerId: 8, clientX: 30, clientY: 75}); assert.equal(angle(), initial);
    field.dispatch('pointermove', {pointerId: 7, clientX: 70, clientY: 75}); assert.ok(angle() < 0);
    g.suspend(); assert.equal(angle(), 0); assert.equal(field.pointerId, null); assert.equal(g.feedback.length, 0);
    setAngle(g, 30); assert.equal(angle(), 30); g.advance(500); assert.equal(angle(), 30); assert.equal(g.feedback.length, 0);
    field.dispatch('keydown', {key: 'ArrowLeft'}); assert.equal(angle(), 28);
    g.label('Shoot ball').click(); assert.equal(g.label('Shoot ball').disabled, true); setAngle(g, -20); assert.equal(angle(), 28);
    g.destroy(); field.dispatch('pointerdown'); assert.equal(field.pointerId, null);
  }
});
test('bubble clusters respect color and adjacency', () => {
  const balls = [{x: 20, y: 20, color: 0}, {x: 44, y: 20, color: 0}, {x: 32, y: 41, color: 0}, {x: 68, y: 20, color: 1}, {x: 180, y: 100, color: 0}];
  assert.equal(rules.bubbleCluster(balls, balls[0]).length, 3);
  assert.equal(rules.bubbleCluster(balls, balls[0], false).length, 4);
});
test('random bubble racks vary in silhouette and color while staying attached with a matchable pair', () => {
  const shapes = new Set(), colors = new Set();
  for(let seed=1;seed<=300;seed++) {
    const balls=rules.generateBubbles(seeded(seed));
    shapes.add(balls.map(b=>`${b.row},${b.col}`).join(';')); colors.add(balls.map(b=>b.color).join());
    assert.ok(balls.length>=6); assert.ok(balls.every(b=>b.y<95));
    const attached=new Set(); balls.filter(b=>b.row===0).forEach(b=>rules.bubbleCluster(balls,b,false).forEach(p=>attached.add(p)));
    assert.equal(attached.size,balls.length);
    const bottom=[...balls].sort((a,b)=>b.y-a.y)[0]; assert.ok(rules.bubbleCluster(balls,bottom).length>=2);
  }
  assert.ok(shapes.size>250); assert.ok(colors.size>250);
});
test('random peg fields vary their positions and counts with three distinct marked targets', () => {
  const layouts=new Set(), counts=new Set();
  for(let seed=1;seed<=300;seed++) {
    const pegs=rules.generatePegs(seeded(seed * 65537)); layouts.add(pegs.map(p=>`${p.x},${p.y}`).join()); counts.add(pegs.length);
    assert.equal(pegs.filter(p=>p.marked).length,3); assert.ok(pegs.length>=7&&pegs.length<=10);
    pegs.forEach((peg,i)=>{ assert.ok(peg.x>=25&&peg.x<=175&&peg.y>=40&&peg.y<=126); pegs.slice(i+1).forEach(other=>assert.ok(Math.hypot(peg.x-other.x,peg.y-other.y)>=peg.r+other.r+12)); });
  }
  assert.equal(layouts.size,300); assert.ok(counts.size>=3);
  for(const value of [0,.5,.999]) assert.equal(rules.generatePegs(()=>value).filter(p=>p.marked).length,3);
});
test('random board lengths have an exact solution using the four fixed dice once each', () => {
  const lengths=new Set(), layouts=new Set();
  for(let seed=1;seed<=500;seed++) {
    const {values,goal,path}=rules.generateBoard(seeded(seed)); lengths.add(goal);
    assert.equal(values.length,4); assert.equal(new Set(values).size,4); assert.equal(path.length,goal+1);
    assert.ok(path.length>=3&&path.length<=8);
    layouts.add(path.map(p=>`${p.x},${p.y}`).join(';'));
    path.forEach((p,i)=>path.slice(i+1).forEach((q,j)=>{
      const gap=Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
      assert.ok(Math.abs(p.x-q.x)>=39||Math.abs(p.y-q.y)>=31, 'Steps must not overlap');
      if(j===0) assert.equal(gap,39,'Consecutive steps stay next to one another');
      else assert.ok(gap>39,'Non-consecutive steps cannot create an ambiguous branch');
    }));
    assert.ok(Array.from({length:15},(_,i)=>i+1).some(mask=>values.reduce((sum,n,i)=>sum+(mask & 1<<i ? n : 0),0)===goal));
  }
  assert.equal(lengths.size,6);
  assert.ok(layouts.size>300);
});

test('planet positions vary continuously, stay reachable and separated, and start away from the crosshair', () => {
  const layouts=new Set();
  for(let seed=1;seed<=400;seed++) {
    const planets=rules.generatePlanets(seeded(seed*65537)); assert.equal(planets.length,4); layouts.add(JSON.stringify(planets));
    planets.forEach((p,i)=>{assert.ok(p.x>=65&&p.x<=455&&p.y>=65&&p.y<=335);assert.ok(Math.hypot(p.x-260,p.y-200)>=60);planets.slice(i+1).forEach(q=>assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=110));});
  }
  assert.equal(layouts.size,400); for(const value of [0,.5,.999])assert.equal(rules.generatePlanets(()=>value).length,4);
});

test('peg preview traces the physical rebound, ignores cleared pegs, and never changes live pegs', () => {
  const pegs=[{x:108,y:65,r:8,hit:false}], before=JSON.stringify(pegs), preview=rules.pegPreview(0,pegs);
  assert.ok(preview.rebound.length>3); assert.ok(preview.rebound.at(-1).x<preview.rebound[0].x);
  assert.equal(JSON.stringify(pegs),before);
  const ball=rules.pegLaunch(0);let hit=false;
  for(let i=0;i<150&&!hit;i++)rules.advanceBall(ball,1/240,{gravity:180,bounce:.9,obstacles:pegs,onHit:()=>hit=true});
  assert.ok(Math.hypot(ball.x-preview.rebound[0].x,ball.y-preview.rebound[0].y)<.0001);
  assert.equal(rules.pegPreview(0,[{...pegs[0],hit:true}]).rebound.length,0); assert.equal(rules.pegPreview(65,pegs).rebound.length,0);
});

test('golf pull indicator stays behind the ball and warms from white toward red with power', () => {
  const g=game('golf'),field=g.one('.arc-scene'),guide=g.one('.arc-golf-guide'),start=rules.generateGolf(()=>0).start;
  field.rect={left:0,top:0,width:200,height:150};
  field.dispatch('pointerdown',{clientX:start.x,clientY:start.y});
  field.dispatch('pointermove',{clientX:start.x-6,clientY:start.y});
  assert.equal(guide.getAttribute('d'),`M${start.x} ${start.y}L${start.x-6} ${start.y}`); const low=guide.getAttribute('stroke');
  field.dispatch('pointermove',{clientX:start.x-60,clientY:start.y});
  assert.equal(guide.getAttribute('d'),`M${start.x} ${start.y}L${start.x-60} ${start.y}`); assert.equal(guide.getAttribute('stroke'),'rgb(255, 75, 80)'); assert.notEqual(low,guide.getAttribute('stroke'));
  field.dispatch('pointercancel');assert.equal(guide.getAttribute('visibility'),'hidden');
});
test('golf courses vary starts, holes, obstacles and turf, with safe gaps and a traversable route', () => {
  const starts=new Set(), holes=new Set(), obstacleKinds=new Set(), turf=new Set();
  for(let seed=1;seed<=200;seed++) {
    const course=rules.generateGolf(seeded(seed * 65537)), {start,hole,obstacles}=course;
    starts.add(`${start.x},${start.y}`); holes.add(`${hole.x},${hole.y}`); turf.add(course.turf);
    assert.ok(Math.hypot(start.x-hole.x,start.y-hole.y)>=90);
    obstacles.forEach(o=>{obstacleKinds.add(o.kind);assert.ok(rules.obstacleDistance(start,o)>=23);assert.ok(rules.obstacleDistance(hole,o)>=25);});
    // Independent clearance grid: the golf ball must fit from start to cup.
    const cols=37, rows=27, free=(x,y)=>!obstacles.some(o=>o.kind==='wall'
      ? Math.hypot(Math.max(Math.abs(x-o.x)-o.w/2,0),Math.max(Math.abs(y-o.y)-o.h/2,0))<6
      : Math.hypot(x-o.x,y-o.y)<o.r+6);
    const index=p=>Math.round((p.y-10)/5)*cols+Math.round((p.x-10)/5), end=index(hole), seen=new Set([index(start)]), queue=[index(start)];
    for(let i=0;i<queue.length&&!seen.has(end);i++) {
      const at=queue[i], x=at%cols,y=Math.floor(at/cols);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {const nx=x+dx,ny=y+dy,next=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||seen.has(next)||!free(10+nx*5,10+ny*5))continue;seen.add(next);queue.push(next);}
    }
    assert.ok(seen.has(end),`Blocked course ${seed}`);
  }
  assert.equal(starts.size,200); assert.ok(holes.size>180); assert.equal(obstacleKinds.size,2); assert.equal(turf.size,3);
});
test('rectangular golf obstacles rebound a ball without letting it pass through', () => {
  const ball={x:80,y:70,vx:300,vy:0};
  rules.advanceBall(ball,.1,{radius:5,obstacles:[{kind:'wall',x:100,y:70,w:12,h:35}]});
  assert.ok(ball.vx<0); assert.ok(ball.x<94);
});
test('bubble shots clear a connected group, count progress, and complete once after six', () => {
  const g = game('bubbles');
  for (let shot = 0; shot < 8 && !g.completions; shot++) {
    const loaded = g.all('.arc-bubble').find(el => el.getAttribute('cx') === '100');
    const fill = loaded.getAttribute('fill');
    const targets = g.all('.arc-bubble-piece').filter(el => !el.classList.contains('is-popped') && el.children[0].getAttribute('fill') === fill).map(el => { const [x, y] = el.getAttribute('transform').match(/[\d.]+/g).map(Number); return {x, y}; }).sort((a, b) => b.y - a.y);
    const target = targets[0]; setAngle(g, Math.atan2(target.x - 100, 126 - target.y) * 180 / Math.PI);
    g.label('Shoot ball').click(); g.advance(2500);
  }
  assert.equal(g.completions, 1); assert.equal(g.one('.arc-caption').textContent, '6 / 6');
});

test('bubble racks retain every unpopped piece across misses and low attachments', () => {
  let misses = 0, lowAttachments = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = game('bubbles', {random: seeded(seed * 65537)});
    for (const angle of [-65, 65, -45, 45, 0, -25, 25]) {
      if (g.completions) break;
      const before = g.all('.arc-bubble-piece');
      setAngle(g, angle); g.label('Shoot ball').click(); g.advance(1800);
      for (const piece of before) if (!piece.classList.contains('is-popped')) assert.ok(piece.parentElement, 'Unpopped balls must never be replaced');
      if (before.every(piece => !piece.classList.contains('is-popped'))) misses++;
      lowAttachments += g.all('.arc-bubble-piece').filter(piece => Number(piece.getAttribute('transform').match(/[\d.]+/g)[1]) > 95).length;
    }
    g.destroy();
  }
  assert.ok(misses > 10); assert.ok(lowAttachments > 0);
});

test('responsive golf and telescope fill tall fields and disconnect resize observers', () => {
  const observers = [];
  window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(field) { this.field = field; }
    disconnect() { this.disconnected = true; }
  };
  try {
    for (const type of ['golf', 'telescope']) {
      const g = game(type), observer = observers.at(-1), field = g.one('.arc-scene');
      field.clientWidth = 200; field.clientHeight = 190; field.rect = {left: 0, top: 0, width: 200, height: 190};
      observer.callback(); assert.equal(field.getAttribute('viewBox'), '0 0 200 190');
      assert.equal(g.all('.arc-caption').length, 0);
      if (type === 'golf') {
        const ball = g.one('.arc-golf-ball'), x = Number(ball.getAttribute('cx')), y = Number(ball.getAttribute('cy'));
        field.dispatch('pointerdown', {clientX:x, clientY:y}); field.dispatch('pointerup', {clientX:x-20, clientY:y});
        g.advance(100); assert.ok(Number(ball.getAttribute('cx')) > x);
      } else {
        assert.match(g.one('.arc-target-planet').getAttribute('transform'), /translate\(30 20\)/);
        assert.equal(g.all('.arc-ring-back').length, 1); assert.equal(g.all('.arc-ring-front').length, 1);
      }
      g.destroy(); assert.ok(observer.disconnected);
    }
  } finally { delete window.ResizeObserver; }
});
test('peg shots rebound and remember marked hits between shots', () => {
  const g = game('pegs');
  for (const angle of [-40, -25, -10, 0, 15, 30, 45, -55, -15, 20, 40, -65, 65, -60, 60]) {
    if (g.completions) break;
    setAngle(g, angle); g.label('Shoot ball').click(); g.advance(5900);
  }
  assert.equal(g.completions, 1); assert.equal(g.all('.arc-caption').length, 0);
});
test('substepped physics rebounds off pegs and detects a hole without tunneling', () => {
  const ball = {x: 100, y: 10, vx: 0, vy: 400}, peg = {x: 100, y: 40, r: 8}; let hits = 0;
  rules.advanceBall(ball, .1, {obstacles: [peg], onHit() { hits++; }}); assert.equal(hits, 1); assert.ok(ball.vy < 0);
  const putt = {x: 10, y: 20, vx: 140, vy: 0}; assert.equal(rules.advanceBall(putt, .1, {hole: {x: 20, y: 20, r: 3}}), true); assert.equal(putt.vx, 0);
});
test('telescope drag pans freely and needs a centered target for 400ms', () => {
  const g = game('telescope'), field = g.one('.arc-scene'); field.rect = {left: 0, top: 0, width: 200, height: 150};
  assert.equal(g.all('.arc-caption').length,0); assert.equal(field.textContent,''); assert.match(g.one('.arc-target-planet').getAttribute('transform'),/scale\(1\.2\)/);
  field.dispatch('pointerdown', {pointerId: 7, clientX: 100, clientY: 77});
  field.dispatch('pointermove', {pointerId: 8, clientX: 285, clientY: 202}); g.advance(500); assert.equal(g.completions, 0);
  field.dispatch('pointermove', {pointerId: 7, clientX: 285, clientY: 202}); field.dispatch('pointerup', {pointerId: 7});
  g.advance(380); assert.equal(g.completions, 0); g.advance(30); assert.equal(g.completions, 1); assert.equal(field.pointerId, null);
});
test('board consumes four fixed dice, resets the same choices on overshoot and permits exact landing', () => {
  const random = () => .999, layout = rules.generateBoard(random), g = game('board', {random}), dice = g.all('.arc-die');
  assert.equal(dice.length, 4); assert.equal(g.all('.arc-caption').length, 0);
  const initialFaces = dice.map(die => die.children.map(el => el.getAttribute('cx')).join());
  for (const value of [...layout.values].sort((a, b) => a - b)) { g.label(`Move ${value} spaces`).click(); g.advance(1300); }
  g.advance(500); assert.equal(g.completions, 0); assert.equal(g.one('.arc-board-status').textContent, '');
  assert.deepEqual(dice.map(die => die.children.map(el => el.getAttribute('cx')).join()), initialFaces);
  const mask = Array.from({length:15},(_,i)=>i+1).find(mask=>layout.values.reduce((sum,n,i)=>sum+(mask & 1<<i ? n : 0),0)===layout.goal);
  for (let i = 0; i < 4; i++) if (mask & 1 << i) { dice[i].click(); assert.equal(g.completions,0); g.advance(1300); assert.ok(dice[i].classList.contains('is-used')); }
  assert.equal(g.completions, 1); assert.equal(g.one('.arc-board-status').textContent, 'A LITTLE GIFT!');
});
test('golf drag cancels on pause and pointer cancellation without firing', () => {
  for (const stop of ['pointercancel', 'suspend']) {
    const g = game('golf'), field = g.one('.arc-scene'); field.rect = {left: 0, top: 0, width: 200, height: 150};
    const {start} = rules.generateGolf(() => 0);
    field.dispatch('pointerdown', {clientX: start.x, clientY: start.y}); field.dispatch('pointermove', {clientX: start.x + 20, clientY: start.y + 30});
    if (stop === 'suspend') g.suspend(); else field.dispatch(stop);
    g.advance(1000); assert.equal(g.one('.arc-golf-ball').getAttribute('cx'), String(start.x)); assert.equal(g.completions, 0); assert.equal(field.pointerId, null);
  }
});
test('golf pull-back releases in the opposite direction and comes to rest for another putt', () => {
  const g = game('golf'), field = g.one('.arc-scene'); field.rect = {left: 0, top: 0, width: 200, height: 150};
  const {start} = rules.generateGolf(() => 0);
  field.dispatch('pointerdown', {clientX: start.x, clientY: start.y}); field.dispatch('pointerup', {clientX: start.x - 15, clientY: start.y}); g.advance(100);
  assert.ok(Number(g.one('.arc-golf-ball').getAttribute('cx')) > start.x); g.advance(5000); assert.equal(g.one('.mg-hint').textContent, 'PULL BACK · RELEASE');
});
test('golf can complete a generated course and retain the finished state at different frame rates', () => {
  for (const frame of [1000 / 30, 1000 / 60, 1000 / 120]) {
    const g = game('golf'), field = g.one('.arc-scene'); field.rect = {left: 0, top: 0, width: 200, height: 150};
    const {start,hole,obstacles} = rules.generateGolf(() => 0);
    let current = start;
    for(let shot=0;shot<4&&!g.completions;shot++) {
      let best = null;
      for(let angle=-180;angle<180;angle+=4) for(let power=10;power<=60;power+=2) {
        const a=angle*Math.PI/180,ball={...current,vx:Math.cos(a)*power*4.5,vy:Math.sin(a)*power*4.5}; let sunk=false;
        for(let t=0;t<4&&Math.hypot(ball.vx,ball.vy)>=6;t+=1/60) if(rules.advanceBall(ball,1/60,{friction:1.35,radius:5,top:4,bottom:146,left:4,right:196,bounce:.7,obstacles,hole})){sunk=true;break;}
        const error=sunk ? -1 : Math.hypot(ball.x-hole.x,ball.y-hole.y);
        if(!best||error<best.error)best={error,dx:Math.cos(a)*power,dy:Math.sin(a)*power};
        if(sunk)break;
      }
      field.dispatch('pointerdown',{clientX:current.x,clientY:current.y}); field.dispatch('pointerup',{clientX:current.x-best.dx,clientY:current.y-best.dy}); g.advance(4500,frame);
      current={x:Number(g.one('.arc-golf-ball').getAttribute('cx')),y:Number(g.one('.arc-golf-ball').getAttribute('cy'))};
    }
    assert.equal(g.completions, 1); assert.equal(g.one('.mg-hint').textContent, 'Ball in the hole'); assert.ok(g.one('.arc-golf-ball').classList.contains('is-sunk'));
  }
});
test('random peg layouts are solvable with aimed shots', () => {
  for (let seed=1;seed<=30;seed++) {
    const g = game('pegs', {random: seeded(seed)});
    for (let shot = 0; shot < 6 && !g.completions; shot++) {
      const remaining = g.all('.arc-peg').filter(el => !el.classList.contains('is-hit')).map(el => {
        const [x, y] = el.getAttribute('transform').match(/[\d.]+/g).map(Number);
        return {x, y, r: Number(el.children[0].getAttribute('r')), marked: el.classList.contains('is-marked')};
      });
      let best = null;
      for (let angle = -65; angle <= 65; angle++) {
        const a = angle * Math.PI / 180, ball = {x: 100 + Math.sin(a) * 18, y: 5 + Math.cos(a) * 18, vx: Math.sin(a) * 165, vy: Math.cos(a) * 165};
        const pegs = remaining.map(peg => ({...peg})); let hits = 0;
        for (let t = 0; t < 5.5 && ball.y <= 160; t += 1 / 60) rules.advanceBall(ball, 1 / 60, {gravity: 180, bounce: .9, obstacles: pegs, onHit: peg => {peg.hit = true; if (peg.marked) hits++;}});
        if (!best || hits > best.hits) best = {angle, hits};
      }
      assert.ok(best.hits > 0); setAngle(g, best.angle); g.label('Shoot ball').click(); g.advance(5900);
    }
    assert.equal(g.completions, 1);
  }
});
test('all live arcade games remove listeners and owned captures on destruction', () => {
  for (const item of catalog) {
    const g = game(item.id), controls = g.all('button'); controls[0]?.dispatch('pointerdown');
    g.destroy(); controls.forEach(el => { el.click(); assert.equal([...el.listeners.values()].reduce((n, set) => n + set.size, 0), 0); });
    g.advance(10000); assert.equal(g.completions, 0); assert.equal(g.container.children.length, 0);
  }
});
