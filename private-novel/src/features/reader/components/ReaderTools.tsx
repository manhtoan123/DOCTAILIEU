import {useEffect,useRef,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {defaults,type ReaderSettings} from '../../../core/domain';

export const readerFonts:Record<ReaderSettings['font'],string>={arial:'Arial, Helvetica, sans-serif',sans:'system-ui, sans-serif',serif:'Georgia, serif',tahoma:'Tahoma, sans-serif',times:'"Times New Roman", serif',palatino:'"Palatino Linotype", Palatino, serif'};

/** Reading remains available while this non-modal utility window is open. */
export function ReaderPanel({title,onClose,children,kind='settings'}:{title:string;onClose:()=>void;children:ReactNode;kind?:string}){
  const element=useRef<HTMLElement>(null);const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    element.current?.querySelector<HTMLElement>('button')?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}};
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('keydown',escape);if(previous?.isConnected)previous.focus();};
  },[]);
  return <section ref={element} id={`reader-${kind}`} className={`reader-panel reader-panel-${kind}`} role="dialog" aria-label={title}><header><strong>{title}</strong><button onClick={onClose} aria-label={`Ẩn ${title}`}>Ẩn ×</button></header><div className="reader-panel-body">{children}</div></section>;
}
const colors=['#eae4d3','#ffffff','#000000','#d0d0d0','#a3e6a2','#a7d4e8','#d7ffff','#8a8a88','#fbdada','#6f3333','#5cbd94','#c492de','#127743','#ececec'];
export function DisplaySettings({settings,setSettings,onNames,onSpeech,onHelp}:{settings:ReaderSettings;setSettings:Dispatch<SetStateAction<ReaderSettings>>;onNames:()=>void;onSpeech:()=>void;onHelp:()=>void}){
  const update=(value:Partial<ReaderSettings>)=>setSettings(old=>({...old,...value}));
  return <>
    <div className="setting-pair">
      <label>Cỡ chữ
        <div className="stepper">
          <button type="button" aria-label="Giảm cỡ chữ" onClick={()=>update({fontSize:Math.max(15,settings.fontSize-1)})}>−</button>
          <input aria-label="Cỡ chữ" type="number" min="15" max="40" value={settings.fontSize} onChange={e=>update({fontSize:Math.min(40,Math.max(15,Number(e.target.value)||15))})}/>
          <button type="button" aria-label="Tăng cỡ chữ" onClick={()=>update({fontSize:Math.min(40,settings.fontSize+1)})}>+</button>
        </div>
      </label>
      <label>Giãn dòng
        <div className="stepper">
          <button type="button" aria-label="Giảm giãn dòng" onClick={()=>update({lineHeight:Math.max(1.2,Number((settings.lineHeight-0.1).toFixed(2)))})}>−</button>
          <input aria-label="Giãn dòng" type="number" min="1.2" max="3" step="0.05" value={settings.lineHeight} onChange={e=>update({lineHeight:Math.min(3,Math.max(1.2,Number(e.target.value)||1.2))})}/>
          <button type="button" aria-label="Tăng giãn dòng" onClick={()=>update({lineHeight:Math.min(3,Number((settings.lineHeight+0.1).toFixed(2)))})}>+</button>
        </div>
      </label>
    </div>
    <label className="setting-line">Font<select aria-label="Font" value={settings.font} onChange={e=>update({font:e.target.value as ReaderSettings['font']})}><option value="arial">Arial</option><option value="tahoma">Tahoma</option><option value="times">Times New Roman</option><option value="palatino">Palatino</option><option value="serif">Georgia</option><option value="sans">Hệ thống</option></select></label>
    <label className="setting-line">Nền<select aria-label="Nền" value={settings.theme} onChange={e=>update({theme:e.target.value as ReaderSettings['theme'],background:'',textColor:''})}><option value="sepia">Sepia</option><option value="light">Sáng</option><option value="dark">Tối</option><option value="gray">Xám</option></select></label>
    <details className="reader-display-advanced">
      <summary>Hiển thị nâng cao</summary>
    <label className="setting-line">Màu nền<input aria-label="Màu nền tùy chọn" type="color" value={settings.background||({sepia:'#eae4d3',light:'#ffffff',dark:'#161b19',gray:'#2b3030'}[settings.theme])} onChange={e=>update({background:e.target.value})}/></label>
    <div className="color-swatches" aria-label="Bảng màu nền">{colors.map(color=><button key={color} style={{backgroundColor:color,color:color==='#000000'?'white':'#222'}} aria-label={`Nền ${color}`} aria-pressed={settings.background===color} onClick={()=>update({background:color})}>A</button>)}</div>
    <label className="setting-line">Màu chữ<input aria-label="Màu chữ tùy chọn" type="color" value={settings.textColor||(settings.theme==='dark'||settings.theme==='gray'?'#cbd1c8':'#222222')} onChange={e=>update({textColor:e.target.value})}/></label>
    <div className="color-swatches" aria-label="Bảng màu chữ">{colors.map(color=><button key={color} style={{color,background:'#f0f0f0',textShadow:color==='#ffffff'?'0 0 2px #555':'none'}} aria-label={`Chữ ${color}`} aria-pressed={settings.textColor===color} onClick={()=>update({textColor:color})}>A</button>)}</div>
    <label className="setting-line">Chiều rộng {settings.width}px<input aria-label="Chiều rộng" type="range" min="500" max="1200" step="20" value={settings.width} onChange={e=>update({width:+e.target.value})}/></label>
    <div className="alignment" aria-label="Căn chữ">
      <button type="button" aria-label="Giảm lề" title="Rộng hơn" onClick={()=>update({width:Math.min(1200,settings.width+50)})}>⇤</button>
      {([['left','Trái'],['center','Giữa'],['justify','Đều'],['right','Phải']] as const).map(([align,label])=><button key={align} aria-pressed={(settings.align||'left')===align} onClick={()=>update({align})}>{label}</button>)}
      <button type="button" aria-label="Tăng lề" title="Hẹp hơn" onClick={()=>update({width:Math.max(500,settings.width-50)})}>⇥</button>
    </div>
    <label className="check"><input type="checkbox" checked={!!settings.textShadow} onChange={e=>update({textShadow:e.target.checked})}/>Bóng chữ nhẹ</label>
    </details>
    <div className="tool-links"><button onClick={()=>update({theme:defaults.theme,font:defaults.font,fontSize:defaults.fontSize,lineHeight:defaults.lineHeight,width:defaults.width,background:defaults.background,textColor:defaults.textColor,align:defaults.align,textShadow:defaults.textShadow})}>Mặc định hiển thị</button><button onClick={onHelp}>Hướng dẫn</button></div>
    <footer className="config-footer"><button onClick={onSpeech}>▶ Nghe sách</button><button onClick={onNames}>✎ Name</button></footer>
  </>;
}
export function ReaderHelp(){return <div className="reader-help">
  <p><b>⚙ Cài đặt:</b> bấm để mở, bấm lần nữa hoặc “Ẩn” để đóng. Màu, font, cỡ chữ và giãn dòng được nhớ trên thiết bị.</p>
  <p><b>Mục lục:</b> mở danh sách, tìm tên chương rồi chọn. Nút chương trước/sau có ở cả đầu và cuối trang.</p>
  <p><b>Convert:</b> là chế độ mặc định. Chạm trực tiếp một từ để mở bảng hv/HV/zw/Tr/tc, mở rộng cụm hoặc áp dụng tạm đúng lần xuất hiện đang chọn. Nút đĩa lưu Name cố định cho truyện; bản gốc nằm trong menu “Công cụ”.</p>
  <p><b>Name:</b> tìm tên rồi chạm để sửa, bấm “Lưu tên” để tự cập nhật bản Convert. Nhập/xuất nhiều dòng nằm trong phần mở rộng. Xóa bằng nút ×; bỏ dòng trong bản nháp không xóa tên đã lưu.</p>
  <p><b>Nghe sách:</b> mở bảng giọng, tốc độ và tự qua chương. Ẩn bảng vẫn tiếp tục nghe; nút ■ mới dừng. TikTok cần gateway được cấu hình và gửi câu đang đọc đến gateway đó.</p>
  <p><b>Chỉ đọc:</b> ẩn các thanh công cụ; nút ⚙ vẫn hiện để bật lại. Phím Esc đóng bảng đang mở hoặc thoát chế độ chỉ đọc.</p>
</div>;}
