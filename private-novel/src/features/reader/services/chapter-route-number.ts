type TocChapter={id:string;order:number};
/** Same stable order as Reader's visible table of contents, counted from one. */
function ordered(chapters:TocChapter[]){return [...chapters].sort((a,b)=>a.order-b.order);}
export function chapterRouteNumber(chapters:TocChapter[],id:string):number|undefined{
 const index=ordered(chapters).findIndex(c=>c.id===id);return index<0?undefined:index+1;
}
export function chapterIdForNumber(chapters:TocChapter[],position:number):string|undefined{
 return Number.isSafeInteger(position)&&position>=1?ordered(chapters)[position-1]?.id:undefined;
}
