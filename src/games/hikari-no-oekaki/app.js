(() => {
  'use strict';
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const muteButton = document.querySelector('#mute');
  const palette = ['#76ddff', '#ffe276', '#ffb7d6', '#b4aaff'];
  const LIMIT = 480, FLOWERS = 24, PARTICLES = 220, FINGERS = 10, VOICES = 4;
  const points = [], flowers = [], particles = [], fingers = new Map(), voices = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const garden = document.createElement('canvas');
  // Independent approved corner images. They never create an input-hit layer.
  const leaves = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => {
    const image = new Image();
    image.onload = () => { if (width && height) { paintGarden(); wake(); } };
    image.src = `assets/leaves-${corner}.webp`;
    return image;
  });
  let width = 0, height = 0, raf = 0, colorIndex = 0, muted = false, generation = 0;
  let audio = null, master = null, compressor = null, lastSound = -Infinity;
  let sampleBuffer = null, sampleLoad = null, sampleStatus = 'idle', nextSampleAt = 0;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const CHARGE_MS = 6000;
  // CSS short side only: rotation preserves scale, DPR never affects geometry.
  const sceneScale = () => clamp(Math.min(width, height) / 390, .85, 1.22);
  const chargeAt = (p, now) => clamp((now - p.time) / CHARGE_MS, 0, 1);
  const flowerRadius = charge => 50.7 * 1.5 * sceneScale() * (1 + charge);
  // Source MP3 peak is -22.2 dBFS. Two sample voices total <=4.5 pre-master.
  const sparkleGain = charge => .75 + 1.5 * clamp(charge, 0, 1);
  function push(items, limit, p) { if (items.length >= limit) items.shift(); items.push(p); }
  function circle(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  function star(g, x, y, size, color) {
    g.fillStyle = color; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? size * .3 : size; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }
  // Static garden is painted only on resize, under the interactive drawing.
  function paintGarden() {
    garden.width = Math.ceil(width); garden.height = Math.ceil(height);
    const g = garden.getContext('2d');
    const bg = g.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.hypot(width,height)/2);
    bg.addColorStop(0, '#15273b'); bg.addColorStop(1, '#101a30');
    g.fillStyle = bg; g.fillRect(0, 0, width, height);
    const size = Math.min(Math.min(width,height)*.46, 330);
    g.globalAlpha = .83;
    leaves.forEach((image,i) => {
      if(image.complete && image.naturalWidth) g.drawImage(image, i%2?width-size:0, i>1?height-size:0, size, size);
    });
    g.globalAlpha = 1;
    // Quiet stationary pinpoints, never pulsing or competing with the gesture.
    for(let i=0;i<16;i++) circle(g, (i*137+31)%Math.max(1,width), height*(.22+((i*7)%11)/17), i%3 ? .7 : 1.2, '#536770');
  }
  function background() { ctx.globalAlpha = 1; ctx.drawImage(garden, 0, 0, width, height); }
  function emit(x, y, color, count, kind, now, direction = 0, charge = 0) {
    const scale = sceneScale(), active = kind !== 'dissolve';
    for (let i = 0; i < count; i++) {
      const a = kind === 'drag' ? direction + Math.PI + (Math.random()-.5)*2 : Math.random()*Math.PI*2;
      const speed = (kind==='burst' ? 220+Math.random()*90 : active ? (55 + Math.random()*45)*(1+2*charge) : 12 + Math.random()*22)*scale;
      const offset = active ? (17 + charge*9)*scale : 0;
      push(particles, PARTICLES, { x:x+Math.cos(a)*offset, y:y+Math.sin(a)*offset, color, time: now, kind, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed,
        life: active ? 800+Math.random()*400 : 950+Math.random()*550, size:(kind==='burst' ? 10+Math.random()*6 : active ? (4+Math.random()*3)*(1+1.2*charge) : 3+Math.random()*3)*scale, star:i%2===0 });
    }
  }
  function wake() { if (!raf && !document.hidden) raf = requestAnimationFrame(draw); }
  function draw(now) {
    raf = 0; background();
    ctx.lineCap = 'round';
    // Arrays retain insertion order, including equal timestamps/multitouch.
    // Paint oldest first within each layer; every flower stays above every line.
    for (let i = 0; i < points.length; i++) {
      const p = points[i], age = now-p.time;
      if (age >= 2700) {
        // Replace each short solid segment with drifting light, oldest first.
        if (age < 3300) emit((p.x+p.sx)/2, (p.y+p.sy)/2, p.color, 2, 'dissolve', now);
        points.splice(i--,1); continue;
      }
      ctx.strokeStyle = palette[p.color]+'12'; ctx.lineWidth = 33*sceneScale();
      ctx.beginPath();ctx.moveTo(p.sx,p.sy);ctx.lineTo(p.x,p.y);ctx.stroke();
      ctx.strokeStyle = palette[p.color]; ctx.lineWidth = 21*sceneScale();
      ctx.beginPath();ctx.moveTo(p.sx,p.sy);ctx.lineTo(p.x,p.y);ctx.stroke();
      circle(ctx,(p.sx+p.x)/2 + p.grain,(p.sy+p.y)/2 - p.grain, .8,'#fff7d7');
    }
    for (let i=0;i<flowers.length;i++) {
      const f=flowers[i], age=now-f.time;
      if(age>=5100) { if(age<5700)emit(f.x,f.y,1,9,'dissolve',now); flowers.splice(i--,1);continue; }
      const grow = reduced ? 1 : .2 + .8*(1-Math.pow(1-clamp(age/420,0,1),3));
      const radius=f.radius*grow;
      for(let k=0;k<6;k++) {
        const dissolve=clamp((age-3650-k*135)/430,0,1), a=k*Math.PI/3-Math.PI/2;
        if(dissolve>0 && !(f.released & (1<<k))) {
          f.released |= 1<<k;
          emit(f.x+Math.cos(a)*f.radius*.7,f.y+Math.sin(a)*f.radius*.7,f.color,5,'dissolve',now);
        }
        if(dissolve>=1)continue;
        // Petal tips recede inward; the remaining petal stays opaque.
        ctx.save();ctx.translate(f.x,f.y);ctx.rotate(a);
        ctx.fillStyle=palette[f.color];ctx.shadowColor=palette[f.color]+'70';ctx.shadowBlur=8;
        ctx.beginPath();ctx.ellipse(radius*.57*(1-dissolve*.45),0,radius*.42*(1-dissolve),radius*.36*(1-dissolve*.65),0,0,Math.PI*2);ctx.fill();
        ctx.shadowBlur=0;ctx.restore();
      }
      const center=age>4750 ? 1-clamp((age-4750)/350,0,1):1;
      circle(ctx,f.x,f.y,radius*.29*center,f.color===1?'#efb93f':'#ffe471');
      circle(ctx,f.x-radius*.055*center,f.y-radius*.065*center,radius*.07*center,'#fff4b2');
      if(age>4750)star(ctx,f.x,f.y,12*center,'#fff4b2');
    }
    for(const p of fingers.values()) {
      const charge=chargeAt(p,now), scale=sceneScale(), radius=(20+28*charge)*scale;
      const glow=ctx.createRadialGradient(p.x,p.y,4*scale,p.x,p.y,radius*1.5);
      glow.addColorStop(0,palette[p.color]+'80');glow.addColorStop(.5,palette[p.color]+'35');glow.addColorStop(1,palette[p.color]+'00');
      circle(ctx,p.x,p.y,radius*1.5,glow);
      ctx.strokeStyle=palette[p.color];ctx.lineWidth=(2+charge*2)*scale;
      ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();
      // Each finger peaks once. No screen flash, no repeat while held.
      if(charge===1&&!p.peaked){p.peaked=true;p.peakTime=now;emit(p.x,p.y,p.color,18,'burst',now,0,1);}
      if(p.peaked&&now-p.peakTime<650){
        const progress=(now-p.peakTime)/650;
        ctx.globalAlpha=1-progress;ctx.strokeStyle=palette[p.color];ctx.lineWidth=3*scale;
        ctx.beginPath();ctx.arc(p.x,p.y,(radius+progress*(reduced?5:36)*scale),0,Math.PI*2);ctx.stroke();
        for(let k=0;k<4;k++){const a=k*Math.PI/2;star(ctx,p.x+Math.cos(a)*radius,p.y+Math.sin(a)*radius,(8+6*(1-progress))*scale,palette[p.color]);}ctx.globalAlpha=1;
      }
      // Bounded cadence, never replay missed emissions or missed notes.
      if(now-p.sparkTime>=160-80*charge){emit(p.x,p.y,p.color,2+Math.floor(2*charge),now-p.lastMove<110?'drag':'charge',now,p.direction,charge);p.sparkTime=now;}
    }
    syncSparkles(now);
    for(let i=particles.length-1;i>=0;i--) {
      const p=particles[i], age=now-p.time;
      if(age>=p.life){particles.splice(i,1);continue;}
      const t=age/1000, motion=reduced?.25:1;
      const x=p.x+p.vx*t*motion, y=p.y+(p.vy*t-(p.kind==='dissolve'?15*t*t:0))*motion;
      ctx.globalAlpha=clamp((p.life-age)/220,0,1);
      if(p.star)star(ctx,x,y,p.size,palette[p.color]);else circle(ctx,x,y,p.size*.65,palette[p.color]);
    }
    ctx.globalAlpha=1;
    if(points.length||flowers.length||particles.length||fingers.size)wake();
  }
  function silence() {
    for(const v of voices){try{v.osc.stop();}catch{}v.osc.disconnect();v.gain.disconnect();} voices.clear();
    nextSampleAt=0;
  }
  function loadSample() {
    if(sampleLoad || !audio)return;
    sampleStatus='loading';
    sampleLoad=fetch('assets/ta_ta_hosikuzu01.mp3')
      .then(response=>{if(!response.ok)throw new Error('Audio unavailable');return response.arrayBuffer();})
      .then(bytes=>audio.decodeAudioData(bytes))
      .then(buffer=>{sampleBuffer=buffer;sampleStatus='ready';})
      .catch(()=>{sampleStatus='failed';});
    // Loading never schedules playback: only a current held gesture can play.
  }
  function playSample(now,charge) {
    if(muted||document.hidden||!audio||audio.state!=='running'||!sampleBuffer||!fingers.size||now<nextSampleAt||voices.size>=VOICES)return;
    if([...voices].filter(v=>v.kind==='sample').length>=2)return;
    const t=audio.currentTime,osc=audio.createBufferSource(),gain=audio.createGain(),peak=sparkleGain(charge);
    osc.buffer=sampleBuffer;osc.connect(gain);gain.connect(master);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(peak,t+.04);
    const voice={osc,gain,kind:'sample',peak,started:t,fading:false};voices.add(voice);
    osc.onended=()=>{voices.delete(voice);osc.disconnect();gain.disconnect();};
    osc.start(t);osc.stop(t+sampleBuffer.duration);nextSampleAt=now+4800;
  }
  function syncSparkles(now) {
    if(!fingers.size||muted||document.hidden||!audio||audio.state!=='running')return;
    const charge=Math.max(...[...fingers.values()].map(p=>chargeAt(p,now)));
    playSample(now,charge);
    const t=audio.currentTime,target=sparkleGain(charge);
    for(const v of voices){
      if(v.kind!=='sample'||v.fading||t-v.started<.05||Math.abs(target-v.peak)<.02)continue;
      v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(target,t,.12);v.peak=target;
    }
  }
  function finishSparkles(seconds) {
    if(!audio)return;const t=audio.currentTime;
    for(const v of voices){
      if(v.kind!=='sample'||v.fading)continue;
      v.fading=true;
      const current=v.gain.gain.value;
      if(v.gain.gain.cancelAndHoldAtTime)v.gain.gain.cancelAndHoldAtTime(t);
      else{v.gain.gain.cancelScheduledValues(t);v.gain.gain.setValueAtTime(current,t);}
      v.gain.gain.linearRampToValueAtTime(0,t+seconds);v.osc.stop(t+seconds+.01);
    }
  }
  function unlock() {
    if(muted)return;
    try {
      if(!audio){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        audio=new Audio();master=audio.createGain();master.gain.value=.22;
        compressor=audio.createDynamicsCompressor();compressor.threshold.value=-24;compressor.knee.value=18;compressor.ratio.value=8;compressor.attack.value=.003;compressor.release.value=.2;
        master.connect(compressor);compressor.connect(audio.destination);
      }
      loadSample();
      if(audio.state!=='running')return audio.resume().catch(()=>{});
    } catch { /* Silent play remains available. */ }
  }
  function sound(color) {
    const now=performance.now();
    if(muted||document.hidden||!audio||audio.state!=='running'||now-lastSound<150||voices.size>=VOICES)return;
    lastSound=now;const t=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();
    const peak=.24;
    const frequency=[523.25,659.25,783.99,587.33][color];
    osc.type='sine';osc.frequency.setValueAtTime(frequency,t);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(peak,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+.34);
    osc.connect(gain);gain.connect(master);const voice={osc,gain,kind:'flower',peak};voices.add(voice);
    osc.onended=()=>{voices.delete(voice);osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+.36);
  }
  function position(e) {const r=canvas.getBoundingClientRect();return{x:clamp(e.clientX-r.left,0,width),y:clamp(e.clientY-r.top,0,height)};}
  function trail(p,q,now) {
    const distance=Math.hypot(q.x-p.x,q.y-p.y);if(distance<3)return;
    const count=Math.min(48,Math.ceil(distance/10));
    for(let i=1;i<=count;i++)push(points,LIMIT,{sx:p.x+(q.x-p.x)*(i-1)/count,sy:p.y+(q.y-p.y)*(i-1)/count,x:p.x+(q.x-p.x)*i/count,y:p.y+(q.y-p.y)*i/count,color:p.color,time:now,grain:(i%3-1)*3});
    p.direction=Math.atan2(q.y-p.y,q.x-p.x);p.lastMove=now;
    p.x=q.x;p.y=q.y;wake();
  }
  canvas.addEventListener('pointerdown',e=>{
    if((e.pointerType==='mouse'&&e.button!==0)||fingers.size>=FINGERS||fingers.has(e.pointerId)||document.hidden)return;
    e.preventDefault();unlock();const now=performance.now();
    const p={...position(e),color:colorIndex++%palette.length,time:now,sparkTime:now,peaked:false,peakTime:0,lastMove:-Infinity,direction:0};fingers.set(e.pointerId,p);
    try{canvas.setPointerCapture(e.pointerId);}catch{}emit(p.x,p.y,p.color,4,'charge',now);wake();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=fingers.get(e.pointerId);if(!p)return;e.preventDefault();
    if(e.pointerType==='mouse'&&e.buttons===0){release(e);return;}trail(p,position(e),performance.now());
  });
  function release(e) {
    fingers.delete(e.pointerId);
    if(!fingers.size){finishSparkles(e.type==='pointerup'?1.2:.08);nextSampleAt=0;}
    try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch{}
  }
  canvas.addEventListener('pointerup',e=>{
    const p=fingers.get(e.pointerId);if(!p||document.hidden)return;
    const q=position(e),now=performance.now();trail(p,q,now);release(e);
    push(flowers,FLOWERS,{...q,color:p.color,time:now,radius:flowerRadius(chargeAt(p,now)),released:0});
    const version=generation,ready=unlock();Promise.resolve(ready).then(()=>{if(version===generation&&!document.hidden&&performance.now()-now<180)sound(p.color);});wake();
  });
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,release);
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function reset() {generation++;for(const id of [...fingers.keys()])release({pointerId:id});points.length=flowers.length=particles.length=0;silence();cancelAnimationFrame(raf);raf=0;if(garden.width)background();}
  function resize() {
    reset();const r=canvas.getBoundingClientRect();width=r.width;height=r.height;
    const dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/Math.max(1,width*height)));
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paintGarden();background();
  }
  document.querySelector('#reset').addEventListener('click',reset);
  document.querySelector('#back').addEventListener('click',()=>{reset();if(audio)audio.suspend().catch(()=>{});});
  muteButton.addEventListener('click',()=>{muted=!muted;generation++;silence();muteButton.setAttribute('aria-pressed',String(muted));muteButton.setAttribute('aria-label',muted?'音を出す':'音を消す');muteButton.querySelector('span').textContent=muted?'消音':'音あり';if(!muted)unlock();});
  document.addEventListener('visibilitychange',()=>{reset();if(document.hidden&&audio&&audio.state==='running')audio.suspend().catch(()=>{});if(!document.hidden)resize();});
  window.addEventListener('blur',reset);
  window.addEventListener('pagehide',()=>{reset();if(audio)audio.suspend().catch(()=>{});});
  window.addEventListener('pageshow',resize);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);resize();
})();
