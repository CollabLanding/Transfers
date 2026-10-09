(()=>{
 const buttons=document.querySelectorAll(".user-profile-open");if(!buttons.length)return;
 const config=window.TRANSFERS_CONFIG||{},sb=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
 const dialog=document.createElement("dialog");dialog.className="user-profile-dialog";
 dialog.setAttribute("aria-labelledby","userProfileTitle");
 dialog.innerHTML='<div class="panelhead"><h2 id="userProfileTitle">My Profile</h2><button class="iconbtn profile-close" type="button" aria-label="Close profile">×</button></div><form id="userProfileForm"><label>Username<span id="profileUsername"></span></label><label>Email<span id="profileEmail"></span></label><div class="profile-color-row"><label>Bubble color<input id="profileBubbleColor" type="color" value="#1d5c8f"></label><span id="profileBubblePreview" class="editor-bubble profile-bubble-preview" aria-label="Your bubble preview"></span></div><p class="profile-help">Your bubble shows when you open a transfer to edit it.</p><p><a href="password.html">Change Password</a></p><p id="userProfileMessage" role="status" aria-live="polite"></p><div class="modalactions"><button type="button" class="profile-close">Cancel</button><button id="saveUserProfile" type="submit" class="primary">Save Profile</button></div></form>';
 document.body.appendChild(dialog);
 const $=id=>dialog.querySelector("#"+id),form=$("userProfileForm"),message=$("userProfileMessage"),save=$("saveUserProfile"),picker=$("profileBubbleColor"),preview=$("profileBubblePreview");
 let account=null,displayName="",working=false,version=0;
 const color=value=>/^#[0-9a-f]{6}$/i.test(value||"")?value:"#1d5c8f";
 function updatePreview(){
  const hex=color(picker.value);preview.textContent=Array.from(displayName||"User").slice(0,2).join("").toUpperCase();preview.style.backgroundColor=hex;
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  preview.style.color=.2126*c[0]+.7152*c[1]+.0722*c[2]>.179?"#101820":"#ffffff";
 }
 async function open(){
  const token=++version;account=null;displayName="";message.textContent="Loading profile…";save.disabled=true;picker.disabled=true;$("profileUsername").textContent="";$("profileEmail").textContent="";dialog.showModal();
  try{
   const result=await sb.auth.getUser();if(result.error)throw result.error;if(!result.data.user)throw new Error("Sign in to edit your profile.");
   const user=result.data.user,r=await sb.from("profiles").select("display_name,bubble_color").eq("id",user.id).maybeSingle();if(r.error)throw r.error;if(token!==version)return;
   account=user;displayName=r.data?.display_name||user.user_metadata?.display_name||user.email?.split("@")[0]||"User";
   $("profileUsername").textContent=displayName;$("profileEmail").textContent=user.email||"";picker.value=color(r.data?.bubble_color);updatePreview();message.textContent="";save.disabled=false;picker.disabled=false;
  }catch(error){if(token===version)message.textContent=error.message||"Could not load your profile."}
 }
 const close=()=>{if(working)return;version++;dialog.close()};
 buttons.forEach(button=>button.addEventListener("click",event=>{event.preventDefault();open()}));dialog.querySelectorAll(".profile-close").forEach(button=>button.addEventListener("click",close));
 dialog.addEventListener("cancel",event=>{if(working)event.preventDefault();else version++});
 picker.addEventListener("input",updatePreview);
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(working||!account)return;working=true;save.disabled=true;picker.disabled=true;message.textContent="Saving profile…";
  try{
   const current=await sb.auth.getUser();if(current.error||current.data.user?.id!==account.id)throw new Error("Your session changed. Close and reopen your profile.");
   const hex=color(picker.value),r=await sb.from("profiles").upsert({id:account.id,display_name:displayName,bubble_color:hex,updated_at:new Date().toISOString()},{onConflict:"id"}).select("bubble_color").single();if(r.error)throw r.error;
   const saved=color(r.data.bubble_color);document.dispatchEvent(new CustomEvent("user-bubble-color-changed",{detail:{userId:account.id,color:saved}}));
   message.textContent="Profile saved.";dialog.close();
  }catch(error){message.textContent=error.message||"Could not save your profile."}
  finally{working=false;save.disabled=false;picker.disabled=false}
 });
})();