import type {D1Database} from '@cloudflare/workers-types';
export interface KeyHealth {id:string;disabled:number;last_used_at:number;http_status:number;busy_until:number;cooldown_until:number;model:string}
const memory=new Map<string,KeyHealth>();
export function resetKeyHealth(){memory.clear();}
export async function keyHealthId(secret:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}
export async function readKeyHealth(db?:D1Database,ids?:string[]):Promise<Map<string,KeyHealth>>{
  if(!db)return new Map(memory);
  if(ids&&!ids.length)return new Map();
  const query=db.prepare('SELECT * FROM ai_key_health'+(ids?` WHERE id IN (${ids.map(()=>'?').join(',')})`:''));
  const result=await (ids?query.bind(...ids):query).all<KeyHealth>();return new Map((result.results||[]).map(row=>[row.id,row]));
}
export async function readKeyCooldowns(db?:D1Database,ids:string[]=[]):Promise<{id:string;model:string;cooldown_until:number}[]>{
  if(!db||!ids.length)return [];
  const result=await db.prepare(`SELECT id,model,cooldown_until FROM ai_key_cooldowns WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{id:string;model:string;cooldown_until:number}>();return result.results||[];
}
export async function updateKeyHealth(id:string,patch:Partial<Omit<KeyHealth,'id'>>,db?:D1Database){
  const row={id,disabled:0,last_used_at:0,http_status:0,cooldown_until:0,model:'',...memory.get(id),...patch,busy_until:memory.get(id)?.busy_until??0};memory.set(id,row);
  if(memory.size>1000){const oldest=[...memory.keys()].find(key=>!memory.get(key)!.disabled);if(oldest)memory.delete(oldest);}
  if(db)try{
    await db.prepare('INSERT INTO ai_key_health(id,disabled,last_used_at,http_status,busy_until,cooldown_until,model) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET disabled=MAX(disabled,excluded.disabled),last_used_at=MAX(last_used_at,excluded.last_used_at),http_status=CASE WHEN last_used_at<=excluded.last_used_at THEN excluded.http_status ELSE http_status END,cooldown_until=MAX(cooldown_until,excluded.cooldown_until),model=excluded.model')
      .bind(id,row.disabled,row.last_used_at,row.http_status,row.busy_until,row.cooldown_until,row.model).run();
    if(patch.cooldown_until&&patch.model!==undefined)await db.prepare('INSERT INTO ai_key_cooldowns(id,model,cooldown_until) VALUES (?,?,?) ON CONFLICT(id,model) DO UPDATE SET cooldown_until=MAX(cooldown_until,excluded.cooldown_until)').bind(id,patch.model,patch.cooldown_until).run();
  }catch{return false;}
  return true;
}
/** Atomic reservation across isolates. Ownership is the expiry plus its monotonic claim time. */
export async function reserveKey(id:string,model:string,db?:D1Database,leaseMs=35_000):Promise<number|undefined>{
  if(!Number.isSafeInteger(leaseMs)||leaseMs<35_000||leaseMs>185_000)throw Error('Invalid key lease');
  const now=Date.now();
  if(db){
    await db.prepare('INSERT INTO ai_key_health(id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(id).run();
    const claimed=await db.prepare('UPDATE ai_key_health SET busy_until=MAX(?,last_used_at+1)+?,last_used_at=MAX(?,last_used_at+1),model=? WHERE id=? AND disabled=0 AND busy_until<=? AND NOT EXISTS(SELECT 1 FROM ai_key_cooldowns WHERE id=? AND model=? AND cooldown_until>?) RETURNING busy_until').bind(now,leaseMs,now,model,id,now,id,model,now).first<{busy_until:number}>();
    if(!claimed)return;
    memory.set(id,{id,disabled:0,http_status:0,cooldown_until:0,model,...memory.get(id),last_used_at:claimed.busy_until-leaseMs,busy_until:claimed.busy_until});return claimed.busy_until;
  }
  const old=memory.get(id);if(old?.disabled||(old?.busy_until??0)>now)return;
  const usedAt=Math.max(now,(old?.last_used_at??0)+1),owner=usedAt+leaseMs;
  memory.set(id,{id,disabled:0,http_status:0,cooldown_until:0,...old,last_used_at:usedAt,busy_until:owner,model});return owner;
}
/** Match expiry AND its monotonic claim time: unequal lease lengths can share an expiry. */
export async function releaseKey(id:string,owner:number,db?:D1Database,leaseMs=35_000):Promise<void>{
  const claimedAt=owner-leaseMs;
  if(db)await db.prepare('UPDATE ai_key_health SET busy_until=0 WHERE id=? AND busy_until=? AND last_used_at=?').bind(id,owner,claimedAt).run();
  const row=memory.get(id);if(row?.busy_until===owner&&row.last_used_at===claimedAt)memory.set(id,{...row,busy_until:0});
}
export function keyHealthView(row?:KeyHealth){
  return {status:row?.disabled?'disabled':(row?.busy_until||0)>Date.now()?'working':(row?.cooldown_until||0)>Date.now()?'cooling':'ready',lastUsedAt:row?.last_used_at||0,httpStatus:row?.http_status||0,cooldownUntil:row?.cooldown_until||0,model:row?.model||''};
}
