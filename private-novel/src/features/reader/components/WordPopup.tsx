import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import '../styles/word-popup.css';

export interface WordPopupProps {
  source:string;
  hanviet:string;
  meanings:string[];
  translated:string;
  custom:string;
  loading:boolean;
  busy:boolean;
  error?:string;
  canExpandLeft:boolean;
  canExpandRight:boolean;
  anchor:{left:number;top:number;right:number;bottom:number};
  onSourceChange:(value:string)=>void;
  onCustomChange:(value:string)=>void;
  onExpand:(direction:'left'|'right')=>void;
  onApply:(value:string,persistent:boolean)=>void;
  onClose:()=>void;
  onManage:()=>void;
  onRun:()=>void;
  onAddName:()=>void;
  onEditMeaning:()=>void;
  onCopy:()=>void;
  onTranslate:()=>void;
  onSearch:()=>void;
}

function titleCase(value:string){
  return value.replace(/(^|\s)(\S)/gu,(_match,space:string,letter:string)=>space+letter.toLocaleUpperCase('vi'));
}

/** Local UI only: callbacks own conversion and persistence; this component never sends text. */
export default function WordPopup(props:WordPopupProps){
  const {source,hanviet,meanings,translated,custom,loading,busy,error,anchor,onClose}=props;
  const box=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const dismiss=useRef({busy,onClose});
  dismiss.current={busy,onClose};
  const [hv,setHv]=useState(hanviet);
  const [upperHv,setUpperHv]=useState(titleCase(hanviet));
  const [position,setPosition]=useState<CSSProperties>({left:anchor.left,top:anchor.bottom+6});
  useEffect(()=>{setHv(hanviet);setUpperHv(titleCase(hanviet));},[source,hanviet]);

  useLayoutEffect(()=>{
    const place=()=>{
      const viewport=window.visualViewport;
      const width=viewport?.width??window.innerWidth;
      const height=viewport?.height??window.innerHeight;
      const originLeft=viewport?.offsetLeft??0;
      const originTop=viewport?.offsetTop??0;
      // Leave space for the second close button outside the cyan panel.
      const popupWidth=Math.min(256,Math.max(1,width-36));
      const maxHeight=Math.max(1,height-16);
      const popupHeight=Math.min(box.current?.offsetHeight??232.4,maxHeight);
      const left=Math.max(originLeft+28,Math.min(anchor.left,originLeft+width-popupWidth-8));
      const below=anchor.bottom+6;
      const preferred=below+popupHeight<=originTop+height-8?below:anchor.top-popupHeight-6;
      const top=Math.max(originTop+8,Math.min(preferred,originTop+height-popupHeight-8));
      setPosition({left,top,width:popupWidth,maxHeight});
    };
    place();
    const observer=new ResizeObserver(place);
    if(box.current)observer.observe(box.current);
    window.addEventListener('resize',place);
    window.visualViewport?.addEventListener('resize',place);
    window.visualViewport?.addEventListener('scroll',place);
    return()=>{
      observer.disconnect();
      window.removeEventListener('resize',place);
      window.visualViewport?.removeEventListener('resize',place);
      window.visualViewport?.removeEventListener('scroll',place);
    };
  },[anchor.left,anchor.top,anchor.right,anchor.bottom]);

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const popupElement=box.current;
    // Focus a button so opening the popup does not summon the Android keyboard.
    closeButton.current?.focus({preventScroll:true});
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!dismiss.current.busy){event.preventDefault();dismiss.current.onClose();}
    };
    const outside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!box.current?.contains(event.target)&&!dismiss.current.busy) dismiss.current.onClose();
    };
    document.addEventListener('keydown',keyboard);
    document.addEventListener('pointerdown',outside);
    return()=>{
      document.removeEventListener('keydown',keyboard);
      document.removeEventListener('pointerdown',outside);
      // Do not steal focus if another panel has already opened.
      if(previous?.isConnected&&(document.activeElement===document.body||popupElement?.contains(document.activeElement))) previous.focus({preventScroll:true});
    };
  },[]);

  const applyButtons=(value:string,label:string)=><span className="stv-word-actions">
    <button type="button" aria-label={`Áp dụng ${label}`} title="Áp dụng tạm trong lần đọc này" disabled={busy||loading||!value.trim()||!source.trim()} onClick={()=>props.onApply(value,false)}>✓</button>
    <button type="button" aria-label={`Lưu ${label}`} title="Lưu Name cố định cho truyện này" disabled={busy||loading||!value.trim()||!source.trim()} onClick={()=>props.onApply(value,true)}>▣</button>
  </span>;

  return <div ref={box} className="stv-word-popup" role="dialog" aria-label="Chỉnh Name" aria-busy={busy||loading} style={position}>
    <button type="button" className="stv-word-close stv-word-close-outside" aria-label="Đóng Chỉnh Name bên trái" title="Đóng" disabled={busy} onClick={onClose}>×</button>
    <div className="stv-word-scroll" style={{maxHeight:typeof position.maxHeight==='number'?Math.max(1,position.maxHeight-12):undefined}}>
      <header className="stv-word-header">
        <button type="button" aria-label="Mở rộng sang trái" title="Mở rộng sang trái" disabled={busy||!props.canExpandLeft} onClick={()=>props.onExpand('left')}>←</button>
        <span>Mở rộng</span>
        <button type="button" aria-label="Mở rộng sang phải" title="Mở rộng sang phải" disabled={busy||!props.canExpandRight} onClick={()=>props.onExpand('right')}>→</button>
        <button ref={closeButton} type="button" className="stv-word-close" aria-label="Đóng Chỉnh Name" title="Đóng" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="stv-word-row">
        <label htmlFor="stv-word-hv">hv</label>
        <input id="stv-word-hv" aria-label="Hán-Việt" value={loading?'':hv} disabled={busy||loading} onChange={event=>setHv(event.target.value)}/>
        {applyButtons(hv,'Hán-Việt')}
      </div>
      <div className="stv-word-row">
        <label htmlFor="stv-word-HV">HV</label>
        <input id="stv-word-HV" aria-label="Hán-Việt viết hoa" value={loading?'':upperHv} disabled={busy||loading} onChange={event=>setUpperHv(event.target.value)}/>
        {applyButtons(upperHv,'Hán-Việt viết hoa')}
      </div>
      <div className="stv-word-row">
        <label htmlFor="stv-word-zw">zw</label>
        <input id="stv-word-zw" aria-label="Chữ Trung" value={source} disabled={busy} onChange={event=>props.onSourceChange(event.target.value)}/>
        <span className="stv-word-actions">
          <button type="button" aria-label="Translate" title="Dịch cụm từ bằng Google" disabled={busy||!source.trim()} onClick={props.onTranslate}>T</button>
          <button type="button" aria-label="Sao chép Chữ Trung" title="Sao chép Chữ Trung" disabled={busy||!source} onClick={props.onCopy}>⧉</button>
          <button type="button" aria-label="Tìm kiếm Chữ Trung" title="Hỏi nghĩa bằng Google chế độ AI" disabled={busy||!source.trim()} onClick={props.onSearch}>⌕</button>
        </span>
      </div>
      <div className="stv-word-row">
        <label htmlFor="stv-word-tr">Tr</label>
        <input id="stv-word-tr" aria-label="Nghĩa Vietphrase" value={loading?'':meanings.length?meanings.join('/'):translated} readOnly/>
        <span className="stv-word-actions">
          {!loading&&meanings.length>1&&<select aria-label="Chọn nghĩa Vietphrase" title="Chọn nghĩa để sửa" value="" disabled={busy} onChange={event=>{if(event.target.value)props.onCustomChange(event.target.value);}}>
            <option value="">▾</option>{meanings.map((value,index)=><option key={`${index}:${value}`} value={value}>{value}</option>)}
          </select>}
          <button type="button" className="stv-word-edit" aria-label="Sửa nghĩa Vietphrase" disabled={busy||loading} onClick={props.onEditMeaning}>Sửa</button>
        </span>
      </div>
      <div className="stv-word-row">
        <label htmlFor="stv-word-tc">tc</label>
        <input id="stv-word-tc" aria-label="Cụm từ tùy chọn" value={custom} disabled={busy} onChange={event=>props.onCustomChange(event.target.value)}/>
        {applyButtons(custom,'cụm từ tùy chọn')}
      </div>
      <footer className="stv-word-footer">
        <button type="button" aria-label="Quản lý Name" disabled={busy} onClick={props.onManage}>Quản lý</button>
        <button type="button" aria-label="Chạy Convert" title="Convert lại bằng từ điển cục bộ" disabled={busy||loading} onClick={props.onRun}>▶</button>
        <button type="button" aria-label="Thêm Name" disabled={busy||loading||!source.trim()} onClick={props.onAddName}>Thêm name</button>
      </footer>
      {loading&&<div className="stv-word-message" role="status">Đang tra nghĩa…</div>}
      {busy&&<div className="stv-word-message" role="status">Đang lưu…</div>}
      {error&&<div className="stv-word-message stv-word-error" role="alert">{error}</div>}
    </div>
  </div>;
}
