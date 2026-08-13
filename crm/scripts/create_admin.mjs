import{passwordHash}from'../src/security.js';
const username=process.env.JKC_ADMIN_USERNAME,name=process.env.JKC_ADMIN_NAME,password=process.env.JKC_ADMIN_PASSWORD;
if(!username||!name||!password||password.length<12)throw new Error('Set JKC_ADMIN_USERNAME, JKC_ADMIN_NAME and a 12+ character JKC_ADMIN_PASSWORD in your private terminal session.');
const h=await passwordHash(password),id=crypto.randomUUID(),time=new Date().toISOString(),q=v=>`'${String(v).replaceAll("'","''")}'`;
console.log(`INSERT INTO users(id,username,name,role,password_hash,password_salt,password_iterations,enabled,must_change_password,created_at,updated_at) VALUES(${q(id)},${q(username.toLowerCase())},${q(name)},'admin',${q(h.hash)},${q(h.salt)},${h.iterations},1,0,${q(time)},${q(time)});`);
