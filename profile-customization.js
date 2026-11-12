(() => {
  const css=document.createElement('style');
  css.textContent='.custom-avatar-image{display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit}.profile-banner{height:120px;border-radius:14px;margin-bottom:18px;border:1px solid var(--border)}.profile-banner[data-banner=pirate]{background:repeating-linear-gradient(135deg,transparent 0 30px,#ffffff0a 30px 32px),linear-gradient(110deg,#113847,#256779,#c39943)}.profile-banner[data-banner=cosmic]{background:radial-gradient(circle at 25% 35%,#e1d8ff 0 2px,transparent 3px),linear-gradient(120deg,#222657,#793d9e,#286a94)}.profile-banner[data-banner=sunrise]{background:linear-gradient(120deg,#9a4059,#f7ae75,#ffe3a0)}.profile-title-badge{display:inline-block;border:1px solid var(--border);border-radius:20px;padding:7px 13px;margin:0 0 16px;color:var(--text);font-weight:700;font-size:13px}.avatar-photo-controls{display:grid;gap:12px;margin:18px 0}.avatar-photo-controls .photo-actions{display:flex;flex-wrap:wrap;gap:10px}.avatar-photo-controls p{color:var(--muted);font-size:13px;line-height:1.6}.avatar-photo-controls [data-error=true]{color:var(--danger)}.shop-item-preview img{width:76px;height:76px;border-radius:18px;object-fit:cover}';
  document.head.appendChild(css);
  let cached=null, signedUrl='', imageKey='', revision=0, busy=false, repaintQueued=false;
  const $=id=>document.getElementById(id);
  function photoStatus(text,error=false){const el=$('avatar-photo-status');if(el){el.textContent=text;el.dataset.error=String(error);}}
  function paint(){
    const p=cached;if(!p)return;
    const source=p.avatar_source==='photo' ? signedUrl : (p.equipped_avatar==='🏴‍☠️' || p.equipped_avatar==='pirate-character') ? 'pirate-avatar.svg' : '';
    for(const el of document.querySelectorAll('.avatar,.large-avatar,.profile-avatar')){
      if(source){
        if(el.dataset.failedAvatar===imageKey)continue;
        if(el.firstElementChild?.tagName==='IMG' && el.firstElementChild.getAttribute('src')===source)continue;
        const img=document.createElement('img');img.className='custom-avatar-image';img.alt=p.avatar_source==='photo'?'Your profile photo':'Pirate captain avatar';img.src=source;
        img.onerror=()=>{el.dataset.failedAvatar=imageKey;el.textContent='✦';};el.replaceChildren(img);
      }else{const text=p.equipped_avatar && p.equipped_avatar!=='spark'?p.equipped_avatar:'✦';if(el.textContent!==text || el.firstElementChild)el.textContent=text;}
    }
  }
  function accountDecorations(p){
    const host=$('profile-panel') || document.querySelector('.account-info');if(!host)return;
    let banner=$('equipped-profile-banner');
    if(!banner){banner=document.createElement('div');banner.id='equipped-profile-banner';banner.className='profile-banner';host.prepend(banner);}
    const allowed=['pirate','cosmic','sunrise'];banner.hidden=!allowed.includes(p.equipped_banner);banner.dataset.banner=p.equipped_banner;banner.setAttribute('role','img');banner.setAttribute('aria-label',p.equipped_banner+' profile banner');
    let title=$('equipped-profile-title');
    if(!title){title=document.createElement('div');title.id='equipped-profile-title';title.className='profile-title-badge';banner.after(title);}
    title.textContent=p.equipped_title||'';title.hidden=!p.equipped_title;
  }
  window.renderProfileCustomization=async(p,user)=>{
    const ticket=++revision;cached=p;imageKey=user.id+':'+p.avatar_source+':'+p.avatar_url+':'+p.equipped_avatar;signedUrl='';
    if(p.avatar_source==='photo' && typeof p.avatar_url==='string' && p.avatar_url.startsWith(user.id+'/')){
      const {data,error}=await supabaseClient.storage.from('profile-avatars').createSignedUrl(p.avatar_url,3600);
      if(ticket!==revision)return;if(!error)signedUrl=data.signedUrl;
    }
    if(ticket!==revision)return;paint();accountDecorations(p);
  };
  window.clearProfileCustomization=()=>{revision++;cached=null;signedUrl='';imageKey='';for(const el of document.querySelectorAll('.avatar,.large-avatar,.profile-avatar'))el.textContent='✦';for(const id of ['equipped-profile-banner','equipped-profile-title'])if($(id))$(id).hidden=true;};
  new MutationObserver(()=>{if(repaintQueued || !cached)return;repaintQueued=true;queueMicrotask(()=>{repaintQueued=false;paint();});}).observe(document.body,{childList:true,characterData:true,subtree:true});
  function setup(){
    const host=$('profile-panel');if(!host || $('avatar-photo-controls'))return;
    const panel=document.createElement('section');panel.id='avatar-photo-controls';panel.className='avatar-photo-controls';
    panel.innerHTML='<h3>Profile avatar</h3><p>Upload a JPG, PNG, or WEBP up to 2 MB. Photos are resized to a square avatar and can be viewed by signed-in app users. Only upload a photo you have permission to use.</p><label>Your photo<input id="avatar-photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="photo-actions"><button id="avatar-photo-upload" class="primary-button" type="button">Upload photo</button><button id="avatar-use-cosmetic" class="secondary-button" type="button">Use my purchased avatar</button><button id="avatar-photo-remove" class="secondary-button" type="button">Delete photo</button></div><p id="avatar-photo-status" role="status"></p>';
    host.insertBefore(panel,$('profile-form'));
    $('avatar-photo-upload').addEventListener('click',()=>changePhoto('upload'));
    $('avatar-use-cosmetic').addEventListener('click',()=>changePhoto('cosmetic'));
    $('avatar-photo-remove').addEventListener('click',()=>changePhoto('delete'));
  }
  async function squarePhoto(file){
    if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>2097152)throw new Error('Choose a JPG, PNG, or WEBP up to 2 MB.');
    const bitmap=await createImageBitmap(file);
    try{
      if(bitmap.width*bitmap.height>20000000)throw new Error('Choose a photo smaller than 20 megapixels.');
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d');
      const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,512,512);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.85));if(!blob || blob.size>2097152)throw new Error('Could not resize that image.');return blob;
    }finally{bitmap.close();}
  }
  async function changePhoto(action){
    if(busy)return;if(action==='delete' && !window.confirm('Delete your uploaded profile photo?'))return;
    busy=true;const controls=$('avatar-photo-controls');controls?.querySelectorAll('button,input').forEach(el=>el.disabled=true);photoStatus('Saving...');
    let uploaded=null,committed=false;
    try{
      const {data:auth,error:authError}=await supabaseClient.auth.getUser();if(authError || !auth.user)throw new Error('Sign in first.');const user=auth.user;
      const {data:profile,error:readError}=await supabaseClient.from('user_profiles').select('avatar_url').eq('user_id',user.id).single();if(readError)throw readError;
      const old=profile.avatar_url;let patch;
      if(action==='upload'){
        const blob=await squarePhoto($('avatar-photo-file').files[0]);const extension=blob.type==='image/webp'?'webp':'png';uploaded=user.id+'/'+crypto.randomUUID()+'.'+extension;
        const {error}=await supabaseClient.storage.from('profile-avatars').upload(uploaded,blob,{contentType:blob.type,upsert:false});if(error){uploaded=null;throw error;}patch={avatar_url:uploaded,avatar_source:'photo'};
      }else patch=action==='delete'?{avatar_url:null,avatar_source:'cosmetic'}:{avatar_source:'cosmetic'};
      const {data:updated,error:updateError}=await supabaseClient.from('user_profiles').update(patch).eq('user_id',user.id).select('user_id');if(updateError)throw updateError;if(!updated?.length)throw new Error('Profile was not updated.');committed=true;
      let cleanupWarning=false;
      if((action==='upload' || action==='delete') && typeof old==='string' && old.startsWith(user.id+'/')){const {error}=await supabaseClient.storage.from('profile-avatars').remove([old]);cleanupWarning=!!error;}
      await window.applySavedCosmetics?.();$('avatar-photo-file').value='';photoStatus(cleanupWarning?'Profile updated, but the old storage file could not be deleted.':action==='upload'?'Photo saved.':action==='delete'?'Photo removed.':'Purchased avatar selected.');
    }catch(error){if(uploaded && !committed)await supabaseClient.storage.from('profile-avatars').remove([uploaded]);photoStatus(error.message||'Could not update your photo.',true);}
    finally{busy=false;controls?.querySelectorAll('button,input').forEach(el=>el.disabled=false);}
  }
  setup();window.applySavedCosmetics?.();
  setInterval(()=>window.applySavedCosmetics?.(),2700000);
})();
