(()=>{
  const C=window.TRANSFERS_CONFIG||{};
  const live=!!(C.supabaseUrl&&C.supabaseAnonKey&&window.supabase);
  const sb=live?window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey):null;
  const $=id=>document.getElementById(id);
  const E={
    select:$("locationSelect"),
    details:$("locationDetails"),
    empty:$("locationEmpty"),
    form:$("locationForm"),
    original:$("originalName"),
    name:$("locationName"),
    createdBy:$("createdBy"),
    createdAt:$("createdAt"),
    save:$("saveLocation"),
    del:$("deleteLocation"),
    msg:$("locationMsg"),
    me:$("me"),
    email:$("email"),
    signout:$("signout"),
    login:$("login"),
    loginForm:$("loginForm"),
    loginEmail:$("loginEmail"),
    loginPassword:$("loginPassword"),
    loginMsg:$("loginMsg"),
    title:$("locationTitle")
  };
  let user=null,profile=null,locations=[],channel=null;

  function userName(){
    return profile?.display_name||user?.user_metadata?.display_name||user?.email?.split("@")[0]||"User";
  }
  function show(text,type=""){
    E.msg.textContent=text||"";
    E.msg.className="location-message"+(type?" "+type:"");
  }
  function esc(s){
    return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }
  function formatCreatedAt(value){
    if(!value)return "";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }
  function saveLocal(){
    localStorage.setItem("transfers-demo-locations-v1",JSON.stringify(locations.map(x=>x.name)));
  }
  function loadLocal(){
    try{
      const names=JSON.parse(localStorage.getItem("transfers-demo-locations-v1")||'["Building 100","Building 200"]')||[];
      locations=names.filter(Boolean).map(name=>({name:String(name),created_by_name:"Demo User",created_at:""}));
    }catch(_err){
      locations=[{name:"Building 100",created_by_name:"Demo User",created_at:""},{name:"Building 200",created_by_name:"Demo User",created_at:""}];
    }
  }
  function setDetails(row){
    if(!row){
      E.details.classList.add("hidden");
      E.empty.classList.remove("hidden");
      E.original.value="";
      E.name.value="";
      E.createdBy.value="";
      E.createdAt.value="";
      return;
    }
    E.empty.classList.add("hidden");
    E.details.classList.remove("hidden");
    E.original.value=row.name;
    E.name.value=row.name;
    E.createdBy.value=row.created_by_name||"System";
    E.createdAt.value=formatCreatedAt(row.created_at);
    E.title.textContent=row.name;
  }
  function renderSelect(selected=""){
    const current=selected||E.select.value;
    E.select.innerHTML='<option value="">Select a location…</option>'+
      locations.map(row=>'<option value="'+esc(row.name)+'">'+esc(row.name)+'</option>').join("");
    if(locations.some(row=>row.name===current))E.select.value=current;
    else E.select.value="";
    setDetails(locations.find(row=>row.name===E.select.value)||null);
  }
  async function load(preserveName=null){
    const keepName=preserveName??E.select.value;
    if(!live){
      loadLocal();
      renderSelect(keepName);
      E.me.textContent="Demo User";
      E.email.textContent="Local preview mode";
      return;
    }
    show("Loading locations…");
    const r=await sb.from("transfer_locations").select("name,created_by,created_by_name,created_at").order("name");
    if(r.error){
      locations=[];
      renderSelect();
      show("Could not load locations: "+r.error.message,"error");
      return;
    }
    locations=(r.data||[]).map(row=>({
      name:String(row.name||"").trim(),
      created_by:row.created_by,
      created_by_name:row.created_by_name||"System",
      created_at:row.created_at||""
    })).filter(row=>row.name);
    renderSelect(keepName);
    show("");
  }

  async function save(){
    const oldName=E.original.value.trim();
    const newName=E.name.value.trim();
    if(!oldName||!newName){
      show("Enter a location name.","error");
      return;
    }
    if(oldName.toLowerCase()===newName.toLowerCase()){
      show("No changes to save.","error");
      return;
    }
    const duplicate=locations.find(row=>row.name.toLowerCase()===newName.toLowerCase()&&row.name!==oldName);
    if(duplicate){
      show("A location with that name already exists.","error");
      return;
    }

    E.save.disabled=true;
    E.del.disabled=true;
    show("Saving location…");

    if(!live){
      const row=locations.find(x=>x.name===oldName);
      if(row)row.name=newName;
      saveLocal();
      renderSelect(newName);
      E.save.disabled=false;
      E.del.disabled=false;
      show("Location updated.","ok");
      return;
    }

    const renamed=await sb.from("transfer_locations")
      .update({name:newName})
      .eq("name",oldName)
      .select("name,created_by,created_by_name,created_at")
      .single();

    if(renamed.error){
      E.save.disabled=false;
      E.del.disabled=false;
      show("Could not update location: "+renamed.error.message,"error");
      return;
    }

    const originUpdate=await sb.from("transfers")
      .update({origin:newName,updated_at:new Date().toISOString()})
      .eq("origin",oldName);

    if(originUpdate.error){
      await sb.from("transfer_locations").update({name:oldName}).eq("name",newName);
      E.save.disabled=false;
      E.del.disabled=false;
      show("Location saved, but existing transfer origins could not be updated: "+originUpdate.error.message,"error");
      await load();
      return;
    }

    const destinationUpdate=await sb.from("transfers")
      .update({destination:newName,updated_at:new Date().toISOString()})
      .eq("destination",oldName);

    if(destinationUpdate.error){
      await sb.from("transfers").update({origin:oldName,updated_at:new Date().toISOString()}).eq("origin",newName);
      await sb.from("transfer_locations").update({name:oldName}).eq("name",newName);
      E.save.disabled=false;
      E.del.disabled=false;
      show("Location saved, but existing transfer destinations could not be updated: "+destinationUpdate.error.message,"error");
      await load();
      return;
    }

    const row=renamed.data||{...locations.find(x=>x.name===oldName),name:newName};
    locations=locations.filter(x=>x.name!==oldName);
    locations.push(row);
    locations.sort((a,b)=>a.name.localeCompare(b.name));
    renderSelect(newName);
    E.save.disabled=false;
    E.del.disabled=false;
    show("Location updated.","ok");
  }

  async function remove(){
    const name=E.original.value.trim();
    if(!name)return;
    if(!confirm('Delete the location "'+name+'"? This removes it from the location master list. Existing transfer history will remain.'))return;

    E.save.disabled=true;
    E.del.disabled=true;
    show("Deleting location…");

    if(!live){
      locations=locations.filter(row=>row.name!==name);
      saveLocal();
      renderSelect("");
      E.save.disabled=false;
      E.del.disabled=false;
      show("Location deleted.","ok");
      return;
    }

    const r=await sb.from("transfer_locations").delete().eq("name",name);
    if(r.error){
      E.save.disabled=false;
      E.del.disabled=false;
      show("Could not delete location: "+r.error.message,"error");
      return;
    }

    locations=locations.filter(row=>row.name!==name);
    renderSelect("");
    E.save.disabled=false;
    E.del.disabled=false;
    show("Location deleted.","ok");
  }

  async function session(s){
    if(!live){
      user={id:"demo-user",email:"Local preview mode"};
      profile={display_name:"Demo User"};
      E.login.classList.add("hidden");
      E.signout.classList.add("hidden");
      await load();
      return;
    }
    if(!s?.user){
      user=null;
      E.login.classList.remove("hidden");
      return;
    }
    user=s.user;
    E.login.classList.add("hidden");
    E.signout.classList.remove("hidden");
    const r=await sb.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
    profile=r.data||{display_name:user.email?.split("@")[0]||"User"};
    E.me.textContent=userName();
    E.email.textContent=user.email||"";
    await load();
    subscribe();
  }

  function subscribe(){
    if(!live)return;
    if(channel)sb.removeChannel(channel);
    channel=sb.channel("locations-management")
      .on("postgres_changes",{event:"*",schema:"public",table:"transfer_locations"},()=>load(E.select.value))
      .subscribe();
  }

  E.select.onchange=()=>setDetails(locations.find(row=>row.name===E.select.value)||null);
  E.form.onsubmit=async event=>{event.preventDefault();await save()};
  E.del.onclick=remove;
  E.signout.onclick=()=>sb?.auth.signOut();
  E.loginForm.onsubmit=async event=>{
    event.preventDefault();
    E.loginMsg.textContent="Signing in…";
    const r=await sb.auth.signInWithPassword({email:E.loginEmail.value.trim(),password:E.loginPassword.value});
    E.loginMsg.textContent=r.error?r.error.message:"";
  };

  if(!live){
    session(null);
  }else{
    sb.auth.getSession().then(r=>session(r.data.session));
    sb.auth.onAuthStateChange((_event,s)=>session(s));
  }
})();
