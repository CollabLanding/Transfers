(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const list=document.getElementById("chatList");
  const form=document.getElementById("chatForm");
  const input=document.getElementById("chatInput");
  const send=document.getElementById("chatSend");
  const note=document.getElementById("chatNote");

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
    return;
  }

  const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  let currentUser=null,displayName="User",messages=[],channel=null;

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
      if(channel){await sb.removeChannel(channel);channel=null}
      return;
    }

    form.classList.remove("hidden");
    displayName=emailName(currentUser.email);
    const profile=await sb.from("profiles").select("display_name").eq("id",currentUser.id).maybeSingle();
    if(!profile.error&&profile.data?.display_name)displayName=profile.data.display_name;

    const ok=await load();
    if(!ok)return;

    if(channel)await sb.removeChannel(channel);
    channel=sb.channel("transfers-team-chat")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"transfer_chat_messages"},payload=>upsert(payload.new))
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

  input.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.shiftKey){
      e.preventDefault();
      form.requestSubmit();
    }
  });

  sb.auth.getSession().then(({data})=>start(data?.session||null));
  sb.auth.onAuthStateChange((_event,session)=>start(session));
})();