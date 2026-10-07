(() => {
  'use strict';
  const root = document.documentElement, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let state = null;

  function start() {
    if (state) return;
    const T = window.LittleRushThree;
    root.dataset.aeroRenderer = 'css';
    if (!T || !document.body) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const s = state = {entries: new Map(), held: new Map(), removers: [], resources: new Set(), raf: 0, time: 0, last: 0, disposed: false, reduced: motion.matches, queued: false};
    const own = resource => { s.resources.add(resource); return resource; };
    const listen = (el, type, fn, options) => { el.addEventListener(type, fn, options); s.removers.push(() => el.removeEventListener(type, fn, options)); };
    const cancelFrame = () => { if (s.raf) cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0; };
    const resetTile = tile => { tile.classList.remove('aero-touch'); for (const name of ['--aero-rx', '--aero-ry', '--aero-x', '--aero-y']) tile.style.removeProperty(name); };
    const release = id => { for (const [tile, touch] of s.held) if (id === undefined || id === touch.id) { resetTile(tile); s.held.delete(tile); } };
    function dispose() {
      if (s.disposed) return;
      s.disposed = true; cancelFrame(); s.observer?.disconnect(); s.resize?.disconnect(); s.removers.forEach(fn => fn()); release();
      for (const [tile, entry] of s.entries) { entry.canvas.remove(); tile.removeAttribute('data-aero-ready'); resetTile(tile); }
      s.entries.clear(); s.backdrop?.remove(); s.resources.forEach(r => r.dispose());
      s.renderer?.dispose(); s.renderer?.forceContextLoss(); delete root.dataset.aeroRenderer;
    }
    s.dispose = dispose;
    try {
      const renderer = s.renderer = new T.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(1); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
      listen(renderer.domElement, 'webglcontextlost', event => { event.preventDefault(); dispose(); root.dataset.aeroRenderer = 'css'; });
      const environment = document.createElement('canvas'); environment.width = 512; environment.height = 256;
      const ec = environment.getContext('2d'), sky = ec.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, '#b3eaff'); sky.addColorStop(.4, '#ffffff'); sky.addColorStop(.53, '#62bde2'); sky.addColorStop(.7, '#68ab72'); sky.addColorStop(1, '#e5fbd3');
      ec.fillStyle = sky; ec.fillRect(0, 0, 512, 256);
      for (const [x,y,w,h] of [[40,50,140,35],[280,70,150,24],[180,5,80,65]]) { ec.fillStyle = '#ffffff'; ec.fillRect(x,y,w,h); }
      const env = own(new T.CanvasTexture(environment)); env.mapping = T.EquirectangularReflectionMapping; env.colorSpace = T.SRGBColorSpace;
      const scene = new T.Scene(); scene.environment = env;
      const camera = new T.OrthographicCamera(-1.08, 1.08, 1.08, -1.08, .1, 20); camera.position.z = 5;
      scene.add(new T.HemisphereLight(0xe9fcff, 0x329798, .8));
      const light = new T.DirectionalLight(0xffffff, 2); light.position.set(-2, 4, 5); scene.add(light);
      const group = new T.Group(); scene.add(group);
      function rounded(path, size, radius) {
        const a = -size, b = size, r = radius;
        path.moveTo(a+r,a); path.lineTo(b-r,a); path.quadraticCurveTo(b,a,b,a+r); path.lineTo(b,b-r); path.quadraticCurveTo(b,b,b-r,b); path.lineTo(a+r,b); path.quadraticCurveTo(a,b,a,b-r); path.lineTo(a,a+r); path.quadraticCurveTo(a,a,a+r,a);
        return path;
      }
      const frame = rounded(new T.Shape(), .965, .16); frame.holes.push(rounded(new T.Path(), .905, .125));
      const rim = new T.Mesh(own(new T.ExtrudeGeometry(frame,{depth:.045,bevelEnabled:true,bevelThickness:.045,bevelSize:.023,bevelSegments:3,curveSegments:10,steps:1})), own(new T.MeshPhysicalMaterial({color:0xc9faff,metalness:.5,roughness:.14,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.5})));
      group.add(rim);
      const texture = document.createElement('canvas'); texture.width = texture.height = 256;
      const tc = texture.getContext('2d'), wash = tc.createLinearGradient(0,0,0,256);
      wash.addColorStop(0,'#96eeff'); wash.addColorStop(.13,'#0cafed'); wash.addColorStop(.58,'#027fc7'); wash.addColorStop(.8,'#2faeda'); wash.addColorStop(1,'#b4e484'); tc.fillStyle=wash;tc.fillRect(0,0,256,256);
      tc.fillStyle='#ffffff25';tc.beginPath();tc.ellipse(72,50,140,27,-.18,0,Math.PI*2);tc.fill();
      tc.fillStyle='#cfffcd45';tc.beginPath();tc.ellipse(75,271,200,48,-.08,0,Math.PI*2);tc.fill();
      const map=own(new T.CanvasTexture(texture));map.colorSpace=T.SRGBColorSpace;
      const face = new T.Mesh(own(new T.ExtrudeGeometry(rounded(new T.Shape(), .91, .13),{depth:.025,bevelEnabled:true,bevelThickness:.04,bevelSize:.025,bevelSegments:3,curveSegments:10,steps:1})),own(new T.MeshPhysicalMaterial({map,roughness:.22,metalness:.02,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.55})));
      // Extruded shape UVs are world coordinates; remap to the full little landscape.
      const uv=face.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+1)/2,(uv.getY(i)+1)/2);
      face.position.z=-.06;group.add(face);
      const bubbleGeometry=own(new T.SphereGeometry(1,24,16));
      const glass=own(new T.ShaderMaterial({transparent:true,depthWrite:false,
        vertexShader:'varying vec3 n; void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:'varying vec3 n; void main(){vec3 normal=normalize(n);float rim=pow(1.0-abs(normal.z),2.4);float shine=pow(max(0.0,dot(normal,normalize(vec3(-.45,.65,1.0)))),28.0);vec3 color=mix(vec3(.35,.84,1.0),vec3(1.0),min(1.0,rim+shine));gl_FragColor=vec4(color,.045+rim*.65+shine*.6);}'
      }));
      const bubble = new T.Mesh(bubbleGeometry,glass);bubble.scale.setScalar(.11);bubble.position.set(.73,.7,.14);group.add(bubble);
      const leafShape=new T.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.26,.15,-.17,.48,.1,.62);leafShape.bezierCurveTo(.27,.3,.21,.1,0,0);
      const leafTexture=document.createElement('canvas');leafTexture.width=128;leafTexture.height=256;
      const lc=leafTexture.getContext('2d'),green=lc.createLinearGradient(0,0,128,160);
      green.addColorStop(0,'#c3ee4b');green.addColorStop(.45,'#75be25');green.addColorStop(.55,'#58a51d');green.addColorStop(1,'#30871c');
      lc.fillStyle=green;lc.fillRect(0,0,128,256);lc.lineCap='round';
      lc.strokeStyle='#ddf780a0';lc.lineWidth=2;lc.beginPath();lc.moveTo(64,256);lc.quadraticCurveTo(60,116,84,10);lc.stroke();
      lc.lineWidth=1;lc.strokeStyle='#d3ed6a70';
      for(let y=55;y<240;y+=35){lc.beginPath();lc.moveTo(67,y);lc.quadraticCurveTo(46,y-10,24,y-39);lc.moveTo(67,y);lc.quadraticCurveTo(91,y-20,106,y-49);lc.stroke();}
      const leafMap=own(new T.CanvasTexture(leafTexture));leafMap.colorSpace=T.SRGBColorSpace;
      const leafGeometry=own(new T.ExtrudeGeometry(leafShape,{depth:.016,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:2,curveSegments:16}));
      const leafUv=leafGeometry.attributes.uv,leafPoints=leafGeometry.attributes.position;
      for(let i=0;i<leafUv.count;i++){leafUv.setXY(i,(leafUv.getX(i)+.3)/.6,leafUv.getY(i)/.65);const x=leafPoints.getX(i),y=leafPoints.getY(i);leafPoints.setZ(i,leafPoints.getZ(i)+y*y*.19-Math.abs(x)*.2);}
      leafGeometry.computeVertexNormals();
      const leaf=new T.Mesh(leafGeometry,own(new T.MeshPhysicalMaterial({map:leafMap,roughness:.32,clearcoat:.7,clearcoatRoughness:.18,metalness:0})));
      leaf.position.set(.69,-.91,.04);leaf.rotation.z=-.4;leaf.scale.setScalar(.62);group.add(leaf);
      const bgScene=new T.Scene();bgScene.environment=env;bgScene.add(new T.HemisphereLight(0xcdfbff,0x4da948,3));
      const bgCamera=new T.OrthographicCamera(-1,1,1,-1,.1,20);bgCamera.position.z=5;
      const bubbles=Array.from({length:6},(_,i)=>{const mesh=new T.Mesh(bubbleGeometry,glass);mesh.scale.setScalar(.035+i%3*.025);bgScene.add(mesh);return mesh;});
      const backdrop=s.backdrop=document.createElement('canvas');backdrop.className='aero-backdrop';backdrop.setAttribute('aria-hidden','true');document.body.prepend(backdrop);const bc=backdrop.getContext('2d',{alpha:true});
      function size(canvas,w,h,max=440) { const ratio=Math.min(1.35,window.devicePixelRatio||1);const width=Math.max(1,Math.min(max,Math.round(w*ratio))),height=Math.max(1,Math.round(width*h/w));if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;} }
      const draw=(canvas,context,world,view)=>{renderer.setViewport(0,0,canvas.width,canvas.height);renderer.setScissor(0,0,canvas.width,canvas.height);renderer.setScissorTest(true);renderer.render(world,view);context.globalCompositeOperation='copy';context.drawImage(renderer.domElement,0,renderer.domElement.height-canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);};
      const paused=()=>document.hidden||!!document.querySelector('#game-dialog[open]:not(.tweaks-dialog)');
      function request() { if(!s.disposed&&!s.raf&&!paused())s.raf=requestAnimationFrame(render); }
      function render(now) {
        s.raf=0;if(s.disposed||paused()){s.last=0;return;}
        if(s.last&&now-s.last<32){request();return;}const delta=s.last?Math.min(80,now-s.last):0;s.last=now;if(!s.reduced)s.time+=delta/1000;
        try {
          size(backdrop,window.innerWidth,window.innerHeight,1100);
          const aspect=window.innerWidth/window.innerHeight;bgCamera.left=-aspect;bgCamera.right=aspect;bgCamera.updateProjectionMatrix();
          const width=Math.max(backdrop.width,...[...s.entries.values()].map(e=>e.canvas.width)),height=Math.max(backdrop.height,...[...s.entries.values()].map(e=>e.canvas.height));
          if(renderer.domElement.width!==width||renderer.domElement.height!==height)renderer.setSize(width,height,false);
          bubbles.forEach((b,i)=>{b.position.set((-.98+(i*73%197)/100)*aspect,-1.15+((i*.31+s.time*.012)%2.4),0);b.rotation.y=s.time*.08;});draw(backdrop,bc,bgScene,bgCamera);
          for(const [tile,entry] of s.entries){
            // Track contact directly; only the release is eased back to rest.
            const touch=s.held.get(tile);entry.x=touch?touch.x:entry.x*.72;entry.y=touch?touch.y:entry.y*.72;
            group.rotation.set(s.reduced?0:-entry.y*.035,s.reduced?0:entry.x*.035,0);light.position.set(-2+entry.x*3,4-entry.y*3,5);
            bubble.position.y=.7+(s.reduced?0:Math.sin(s.time*.65+entry.seed)*.016);leaf.rotation.y=s.reduced?0:Math.sin(s.time*.5+entry.seed)*.06;
            draw(entry.canvas,entry.context,scene,camera);tile.setAttribute('data-aero-ready','');
          }
          root.dataset.aeroRenderer='three';
        } catch { dispose();root.dataset.aeroRenderer='css';return; }
        if(!s.reduced)request();
      }
      function sync() {
        s.queued=false;if(s.disposed)return;
        const candidates=[...document.querySelectorAll('.tile:not(.empty), .home-art')].filter(tile=>{const r=tile.getBoundingClientRect(),clip=tile.closest('.game-toggles')?.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>Math.max(0,clip?.top||0)&&r.top<Math.min(window.innerHeight,clip?.bottom||window.innerHeight);});const keep=new Set(candidates);
        for(const [tile,entry]of s.entries)if(!keep.has(tile)||entry.canvas.parentNode!==tile){entry.canvas.remove();tile.removeAttribute('data-aero-ready');s.entries.delete(tile);s.held.delete(tile);resetTile(tile);}
        candidates.forEach((tile,i)=>{let entry=s.entries.get(tile);if(!entry){const canvas=document.createElement('canvas');canvas.className='aero-tile-canvas';canvas.setAttribute('aria-hidden','true');entry={canvas,context:canvas.getContext('2d',{alpha:true}),x:0,y:0,seed:i};tile.prepend(canvas);s.entries.set(tile,entry);}size(entry.canvas,tile.clientWidth,tile.clientHeight);});
        if(paused()){release();cancelFrame();}else request();
      }
      const refresh=s.refresh=()=>{if(!s.queued&&!s.disposed){s.queued=true;Promise.resolve().then(sync);}};
      s.observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'?r.target.matches?.('.tile,#play-screen,dialog,body'):Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).some(n=>n.nodeType===1&&!n.matches?.('.aero-tile-canvas,.aero-backdrop'))))refresh();});
      s.observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','data-game','data-tile-id']});
      s.resize=new ResizeObserver(refresh);s.resize.observe(document.body);
      listen(window,'resize',refresh,{passive:true});listen(document,'scroll',refresh,{passive:true,capture:true});listen(document,'visibilitychange',refresh);
      const track=(tile,e,touch)=>{touch.x=clamp((e.clientX-touch.rect.left)/touch.rect.width,0,1)*2-1;touch.y=clamp((e.clientY-touch.rect.top)/touch.rect.height,0,1)*2-1;tile.style.setProperty('--aero-x',`${(touch.x+1)*50}%`);tile.style.setProperty('--aero-y',`${(touch.y+1)*50}%`);if(!['maze','level','shapes','jewels','golf','telescope','pegs','bubbles','sign'].includes(tile.dataset.game)){tile.style.setProperty('--aero-rx',`${-touch.y*2.5}deg`);tile.style.setProperty('--aero-ry',`${touch.x*2.5}deg`);}};
      listen(document,'pointerdown',e=>{
        const tile=e.target.closest?.('.tile:not(.empty),.home-art');
        if(!tile||s.reduced||paused()||s.held.has(tile))return;
        // Retire the entrance before touch styling cancels it. Otherwise release
        // restores .new-tile's animation and fades the entire tile in again.
        tile.classList.remove('new-tile');
        const touch={id:e.pointerId,rect:tile.getBoundingClientRect(),x:0,y:0};
        s.held.set(tile,touch);tile.classList.add('aero-touch');track(tile,e,touch);request();
      },{passive:true,capture:true});
      listen(document,'pointermove',e=>{for(const[tile,touch]of s.held)if(touch.id===e.pointerId)track(tile,e,touch);},{passive:true,capture:true});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(document,type,e=>release(e.pointerId),{passive:true,capture:true});listen(window,'blur',()=>release());
      const motionChanged=e=>{s.reduced=e.matches;release();cancelFrame();refresh();};listen(motion,'change',motionChanged);
      sync();
    } catch { dispose();root.dataset.aeroRenderer='css'; }
  }
  window.LittleRushAero={start,stop(){state?.dispose();state=null;delete root.dataset.aeroRenderer;},refresh(){state?.refresh?.();},getDiagnostics:()=>({active:!!state&&!state.disposed,renderer:root.dataset.aeroRenderer||'off',contexts:state?.renderer&&!state.disposed?1:0,canvases:state?.entries.size||0,rafPending:!!state?.raf,reducedMotion:!!state?.reduced})};
})();
