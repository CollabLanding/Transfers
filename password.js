(async()=>{
 const $=id=>document.getElementById(id),form=$("passwordForm"),message=$("passwordMessage"),save=$("savePassword");
 const config=window.TRANSFERS_CONFIG||{},query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
 let account=null,busy=false;
 const linkError=query.get("error")||hash.get("error");
 const showMessage=(text,error=false)=>{message.textContent=text;message.style.color=error?"#b63e3e":""};
 if(linkError){$("passwordAccount").textContent="Recovery link unavailable.";showMessage("This recovery link has expired or was already used. Request a fresh link, or return to Transfers and use Change Password while signed in.",true);history.replaceState(null,"",location.pathname);return}
 if(!window.supabase||!config.supabaseUrl||!config.supabaseAnonKey){showMessage("Account service is unavailable. Please reload this page.",true);return}
 const sb=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey);
 try{
  if(query.get("token_hash")&&query.get("type")==="recovery"){
   const verified=await sb.auth.verifyOtp({token_hash:query.get("token_hash"),type:"recovery"});if(verified.error)throw verified.error;
  }
  const session=await sb.auth.getSession();if(session.error)throw session.error;
  if(!session.data?.session){$("passwordAccount").textContent="Sign in or open a fresh password recovery link.";showMessage("Return to Transfers to sign in, then open Change Password.",true);return}
  const result=await sb.auth.getUser();if(result.error)throw result.error;
  account=result.data.user;if(!account)throw new Error("Please sign in again.");
  history.replaceState(null,"",location.pathname);
  $("passwordAccount").textContent=account.email||"Your account";form.hidden=false;$("newPassword").focus();
 }catch(error){$("passwordAccount").textContent="Could not verify your account.";showMessage(error.message||"Open a fresh recovery link or sign in again.",true);history.replaceState(null,"",location.pathname);return}
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(busy||!account)return;
  const password=$("newPassword").value,confirmation=$("confirmPassword").value;
  if(password.length<8){showMessage("Use at least 8 characters.",true);return}
  if(password!==confirmation){showMessage("The passwords do not match.",true);$("confirmPassword").focus();return}
  busy=true;save.disabled=true;showMessage("Saving password…");
  try{
   const current=await sb.auth.getUser();if(current.error||current.data.user?.id!==account.id)throw new Error("Your session changed. Reload this page before saving.");
   const result=await sb.auth.updateUser({password});if(result.error)throw result.error;
   form.reset();form.hidden=true;$("passwordTitle").textContent="Password Updated";showMessage("Your new password has been saved. You can return to Transfers.");
  }catch(error){showMessage(error.message||"Could not save your password. Please try again.",true)}
  finally{busy=false;save.disabled=false}
 });
})();