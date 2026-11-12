(() => {
  if(document.body.dataset.page!=='workspace')return;
  const todo=new URLSearchParams(location.search).get('view')==='todo';
  const tasks=document.querySelector('[aria-labelledby=tasks-heading]'),math=document.querySelector('[aria-labelledby=game-heading]'),grid=document.querySelector('.workspace-grid');
  if(!tasks||!math||!grid)return;
  tasks.hidden=!todo;math.hidden=todo;grid.style.gridTemplateColumns='1fr';
  document.querySelector('h1').textContent=todo?'To-do List':'Games';document.title=(todo?'To-do List':'Games')+' | AI Tutor';
  document.querySelector('.topbar .eyebrow').textContent=todo?'YOUR PERSONAL PLANNER':'PICK A GAME AND PLAY';
  const auth=document.getElementById('workspace-auth');
  function authCopy(){if(!auth)return;const signed=auth.textContent.startsWith('Signed in');const text=signed?(todo?'Signed in. Your task list is private.':'Signed in. Math Challenge rewards are available; arcade games are free play.'):(todo?'Sign in on the Account page to save your tasks.':'Play the arcade games below, or sign in for token-earning Math Challenge rounds.');if(auth.textContent!==text)auth.textContent=text;}
  if(auth){authCopy();new MutationObserver(authCopy).observe(auth,{childList:true,characterData:true,subtree:true});}
  if(todo)return;
  const style=document.createElement('style');style.textContent='.arcade-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin:20px 0}.arcade-choice{display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:24px;border:2px solid var(--border);border-radius:18px;background:var(--panel);color:var(--text);text-align:left;cursor:pointer;min-height:180px;font:inherit}.arcade-choice strong{font-size:22px}.arcade-choice span{font-size:13px;line-height:1.6;color:var(--muted)}.arcade-choice[aria-pressed=true]{border-color:var(--purple);box-shadow:0 0 0 3px #9875ff22}.arcade-memory{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:480px;margin:20px 0}.arcade-memory button{min-height:76px;border:2px solid var(--border);border-radius:12px;background:var(--panel-light);color:var(--text);font-size:28px;cursor:pointer}.arcade-memory button[data-matched=true]{border-color:#248660;opacity:.7}.arcade-status{min-height:26px;color:var(--text);line-height:1.6}.reaction-pad{display:block;width:100%;min-height:180px;margin:20px 0;border:2px solid var(--border);border-radius:18px;background:#653244;color:#fff;font:inherit;font-size:23px;font-weight:700;cursor:pointer}.reaction-pad[data-ready=true]{background:#166746}.arcade-description{color:var(--muted);line-height:1.7}';document.head.appendChild(style);
  function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  const choices=el('div',null,'arcade-choices');grid.before(choices);
  const memory=el('section',null,'panel'),reflex=el('section',null,'panel');grid.append(memory,reflex);
  memory.append(el('h2','Memory Match'),el('p','Find all six matching pairs. Free play — no token rewards.','arcade-description'));
  const restart=el('button','New board','secondary-button');restart.type='button';const board=el('div',null,'arcade-memory'),memoryStatus=el('p','','arcade-status');memoryStatus.setAttribute('role','status');memory.append(restart,board,memoryStatus);
  let open=[],matched=0,moves=0,locked=false,boardTimer=null;
  function newBoard(){
    clearTimeout(boardTimer);open=[];matched=0;moves=0;locked=false;board.replaceChildren();memoryStatus.textContent='Find the matching shapes.';
    const cards=['★','◆','●','▲','☀','☾','★','◆','●','▲','☀','☾'];
    for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}
    cards.forEach((symbol,index)=>{
      const card=el('button','?');card.type='button';card.setAttribute('aria-label','Card '+(index+1)+', face down');
      card.addEventListener('click',()=>{
        if(locked||card.disabled||open.some(item=>item.card===card))return;
        card.textContent=symbol;card.setAttribute('aria-label','Card '+(index+1)+': '+symbol);open.push({card,symbol,index});if(open.length<2)return;
        moves++;const [a,b]=open;
        if(a.symbol===b.symbol){for(const item of open){item.card.disabled=true;item.card.dataset.matched='true';}matched++;open=[];memoryStatus.textContent=matched===6?'Board complete in '+moves+' moves!':matched+' of 6 pairs · '+moves+' moves';}
        else{locked=true;memoryStatus.textContent='Try another pair. '+moves+' moves.';boardTimer=setTimeout(()=>{for(const item of open){item.card.textContent='?';item.card.setAttribute('aria-label','Card '+(item.index+1)+', face down');}open=[];locked=false;},850);}
      });board.append(card);
    });
  }
  restart.addEventListener('click',newBoard);newBoard();
  reflex.append(el('h2','Reaction Rush'),el('p','Start a round, wait for green, then tap as fast as you can. Free play — no token rewards.','arcade-description'));
  const pad=el('button','Start round','reaction-pad');pad.type='button';const reflexStatus=el('p','','arcade-status');reflexStatus.setAttribute('role','status');reflex.append(pad,reflexStatus);
  let reaction='idle',reactionTimer=null,started=0;
  function resetReaction(){clearTimeout(reactionTimer);reaction='idle';pad.dataset.ready='false';pad.textContent='Start round';}
  pad.addEventListener('click',()=>{
    if(reaction==='idle'){reaction='waiting';pad.textContent='Wait for green...';pad.dataset.ready='false';reflexStatus.textContent='';reactionTimer=setTimeout(()=>{reaction='ready';started=performance.now();pad.dataset.ready='true';pad.textContent='TAP NOW';},1500+Math.random()*2500);}
    else if(reaction==='waiting'){resetReaction();reflexStatus.textContent='Too soon! Start a new round.';}
    else{const ms=Math.round(performance.now()-started);resetReaction();reflexStatus.textContent='Your reaction: '+ms+' ms. Play again to beat it!';}
  });
  const panels={memory,reflex,math},buttons=[];
  function choose(id){for(const [key,panel]of Object.entries(panels))panel.hidden=key!==id;for(const item of buttons)item.button.setAttribute('aria-pressed',String(item.id===id));resetReaction();}
  for(const [id,name,description]of [['memory','Memory Match','Flip cards, spot shapes, and find the pairs. Free play.'],['reflex','Reaction Rush','Wait for green and test your reaction speed. Free play.'],['math','Math Challenge','Solve server-checked questions to earn tokens. Sign-in required.']]){
    const button=el('button',null,'arcade-choice');button.type='button';button.append(el('strong',name),el('span',description));button.addEventListener('click',()=>choose(id));buttons.push({id,button});choices.append(button);
  }
  choose('memory');
  document.addEventListener('visibilitychange',()=>{if(document.hidden){resetReaction();reflexStatus.textContent='Round reset while the tab was away.';}});
  window.addEventListener('pagehide',()=>{clearTimeout(boardTimer);resetReaction();});
})();
