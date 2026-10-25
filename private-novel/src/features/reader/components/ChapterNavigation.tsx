interface Props {
 top?:boolean;
 previousId?:string;
 nextId?:string;
 onChapterChange:(id:string)=>void;
 onOpenToc:()=>void;
}
/** Navigation renders callbacks only; Reader owns chapter transitions. */
export function ChapterNavigation({top=false,previousId,nextId,onChapterChange,onOpenToc}:Props){
 return <nav className={`chapter-navigation${top?' chapter-navigation-top':''}`} aria-label={top?'Điều hướng chương đầu trang':'Điều hướng chương cuối trang'}>
  <button disabled={!previousId} onClick={()=>{if(previousId)onChapterChange(previousId);}}>← Chương trước</button>
  <button onClick={onOpenToc}>☷ Mục lục</button>
  <button disabled={!nextId} onClick={()=>{if(nextId)onChapterChange(nextId);}}>Chương sau →</button>
 </nav>;
}
