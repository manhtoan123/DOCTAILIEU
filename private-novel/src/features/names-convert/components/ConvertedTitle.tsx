import {readEffectiveBookNames} from '../services/scoped-names';
import {useContext,useEffect,useState} from 'react';
import {EffectiveNamesContext} from './EffectiveNamesContext';
import {useLiveQuery} from 'dexie-react-hooks';
import {db} from '../../../core/db';
import {convertLocal} from '../services/language-client';
import {useConvertBackend} from '../services/convert-server-client';
import {CONVERT_NAMES_KEY} from '../services/convert-names';
import type {NameEntry} from '../../../core/domain';

// A fresh fallback array would restart the live query on every render.
const emptyNames:NameEntry[]=[];

/** Presentation only: never write translated titles over the original metadata. */
export interface TitlePresentation {bookId:string;text:string;signature:string;value:string}
interface Props {text:string;bookId:string;displayTitle?:string;onReady?:(result:TitlePresentation)=>void;render?:boolean;showOriginal?:boolean;skipConvert?:boolean}
export function ConvertedTitle(props:Props){
  const backend=useConvertBackend();
  if(props.skipConvert||backend!=='local')return props.render===false?null:
    <TitleText text={props.text} value={props.displayTitle||props.text} showOriginal={props.showOriginal}/>;
  return <LocalTitle {...props}/>;
}
function TitleText({text,value,showOriginal}:{text:string;value:string;showOriginal?:boolean}){
  return showOriginal?<span className="bilingual-title" title={text}><span className="title-primary">{value}</span>{value.trim()!==text.trim()&&<small className="title-original">{text}</small>}</span>:<span title={text}>{value}</span>;
}
function LocalTitle({text,bookId,displayTitle,onReady,render=true,showOriginal=false}:Props){
  const sharedNames=useContext(EffectiveNamesContext);
  const localNames=useLiveQuery(()=>sharedNames===undefined?readEffectiveBookNames(bookId):undefined,[bookId,sharedNames===undefined]);
  const names=sharedNames===undefined?localNames:sharedNames===null?undefined:sharedNames.get(bookId)??emptyNames;
  const hasCustomName=Boolean(names?.some(n=>n.key&&text.includes(n.key)));

  // If persisted displayTitle is already available and no custom Name overrides it, skip worker convert.
  useEffect(()=>{
    if(displayTitle&&!hasCustomName){
      onReady?.({bookId,text,signature:'persisted',value:displayTitle});
    }
  },[displayTitle,hasCustomName,bookId,text,onReady]);

  const context=useLiveQuery(async()=>{
    if(names===undefined)return undefined;
    if(displayTitle&&!hasCustomName)return undefined;
    return {
      names:names||await readEffectiveBookNames(bookId),
      global:(await db.settings.get(CONVERT_NAMES_KEY))?.value,
      dictionaries:(await db.dictionaries.toArray()).map(row=>[row.kind,row.sha256,row.updatedAt]),
    };
  },[bookId,displayTitle,hasCustomName,names]);

  const signature=context?JSON.stringify(context):'';
  const [result,setResult]=useState<{bookId:string;text:string;signature:string;value:string}>();
  useEffect(()=>{
    if(displayTitle&&!hasCustomName)return;
    let alive=true;
    if(!context||!context.dictionaries.length||!/[\p{Script=Han}]/u.test(text))return;
    void convertLocal(text,context.names,{capitalize:true,standardizePunctuation:true}).then(tokens=>{
      const value=tokens.map(token=>token.targetText).join('').trim();
      if(alive){const next={bookId,text,signature,value:value||text};setResult(next);onReady?.(next);}
    }).catch(()=>{if(alive)setResult(old=>old?.bookId===bookId&&old.text===text?old:{bookId,text,signature,value:text});});
    return()=>{alive=false;};
  },[text,bookId,signature,onReady,context,displayTitle,hasCustomName]);

  if(!render)return null;
  const activeValue=(hasCustomName&&result?.value)||displayTitle||(result?.bookId===bookId&&result.text===text?result.value:text);
  return <TitleText text={text} value={activeValue} showOriginal={showOriginal}/>;
}
