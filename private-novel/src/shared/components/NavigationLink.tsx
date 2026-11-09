import type {ComponentProps} from 'react';

/** Keep native link actions; only an ordinary left click uses in-app navigation. */
export function NavigationLink({onNavigate,disabled=false,onClick,...props}:ComponentProps<'a'>&{onNavigate:()=>void;disabled?:boolean}){
 return <a {...props} href={disabled?undefined:props.href} tabIndex={disabled?-1:props.tabIndex} aria-disabled={disabled||undefined} onClick={event=>{
  onClick?.(event);
  if(event.defaultPrevented)return;
  if(disabled){event.preventDefault();return;}
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||(props.target&&props.target!=='_self')||props.download!==undefined)return;
  event.preventDefault();onNavigate();
 }}/>;
}
