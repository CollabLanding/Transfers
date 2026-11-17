/* Offline browser regression checks. Run with Playwright on NODE_PATH. */
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const server=http.createServer((req,res)=>{
  const file=path.join(__dirname,new URL(req.url,'http://local').pathname);
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium"});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const allowed=new Set(['app.js','slot-status.js','board-links.js','board-interaction.js','chain-visual.js','packing-slip.js','status-history.js']);
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(route.request().resourceType()==='script'&&!allowed.has(path.basename(url.pathname)))return route.fulfill({body:'',contentType:'application/javascript'});return route.continue();});
  await page.addInitScript(()=>{
   window.TRANSFERS_CONFIG={};window.TransfersAccess={role:'Owner',can:()=>true,apply(){},ready:Promise.resolve()};
   const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());const date=d.toISOString().slice(0,10);
   const jobs=['a','b'].map((id,i)=>({id,driver:'A',scheduled_date:date,scheduled_time:i?'10:00':'08:00',duration_minutes:60,origin:'Sunnyvale 100',destination:'Sunnyvale 200',job_number:'Notes '+id,pallet_count:2,order_status:'Planned'}));
   localStorage.setItem('transfers-demo-v2',JSON.stringify(jobs));localStorage.setItem('transfers-demo-drivers-v1',JSON.stringify(['A','B']));
   localStorage.setItem('transfers-slot-statuses-v1',JSON.stringify([{id:'s',driver:'A',scheduled_date:date,start_minutes:720,end_minutes:780,status:'Standby',notes:'saved'}]));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.locator('.card[data-id="a"]').waitFor();
  // Job and status drafts survive a declined switch.
  await page.locator('.card[data-id="a"]').click();await page.locator('#job').fill('keep this draft');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('.card[data-id="b"]').click();
  assert.equal(await page.locator('#editId').inputValue(),'a');assert.equal(await page.locator('#job').inputValue(),'keep this draft');
  page.once('dialog',dialog=>dialog.accept());await page.locator('.card[data-id="b"]').click();assert.equal(await page.locator('#editId').inputValue(),'b');
  await page.locator('.slot-status-block').click();await page.locator('#slotStatusNotes').fill('draft status');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('.card[data-id="a"]').click();assert.equal(await page.locator('#slotStatusNotes').inputValue(),'draft status');
  page.once('dialog',dialog=>dialog.accept());await page.locator('.card[data-id="a"]').click();
  // Real pointer capture: a queued board update cannot detach the resize handle.
  const handle=page.locator('.card[data-id="a"] .resize-bottom');await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+20);
  assert(await page.evaluate(()=>window.TransferBoardInteraction.active));
  await page.evaluate(()=>{window.testHandle=document.querySelector('.card[data-id="a"] .resize-bottom');window.TransferBoardInteraction.defer('probe',()=>window.refreshFlushed=true);document.dispatchEvent(new CustomEvent('edit-load-latest',{detail:{table:'transfers',rows:[]}}));});
  assert(await page.evaluate(()=>testHandle.isConnected));assert.equal(await page.evaluate(()=>!!window.refreshFlushed),false);
  await page.keyboard.press('Escape');await page.mouse.up();
  await page.waitForFunction(()=>!window.TransferBoardInteraction.active&&window.refreshFlushed);
  assert.equal(await page.locator('.resizing').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS browser: canceled/accepted job and status switches; resize pointer capture survives refresh and Escape cleans up.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
