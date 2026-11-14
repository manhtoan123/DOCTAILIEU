/* Build script replaces these two markers with the current hashed shell. */
const BUILD_ID='__BUILD_ID__';
const PRECACHE_URLS=__PRECACHE_URLS__;
const CACHE_PREFIX='private-novel-shell-';
const CACHE_NAME=`${CACHE_PREFIX}${BUILD_ID}`;
const PRECACHED_PATHS=new Set(PRECACHE_URLS);

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      for(const url of PRECACHE_URLS){
        const request=new Request(new URL(url,self.location.origin),{cache:'reload'});
        const response=await fetch(request);
        if(!response.ok)throw new Error(`Shell asset failed: ${url} (${response.status})`);
        await cache.put(url,response);
      }
    }catch(error){
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE_NAME).map(name=>caches.delete(name)));
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname==='/sw.js'||url.pathname==='/api'||url.pathname.startsWith('/api/'))return;

  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(CACHE_NAME);
      return await cache.match(new URL('/index.html',self.location.origin))||new Response('Mở ứng dụng online một lần để lưu app shell ngoại tuyến.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }));
    return;
  }

  if(!PRECACHED_PATHS.has(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    return await cache.match(new URL(url.pathname,self.location.origin))||fetch(request);
  })());
});
