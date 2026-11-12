(() => {
  const $ = id => document.getElementById(id);
  let user = null, tasks = [], editing = null, round = null, epoch = 0, busyTask = false, busyGame = false;
  function status(id, text, error = false) { $(id).textContent = text; $(id).dataset.error = String(error); }
  function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
  function resetForm() { editing = null; $('task-form').reset(); $('task-save').textContent = 'Add task'; $('task-cancel').hidden = true; }
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function renderTasks() {
    const list = $('task-list'); list.replaceChildren();
    const filter = $('task-filter').value, sort = $('task-sort').value;
    const rank = { high:0, normal:1, low:2 };
    const shown = tasks.filter(t => filter === 'all' || filter === 'open' && !t.completed || filter === 'done' && t.completed || filter === 'overdue' && !t.completed && t.due_date && t.due_date < today());
    shown.sort((a,b) => sort === 'priority' ? rank[a.priority]-rank[b.priority] || b.created_at.localeCompare(a.created_at) : sort === 'newest' ? b.created_at.localeCompare(a.created_at) : (a.due_date || '9999').localeCompare(b.due_date || '9999') || rank[a.priority]-rank[b.priority]);
    if (!shown.length) list.append(element('p', user ? 'No tasks match this filter.' : 'Sign in to manage your tasks.', 'small-muted'));
    for (const task of shown) {
      const article = element('article', null, 'workspace-task'); article.dataset.completed = String(task.completed);
      article.append(element('h3', task.title));
      if (task.notes) article.append(element('p', task.notes));
      article.append(element('div', task.priority + ' priority' + (task.due_date ? ' · Due ' + task.due_date : '') + (task.completed ? ' · Completed' : ''), 'workspace-task-meta'));
      const actions = element('div', null, 'workspace-actions');
      for (const [action,label] of [['toggle',task.completed ? 'Reopen' : 'Complete'],['edit','Edit'],['delete','Delete']]) {
        const button = element('button', label, 'secondary-button'); button.type='button'; button.disabled = busyTask;
        button.addEventListener('click', () => taskAction(task, action)); actions.append(button);
      }
      article.append(actions); list.append(article);
    }
  }
  async function loadTasks(ticket = epoch) {
    const owner = user?.id; if (!owner) return;
    const {data,error} = await supabaseClient.from('study_tasks').select('id,title,notes,due_date,priority,completed,created_at').eq('user_id',owner).order('created_at',{ascending:false}).limit(1000);
    if (ticket !== epoch) return;
    if (error) throw error; tasks = data || []; renderTasks();
    status('task-status', tasks.length + ' tasks loaded' + (tasks.length === 1000 ? ' (showing newest 1,000).' : '.'));
  }
  async function taskAction(task, action) {
    if (!user || busyTask) return;
    if (action === 'edit') {
      editing = task.id; $('task-title').value=task.title; $('task-notes').value=task.notes; $('task-due').value=task.due_date || ''; $('task-priority').value=task.priority; $('task-save').textContent='Save changes'; $('task-cancel').hidden=false; $('task-title').focus(); return;
    }
    if (action === 'delete' && !window.confirm('Delete this task?')) return;
    const ticket = epoch, owner = user.id; busyTask=true; $('task-fields').disabled=true; renderTasks();
    try {
      const query = action === 'delete' ? supabaseClient.from('study_tasks').delete() : supabaseClient.from('study_tasks').update({completed:!task.completed});
      const {data,error} = await query.eq('id',task.id).eq('user_id',owner).select('id');
      if (ticket !== epoch) return; if (error) throw error; if (!data?.length) throw new Error('Task could not be changed. Refresh and try again.');
      if (editing === task.id && action === 'delete') resetForm(); await loadTasks(ticket);
    } catch(error) { if(ticket===epoch) status('task-status',error.message,true); }
    finally { if(ticket===epoch) { busyTask=false; $('task-fields').disabled=!user; renderTasks(); } }
  }
  $('task-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!user || busyTask) return;
    const title=$('task-title').value.trim(); if (!title) { status('task-status','Enter a task name.',true); return; }
    const payload={title,notes:$('task-notes').value.trim(),due_date:$('task-due').value || null,priority:$('task-priority').value};
    const ticket=epoch, owner=user.id, id=editing; busyTask=true; $('task-fields').disabled=true; renderTasks();
    try {
      const query = id ? supabaseClient.from('study_tasks').update(payload).eq('id',id).eq('user_id',owner) : supabaseClient.from('study_tasks').insert({...payload,user_id:owner});
      const {data,error}=await query.select('id');
      if(ticket!==epoch)return; if(error)throw error; if(!data?.length)throw new Error('Task was not saved.'); resetForm(); await loadTasks(ticket);
    } catch(error) { if(ticket===epoch)status('task-status',error.message,true); }
    finally { if(ticket===epoch){busyTask=false;$('task-fields').disabled=!user;renderTasks();} }
  });
  $('task-cancel').addEventListener('click',resetForm);
  $('task-filter').addEventListener('change',renderTasks); $('task-sort').addEventListener('change',renderTasks);
  function gameButtons() { $('math-start').disabled=!user || busyGame; $('math-submit').disabled=!user || busyGame || !round; }
  $('math-start').addEventListener('click',async()=>{
    if(!user || busyGame)return; const ticket=epoch; busyGame=true;gameButtons();
    try {
      const {data,error}=await supabaseClient.rpc('start_math_round');
      if(ticket!==epoch)return; if(error)throw error; if(data?.error)throw new Error(data.error);
      round=data.round_id; $('math-question').textContent=data.question+' = ?'; $('game-balance').textContent=data.balance; $('math-form').hidden=false; $('math-answer').value='';$('math-answer').focus();
      status('math-status',data.rounds_remaining+' rounds remaining today after this round.');
    }catch(error){if(ticket===epoch)status('math-status',error.message,true);}
    finally{if(ticket===epoch){busyGame=false;gameButtons();}}
  });
  $('math-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!user || busyGame || !round)return;
    const answer=Number($('math-answer').value); if(!Number.isInteger(answer) || answer < -2147483648 || answer > 2147483647)return;
    const ticket=epoch;busyGame=true;gameButtons();
    try {
      const {data,error}=await supabaseClient.rpc('submit_math_answer',{round_id:round,answer});
      if(ticket!==epoch)return;if(error)throw error;
      round=null;$('math-form').hidden=true;
      if(data?.error)throw new Error(data.error);
      $('game-balance').textContent=data.balance;
      status('math-status',data.is_correct ? 'Correct! +'+data.token_reward+' tokens.' : 'Not quite. The answer was '+data.correct_answer+'. Try a new round.');
    }catch(error){if(ticket===epoch)status('math-status',error.message,true);}
    finally{if(ticket===epoch){busyGame=false;gameButtons();}}
  });
  async function refresh() {
    const ticket=++epoch; const {data,error}=await supabaseClient.auth.getSession(); if(ticket!==epoch)return;
    user=error ? null : data.session?.user || null;tasks=[];round=null;busyTask=false;busyGame=false;resetForm();$('math-form').hidden=true;$('math-question').textContent='Ready to play?';$('game-balance').textContent='—';$('task-fields').disabled=!user;status('math-status','');status('task-status','');renderTasks();gameButtons();
    $('workspace-auth').textContent=user ? 'Signed in. Your task list is private.' : 'Sign in on the Account page to save tasks and earn game tokens.';
    if(!user)return;
    try {
      await loadTasks(ticket);
      const {data:profile,error:profileError}=await supabaseClient.from('user_profiles').select('token_balance').eq('user_id',user.id).maybeSingle();
      if(ticket===epoch && !profileError)$('game-balance').textContent=profile?.token_balance ?? 0;
    }catch(error){if(ticket===epoch)status('task-status',error.message,true);}
  }
  supabaseClient.auth.onAuthStateChange(()=>setTimeout(refresh,0));refresh();
})();
