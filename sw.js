const CACHE='jkc-v6';
const CORE=['/','/index.html','/shop.html','/catalogues.html','/catalogue.html','/cart.html','/saved.html','/account.html','/offline.html','/assets/css/styles.css','/assets/css/brand.css','/assets/css/catalogues.css','/assets/js/app.js','/assets/js/account.js','/assets/js/catalogues.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    const hadPrevious=keys.some(key=>key.startsWith('jkc-')&&key!==CACHE);
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
    if(hadPrevious){
      const clients=await self.clients.matchAll({type:'window'});
      clients.forEach(client=>client.postMessage({type:'JKC_UPDATE_READY',version:CACHE}));
    }
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response.ok){
        const cache=await caches.open(CACHE);
        await cache.put(event.request,response.clone());
      }
      return response;
    }catch{
      return (await caches.match(event.request))||(await caches.match('/offline.html'));
    }
  })());
});
