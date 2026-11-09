import {NavigationLink} from '../../../shared/components/NavigationLink';
import {readerRoutePath} from '../services/reader-route';
interface Props {
 bookId:string;
 top?:boolean;
 previousId?:string;
 nextId?:string;
 onChapterChange:(id:string)=>void;
 onOpenToc:()=>void;
}
/** Native URLs support new tabs; Reader still owns ordinary chapter transitions. */
export function ChapterNavigation({bookId,top=false,previousId,nextId,onChapterChange,onOpenToc}:Props){
 return <nav className={`chapter-navigation${top?' chapter-navigation-top':''}`} aria-label={top?'Điều hướng chương đầu trang':'Điều hướng chương cuối trang'}>
  {previousId?<NavigationLink href={readerRoutePath({kind:'read',bookId,chapterId:previousId})} onNavigate={()=>onChapterChange(previousId)}>← Chương trước</NavigationLink>:<button disabled>← Chương trước</button>}
  <button onClick={onOpenToc}>☷ Mục lục</button>
  {nextId?<NavigationLink href={readerRoutePath({kind:'read',bookId,chapterId:nextId})} onNavigate={()=>onChapterChange(nextId)}>Chương sau →</NavigationLink>:<button disabled>Chương sau →</button>}
 </nav>;
}
