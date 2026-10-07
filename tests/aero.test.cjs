const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// The real Aero lifecycle with inert graphics: these checks exercise pointer
// ownership and entrance/touch classes, not Three.js geometry or browser paint.
function environment() {
  const events=new Map(),classes=new Set(['tile','new-tile']),properties=new Map();
  const eventTarget=prefix=>({addEventListener:(name,fn)=>events.set(prefix+name,fn),removeEventListener:name=>events.delete(prefix+name)});
  const context={createLinearGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},ellipse(){},fill(){},moveTo(){},quadraticCurveTo(){},stroke(){},drawImage(){}};
  const canvas=()=>({...eventTarget('canvas:'),width:0,height:0,getContext:()=>context,setAttribute(){},remove(){this.parentNode=null;}});
  const vector=()=>({set(){},setScalar(){}});
  class Resource {
    constructor(){this.holes=[];this.position=vector();this.rotation=vector();this.scale=vector();this.attributes={uv:{count:0},position:{}};}
    add(){} moveTo(){} lineTo(){} quadraticCurveTo(){} bezierCurveTo(){} computeVertexNormals(){} dispose(){}
  }
  class Mesh extends Resource {constructor(geometry){super();this.geometry=geometry;}}
  class Renderer {
    constructor(){this.domElement=canvas();}
    setPixelRatio(){} dispose(){} forceContextLoss(){}
  }
  const three={WebGLRenderer:Renderer,Mesh};
  for(const name of ['CanvasTexture','Scene','OrthographicCamera','HemisphereLight','DirectionalLight','Group','Shape','Path','ExtrudeGeometry','MeshPhysicalMaterial','SphereGeometry','ShaderMaterial'])three[name]=Resource;
  const tile={dataset:{game:'catch'},clientWidth:200,clientHeight:200,
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},
    style:{setProperty:(name,value)=>properties.set(name,value),removeProperty:name=>properties.delete(name)},
    getBoundingClientRect:()=>({left:0,top:0,bottom:200,width:200,height:200}),
    closest:()=>null,prepend(el){el.parentNode=this;this.canvas=el;},removeAttribute(){},setAttribute(){}};
  const document={...eventTarget('doc:'),documentElement:{dataset:{}},body:{prepend(){}},hidden:false,
    querySelector:()=>null,querySelectorAll:()=>[tile],createElement:()=>canvas()};
  const window={...eventTarget('win:'),LittleRushThree:three,innerWidth:400,innerHeight:800,devicePixelRatio:1,
    matchMedia:()=>({...eventTarget('motion:'),matches:false})};
  class Observer {observe(){} disconnect(){}}
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../aero.js'),'utf8'),{window,document,MutationObserver:Observer,ResizeObserver:Observer,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  window.LittleRushAero.start();
  assert.equal(window.LittleRushAero.getDiagnostics().active,true);
  return {classes,properties,tile,stop:()=>window.LittleRushAero.stop(),
    fire(type,id=1){events.get('doc:'+type)?.({target:{closest:()=>tile},pointerId:id,clientX:30,clientY:50});},
    blur(){events.get('win:blur')?.();}};
}

test('Aero taps and canceled holds cannot re-arm the tile entrance animation',()=>{
  for(const release of ['pointerup','pointercancel','lostpointercapture','blur']){
    const e=environment(),canvas=e.tile.canvas;
    for(let tap=0;tap<3;tap++){
      e.fire('pointerdown');
      assert.equal(e.classes.has('new-tile'),false,'Contact retires even an unfinished entrance');
      assert.equal(e.classes.has('aero-touch'),true);
      e.fire('pointerup',2);
      assert.equal(e.classes.has('aero-touch'),true,'Another finger must not release the held tile');
      if(release==='blur')e.blur();else e.fire(release);
      assert.equal(e.classes.has('new-tile'),false,'Release must not restore the fade-in');
      assert.equal(e.classes.has('aero-touch'),false);
      assert.equal(e.properties.size,0);
      assert.equal(e.tile.canvas,canvas,'Interactions retain the existing rendered surface');
    }
    e.stop();
  }
});
