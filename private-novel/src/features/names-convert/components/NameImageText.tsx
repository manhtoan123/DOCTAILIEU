import {Fragment,useState} from 'react';
import {validNameImage,type NameImage,type NameImageMatch} from '../services/name-images';
function InlineNameImage({image}:{image:NameImage}){
 const [failed,setFailed]=useState(''),safe=validNameImage(image);
 return safe&&failed!==safe.url?<img className="inline-name-image" src={safe.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(safe.url)}/>:null;
}
/** Text is never rewritten: speech, selection and highlight offsets stay exact. */
export default function NameImageText({text,matches=[],offset=0,highlight,color}:{text:string;matches?:readonly NameImageMatch[];offset?:number;highlight?:{start:number;end:number};color?:string}){
 const local=matches.filter(m=>m.start>=offset&&m.end<=offset+text.length),points=new Set([0,text.length]);
 for(const match of local){points.add(match.start-offset);points.add(match.end-offset);}
 const start=highlight?Math.max(0,Math.min(text.length,highlight.start-offset)):0,end=highlight?Math.max(0,Math.min(text.length,highlight.end-offset)):0;
 if(end>start){points.add(start);points.add(end);}
 const cuts=[...points].sort((a,b)=>a-b);
 return <>{cuts.slice(0,-1).map((at,i)=>{const match=local.find(m=>m.start-offset===at),chunk=text.slice(at,cuts[i+1]);return <Fragment key={at}>{match&&<InlineNameImage image={match.image}/>}{end>start&&at>=start&&at<end?<mark className="spoken-text" style={{background:color,color:'inherit'}}>{chunk}</mark>:chunk}</Fragment>;})}</>;
}
