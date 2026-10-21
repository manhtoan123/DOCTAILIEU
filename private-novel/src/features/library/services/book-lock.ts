/** Serializes album moves and destructive operations across cooperating local tabs. */
export async function withBookLock<T>(id:string,operation:()=>Promise<T>):Promise<T>{
  if(typeof navigator!=='undefined'&&navigator.locks)return await navigator.locks.request(`thu-phong-book:${id}`,()=>operation());
  return operation();
}
