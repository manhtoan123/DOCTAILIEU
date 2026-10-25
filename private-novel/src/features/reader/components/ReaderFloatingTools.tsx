import type {AiChapterView} from '../../ai/types/ai-chapter-view';
import type {SpeechState} from '../../tts/services/tts';
interface Props {
 focusMode:boolean;canPrevious:boolean;canNext:boolean;canListen:boolean;
 pendingAiListen:string;speech:SpeechState;cursorResumable:boolean;nextAi:AiChapterView;aiOpen:boolean;settingsOpen:boolean;
 onPrevious:()=>void;onNext:()=>void;onStopReading:()=>void;onToggleAi:()=>void;onListen:()=>void;onToggleSettings:()=>void;
}
/** Display-only controls: session and player ownership stay in Reader. */
export function ReaderFloatingTools({focusMode,canPrevious,canNext,canListen,pendingAiListen,speech,cursorResumable,nextAi,aiOpen,settingsOpen,onPrevious,onNext,onStopReading,onToggleAi,onListen,onToggleSettings}:Props){
 return <div className="floating-tools">{focusMode&&<>
  <button aria-label="Chương trước nhanh" disabled={!canPrevious} onClick={onPrevious}>‹</button>
  <button aria-label="Chương sau nhanh" disabled={!canNext} onClick={onNext}>›</button>
  </>}
  {(pendingAiListen||speech==='playing'||speech==='paused'||speech==='loading')&&<button aria-label="Dừng đọc nhanh" onClick={onStopReading}>■</button>}<button className="ai-trigger"
   data-prewarm={nextAi.content==='complete'?'ready':nextAi.phase==='running'?'loading':nextAi.phase==='needs_config'?'waiting':nextAi.phase}
   aria-describedby="reader-prewarm-status" aria-label="Tùy chỉnh prompt và model"
   aria-expanded={aiOpen}
   title={`Tùy chỉnh prompt và model · ${nextAi.label}`} onClick={onToggleAi}>⚙ AI{(nextAi.content==='complete'||nextAi.phase!=='idle')&&<span className="prewarm-badge" aria-hidden="true">{nextAi.content==='complete'?'✓':nextAi.phase==='stopped'?'■':'…'}</span>}</button>
  <span id="reader-prewarm-status" className="prewarm-description" role="status">{nextAi.label}</span>
  <button className="listen-trigger" aria-label="Nghe truyện nhanh" aria-pressed={!!pendingAiListen||speech==='playing'||speech==='paused'||speech==='loading'}
   data-state={pendingAiListen?'waiting':speech}
   title={pendingAiListen?'Dừng chờ bản AI':speech==='loading'?'Tạm dừng tải':speech==='playing'?'Tạm dừng nghe':speech==='paused'||cursorResumable?'Tiếp tục nghe':'Nghe sách'}
   data-resume={cursorResumable?'true':undefined} disabled={!canListen} onClick={onListen}>
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{pendingAiListen||speech==='loading'?<>
  <circle cx="12" cy="12" r="9"/>
  <path d="M12 6v6l4 2"/>
  </>:speech==='playing'?<>
  <path d="M8 5v14M16 5v14"/>
  </>:speech==='paused'||cursorResumable?<path d="m8 5 11 7-11 7Z"/>:<>
  <path d="M4 14v-3a8 8 0 0 1 16 0v3"/>
  <rect x="3" y="12" width="5" height="9" rx="2"/>
  <rect x="16" y="12" width="5" height="9" rx="2"/>
  </>}</svg>
  </button>
  <button className="settings-trigger" aria-label="Cài đặt đọc truyện"
   aria-expanded={settingsOpen} aria-controls="reader-settings" onClick={onToggleSettings}>⚙</button>
  </div>;
}
