(() => {
  /* ── Theme definitions ── */
  const THEMES = [
    {id:'clean',  label:'Clean',  bg:'#ffffff', dots:['#111827','#ef4444','#3b82f6']},
    {id:'dark',   label:'Dark',   bg:'#0d0d12', dots:['#f5f5f5','#f87171','#60a5fa']},
    {id:'cobalt', label:'Cobalt', bg:'#eef2ff', dots:['#4338ca','#e11d48','#0ea5e9']},
    {id:'ember',  label:'Ember',  bg:'#fff8f5', dots:['#c2410c','#dc2626','#d97706']},
  ];

  const PIECE_COLORS = {
    clean:  {I:'#0ea5e9',O:'#f59e0b',T:'#8b5cf6',S:'#10b981',Z:'#ef4444',J:'#3b82f6',L:'#f97316'},
    dark:   {I:'#38bdf8',O:'#fbbf24',T:'#a78bfa',S:'#34d399',Z:'#f87171',J:'#60a5fa',L:'#fb923c'},
    cobalt: {I:'#0ea5e9',O:'#f59e0b',T:'#7c3aed',S:'#059669',Z:'#dc2626',J:'#4338ca',L:'#ea580c'},
    ember:  {I:'#0891b2',O:'#d97706',T:'#7c3aed',S:'#16a34a',Z:'#dc2626',J:'#b45309',L:'#c2410c'},
  };

  let COLORS = {};
  let state, dropTimer;

  /* ── Build theme swatches ── */
  const themeGrid = document.getElementById('theme-grid');
  THEMES.forEach(t => {
    const sw = document.createElement('div');
    sw.className = 'theme-swatch';
    sw.dataset.themeId = t.id;
    sw.innerHTML =
      `<div class="swatch-top" style="background:${t.bg};color:${t.dots[0]}">${t.label}</div>`+
      `<div class="swatch-dots">${t.dots.map(d=>`<div class="swatch-dot" style="background:${d}"></div>`).join('')}</div>`;
    sw.addEventListener('click', () => applyTheme(t.id));
    themeGrid.appendChild(sw);
  });

  function applyTheme(id) {
    if (!PIECE_COLORS[id]) id = 'clean';
    document.documentElement.dataset.theme = id;
    localStorage.setItem('bf_theme', id);
    COLORS = PIECE_COLORS[id];
    document.querySelectorAll('.theme-swatch').forEach(s =>
      s.classList.toggle('active', s.dataset.themeId === id));
    if (state) drawAll();
  }

  /* ── Settings persistence ── */
  applyTheme(localStorage.getItem('bf_theme') || 'clean');

  const ghostToggle = document.getElementById('ghost-toggle');
  ghostToggle.checked = localStorage.getItem('bf_ghost') !== 'false';
  ghostToggle.addEventListener('change', () => {
    localStorage.setItem('bf_ghost', ghostToggle.checked);
    if (state) drawAll();
  });

  /* ── Settings drawer ── */
  const drawer = document.getElementById('settings-drawer');
  const scrim  = document.getElementById('scrim');

  function openDrawer() {
    drawer.classList.add('open');
    scrim.classList.add('visible');
    if (state && state.started && !state.over && !state.paused) {
      state.paused = true;
      document.getElementById('btn-pause').textContent = '▶';
    }
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    scrim.classList.remove('visible');
  }
  document.getElementById('btn-settings').addEventListener('click', openDrawer);
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  /* ── Game constants ── */
  const COLS = 10, ROWS = 20;
  const PIECES = {
    I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O:[[1,1],[1,1]],
    T:[[0,1,0],[1,1,1],[0,0,0]],
    S:[[0,1,1],[1,1,0],[0,0,0]],
    Z:[[1,1,0],[0,1,1],[0,0,0]],
    J:[[1,0,0],[1,1,1],[0,0,0]],
    L:[[0,0,1],[1,1,1],[0,0,0]],
  };
  const SCORE_TABLE = [0,100,300,500,800];
  const BASE_SPEED  = 800;

  /* ── Canvas ── */
  const boardCanvas = document.getElementById('board');
  const ctx         = boardCanvas.getContext('2d');
  const nextCanvas  = document.getElementById('next-canvas');
  const nctx        = nextCanvas.getContext('2d');
  let CS = 26;

  function resize() {
    const hh = document.querySelector('header').offsetHeight;
    const ch = document.getElementById('controls').offsetHeight;
    const sw = document.getElementById('side-panel').offsetWidth;
    const availH = window.innerHeight - hh - ch - 18;
    const availW = window.innerWidth  - sw - 48;
    CS = Math.max(14, Math.floor(Math.min(availH/ROWS, availW/COLS)));
    boardCanvas.width  = CS * COLS;
    boardCanvas.height = CS * ROWS;
    nextCanvas.width   = CS * 4;
    nextCanvas.height  = CS * 4;
    if (state) drawAll();
  }

  /* ── State ── */

  function newState() {
    return {
      board:Array.from({length:ROWS},()=>Array(COLS).fill(null)),
      piece:null, pieceType:null, px:0, py:0,
      next:null, nextType:null,
      score:0, lines:0, level:1,
      paused:false, over:false, started:false,
    };
  }

  function randomPiece() {
    const keys = Object.keys(PIECES);
    const k = keys[Math.floor(Math.random()*keys.length)];
    return {type:k, shape:PIECES[k].map(r=>[...r])};
  }

  function spawnPiece() {
    const p = state.next || randomPiece();
    state.pieceType = p.type;
    state.piece     = p.shape;
    state.px = Math.floor((COLS - state.piece[0].length)/2);
    state.py = 0;
    const n = randomPiece();
    state.next = n; state.nextType = n.type;
    if (collides(state.piece, state.px, state.py)) state.over = true;
  }

  function collides(shape, ox, oy) {
    for (let r=0;r<shape.length;r++)
      for (let c=0;c<shape[r].length;c++) {
        if (!shape[r][c]) continue;
        const nx=ox+c, ny=oy+r;
        if (nx<0||nx>=COLS||ny>=ROWS) return true;
        if (ny>=0 && state.board[ny][nx]) return true;
      }
    return false;
  }

  function rotate(shape) {
    const N=shape.length;
    return shape[0].map((_,c)=>shape.map((_,r)=>shape[N-1-r][c]));
  }

  function lockPiece() {
    state.piece.forEach((row,r)=>row.forEach((v,c)=>{
      if (!v) return;
      const ny=state.py+r, nx=state.px+c;
      if (ny>=0) state.board[ny][nx]=COLORS[state.pieceType];
    }));
    let cleared=0;
    for (let r=ROWS-1;r>=0;r--) {
      if (state.board[r].every(c=>c)) {
        state.board.splice(r,1);
        state.board.unshift(Array(COLS).fill(null));
        cleared++; r++;
      }
    }
    if (cleared) {
      state.lines += cleared;
      state.score += SCORE_TABLE[Math.min(cleared,4)] * state.level;
      state.level  = Math.floor(state.lines/10)+1;
      updateHUD(); resetDropTimer();
    }
    spawnPiece();
  }

  function updateHUD() {
    document.getElementById('score-val').textContent = state.score;
    document.getElementById('lines-val').textContent = state.lines;
    document.getElementById('level-val').textContent = state.level;
    const best = Math.max(state.score, +(localStorage.getItem('bf_best')||0));
    localStorage.setItem('bf_best', best);
    document.getElementById('best-val').textContent = best;
  }

  /* ── Drawing helpers ── */
  function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function roundRect(cx2, x, y, w, h, r, stroke=false) {
    cx2.beginPath();
    cx2.moveTo(x+r,y); cx2.lineTo(x+w-r,y);
    cx2.quadraticCurveTo(x+w,y,x+w,y+r);
    cx2.lineTo(x+w,y+h-r);
    cx2.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    cx2.lineTo(x+r,y+h);
    cx2.quadraticCurveTo(x,y+h,x,y+h-r);
    cx2.lineTo(x,y+r);
    cx2.quadraticCurveTo(x,y,x+r,y);
    cx2.closePath();
    if (stroke) cx2.stroke(); else cx2.fill();
  }

  function drawCell(cx2, col, row, color, size) {
    const s=size, pad=Math.max(1,s*.07), r=Math.max(2,s*.1);
    cx2.fillStyle=color;
    roundRect(cx2,col*s+pad,row*s+pad,s-pad*2,s-pad*2,r);
    const g=cx2.createLinearGradient(col*s,row*s,col*s+s,row*s+s);
    g.addColorStop(0,'rgba(255,255,255,.26)');
    g.addColorStop(.45,'rgba(255,255,255,.04)');
    g.addColorStop(1,'rgba(0,0,0,.14)');
    cx2.fillStyle=g;
    roundRect(cx2,col*s+pad,row*s+pad,s-pad*2,s-pad*2,r);
    cx2.strokeStyle=color;
    cx2.lineWidth=.8;
    cx2.globalAlpha=.35;
    roundRect(cx2,col*s+pad,row*s+pad,s-pad*2,s-pad*2,r,true);
    cx2.globalAlpha=1;
  }

  function drawBoard() {
    ctx.fillStyle = cssVar('--surface2');
    ctx.fillRect(0,0,boardCanvas.width,boardCanvas.height);
    ctx.strokeStyle = cssVar('--border');
    ctx.lineWidth = .4;
    for (let r=0;r<ROWS;r++)
      for (let c=0;c<COLS;c++) {
        ctx.strokeRect(c*CS,r*CS,CS,CS);
        if (state.board[r][c]) drawCell(ctx,c,r,state.board[r][c],CS);
      }
  }

  function drawGhost() {
    if (!ghostToggle.checked) return;
    let gy=state.py;
    while (!collides(state.piece,state.px,gy+1)) gy++;
    if (gy===state.py) return;
    const color=COLORS[state.pieceType];
    const pad=Math.max(1,CS*.07), r=Math.max(2,CS*.1);
    state.piece.forEach((row,rr)=>row.forEach((v,c)=>{
      if (!v) return;
      const px=(state.px+c)*CS, py=(gy+rr)*CS;
      ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.globalAlpha=.52;
      roundRect(ctx,px+pad,py+pad,CS-pad*2,CS-pad*2,r,true);
      ctx.globalAlpha=1;
      ctx.fillStyle=color; ctx.globalAlpha=.07;
      roundRect(ctx,px+pad,py+pad,CS-pad*2,CS-pad*2,r,false);
      ctx.globalAlpha=1;
    }));
  }

  function drawActivePiece() {
    state.piece.forEach((row,r)=>row.forEach((v,c)=>{
      if (v) drawCell(ctx,state.px+c,state.py+r,COLORS[state.pieceType],CS);
    }));
  }

  function drawNext() {
    nctx.fillStyle = cssVar('--surface2');
    nctx.fillRect(0,0,nextCanvas.width,nextCanvas.height);
    if (!state.next) return;
    const shape=state.next.shape;
    const ox=Math.floor((4-shape[0].length)/2);
    const oy=Math.floor((4-shape.length)/2);
    shape.forEach((row,r)=>row.forEach((v,c)=>{
      if (v) drawCell(nctx,ox+c,oy+r,COLORS[state.nextType],CS);
    }));
  }

  function drawAll() { drawBoard(); if(!state.over){drawGhost();drawActivePiece();} drawNext(); }

  /* ── Timer ── */
  function dropSpeed() { return Math.max(75, BASE_SPEED-(state.level-1)*72); }
  function resetDropTimer() { clearInterval(dropTimer); dropTimer=setInterval(tick,dropSpeed()); }

  function tick() {
    if (state.paused||state.over||!state.started) return;
    if (!collides(state.piece,state.px,state.py+1)) state.py++;
    else { lockPiece(); if(state.over){gameOver();return;} }
    drawAll();
  }

  /* ── Actions ── */
  const active = () => state && !state.paused && !state.over && state.started;

  function moveLeft()  { if(active()&&!collides(state.piece,state.px-1,state.py)){state.px--;drawAll();} }
  function moveRight() { if(active()&&!collides(state.piece,state.px+1,state.py)){state.px++;drawAll();} }
  function softDrop()  {
    if(!active()) return;
    if(!collides(state.piece,state.px,state.py+1)){state.py++;state.score++;updateHUD();}
    else{lockPiece();if(state.over){gameOver();return;}}
    drawAll();
  }
  function hardDrop() {
    if(!active()) return;
    while(!collides(state.piece,state.px,state.py+1)){state.py++;state.score+=2;}
    updateHUD(); lockPiece(); if(state.over){gameOver();return;} drawAll();
  }
  function rotatePiece() {
    if(!active()) return;
    const rot=rotate(state.piece); let kick=0;
    if(collides(rot,state.px,state.py)){
      kick=state.px>COLS/2?-1:1;
      if(collides(rot,state.px+kick,state.py)){kick*=2;if(collides(rot,state.px+kick,state.py))return;}
    }
    state.piece=rot; state.px+=kick; drawAll();
  }
  function togglePause() {
    if(!state||state.over||!state.started) return;
    state.paused=!state.paused;
    document.getElementById('btn-pause').textContent=state.paused?'▶':'⏸';
    if(state.paused) showOverlay('PAUSED','Tap Resume to continue',null,'RESUME');
    else hideOverlay();
  }

  /* ── Overlay ── */
  function showOverlay(title,msg,score,btn) {
    document.getElementById('overlay-title').textContent=title;
    document.getElementById('overlay-msg').textContent=msg||'';
    const sc=document.getElementById('overlay-score');
    if(score!=null){sc.style.display='';sc.textContent=score;}else sc.style.display='none';
    document.getElementById('overlay-btn').textContent=btn||'START';
    document.getElementById('overlay').classList.remove('hidden');
  }
  function hideOverlay(){document.getElementById('overlay').classList.add('hidden');}

  function gameOver() {
    state.over=true; clearInterval(dropTimer);
    const best=Math.max(state.score,+(localStorage.getItem('bf_best')||0));
    localStorage.setItem('bf_best',best);
    document.getElementById('best-val').textContent=best;
    setTimeout(()=>showOverlay('GAME OVER',`Lines: ${state.lines}  ·  Level: ${state.level}`,state.score,'PLAY AGAIN'),420);
  }

  function startGame() {
    clearInterval(dropTimer);
    state=newState(); state.started=true;
    spawnPiece(); updateHUD(); hideOverlay();
    document.getElementById('btn-pause').textContent='⏸';
    resetDropTimer(); drawAll();
  }

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
    const map={ArrowLeft:moveLeft,ArrowRight:moveRight,ArrowDown:softDrop,ArrowUp:rotatePiece,' ':hardDrop,p:togglePause,P:togglePause};
    if(map[e.key]){e.preventDefault();map[e.key]();}
  });

  /* ── Buttons ── */
  function bindBtn(id,fn){
    const el=document.getElementById(id);
    el.addEventListener('pointerdown',e=>{e.preventDefault();el.classList.add('pressed');fn();});
    el.addEventListener('pointerup',()=>el.classList.remove('pressed'));
    el.addEventListener('pointerleave',()=>el.classList.remove('pressed'));
  }
  function bindRepeat(id,fn){
    const el=document.getElementById(id); let t,iv;
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();el.classList.add('pressed');fn();
      t=setTimeout(()=>{iv=setInterval(fn,72);},185);
    });
    const stop=()=>{clearTimeout(t);clearInterval(iv);el.classList.remove('pressed');};
    ['pointerup','pointerleave','pointercancel'].forEach(ev=>el.addEventListener(ev,stop));
  }
  bindRepeat('btn-left',  moveLeft);
  bindRepeat('btn-right', moveRight);
  bindRepeat('btn-down',  softDrop);
  bindBtn('btn-rotate',   rotatePiece);
  bindBtn('btn-drop',     hardDrop);
  bindBtn('btn-pause',    togglePause);

  /* Dual-bind START: touchstart fires first on mobile (no 300ms delay),
     preventDefault cancels the subsequent synthetic click so startGame
     only runs once. The click listener catches desktop/mouse. */
  const overlayBtn = document.getElementById('overlay-btn');
  let _startLock = false;
  function _handleStart(e) {
    e.preventDefault();
    if (_startLock) return;
    _startLock = true;
    startGame();
    setTimeout(() => { _startLock = false; }, 600);
  }
  overlayBtn.addEventListener('touchstart', _handleStart, {passive: false});
  overlayBtn.addEventListener('click', _handleStart);

  /* ── Swipe ── */
  let tx,ty,tt;
  boardCanvas.addEventListener('touchstart',e=>{e.preventDefault();tx=e.touches[0].clientX;ty=e.touches[0].clientY;tt=Date.now();},{passive:false});
  boardCanvas.addEventListener('touchend',e=>{
    e.preventDefault();
    const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty, dt=Date.now()-tt;
    const ax=Math.abs(dx),ay=Math.abs(dy);
    if(ax<10&&ay<10&&dt<220){rotatePiece();return;}
    if(ay>ax&&dy>26){softDrop();return;}
    if(ay>ax&&dy<-26){hardDrop();return;}
    if(ax>ay&&dx<-26){moveLeft();return;}
    if(ax>ay&&dx>26){moveRight();return;}
  },{passive:false});

  /* ── Init ── */
  window.addEventListener('resize', resize);
  resize();
  document.getElementById('best-val').textContent = localStorage.getItem('bf_best')||0;
  state = newState();
  showOverlay('BLOCKFALL','Arrow keys · Swipe · Buttons',null,'START');
})();
