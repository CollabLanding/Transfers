(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const list=document.getElementById("chatList");
  const form=document.getElementById("chatForm");
  const input=document.getElementById("chatInput");
  const send=document.getElementById("chatSend");
  const note=document.getElementById("chatNote");
  const clearButton=document.getElementById("clearChat");
  const ADMIN_EMAIL="psaverchenko@collectfanatics.com";

  if(!list||!form||!input||!send)return;

  function esc(s){
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }
  function emailName(email){
    return String(email||"User").split("@")[0]||"User";
  }

  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase){
    list.innerHTML='<div class="chat-empty">Chat is available in Live mode.</div>';
    form.classList.add("hidden");
    clearButton?.classList.add("hidden");
    return;
  }

  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  let currentUser=null,displayName="User",messages=[],channel=null,audioCtx=null;

  function unlockAudio(){
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return;
      if(!audioCtx)audioCtx=new AC();
      if(audioCtx.state==="suspended")audioCtx.resume();
    }catch(_err){}
  }

  function playIncomingClick(){
    try{
      unlockAudio();
      if(!audioCtx||audioCtx.state!=="running")return;
      const now=audioCtx.currentTime;
      const osc=audioCtx.createOscillator();
      const gain=audioCtx.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(920,now);
      osc.frequency.exponentialRampToValueAtTime(620,now+0.055);
      gain.gain.setValueAtTime(0.0001,now);
      gain.gain.exponentialRampToValueAtTime(0.15,now+0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+0.075);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now+0.08);
    }catch(_err){}
  }

  document.addEventListener("pointerdown",unlockAudio,{once:true});
  document.addEventListener("keydown",unlockAudio,{once:true});

  function render(){
    if(!messages.length){
      list.innerHTML='<div class="chat-empty">No messages yet.<br>Start the conversation.</div>';
      return;
    }
    list.innerHTML=messages.map(row=>{
      const when=new Date(row.created_at);
      const time=Number.isFinite(when.getTime())?when.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"";
      const who=row.user_name||emailName(row.user_email);
      return '<div class="chat-message" data-chat-id="'+esc(row.id)+'"><div class="chat-meta"><span class="chat-user">'+esc(who)+'</span><span class="chat-time">'+esc(time)+'</span></div><div class="chat-text">'+esc(row.message)+'</div></div>';
    }).join("");
    requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});
  }

  function upsert(row){
    if(!row||row.id==null)return;
    const i=messages.findIndex(m=>String(m.id)===String(row.id));
    if(i>=0)messages[i]=row;else messages.push(row);
    messages.sort((a,b)=>Date.parse(a.created_at||0)-Date.parse(b.created_at||0));
    if(messages.length>100)messages=messages.slice(-100);
    render();
  }

  function removeMessage(row){
    if(!row||row.id==null)return;
    messages=messages.filter(m=>String(m.id)!==String(row.id));
    render();
  }

  async function load(){
    const {data,error}=await sb.from("transfer_chat_messages")
      .select("id,user_id,user_name,user_email,message,created_at")
      .order("created_at",{ascending:false})
      .limit(100);
    if(error){
      messages=[];
      render();
      note.textContent="Chat needs the latest Supabase migration.";
      return false;
    }
    note.textContent="";
    messages=(data||[]).slice().reverse();
    render();
    return true;
  }

  async function start(session){
    currentUser=session?.user||null;
    if(!currentUser){
      list.innerHTML='<div class="chat-empty">Sign in to use Team Chat.</div>';
      form.classList.add("hidden");
      clearButton?.classList.add("hidden");
      if(channel){await sb.removeChannel(channel);channel=null}
      return;
    }

    form.classList.remove("hidden");
    const isAdmin=String(currentUser.email||"").trim().toLowerCase()===ADMIN_EMAIL;
    clearButton?.classList.toggle("hidden",!isAdmin);

    displayName=emailName(currentUser.email);
    const profile=await sb.from("profiles").select("display_name").eq("id",currentUser.id).maybeSingle();
    if(!profile.error&&profile.data?.display_name)displayName=profile.data.display_name;

    const ok=await load();
    if(!ok)return;

    if(channel)await sb.removeChannel(channel);
    channel=sb.channel("transfers-team-chat")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"transfer_chat_messages"},payload=>{
        const row=payload.new;
        const fromSomeoneElse=String(row?.user_id||"")!==String(currentUser?.id||"");
        upsert(row);
        if(fromSomeoneElse)playIncomingClick();
      })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"transfer_chat_messages"},payload=>removeMessage(payload.old))
      .subscribe();
  }

  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=input.value.trim();
    if(!message||!currentUser)return;

    send.disabled=true;
    input.disabled=true;
    note.textContent="Sending…";

    const {data,error}=await sb.from("transfer_chat_messages").insert({
      user_id:currentUser.id,
      user_name:displayName,
      user_email:currentUser.email||"",
      message
    }).select("id,user_id,user_name,user_email,message,created_at").single();

    send.disabled=false;
    input.disabled=false;

    if(error){
      note.textContent="Could not send: "+error.message;
      input.focus();
      return;
    }

    input.value="";
    note.textContent="";
    upsert(data);
    input.focus();
  });

  clearButton?.addEventListener("click",async()=>{
    if(!currentUser||String(currentUser.email||"").trim().toLowerCase()!==ADMIN_EMAIL)return;
    if(!confirm("Clear all Team Chat messages? This cannot be undone."))return;

    clearButton.disabled=true;
    note.textContent="Clearing chat…";
    const {error}=await sb.rpc("clear_transfer_chat");
    clearButton.disabled=false;

    if(error){
      note.textContent="Could not clear chat: "+error.message;
      return;
    }

    messages=[];
    render();
    note.textContent="";
  });

  input.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.shiftKey){
      e.preventDefault();
      form.requestSubmit();
    }
  });

  sb.auth.getSession().then(({data})=>start(data?.session||null));
  sb.auth.onAuthStateChange((_event,session)=>start(session));
})();