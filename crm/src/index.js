import{randomToken,sha256,passwordHash,passwordVerify,cleanText,normalizePhone,normalizeEmail,normalizeSocial}from'./security.js';

const COOKIE='jkc_session';
const now=()=>new Date().toISOString();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const redirect=url=>new Response(null,{status:302,headers:{location:url,'cache-control':'no-store'}});
const cookie=(token,max=3600)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${max}`;
const parseCookie=req=>req.headers.get('cookie')?.match(/(?:^|; )jkc_session=([^;]+)/)?.[1]||'';

async function audit(env,user,action,target='',details='',req){
  await env.DB.prepare('INSERT INTO audit_log VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user?.user_id||user?.id||null,user?.name||'',action,'contact',target,details.slice(0,1000),await sha256(req.headers.get('cf-connecting-ip')||'unknown'),now()).run();
}
async function session(req,env){
  const token=parseCookie(req);if(!token)return null;
  return env.DB.prepare("SELECT s.*,u.username,u.name,u.role,u.enabled,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>?").bind(await sha256(token),now()).first();
}
async function requestBody(req){if(Number(req.headers.get('content-length')||0)>30000)throw new Error('Request is too large.');return req.json()}
async function requireUser(req,env,checkCsrf=true){
  const s=await session(req,env);if(!s||!s.enabled)return{error:json({error:'Please log in again.'},401)};
  if(checkCsrf&&!['GET','HEAD'].includes(req.method)&&await sha256(req.headers.get('x-csrf-token')||'')!==s.csrf_hash)return{error:json({error:'Security token expired. Refresh the page and try again.'},403)};
  return{s};
}
function validateContact(d){
  const customer_name=cleanText(d.customer_name,120);if(!customer_name)throw new Error('Customer name is required.');
  if(d.consent_confirmed!==true)throw new Error('Customer consent is required.');
  return{customer_name,phone:normalizePhone(d.phone),email:normalizeEmail(d.email),whatsapp:d.whatsapp?normalizePhone(d.whatsapp):'',facebook:normalizeSocial(d.facebook,'facebook'),instagram:normalizeSocial(d.instagram,'instagram'),notes:cleanText(d.notes,2000)};
}
async function login(req,env){
  const d=await requestBody(req),username=cleanText(d.username,80).toLowerCase(),key=await sha256(`${req.headers.get('cf-connecting-ip')||''}:${username}`),attempt=await env.DB.prepare('SELECT * FROM login_attempts WHERE key=?').bind(key).first();
  if(attempt?.blocked_until&&attempt.blocked_until>now())return json({error:'Too many attempts. Try again in 15 minutes.'},429);
  const user=await env.DB.prepare("SELECT * FROM users WHERE username=? AND role='admin'").bind(username).first(),ok=user&&user.enabled&&await passwordVerify(String(d.password||''),user);
  if(!ok){const count=(attempt?.count||0)+1,blocked=count>=5?new Date(Date.now()+15*60000).toISOString():null;await env.DB.prepare('INSERT INTO login_attempts VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET count=?,blocked_until=?').bind(key,count,attempt?.window_started||now(),blocked,count,blocked).run();await audit(env,null,'login_failed','',username,req);return json({error:'Invalid username or password.'},401)}
  await env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(key).run();
  const token=randomToken(),csrf=randomToken(),expires=new Date(Date.now()+60*60000).toISOString();
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').bind(await sha256(token),user.id,await sha256(csrf),expires,now(),now()).run();
  await audit(env,user,'login','',username,req);
  return json({ok:true,csrf,name:user.name,mustChange:!!user.must_change_password},200,{'set-cookie':cookie(token)});
}
async function api(req,env,path){
  if(path==='/api/login'&&req.method==='POST')return login(req,env);
  const auth=await requireUser(req,env,path!=='/api/session');if(auth.error)return auth.error;const s=auth.s;
  if(path==='/api/session'&&req.method==='GET'){
    const csrf=randomToken();await env.DB.prepare('UPDATE sessions SET csrf_hash=?,last_seen_at=? WHERE id_hash=?').bind(await sha256(csrf),now(),s.id_hash).run();
    return json({ok:true,name:s.name,csrf,mustChange:!!s.must_change_password});
  }
  if(path==='/api/logout'&&req.method==='POST'){await env.DB.prepare('DELETE FROM sessions WHERE id_hash=?').bind(s.id_hash).run();await audit(env,s,'logout','','',req);return json({ok:true},200,{'set-cookie':cookie('',0)})}
  if(path==='/api/password'&&req.method==='POST'){
    const d=await requestBody(req);if(String(d.password||'').length<12)throw new Error('Password must contain at least 12 characters.');
    const h=await passwordHash(d.password);await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,updated_at=? WHERE id=?').bind(h.hash,h.salt,h.iterations,now(),s.user_id).run();
    await audit(env,s,'password_change','','',req);return json({ok:true});
  }
  if(path==='/api/contacts'&&req.method==='POST'){
    const d=validateContact(await requestBody(req)),id=crypto.randomUUID(),time=now();
    try{await env.DB.prepare('INSERT INTO contacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.customer_name,d.phone,d.email||null,d.whatsapp||null,d.facebook||null,d.instagram||null,d.notes,1,s.user_id,s.name,time,time).run()}
    catch(e){if(String(e).includes('UNIQUE'))return json({error:'This phone number or email already exists.'},409);throw e}
    await audit(env,s,'contact_create',id,'',req);return json({ok:true,id},201);
  }
  if(path==='/api/contacts'&&req.method==='GET'){
    const u=new URL(req.url),q=`%${cleanText(u.searchParams.get('q'),80)}%`,page=Math.max(1,Number(u.searchParams.get('page'))||1),limit=25;
    const total=await env.DB.prepare('SELECT COUNT(*) n FROM contacts WHERE customer_name LIKE ? OR phone LIKE ? OR email LIKE ?').bind(q,q,q).first();
    const rows=await env.DB.prepare('SELECT * FROM contacts WHERE customer_name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(q,q,q,limit,(page-1)*limit).all();
    return json({rows:rows.results,total:total.n,page,pages:Math.max(1,Math.ceil(total.n/limit))});
  }
  const match=path.match(/^\/api\/contacts\/([^/]+)$/);
  if(match&&req.method==='DELETE'){await env.DB.prepare('DELETE FROM contacts WHERE id=?').bind(match[1]).run();await audit(env,s,'contact_delete',match[1],'',req);return json({ok:true})}
  if(path==='/api/export'&&req.method==='POST'){
    const d=await requestBody(req),ids=Array.isArray(d.ids)?d.ids.slice(0,1000):[],sql=ids.length?`SELECT * FROM contacts WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY created_at DESC`:'SELECT * FROM contacts ORDER BY created_at DESC',rows=await env.DB.prepare(sql).bind(...ids).all();
    const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`,header=['Customer Name','Phone Number','Email','WhatsApp Number','Facebook','Instagram','Notes','Consent Confirmed','Submitted By','Submission Date'];
    const csv='\uFEFF'+[header,...rows.results.map(r=>[r.customer_name,r.phone,r.email,r.whatsapp,r.facebook,r.instagram,r.notes,'Yes',r.submitted_by_name,r.created_at])].map(row=>row.map(quote).join(',')).join('\r\n');
    await audit(env,s,'csv_export','',`${rows.results.length} records`,req);
    return new Response(csv,{headers:{'content-type':'text/csv;charset=utf-8','content-disposition':'attachment; filename="jk-chennai-customer-contacts.csv"','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  return json({error:'Not found.'},404);
}

const css=`<style>:root{--orange:#f05523;--blue:#075b9b;--ink:#14242d;--cream:#fffaf3}*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px system-ui}.wrap{max-width:1120px;margin:auto;padding:20px}.brand{font-size:26px;font-weight:900}.brand span{color:var(--orange)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.card{background:#fff;border:1px solid #eadfd3;border-radius:18px;padding:20px;margin:18px 0;box-shadow:0 8px 28px #1830440d}.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}label{display:grid;gap:6px;font-weight:700}input,textarea{width:100%;padding:12px;border:1px solid #cfc4ba;border-radius:10px;font:inherit}button,.button{border:0;border-radius:999px;padding:12px 17px;background:var(--orange);color:#fff;font-weight:800;cursor:pointer;text-decoration:none}.blue{background:var(--blue)}.toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.toolbar input{width:auto;flex:1;min-width:200px}.ok{color:#257047}.error{color:#b42318}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:950px}th,td{text-align:left;padding:9px;border-bottom:1px solid #eee;font-size:14px}.pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}.wrap{padding:12px}h1{font-size:27px}}</style>`;
const headers={'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'",'x-frame-options':'DENY','referrer-policy':'no-referrer','cache-control':'no-store'};
function loginPage(){return`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>JK Chennai Customer App</title>${css}<main class=wrap style="max-width:470px"><div class=brand>JK <span>Chennai</span></div><form id=login class=card><h1>Owner login</h1><label>Username<input name=username autocomplete=username required></label><label>Password<input name=password type=password autocomplete=current-password required></label><button>Sign in</button><p id=message class=error></p></form></main><script>login.addEventListener('submit',async function(e){e.preventDefault();message.textContent='';var r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(login)))});var d=await r.json();if(!r.ok){message.textContent=d.error;return}location.href='/app'})</script>`}
function appPage(){return`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>JK Chennai Customer App</title>${css}<main class=wrap><header><div><div class=brand>JK <span>Chennai</span></div><small>Customer Contacts</small></div><div class=toolbar><b id=owner></b><button class=blue id=passwordButton>Change password</button><button id=logoutButton>Logout</button></div></header><section class=card><h1>Add customer</h1><form id=contact><div class=grid><label>Customer name *<input name=customer_name required></label><label>Phone number *<input name=phone inputmode=tel required></label><label>Email<input name=email type=email></label><label>WhatsApp number<input name=whatsapp inputmode=tel></label><label>Facebook<input name=facebook></label><label>Instagram<input name=instagram></label></div><label>Notes<textarea name=notes rows=3></textarea></label><label style="display:flex;grid-template-columns:auto 1fr;align-items:start"><input name=consent_confirmed type=checkbox required style="width:auto">Customer consent confirmed *</label><button>Save customer</button><p id=formMessage></p></form></section><section class=card><h2>Customer records</h2><div class=toolbar><input id=search placeholder="Search name, phone or email"><button id=searchButton>Search</button><button class=blue id=exportButton>Download selected/all CSV</button></div><div class=scroll><table><thead><tr><th><input id=all type=checkbox></th><th>Name</th><th>Phone</th><th>Email</th><th>WhatsApp</th><th>Facebook</th><th>Instagram</th><th>Notes</th><th>Date</th><th></th></tr></thead><tbody id=rows></tbody></table></div><div class=pager><button class=blue id=previous>Previous</button><span id=count></span><button class=blue id=next>Next</button></div></section><dialog id=passwordDialog><form id=passwordForm class=card style="min-width:min(420px,85vw)"><h2>Change password</h2><label>New password<input name=password type=password minlength=12 required></label><div class=toolbar><button>Save</button><button type=button class=blue id=cancelPassword>Cancel</button></div><p id=passwordMessage></p></form></dialog></main><script>
var csrf='',page=1,pages=1;function esc(v){var d=document.createElement('div');d.textContent=v||'';return d.innerHTML}async function call(url,opt){opt=opt||{};opt.headers=Object.assign({},opt.headers||{},{'content-type':'application/json','x-csrf-token':csrf});var r=await fetch(url,opt);if(!r.ok){var e=await r.json().catch(function(){return{error:'Request failed'}});throw new Error(e.error)}return r.headers.get('content-type')?.includes('json')?r.json():r}async function start(){try{var s=await call('/api/session');csrf=s.csrf;owner.textContent=s.name;await load()}catch(e){location.href='/login'}}async function load(){var d=await call('/api/contacts?'+new URLSearchParams({q:search.value,page:page}));pages=d.pages;count.textContent=d.total+' customers · Page '+d.page+' of '+d.pages;previous.disabled=page<=1;next.disabled=page>=pages;rows.innerHTML=d.rows.map(function(r){return '<tr><td><input class="pick" type="checkbox" data-id="'+r.id+'"></td><td>'+esc(r.customer_name)+'</td><td>'+esc(r.phone)+'</td><td>'+esc(r.email)+'</td><td>'+esc(r.whatsapp)+'</td><td>'+esc(r.facebook)+'</td><td>'+esc(r.instagram)+'</td><td>'+esc(r.notes)+'</td><td>'+esc(new Date(r.created_at).toLocaleString())+'</td><td><button class="delete" data-id="'+r.id+'">Delete</button></td></tr>'}).join('')}
contact.addEventListener('submit',async function(e){e.preventDefault();var d=Object.fromEntries(new FormData(contact));d.consent_confirmed=contact.consent_confirmed.checked;try{await call('/api/contacts',{method:'POST',body:JSON.stringify(d)});formMessage.className='ok';formMessage.textContent='Customer saved.';contact.reset();page=1;await load()}catch(x){formMessage.className='error';formMessage.textContent=x.message}});searchButton.onclick=function(){page=1;load()};previous.onclick=function(){if(page>1){page--;load()}};next.onclick=function(){if(page<pages){page++;load()}};all.onchange=function(){document.querySelectorAll('.pick').forEach(function(x){x.checked=all.checked})};rows.addEventListener('click',async function(e){if(!e.target.classList.contains('delete'))return;if(confirm('Delete this customer record?')){await call('/api/contacts/'+e.target.dataset.id,{method:'DELETE'});load()}});exportButton.onclick=async function(){var ids=Array.from(document.querySelectorAll('.pick:checked')).map(function(x){return x.dataset.id});var r=await fetch('/api/export',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({ids:ids})});if(!r.ok){alert((await r.json()).error);return}var blob=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='jk-chennai-customer-contacts.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href)};passwordButton.onclick=function(){passwordDialog.showModal()};cancelPassword.onclick=function(){passwordDialog.close()};passwordForm.addEventListener('submit',async function(e){e.preventDefault();try{await call('/api/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(passwordForm)))});passwordMessage.className='ok';passwordMessage.textContent='Password changed successfully.';passwordForm.reset()}catch(x){passwordMessage.className='error';passwordMessage.textContent=x.message}});logoutButton.onclick=async function(){await call('/api/logout',{method:'POST'});location.href='/login'};start();
</script>`}
export default{async fetch(req,env){try{const p=new URL(req.url).pathname;if(p.startsWith('/api/'))return api(req,env,p);if(p==='/login'||p==='/form/login')return new Response(loginPage(),{headers});if(p==='/'||p==='/app'||p==='/form'||p==='/form/'||p==='/admin/contacts'||p==='/admin/contacts/'){if(!await session(req,env))return redirect('/login');return new Response(appPage(),{headers})}return redirect('/app')}catch(e){console.error(String(e));return json({error:e instanceof Error?e.message:'Request failed.'},400)}}};
