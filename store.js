const SHOP_URL=SUPABASE_URL+'/functions/v1/cosmetics-shop';
async function shopRequest(method='GET',body=null){const {data:{session}}=await supabaseClient.auth.getSession();if(!session)throw new Error('Sign in to use the Token Shop.');const response=await fetch(SHOP_URL,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,apikey:SUPABASE_ANON_KEY},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Shop request failed.');return result;}
function shopStatus(message,error=false){const el=document.getElementById('shop-status');if(el){el.textContent=message;el.style.color=error?'var(--danger)':'var(--text)';}}
function shopNode(tag,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
async function loadShop(){
 const grid=document.getElementById('shop-items');
 try{
  const data=await shopRequest();document.getElementById('shop-balance').textContent=data.balance;const owned=new Set(data.owned||[]),equipped=data.equipped||{};grid.replaceChildren();
  for(const item of data.catalog||[]){
   const isOwned=owned.has(item.item_id),current=equipped[item.item_type]===item.item_value;const card=shopNode('article',null,'shop-item'),preview=shopNode('div',null,'shop-item-preview');
   if(item.item_id==='avatar-pirate'){const image=document.createElement('img');image.src='pirate-avatar.svg';image.alt='Pirate captain with a hat and eyepatch';image.width=76;image.height=76;preview.append(image);}else preview.textContent=item.preview||'✧';
   card.append(preview,shopNode('h3',item.item_id==='avatar-pirate'?'Pirate Avatar':item.item_name),shopNode('p',item.description));
   const footer=shopNode('div',null,'shop-item-footer');footer.append(shopNode('span',isOwned?'OWNED':item.price+' TOKENS','shop-price'));
   const button=shopNode('button',current?'Equipped':isOwned?'Equip':'Buy',isOwned?'secondary-button':'primary-button');button.type='button';button.dataset.item=item.item_id;button.dataset.action=isOwned?'equip':'purchase';button.disabled=current;footer.append(button);card.append(footer);grid.append(card);
  }
  if(!grid.children.length)grid.append(shopNode('p','No items are available yet.','shop-loading'));
 }catch(error){grid.replaceChildren(shopNode('p',error.message,'shop-loading'));}
}
document.getElementById('shop-items')?.addEventListener('click',async event=>{const button=event.target.closest('button[data-item]');if(!button)return;button.disabled=true;shopStatus(button.dataset.action==='purchase'?'Purchasing...':'Equipping...');try{const result=await shopRequest('POST',{action:button.dataset.action,item_id:button.dataset.item});shopStatus(result.message||'Done!');await loadShop();await window.applySavedCosmetics?.();}catch(error){shopStatus(error.message,true);button.disabled=false;}});
const how=document.querySelector('.shop-how');if(how){how.querySelector('p').textContent='Play the Math challenge in Tasks & Games to earn 5 tokens per correct answer, up to 20 rounds per UTC day. AI-practice rewards are currently paused.';const link=how.querySelector('a');if(link){link.href='workspace.html';link.textContent='Play Math challenge';}}
const heroText=document.querySelector('.shop-hero p');if(heroText)heroText.textContent='Spend game tokens on themes, avatars, chat styles, banners, and titles. Profile photo uploads are free on the Account page.';
loadShop();
