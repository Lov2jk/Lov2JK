const enc=new TextEncoder();
export const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const randomToken=(bytes=32)=>{const a=new Uint8Array(bytes);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/[+/=]/g,c=>({'+':'-','/':'_','=':''}[c]))};
export const sha256=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
export async function passwordHash(password,salt=randomToken(18),iterations=210000){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']),bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations},key,256);return{hash:hex(bits),salt,iterations}}
export async function passwordVerify(password,user){const result=await passwordHash(password,user.password_salt,user.password_iterations),a=enc.encode(result.hash),b=enc.encode(user.password_hash);if(a.length!==b.length)return false;let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0}
export const cleanText=(v,max=500)=>String(v??'').replace(/[<>]/g,'').trim().slice(0,max);
export function normalizePhone(value){const digits=String(value||'').replace(/\D/g,'');if(digits.length===10)return`+91${digits}`;if(digits.length>=11&&digits.length<=15)return`+${digits}`;throw new Error('Enter a valid phone number.')}
export function normalizeEmail(value){const v=String(value||'').trim().toLowerCase();if(!v)return'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||v.length>254)throw new Error('Enter a valid email address.');return v}
export function normalizeSocial(value,network){let v=String(value||'').trim();if(!v)return'';if(!/^https?:\/\//i.test(v)){v=network==='instagram'?`https://instagram.com/${v.replace(/^@/,'')}`:`https://facebook.com/${v.replace(/^@/,'')}`}const url=new URL(v);if(!['https:'].includes(url.protocol))throw new Error(`Enter a secure ${network} URL or username.`);return url.href.slice(0,500)}
