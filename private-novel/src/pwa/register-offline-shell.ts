export function registerOfflineShell(){
  if(!import.meta.env.PROD||typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
  void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
}
