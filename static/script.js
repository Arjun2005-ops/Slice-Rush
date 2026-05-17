// ============================================================
//  FRUIT CUT — script.js  v2 (Full Feature Upgrade)
// ============================================================

// ── Canvas ──────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W = canvas.width  = window.innerWidth;
let H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; });

// ── Web Audio (Procedural – no files needed) ─────────────────
let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function beep(freq, type, dur, vol = 0.3) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}
function playSlice()    { beep(900,'sine',0.08,0.25); beep(400,'sine',0.12,0.1); }
function playMiss()     { beep(180,'sawtooth',0.25,0.2); }
function playGameOver() { [350,250,180,100].forEach((f,i)=>setTimeout(()=>beep(f,'sine',0.22,0.3),i*150)); }
function playBomb() {
  if (!audioCtx) return;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*0.35, audioCtx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.5);
  const s=audioCtx.createBufferSource(), g=audioCtx.createGain();
  g.gain.value=0.9; s.buffer=buf; s.connect(g); g.connect(audioCtx.destination); s.start();
}

// ── Config ────────────────────────────────────────────────────
const CFG = {
  maxLives:3, spawnMinBase:800, spawnMaxBase:1200, minSpawn:380,
  gravity:0.18, trailLen:22, particleCount:20, diffEvery:20000,
  fruits:[
    {emoji:'🍎',color:'#e74c3c',shine:'#ff8a80',pts:10},
    {emoji:'🍊',color:'#e67e22',shine:'#ffb74d',pts:10},
    {emoji:'🍋',color:'#f1c40f',shine:'#fff176',pts:15},
    {emoji:'🍇',color:'#8e44ad',shine:'#ce93d8',pts:20},
    {emoji:'🍓',color:'#c0392b',shine:'#ef9a9a',pts:15},
    {emoji:'🍑',color:'#e8a87c',shine:'#ffccbc',pts:20},
    {emoji:'🥝',color:'#27ae60',shine:'#a5d6a7',pts:25},
    {emoji:'🍌',color:'#f9ca24',shine:'#fff9c4',pts:15},
    {emoji:'🍉',color:'#2ecc71',shine:'#b9f6ca',pts:30},
  ],
};

// ── State ─────────────────────────────────────────────────────
let fruits=[],parts=[],halves=[],juice=[],popups=[],trail=[];
let score=0, lives=CFG.maxLives, highScore=+(localStorage.getItem('fc_hs')||0);
let combo=0, lastSliceTime=0, speedMult=1, spawnMin=CFG.spawnMinBase, spawnMax=CFG.spawnMaxBase;
let nextSpawn=0, gameState='start', gameStartTime=0;
let shakeF=0, shakeMag=0, isSlicing=false, rafId=null, lastTime=0;
let gameMode='classic'; // 'classic' | 'timeattack' | 'zen'
const TIME_ATTACK_SECS=60;

// ── DOM refs ──────────────────────────────────────────────────
const hudEl=document.getElementById('hud');
const scoreVal=document.getElementById('scoreValue');
const comboPanel=document.getElementById('comboPanel');
const comboText=document.getElementById('comboText');
const startScreen=document.getElementById('startScreen');
const gameOverScreen=document.getElementById('gameOverScreen');
const finalScoreEl=document.getElementById('finalScore');
const highScoreEl=document.getElementById('highScore');
const heartEls=[document.getElementById('heart1'),document.getElementById('heart2'),document.getElementById('heart3')];
const timerPanel=document.getElementById('timerPanel');
const timerVal=document.getElementById('timerValue');
const livesPanel=document.getElementById('livesPanel');
const resultEmoji=document.getElementById('resultEmoji');
const resultTitle=document.getElementById('resultTitle');
const modeTag=document.getElementById('modeTag');

// Mode select buttons
document.querySelectorAll('.mode-card').forEach(btn=>{
  btn.addEventListener('click',()=>{ initAudio(); startGame(btn.dataset.mode); });
});
document.getElementById('restartBtn').addEventListener('click',()=>{ initAudio(); startGame(gameMode); });
document.getElementById('menuBtn').addEventListener('click',()=>{ gameState='start'; gameOverScreen.classList.add('hidden'); startScreen.classList.remove('hidden'); });

// ── Fruit ─────────────────────────────────────────────────────
class Fruit {
  constructor() {
    this.radius = 30+Math.random()*18;
    this.scale  = 0.05;
    this.isBomb = gameMode!=='zen' && Math.random()<0.12;
    this.sliced = false; this.alpha=1;
    const s=Math.random();
    if(s<0.33)      { this.x=60+Math.random()*W*0.3;  this.vx=(1.8+Math.random()*2.5)*speedMult; }
    else if(s<0.66) { this.x=W*0.3+Math.random()*W*0.4; this.vx=(Math.random()-0.5)*3.5*speedMult; }
    else            { this.x=W*0.7+Math.random()*W*0.25; this.vx=-(1.8+Math.random()*2.5)*speedMult; }
    this.y=H+this.radius;
    this.vy=-(9+Math.random()*6)*speedMult;
    this.rot=Math.random()*Math.PI*2; this.rotSpd=(Math.random()-0.5)*0.07;
    if(!this.isBomb){ const t=CFG.fruits[Math.floor(Math.random()*CFG.fruits.length)];
      this.emoji=t.emoji;this.color=t.color;this.shine=t.shine;this.pts=t.pts;
    } else { this.emoji='💣';this.color='#1a1a2e';this.shine='#5a5a7e';this.pts=0; }
  }
  update() {
    this.vy+=CFG.gravity; this.x+=this.vx; this.y+=this.vy; this.rot+=this.rotSpd;
    if(this.scale<1) this.scale=Math.min(1,this.scale+0.1);
    if(this.sliced) this.alpha-=0.045;
  }
  isOff() { return this.y>H+this.radius+20; }
  draw() {
    ctx.save(); ctx.globalAlpha=this.alpha;
    ctx.translate(this.x,this.y); ctx.rotate(this.rot); ctx.scale(this.scale,this.scale);
    const g1=ctx.createRadialGradient(0,0,this.radius*0.2,0,0,this.radius*1.5);
    g1.addColorStop(0,this.color+'55'); g1.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,this.radius*1.5,0,Math.PI*2); ctx.fillStyle=g1; ctx.fill();
    const g2=ctx.createRadialGradient(-this.radius*.3,-this.radius*.3,2,0,0,this.radius);
    g2.addColorStop(0,this.shine); g2.addColorStop(.5,this.color); g2.addColorStop(1,this.color+'cc');
    ctx.beginPath(); ctx.arc(0,0,this.radius,0,Math.PI*2);
    ctx.fillStyle=g2; ctx.shadowColor=this.color; ctx.shadowBlur=18; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-this.radius*.25,-this.radius*.3,this.radius*.2,this.radius*.12,-0.4,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.shadowBlur=0; ctx.fill();
    ctx.font=`${this.radius*1.05}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(this.emoji,0,1); ctx.restore();
  }
  slice() {
    this.sliced=true; playSlice();
    spawnParts(this.x,this.y,this.color,this.isBomb);
    spawnHalves(this); spawnJuice(this.x,this.y,this.color);
    addPopup(this.x,this.y-this.radius,this.isBomb?'💥 BOMB!':`+${this.pts}`);
  }
}

// ── FruitHalf ─────────────────────────────────────────────────
class Half {
  constructor(f,dir) {
    this.x=f.x;this.y=f.y;this.r=f.radius;this.color=f.color;this.shine=f.shine;
    this.dir=dir;this.vx=f.vx+dir*(2.5+Math.random()*3);this.vy=f.vy-1;
    this.rot=f.rot;this.rotSpd=f.rotSpd+dir*0.07;this.alpha=1;
  }
  update(){ this.vy+=CFG.gravity;this.x+=this.vx;this.y+=this.vy;this.rot+=this.rotSpd;this.alpha-=0.02; }
  draw(){
    ctx.save(); ctx.globalAlpha=Math.max(0,this.alpha);
    ctx.translate(this.x,this.y); ctx.rotate(this.rot);
    ctx.beginPath();
    ctx.rect(this.dir===-1?-this.r*2:0,-this.r,this.r,this.r*2); ctx.clip();
    const g=ctx.createRadialGradient(-this.r*.3,-this.r*.3,2,0,0,this.r);
    g.addColorStop(0,this.shine); g.addColorStop(1,this.color+'bb');
    ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-this.r);ctx.lineTo(0,this.r);
    ctx.strokeStyle=this.shine;ctx.lineWidth=3;ctx.stroke(); ctx.restore();
  }
  gone(){ return this.alpha<=0||this.y>H+80; }
}
function spawnHalves(f){ halves.push(new Half(f,-1),new Half(f,+1)); }

// ── Juice Lines ───────────────────────────────────────────────
class Juice {
  constructor(x,y,color){
    const a=Math.random()*Math.PI*2,spd=4+Math.random()*5;
    this.x=x;this.y=y;this.color=color;
    this.vx=Math.cos(a)*spd;this.vy=Math.sin(a)*spd;this.life=1;
  }
  update(){ this.x+=this.vx;this.y+=this.vy;this.vy+=0.3;this.life-=0.04; }
  draw(){
    ctx.save();ctx.globalAlpha=Math.max(0,this.life);
    ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x-this.vx*3,this.y-this.vy*3);
    ctx.strokeStyle=this.color;ctx.lineWidth=2.5;ctx.lineCap='round';
    ctx.shadowColor=this.color;ctx.shadowBlur=6;ctx.stroke();ctx.restore();
  }
  dead(){ return this.life<=0; }
}
function spawnJuice(x,y,color){ for(let i=0;i<9;i++) juice.push(new Juice(x,y,color)); }

// ── Particles ─────────────────────────────────────────────────
class Particle {
  constructor(x,y,color){
    const a=Math.random()*Math.PI*2,spd=3+Math.random()*7;
    this.x=x;this.y=y;this.color=color;
    this.vx=Math.cos(a)*spd;this.vy=Math.sin(a)*spd-2;
    this.life=1;this.decay=0.025+Math.random()*0.025;this.size=4+Math.random()*6;
  }
  update(){ this.x+=this.vx;this.y+=this.vy;this.vy+=0.22;this.life-=this.decay;this.size*=0.97; }
  draw(){
    ctx.save();ctx.globalAlpha=Math.max(0,this.life);
    ctx.beginPath();ctx.arc(this.x,this.y,this.size,0,Math.PI*2);
    ctx.fillStyle=this.color;ctx.shadowColor=this.color;ctx.shadowBlur=8;ctx.fill();ctx.restore();
  }
  dead(){ return this.life<=0; }
}
function spawnParts(x,y,color,bomb){
  const n=bomb?38:CFG.particleCount;
  for(let i=0;i<n;i++) parts.push(new Particle(x,y,bomb?(i%2?'#f39c12':'#e74c3c'):color));
}

// ── Score Popups ──────────────────────────────────────────────
class Popup {
  constructor(x,y,text){ this.x=x;this.y=y;this.text=text;this.life=1;this.vy=-1.7; }
  update(){ this.y+=this.vy;this.life-=0.022; }
  draw(){
    ctx.save();ctx.globalAlpha=Math.max(0,this.life);
    ctx.font="bold 22px 'Orbitron',sans-serif";
    ctx.textAlign='center';ctx.textBaseline='middle';
    const c=this.text.includes('BOMB')||this.text==='MISSED!'?'#ff6b6b':'#f9ca24';
    ctx.fillStyle=c;ctx.shadowColor=c;ctx.shadowBlur=14;
    ctx.fillText(this.text,this.x,this.y);ctx.restore();
  }
  dead(){ return this.life<=0; }
}
function addPopup(x,y,t){ popups.push(new Popup(x,y,t)); }

// ── Trail ─────────────────────────────────────────────────────
function addPt(x,y){ trail.push({x,y}); if(trail.length>CFG.trailLen) trail.shift(); }
function drawTrail(){
  if(trail.length<2) return;
  ctx.save();
  for(let i=1;i<trail.length;i++){
    const p0=trail[i-1],p1=trail[i],t=i/trail.length;
    ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);
    ctx.strokeStyle=`rgba(${Math.round(120+135*t)},${Math.round(200+55*t)},255,${t*0.9})`;
    ctx.lineWidth=3.5*t;ctx.lineCap='round';
    ctx.shadowColor=`rgba(100,200,255,${t*0.8})`;ctx.shadowBlur=16*t;ctx.stroke();
  }
  ctx.restore();
}

// ── Collision ─────────────────────────────────────────────────
function hitTest(ax,ay,bx,by,cx,cy,r){
  const dx=bx-ax,dy=by-ay,fx=ax-cx,fy=ay-cy,a=dx*dx+dy*dy;
  if(!a) return false;
  const b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-r*r;
  let d=b*b-4*a*c; if(d<0) return false; d=Math.sqrt(d);
  const t1=(-b-d)/(2*a),t2=(-b+d)/(2*a);
  return (t1>=0&&t1<=1)||(t2>=0&&t2<=1);
}
function checkSlice(){
  if(trail.length<2) return;
  const p0=trail[trail.length-2],p1=trail[trail.length-1];
  let n=0;
  const now=Date.now();
  for(const f of fruits){
    if(f.sliced) continue;
    if(hitTest(p0.x,p0.y,p1.x,p1.y,f.x,f.y,f.radius)){
      f.slice();
      if(f.isBomb){ triggerBomb(); return; }
      if(now - lastSliceTime < 500){ combo++; } else { combo=1; }
      lastSliceTime=now;
      score += f.pts * combo;
      updateScoreUI(); n++;
    }
  }
  if(n>1) addPopup(W/2,H/2-80,`MULTI x${n}! 🔥`);
}

// ── Screen Shake ──────────────────────────────────────────────
function shake(mag,frames){ shakeMag=mag; shakeF=frames; }

// ── Bomb hit ──────────────────────────────────────────────────
function triggerBomb(){
  playBomb(); shake(16,22); combo=0; comboPanel.classList.add('hidden'); loseLife();
}

// ── Lives ─────────────────────────────────────────────────────
function loseLife(){
  lives--;
  if(heartEls[lives]) heartEls[lives].classList.add('lost');
  if(lives<=0) endGame();
}
function updateLivesUI(){ heartEls.forEach((e,i)=>e.classList.toggle('lost',i>=lives)); }
function updateScoreUI(){
  scoreVal.textContent=score;
  if(combo>=2){
    comboPanel.classList.remove('hidden');
    comboText.textContent=`COMBO ×${combo}`;
    comboText.style.animation='none';
    requestAnimationFrame(()=>comboText.style.animation='');
  }
}

// ── Difficulty ────────────────────────────────────────────────
function scaleDiff(now){
  const lvl=Math.floor((now-gameStartTime)/CFG.diffEvery);
  speedMult=1+lvl*0.18;
  spawnMin=Math.max(CFG.minSpawn, CFG.spawnMinBase-lvl*90);
  spawnMax=Math.max(CFG.minSpawn+200, CFG.spawnMaxBase-lvl*90);
}

// ── Spawn ─────────────────────────────────────────────────────
function trySpawn(now){
  if(now<nextSpawn) return;
  nextSpawn=now+spawnMin+Math.random()*(spawnMax-spawnMin);
  const n=Math.random()<0.2?2:1;
  for(let i=0;i<n;i++) setTimeout(()=>{ if(gameState==='playing') fruits.push(new Fruit()); },i*300);
}

// ── Background ────────────────────────────────────────────────
function drawBg(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#07071a');g.addColorStop(.5,'#0c1a2e');g.addColorStop(1,'#07071a');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const rg=ctx.createRadialGradient(W/2,H/2,60,W/2,H/2,W*.68);
  rg.addColorStop(0,'rgba(20,55,110,.18)');rg.addColorStop(1,'transparent');
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
}

// ── Main Loop ─────────────────────────────────────────────────
function loop(now){
  rafId=requestAnimationFrame(loop);
  lastTime=now; drawBg();
  if(gameState!=='playing') return;

  scaleDiff(now); trySpawn(now);

  if(shakeF>0){
    ctx.save();
    ctx.translate((Math.random()-.5)*shakeMag*2,(Math.random()-.5)*shakeMag*2);
    shakeF--;
  }

  halves=halves.filter(h=>!h.gone()); halves.forEach(h=>{h.update();h.draw();});

  for(let i=fruits.length-1;i>=0;i--){
    const f=fruits[i]; f.update();
    if(f.isOff()){
      if(!f.sliced&&!f.isBomb&&gameMode==='classic'){
        combo=0;comboPanel.classList.add('hidden');playMiss();loseLife();addPopup(f.x,H-70,'MISSED!');
      }
      fruits.splice(i,1); continue;
    }
    if(f.sliced&&f.alpha<=0){ fruits.splice(i,1); continue; }
    f.draw();
  }

  juice=juice.filter(j=>!j.dead()); juice.forEach(j=>{j.update();j.draw();});
  parts=parts.filter(p=>!p.dead()); parts.forEach(p=>{p.update();p.draw();});
  popups=popups.filter(p=>!p.dead()); popups.forEach(p=>{p.update();p.draw();});

  drawTrail(); checkSlice();

  if(gameMode==='timeattack'){
    const elapsed=(now-gameStartTime)/1000;
    const left=Math.max(0,TIME_ATTACK_SECS-elapsed);
    timerVal.textContent=Math.ceil(left);
    timerVal.classList.toggle('urgent',left<=10);
    if(left<=0) endGame();
  }

  if(combo>0 && Date.now()-lastSliceTime>600){ combo=0; comboPanel.classList.add('hidden'); }

  if(shakeF===0&&shakeMag>0){ ctx.restore(); shakeMag=0; }
  else if(shakeF>0){ ctx.restore(); }
}

// ── Game Control ──────────────────────────────────────────────
function startGame(mode){
  gameMode = mode || 'classic';
  fruits=[];parts=[];halves=[];juice=[];popups=[];trail=[];
  score=0;lives=CFG.maxLives;combo=0;lastSliceTime=0;
  speedMult=1;spawnMin=CFG.spawnMinBase;spawnMax=CFG.spawnMaxBase;
  nextSpawn=0;shakeF=0;shakeMag=0;
  gameStartTime=performance.now();

  timerPanel.classList.toggle('hidden', gameMode!=='timeattack');
  livesPanel.classList.toggle('hidden', gameMode!=='classic');
  if(gameMode==='timeattack'){ timerVal.textContent=TIME_ATTACK_SECS; timerVal.classList.remove('urgent'); }

  updateScoreUI(); updateLivesUI(); comboPanel.classList.add('hidden');
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
  gameState='playing';
  if(!rafId){ lastTime=performance.now(); rafId=requestAnimationFrame(loop); }
}

function endGame(){
  gameState='over'; playGameOver();
  const key='fc_hs_'+gameMode;
  const best=+(localStorage.getItem(key)||0);
  if(score>best) localStorage.setItem(key,score);
  finalScoreEl.textContent=score;
  highScoreEl.textContent=Math.max(score,best);
  const info={
    classic:   {emoji:'💥',title:'GAME OVER',   tag:'⚔️ CLASSIC'},
    timeattack:{emoji:'⏱️',title:"TIME'S UP!",  tag:'⏱️ TIME ATTACK'},
    zen:       {emoji:'🧘',title:'SESSION END', tag:'🧘 ZEN'},
  }[gameMode];
  resultEmoji.textContent=info.emoji;
  resultTitle.textContent=info.title;
  modeTag.textContent=info.tag;
  hudEl.classList.add('hidden'); gameOverScreen.classList.remove('hidden');
}

// ── Mouse ──────────────────────────────────────────────────────
canvas.addEventListener('mousedown', ()=>{ isSlicing=true; trail=[]; });
canvas.addEventListener('mouseup',   ()=>{ isSlicing=false; trail=[]; });
canvas.addEventListener('mouseleave',()=>{ isSlicing=false; trail=[]; });
canvas.addEventListener('mousemove', e=>{ if(!isSlicing||gameState!=='playing') return; addPt(e.clientX,e.clientY); });

// ── Touch ──────────────────────────────────────────────────────
canvas.addEventListener('touchstart', e=>{ e.preventDefault(); isSlicing=true; trail=[]; },{passive:false});
canvas.addEventListener('touchend',   e=>{ e.preventDefault(); isSlicing=false; trail=[]; },{passive:false});
canvas.addEventListener('touchmove',  e=>{ e.preventDefault(); if(gameState!=='playing') return; addPt(e.touches[0].clientX,e.touches[0].clientY); },{passive:false});

// ── Boot ───────────────────────────────────────────────────────
rafId=requestAnimationFrame(loop);
