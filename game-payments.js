(() => {
  if(document.body.dataset.page!=='workspace'||new URLSearchParams(location.search).get('view')==='todo')return;
  const approved=new WeakSet(),requests=new Map();let busy=false,memoryPaid=false;
  const titles={'Memory Match':'memory','Reaction Rush':'reflex','Space Dodger':'space','Pirate Dash':'pirate'};
  let message;
  function say(text,error=false){if(!message){message=document.createElement('p');message.id='arcade-payment-status';message.setAttribute('role','status');message.style.lineHeight='1.7';document.querySelector('.topbar')?.after(message);}message.textContent=text;message.style.color=error?'var(--danger)':'var(--text)';}
  function decorate(){
    const auth=document.getElementById('workspace-auth');if(auth)auth.hidden=true;
    for(const panel of document.querySelectorAll('.workspace-grid>section')){
      const title=panel.querySelector('h2')?.textContent;if(!titles[title])continue;
      const description=panel.querySelector('.arcade-description');if(description)description.textContent=description.textContent.replace(/Free play(?: only)?:?|Free play —/gi,'5 tokens per new round.').replace(/no token rewards/gi,'no shop-token rewards');
    }
    for(const card of document.querySelectorAll('.arcade-choice')){const title=card.querySelector('strong')?.textContent;const description=card.querySelector('span');if(description&&titles[title])description.textContent=description.textContent.replace(/Free play\.?/gi,'')+' · 5 tokens per round';}
    say('Arcade games cost 5 tokens per round or restart. You confirm before each purchase. Pause/resume is free. Math Challenge stays free and earns tokens.');
  }
  function getRequest(owner,game){
    const key='arcade-pending:'+owner+':'+game;let id=requests.get(key);
    if(!id){try{id=sessionStorage.getItem(key);}catch{}if(!/^[0-9a-f-]{36}$/i.test(id||''))id=crypto.randomUUID();requests.set(key,id);try{sessionStorage.setItem(key,id);}catch{}}
    return {key,id};
  }
  function clearRequest(key){requests.delete(key);try{sessionStorage.removeItem(key);}catch{}}
  document.addEventListener('click',event=>{
    if(!(event.target instanceof Element))return;const button=event.target.closest('button');if(!button)return;
    if(approved.has(button)){approved.delete(button);return;}
    const panel=button.closest('.workspace-grid>section'),title=panel?.querySelector('h2')?.textContent,game=titles[title];if(!game)return;
    const text=button.textContent.trim();const firstCard=game==='memory'&&button.closest('.arcade-memory');
    const newRound=game==='memory'&&text==='New board'||game==='reflex'&&button.classList.contains('reaction-pad')&&text==='Start round'||['space','pirate'].includes(game)&&text==='Start / Restart';
    if(firstCard&&memoryPaid&&!busy)return;
    if(!newRound&&!firstCard)return;
    event.preventDefault();event.stopImmediatePropagation();if(busy)return;
    purchase(button,panel,title,game,firstCard);
  },true);
  async function purchase(button,panel,title,game,firstCard){
    busy=true;button.disabled=true;let request=null;
    try{
      const {data:auth,error:authError}=await supabaseClient.auth.getUser();if(authError||!auth.user)throw new Error('Sign in before playing. Math Challenge can help you earn tokens.');
      const owner=auth.user.id;request=getRequest(owner,game);
      if(!window.confirm('Play a new round of '+title+' for 5 tokens? A restart costs another 5 tokens.'))return;
      say('Confirming payment...');
      const {data,error}=await supabaseClient.rpc('buy_arcade_round',{game_id:game,payment_request_id:request.id});
      if(error)throw error;if(data?.error){clearRequest(request.key);throw new Error(data.error);}if(!data?.round_id)throw new Error('Payment could not be confirmed. Retry to check the same payment request.');
      const {data:current}=await supabaseClient.auth.getSession();
      if(current.session?.user.id!==owner)throw new Error('The round was purchased for the previous account. Sign back into that account and retry to use the same payment receipt.');
      if(panel.hidden||!button.isConnected)throw new Error('Your round is paid. Return to this game and retry its start button to use the same receipt.');
      button.disabled=false;approved.add(button);button.click();approved.delete(button);clearRequest(request.key);
      if(game==='memory')memoryPaid=true;
      say('Round purchased for 5 tokens. Remaining balance: '+data.balance+'. Pause/resume is free.');
      const balance=document.getElementById('game-balance');if(balance)balance.textContent=data.balance;
    }catch(error){say((error.message||'Payment failed.')+' If the request was interrupted, retry; the same payment request will not charge twice.',true);}
    finally{button.disabled=false;busy=false;}
  }
  supabaseClient.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN')memoryPaid=false;});
  window.addEventListener('arcade-ready',decorate,{once:true});
})();
