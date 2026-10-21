import {useEffect,useState} from 'react';
import {loadSharedImage} from '../../features/sync-cloud/services/shared-images';
import type {SharedImage as ImageValue} from '../../features/sync-cloud/services/shared-image-schema';
export function useSharedImage(value?:ImageValue|null){const [url,setUrl]=useState(''),key=JSON.stringify(value);useEffect(()=>{setUrl('');if(!value)return;const controller=new AbortController();let created='';void loadSharedImage(value,controller.signal).then(blob=>{if(!controller.signal.aborted){created=URL.createObjectURL(blob);setUrl(created);}}).catch(()=>{});return()=>{controller.abort();if(created)URL.revokeObjectURL(created);};},[key]);return url;}
export default function CoverImage({value,title}:{value:ImageValue;title:string}){const url=useSharedImage(value);return url?<img src={url} alt={`Bìa ${title}`} loading="lazy"/>:<span>Đang tải bìa…</span>;}
