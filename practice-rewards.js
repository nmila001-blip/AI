(() => {
 const $=id=>document.getElementById(id);const form=$('chat-form'),toggle=$('practice-mode'),input=$('chat-input'),send=$('send-button'),subject=$('subject'),level=$('level'),next=$('practice-new-question'),status=$('practice-reward-status');
 if(!form||!toggle||!next||!status)return;
 let question=null,busy=false,version=0,owner=null,pendingRequest=null;
 function tell(text){status.textContent=text;}
 function reset(){version++;question=null;pendingRequest=null;next.hidden=!toggle.checked;tell(toggle.checked?'Verified Math practice: earn 5 tokens once per solved question. Start a new question below.':'');}
 function controls(disabled){for(const el of [send,next,toggle,subject,level])el.disabled=disabled;}
 async function userSession(){const {data,error}=await supabaseClient.auth.getSession();if(error)throw error;const user=data.session?.user;if(!user)throw new Error('Sign in on the Account page to earn practice tokens.');if(owner!==user.id){owner=user.id;reset();}return user;}
 async function task(action){if(busy)return;busy=true;controls(true);try{await userSession();if(subject.value!=='Math')throw new Error('Token practice currently supports Math. Turn Practice mode off to use the AI tutor for other subjects.');await action();}catch(error){tell(error.message||'Practice request failed. Please try again.');}finally{busy=false;controls(false);input.focus();}}
 async function newQuestion(){
 const ticket=version,userId=owner;pendingRequest=pendingRequest||crypto.randomUUID();tell('Preparing a verified Math question...');
 const {data,error}=await supabaseClient.rpc('start_tutor_practice_question',{practice_subject:subject.value,practice_level:level.value,request_id:pendingRequest});
 if(ticket!==version||userId!==owner)return;if(error)throw error;if(data?.error)throw new Error(data.error);if(!data?.question_id||typeof data.question!=='string')throw new Error('No practice question was returned. Please retry.');
 pendingRequest=null;question={id:data.question_id,text:data.question,expires:data.expires_at};
 addMessage('assistant',data.question+'\n\nAnswer with a number or fraction. You may include the exact requested unit. A correct answer earns 5 tokens once.');
 tell('Balance: '+data.balance+' tokens. Question expires '+new Date(data.expires_at).toLocaleTimeString()+'.');
 }
 async function submitAnswer(text){
 if(!question)return newQuestion();const ticket=version,userId=owner,current=question;
 if(Date.parse(current.expires)<=Date.now()){question=null;throw new Error('That question expired. Start a new practice question.');}
 addMessage('user',text);input.value='';tell('Checking your answer...');
 const {data,error}=await supabaseClient.rpc('submit_tutor_practice_answer',{question_id:current.id,answer_text:text});
 if(ticket!==version||userId!==owner)return;if(error)throw error;if(data?.error)throw new Error(data.error);
 if(data?.is_correct===true){question=null;const reward=Number(data.token_reward)||0;addMessage('assistant',reward>0?'Correct! +'+reward+' tokens have been added to your balance. Choose New practice question to continue.':'Correct! This question was already rewarded, so no extra tokens were added. Choose New practice question to continue.');tell('Balance: '+data.balance+' tokens.');}
 else if(data?.is_correct===false){addMessage('assistant','That answer does not match the stored solution. Try again, or choose New practice question to skip.');tell('No tokens awarded. Balance: '+data.balance+' tokens.');}
 else throw new Error('The server did not return a grade. Please retry.');
 }
 form.addEventListener('submit',event=>{if(!toggle.checked)return;event.preventDefault();event.stopImmediatePropagation();if(busy)return;const text=input.value.trim();if($('chat-image')?.files?.length){tell('Photo attachments use ordinary AI tutoring. Turn Practice mode off to send a photo.');return;}task(async()=>{if(!question||/^(next(?: question)?|new(?: question)?|start|hello|hi|ok next question)[.!]?$/i.test(text)){input.value='';await newQuestion();}else if(text)await submitAnswer(text);});},true);
 next.addEventListener('click',()=>task(newQuestion));toggle.addEventListener('change',reset);subject.addEventListener('change',reset);level.addEventListener('change',reset);$('clear-chat')?.addEventListener('click',reset);
 supabaseClient.auth.onAuthStateChange((_event,session)=>setTimeout(()=>{const id=session?.user?.id||null;if(id!==owner){owner=id;reset();}},0));reset();
})();
