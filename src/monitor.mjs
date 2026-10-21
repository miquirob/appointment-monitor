import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { analyze } from './analyze.mjs';

const baseUrl=process.env.BOOKING_URL;
const practitioner=process.env.EXPECTED_PRACTITIONER_NAME;
const dateParam=process.env.DATE_QUERY_PARAM;
if(!baseUrl||!practitioner||!dateParam){
  console.error('Required secrets missing: BOOKING_URL, EXPECTED_PRACTITIONER_NAME, DATE_QUERY_PARAM');
  process.exit(2);
}
let parsed;
try {parsed=new URL(baseUrl);if(parsed.protocol!=='https:')throw Error('https');}
catch {console.error('BOOKING_URL must be a valid HTTPS URL');process.exit(2);}
const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const offsets=(process.env.SCAN_DAY_OFFSETS||'0,7,14').split(',').map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>=0&&x<=90).slice(0,5);
const pilot=process.env.PILOT_MODE==='true';
const alerts=process.env.ALERTS_ENABLED==='true';
const yyyyMMdd=offset=>{
  const dt=new Date(`${localDay}T12:00:00Z`);dt.setUTCDate(dt.getUTCDate()+offset);
  return dt.toISOString().slice(0,10);
};
const dateForUrl=iso=>`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`;
const targetUrl=iso=>{const u=new URL(baseUrl);u.searchParams.set(dateParam,dateForUrl(iso));return u.toString();};
const chatToken=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
const telegramReady=Boolean(chatToken&&chatId);
async function telegram(method,payload){
  if(!telegramReady)return false;
  const res=await fetch(`https://api.telegram.org/bot${chatToken}/${method}`,{method:'POST',body:payload});
  if(!res.ok)throw Error(`Telegram HTTP ${res.status}`);
  return true;
}
async function sendText(message){
  const form=new FormData();form.set('chat_id',chatId);form.set('text',message);
  return telegram('sendMessage',form);
}
async function sendPrivateScreenshot(buf,caption){
  const form=new FormData();form.set('chat_id',chatId);
  form.set('caption',caption);form.set('photo',new Blob([buf],{type:'image/png'}),'screenshot.png');
  return telegram('sendPhoto',form);
}
async function takeSnapshot(page){
  return page.evaluate(()=>{
    const visible=el=>{const st=getComputedStyle(el),r=el.getBoundingClientRect();return st.display!=='none'&&st.visibility!=='hidden'&&r.width>0&&r.height>0;};
    const controls=[...document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')];
    const candidates=controls.slice(0,1000).map(el=>{
      const ancestor=el.closest('[data-date],[data-fecha],[data-day]');
      const dateAttribute=ancestor?['data-date','data-fecha','data-day'].map(k=>ancestor.getAttribute(k)).filter(Boolean).join(' '):'';
      let p=el;const around=[];
      for(let i=0;i<3&&p;i++,p=p.parentElement){const t=(p.innerText||'').trim();if(t.length<550)around.push(t);}
      return {text:(el.innerText||el.value||'').trim().slice(0,160),label:[el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ').slice(0,240),nearText:around.join(' | ').slice(0,550),dateAttribute,disabled:Boolean(el.disabled||el.getAttribute('aria-disabled')==='true'),visible:visible(el)};
    });
    return {bodyText:(document.body?.innerText||'').slice(0,30000),candidates};
  });
}
let browser,screenshot=null;
const records=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({locale:'es-CL',timezoneId:'America/Santiago',viewport:{width:1366,height:900},acceptDownloads:false});
  for(const offset of (offsets.length?offsets:[0])){
    const scanDay=yyyyMMdd(offset);
    const page=await context.newPage();
    try {
      const response=await page.goto(targetUrl(scanDay),{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForTimeout(3000);
      if(pilot&&!screenshot){try{screenshot=await page.screenshot({fullPage:true,timeout:15000});}catch{/* no screenshot */}}
      const a=analyze(await takeSnapshot(page),localDay,practitioner);
      records.push({...a,checkedDate:scanDay,httpStatus:response?.status()??null});
    }catch(err){records.push({status:'unknown',slots:[],checkedDate:scanDay,errorType:err?.name||'NavigationError'});}
    finally {await page.close();}
  }
}catch(err){records.push({status:'unknown',slots:[],errorType:err?.name||'BrowserError'});}
finally{if(browser)await browser.close();}
const slots=[...new Map(records.flatMap(r=>r.slots||[]).map(s=>[`${s.date}-${s.time}`,s])).values()];
const status=slots.length?'available':records.length&&records.every(r=>r.status==='no_slots')?'no_slots':'unknown';
const summary={status,checks:records.map(r=>({checkedDate:r.checkedDate,status:r.status,practitionerConfirmed:!!r.practitionerConfirmed,candidateCount:r.candidateCount??0,httpStatus:r.httpStatus??null,errorType:r.errorType??null})),slotCount:slots.length,checkedAt:new Date().toISOString()};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/status.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
if(process.env.GITHUB_STEP_SUMMARY){
  await writeFile(process.env.GITHUB_STEP_SUMMARY,`### Appointment monitor\n\nStatus: **${status}** · Slots: **${slots.length}** · Checks: **${records.length}**\n\nPilot requires manual validation before enabling alerts.\n`,{flag:'a'});
}
try{
  if(pilot){
    if(!telegramReady)console.log('Pilot completed without private notifications: configure Telegram secrets.');
    else {
      await sendText(`Appointment monitor pilot: ${status}\nChecks: ${records.length}\nPractitioner identified: ${records.some(r=>r.practitionerConfirmed)}\nPotential slots: ${slots.length}\nReview screenshot before enabling alerts.`);
      if(screenshot)await sendPrivateScreenshot(screenshot,'Private pilot screenshot for manual verification');
    }
  }else if(status==='available'&&alerts){
    if(!telegramReady)throw Error('Missing Telegram secrets for enabled alerts');
    const message=['Appointment available:','',...slots.slice(0,8).map(s=>`${s.date} · ${s.time} (Chile)\n${targetUrl(s.date)}`),'','Availability is not held or reserved.'];
    await sendText(message.join('\n'));
  }else if(status==='available')console.log('Potential slots detected, but alerts remain disabled pending manual confirmation.');
}catch(e){console.error(`Private notification failed: ${e?.message?.replace(baseUrl,'[REDACTED]')||'Error'}`);process.exitCode=1;}
