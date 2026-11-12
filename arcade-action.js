(() => {
  const choices=document.querySelector('.arcade-choices'),grid=document.querySelector('.workspace-grid');
  if(!choices||!grid||new URLSearchParams(location.search).get('view')==='todo')return;
  const css=document.createElement('style');css.textContent='.action-canvas{display:block;width:100%;max-width:800px;height:auto;aspect-ratio:5/3;border:2px solid #6d85b7;border-radius:16px;background:#081225;touch-action:none;margin:16px 0}.action-controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.action-hud{font-variant-numeric:tabular-nums;color:var(--text);font-weight:700;line-height:1.8}.action-choice-space{background:linear-gradient(140deg,#10233e,#282452)!important;color:#fff!important}.action-choice-pirate{background:linear-gradient(140deg,#123b43,#604120)!important;color:#fff!important}.action-choice-space span,.action-choice-pirate span{color:#e1eaff!important}';document.head.appendChild(css);
  function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  const allPanels=[...grid.children].filter(n=>n.tagName==='SECTION'),map=new Map(),engines=[];
  for(const button of choices.querySelectorAll('button')){const title=button.querySelector('strong')?.textContent;const panel=allPanels.find(p=>p.querySelector('h2')?.textContent.toLowerCase()===title?.toLowerCase());if(panel)map.set(button,panel);}
  function makeGame(kind,title,instructions){
    const panel=el('section',null,'panel');panel.hidden=true;panel.append(el('h2',title),el('p',instructions+' Free play only: points are not shop tokens. Best scores are saved in this browser.','arcade-description'));
    const hud=el('p','','action-hud'),canvas=document.createElement('canvas');canvas.width=600;canvas.height=360;canvas.className='action-canvas';canvas.tabIndex=0;canvas.setAttribute('aria-label',title+'. '+instructions);canvas.textContent='This game requires canvas support. Use the control buttons or keyboard.';
    const controls=el('div',null,'action-controls'),start=el('button','Start / Restart','primary-button'),pause=el('button','Pause','secondary-button'),status=el('p','Press Start to play.','arcade-status');status.setAttribute('role','status');
    for(const b of [start,pause])b.type='button';pause.disabled=true;controls.append(start,pause);panel.append(hud,canvas,controls,status);grid.append(panel);allPanels.push(panel);
    const ctx=canvas.getContext('2d');if(!ctx){status.textContent='Canvas is unavailable in this browser.';start.disabled=true;return {panel,pause:()=>{}};}
    const portrait=new Image();portrait.src='pirate-avatar.svg';let best=0;
    try{const saved=Number(localStorage.getItem('ai-tutor-best-'+kind));if(Number.isFinite(saved)&&saved>=0)best=saved;}catch{}
    let running=false,ended=false,frame=0,last=0,time=0,score=0,lives=3,invincible=0,spawn=0,objects=[],x=300,target=300,y=278,velocity=0;
    function updateHud(){hud.textContent='Score: '+Math.floor(score)+' · Best: '+best+' · Lives: '+lives+' · Level: '+(1+Math.floor(time/20));}
    function record(){best=Math.max(best,Math.floor(score));try{localStorage.setItem('ai-tutor-best-'+kind,String(best));}catch{}}
    function halt(){if(!running)return;running=false;cancelAnimationFrame(frame);pause.textContent='Resume';status.textContent='Paused. Press Resume to continue.';record();draw();}
    function hit(){if(invincible>0)return;lives--;invincible=1.2;if(lives<=0){running=false;ended=true;pause.disabled=true;record();status.textContent='Game over! Score: '+Math.floor(score)+'. Press Start / Restart to try again.';}}
    function jump(){if(running&&kind==='pirate'&&y>=277){velocity=-540;}}
    function steer(delta){if(running&&kind==='space')target=Math.max(24,Math.min(576,target+delta));}
    if(kind==='space'){for(const [label,delta]of [['Move left',-90],['Move right',90]]){const b=el('button',label,'secondary-button');b.type='button';b.addEventListener('click',()=>steer(delta));controls.append(b);}}
    else{const b=el('button','Jump','secondary-button');b.type='button';b.addEventListener('click',jump);controls.append(b);}
    panel.addEventListener('keydown',event=>{if(panel.hidden||event.target.tagName==='INPUT')return;if(event.code==='ArrowLeft'&&kind==='space'){event.preventDefault();steer(-70);}if(event.code==='ArrowRight'&&kind==='space'){event.preventDefault();steer(70);}if((event.code==='Space'||event.code==='ArrowUp')&&kind==='pirate'&&event.target===canvas){event.preventDefault();if(!event.repeat)jump();}if(event.code==='KeyP'){event.preventDefault();if(running)halt();else resume();}});
    function pointer(event){if(!running)return;const rect=canvas.getBoundingClientRect();if(kind==='space')target=Math.max(24,Math.min(576,(event.clientX-rect.left)*600/rect.width));else jump();}
    canvas.addEventListener('pointerdown',event=>{canvas.focus();canvas.setPointerCapture(event.pointerId);pointer(event);});
    canvas.addEventListener('pointermove',event=>{if(kind==='space'&&event.buttons)pointer(event);});
    function resume(){if(ended||panel.hidden||lives<=0||pause.disabled)return;running=true;last=performance.now();pause.textContent='Pause';status.textContent='Playing. Press P or Pause to take a break.';frame=requestAnimationFrame(loop);}
    pause.addEventListener('click',()=>running?halt():resume());
    start.addEventListener('click',()=>{if(panel.hidden)return;cancelAnimationFrame(frame);running=true;ended=false;time=0;score=0;lives=3;invincible=0;spawn=0.6;objects=[];x=300;target=300;y=278;velocity=0;last=performance.now();pause.disabled=false;pause.textContent='Pause';status.textContent='Playing. Press P or Pause to take a break.';canvas.focus();frame=requestAnimationFrame(loop);});
    function tick(dt){
      time+=dt;score+=dt*10;invincible=Math.max(0,invincible-dt);spawn-=dt;
      if(kind==='space'){
        x+=(target-x)*Math.min(1,dt*14);
        if(spawn<=0){objects.push({x:24+Math.random()*552,y:-25,coin:Math.random()<0.28,r:15+Math.random()*9});spawn=Math.max(0.28,0.8-time*0.004);}
        for(const o of objects){o.y+=(160+Math.min(180,time*3))*dt;if(Math.hypot(o.x-x,o.y-300)<o.r+14){if(o.coin)score+=50;else hit();o.dead=true;}}
        objects=objects.filter(o=>!o.dead&&o.y<395);
      }else{
        velocity+=1300*dt;y=Math.min(278,y+velocity*dt);if(y===278)velocity=0;
        if(spawn<=0){objects.push({x:640,y:Math.random()<0.3?220:294,coin:Math.random()<0.3});spawn=1.3+Math.random()*0.65;}
        const speed=230+Math.min(190,time*3);
        for(const o of objects){o.x-=speed*dt;const collision=o.x<126&&o.x+30>86&&o.y<y+32&&o.y+30>y-14;if(collision){if(o.coin)score+=60;else hit();o.dead=true;}}
        objects=objects.filter(o=>!o.dead&&o.x>-40);
      }
    }
    function draw(){
      ctx.clearRect(0,0,600,360);const bg=ctx.createLinearGradient(0,0,0,360);bg.addColorStop(0,kind==='space'?'#070b24':'#103c57');bg.addColorStop(1,kind==='space'?'#19294b':'#278c9c');ctx.fillStyle=bg;ctx.fillRect(0,0,600,360);
      if(kind==='space'){
        ctx.fillStyle='#bddef7';for(let i=0;i<44;i++){const sx=(i*137)%600,sy=((i*73)+time*15)%360;ctx.fillRect(sx,sy,i%3===0?2:1,2);}
        ctx.fillStyle=invincible>0?'#f7e38c':'#79e5ff';ctx.beginPath();ctx.moveTo(x,277);ctx.lineTo(x-18,317);ctx.lineTo(x,308);ctx.lineTo(x+18,317);ctx.closePath();ctx.fill();ctx.fillStyle='#b48aff';ctx.fillRect(x-5,315,10,12);
      }else{
        ctx.fillStyle='#b5e4ed';ctx.beginPath();ctx.arc(490,68,30,0,Math.PI*2);ctx.fill();ctx.fillStyle='#153d49';ctx.fillRect(0,316,600,44);ctx.fillStyle='#a3733a';ctx.fillRect(0,312,600,8);for(let i=0;i<12;i++){ctx.fillStyle='#d2a05c';ctx.fillRect((i*65-time*90)%780,313,40,4);}
        if(portrait.complete&&portrait.naturalWidth){ctx.globalAlpha=invincible>0?0.65:1;ctx.drawImage(portrait,80,y-18,48,48);ctx.globalAlpha=1;}else{ctx.fillStyle='#f4c590';ctx.fillRect(88,y-8,30,34);ctx.fillStyle='#b2384a';ctx.fillRect(85,y-15,36,10);}
      }
      for(const o of objects){
        if(o.coin){ctx.fillStyle='#ffdc70';ctx.beginPath();ctx.arc(o.x+(kind==='pirate'?15:0),o.y+(kind==='pirate'?15:0),12,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a86a0a';ctx.lineWidth=3;ctx.stroke();}
        else if(kind==='space'){ctx.fillStyle='#7c88a8';ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4c5878';ctx.beginPath();ctx.arc(o.x-5,o.y-4,5,0,Math.PI*2);ctx.fill();}
        else{ctx.fillStyle='#8a4d2a';ctx.fillRect(o.x,o.y,30,30);ctx.fillStyle='#dec28c';ctx.fillRect(o.x,o.y+5,30,4);ctx.fillRect(o.x,o.y+22,30,4);}
      }
      if(!running){ctx.fillStyle='#020716b8';ctx.fillRect(0,0,600,360);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 26px sans-serif';ctx.fillText(ended?'Game over':pause.disabled?title:'Paused',300,166);ctx.font='16px sans-serif';ctx.fillText(pause.disabled||ended?'Press Start / Restart':'Press Resume to keep playing',300,198);ctx.textAlign='left';}
      updateHud();
    }
    function loop(now){if(!running||panel.hidden){halt();return;}const dt=Math.min(0.035,(now-last)/1000);last=now;tick(dt);draw();if(running)frame=requestAnimationFrame(loop);}
    draw();return {panel,pause:halt};
  }
  for(const [kind,title,instructions]of [['space','Space Dodger','Use left/right arrows, the on-screen buttons, or drag across the play area. Dodge asteroids and collect gold stars.'],['pirate','Pirate Dash','Tap the play area or Jump button, or focus the play area and press Space/Up. Jump over barrels and collect treasure.']]){
    const engine=makeGame(kind,title,instructions);engines.push(engine);const button=el('button',null,'arcade-choice action-choice-'+kind);button.type='button';button.append(el('strong',title),el('span',kind==='space'?'Dodge asteroids. Collect stars. Survive the next level.':'Leap over barrels and hunt treasure on a pirate run.'));button.setAttribute('aria-pressed','false');choices.prepend(button);map.set(button,engine.panel);
  }
  choices.addEventListener('click',event=>{const button=event.target.closest('button');if(!map.has(button))return;queueMicrotask(()=>{for(const engine of engines)engine.pause();const target=map.get(button);for(const panel of allPanels)panel.hidden=panel!==target;for(const b of choices.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));});});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const engine of engines)engine.pause();});
  window.addEventListener('pagehide',()=>{for(const engine of engines)engine.pause();});
})();
