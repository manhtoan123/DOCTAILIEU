export const PACKED_FORMAT_VERSION=1;
export const PACKED_KINDS=['vp','hanviet'] as const;
export interface PackedTable {count:number;keyUnits:Uint16Array;keyOffsets:Uint32Array;valueUnits:Uint16Array;valueOffsets:Uint32Array}
export interface PackedIndexData {version:1;base:PackedTable;normalized:PackedTable;maxByFirst:Uint16Array}
function table(values:Map<string,string>):PackedTable {
 const rows=[...values].sort(([a],[b])=>a<b?-1:a>b?1:0),keyOffsets=new Uint32Array(rows.length+1),valueOffsets=new Uint32Array(rows.length+1);
 let kn=0,vn=0;for(let i=0;i<rows.length;i++){keyOffsets[i]=kn;valueOffsets[i]=vn;kn+=rows[i][0].length;vn+=rows[i][1].length;}keyOffsets[rows.length]=kn;valueOffsets[rows.length]=vn;
 const keyUnits=new Uint16Array(kn),valueUnits=new Uint16Array(vn);let k=0,v=0;for(const [key,value]of rows){for(let i=0;i<key.length;i++)keyUnits[k++]=key.charCodeAt(i);for(let i=0;i<value.length;i++)valueUnits[v++]=value.charCodeAt(i);}return {count:rows.length,keyUnits,keyOffsets,valueUnits,valueOffsets};
}
export class PackedBuilder {
 private base=new Map<string,string>();private normalized=new Map<string,string>();private max=new Uint16Array(65536);
 constructor(private normalize:(key:string)=>string){}
 add(key:string,value:string){if(!key||key.length>256)return;const normalized=this.normalize(key);this.base.set(key,value);if(normalized!==key||this.normalized.has(normalized))this.normalized.set(normalized,value);this.max[key.charCodeAt(0)]=Math.max(this.max[key.charCodeAt(0)],key.length);if(normalized)this.max[normalized.charCodeAt(0)]=Math.max(this.max[normalized.charCodeAt(0)],normalized.length);}
 async build(onStage?:(percent:number)=>void):Promise<PackedIndexData>{
  const buckets=new Map<number,[string,string][] >();for(const row of this.base){const first=row[0].charCodeAt(0),bucket=buckets.get(first)??[];bucket.push(row);buckets.set(first,bucket);}
  const rows:[string,string][]=[];for(let first=0;first<65536;first++){const bucket=buckets.get(first);if(bucket){bucket.sort(([a],[b])=>a<b?-1:a>b?1:0);for(const row of bucket)rows.push(row);}if(first%4096===4095){onStage?.(Math.floor((first+1)/65536*90));await new Promise<void>(resolve=>setTimeout(resolve,0));}}
  const normalized=[...this.normalized];normalized.sort(([a],[b])=>a<b?-1:a>b?1:0);const data={version:1 as const,base:table(new Map(rows)),normalized:table(new Map(normalized)),maxByFirst:this.max};onStage?.(100);return data;
 }
}
function find(t:PackedTable,key:string){let lo=0,hi=t.count-1,L=key.length;while(lo<=hi){const mid=(lo+hi)>>>1,a=t.keyOffsets[mid],bl=t.keyOffsets[mid+1]-a,m=Math.min(bl,L);let c=0;for(let i=0;i<m;i++){const d=t.keyUnits[a+i]-key.charCodeAt(i);if(d){c=d;break;}}if(!c)c=bl-L;if(!c)return mid;if(c<0)lo=mid+1;else hi=mid-1;}return -1;}
function value(t:PackedTable,i:number){let out='';const s=t.valueOffsets[i],e=t.valueOffsets[i+1];for(let p=s;p<e;p+=8192)out+=String.fromCharCode(...t.valueUnits.subarray(p,Math.min(e,p+8192)));return out;}
export function validatePackedData(data:PackedIndexData){const validTable=(t:PackedTable)=>{if(!t||!Number.isInteger(t.count)||t.count<0||!(t.keyOffsets instanceof Uint32Array)||!(t.valueOffsets instanceof Uint32Array)||!(t.keyUnits instanceof Uint16Array)||!(t.valueUnits instanceof Uint16Array)||t.keyOffsets.length!==t.count+1||t.valueOffsets.length!==t.count+1||t.keyOffsets[0]!==0||t.valueOffsets[0]!==0||t.keyOffsets[t.count]!==t.keyUnits.length||t.valueOffsets[t.count]!==t.valueUnits.length)return false;for(let i=1;i<=t.count;i++)if(t.keyOffsets[i]<t.keyOffsets[i-1]||t.valueOffsets[i]<t.valueOffsets[i-1])return false;return true;};return !!data&&data.version===1&&validTable(data.base)&&validTable(data.normalized)&&data.maxByFirst instanceof Uint16Array&&data.maxByFirst.length===65536;}
export class PackedIndex {
 private extra=new Map<string,string>();private extraNormalized=new Map<string,string>();private extraMax=new Map<number,number>();readonly values={get:(k:string)=>this.get(k),has:(k:string)=>this.has(k)};
 constructor(private data:PackedIndexData,private normalize:(key:string)=>string){}
 private baseGet(t:PackedTable,k:string){const i=find(t,k);return i<0?undefined:value(t,i);}
 get(key:string,normalized=false){if(!normalized)return this.extra.get(key)??this.baseGet(this.data.base,key);return this.extraNormalized.get(key)??this.extra.get(key)??this.baseGet(this.data.normalized,key)??this.baseGet(this.data.base,key);}
 has(key:string){return this.extra.has(key)||find(this.data.base,key)>=0;}
 add(key:string,value:string){if(!key||key.length>256)return;const n=this.normalize(key);this.extra.set(key,value);if(n!==key||this.extraNormalized.has(n)||find(this.data.normalized,n)>=0)this.extraNormalized.set(n,value);this.extraMax.set(key.charCodeAt(0),Math.max(key.length,this.extraMax.get(key.charCodeAt(0))??0));if(n)this.extraMax.set(n.charCodeAt(0),Math.max(n.length,this.extraMax.get(n.charCodeAt(0))??0));}
 match(text:string,at:number,normalized=false):[string,string]|undefined{const unit=text.charCodeAt(at);if(!Number.isFinite(unit))return;const max=Math.max(this.data.maxByFirst[unit]||0,this.extraMax.get(unit)||0);for(let length=Math.min(max,text.length-at);length>0;length--){const key=text.slice(at,at+length),v=this.get(key,normalized);if(v!==undefined)return [key,v];}}
}
export type PackedKind=typeof PACKED_KINDS[number];
