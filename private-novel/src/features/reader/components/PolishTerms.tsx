import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import type {PolishTerm} from '../../ai/services/polish-output';
import {readLocalVietphrase,saveLocalVietphrases} from '../../names-convert/services/local-vietphrase';
import {normalizeLibrarySearch} from '../../library/services/library-search';
import {errorText} from '../../../shared/components/common';

export function PolishTerms({terms,busy,saving,onSavingChange}:{terms:PolishTerm[];busy:boolean;saving:boolean;onSavingChange:(saving:boolean)=>void}){
  const [edits,setEdits] = useState<Record<string,string>>({});
  const [selected,setSelected] = useState<Record<string,string>>({});
  const [saved,setSaved] = useState<Set<string>>(new Set());
  const [status,setStatus] = useState('');
  const [query,setQuery] = useState('');
  const [onlySelected,setOnlySelected] = useState(false);
  const stored=useLiveQuery(()=>readLocalVietphrase().catch(()=>undefined),[]);
  const idOf = (term:PolishTerm)=>JSON.stringify([term.source,term.meaning]);
  const meaningOf = (term:PolishTerm)=>(edits[idOf(term)]??term.meaning).trim();
  const existing=new Map(stored?.entries.map(entry=>[entry.key,entry.value]));
  const available=terms.filter(term=>existing.get(term.source)!==term.meaning&&!saved.has(idOf(term)));
  const chosen = available.filter(term=>selected[term.source]===idOf(term));
  const validSelection=chosen.length>0&&chosen.every(meaningOf);
  const needle=normalizeLibrarySearch(query).replace(/^\$/,'');
  const visible=available.filter(term=>(!onlySelected||selected[term.source]===idOf(term))&&
    (!needle||normalizeLibrarySearch([term.convert,term.source,meaningOf(term)].join(' ')).includes(needle)));

  async function save(){
    if(busy||saving||!validSelection)return;
    onSavingChange(true);
    try{
      await saveLocalVietphrases(chosen.map(term=>({key:term.source,value:meaningOf(term)})));
      setSaved(old=>new Set([...old,...chosen.map(idOf)]));
      setSelected({});
      setOnlySelected(false);
      setStatus(`Đã lưu ${chosen.length} mục Vietphrase.`);
    }catch(error){setStatus(errorText(error));}
    finally{onSavingChange(false);}
  }

  async function copy(){
    try{
      await navigator.clipboard.writeText(chosen.map(term=>`$${term.source}=${meaningOf(term)}`).join('\n'));
      setStatus(`Đã sao chép ${chosen.length} mục từ.`);
    }catch(error){setStatus(errorText(error));}
  }

  return <section className="polish-terms name-discovery-results" aria-label="Đề xuất Vietphrase">
    <div className="name-discovery-filters">
      <div className="name-discovery-search">
        <input type="search" aria-label="Lọc đề xuất Vietphrase" placeholder="Tìm cụm Convert, chữ Trung hoặc nghĩa Việt" value={query} onChange={event=>setQuery(event.target.value)}/>
        {query&&<button className="name-discovery-icon" type="button" aria-label="Xóa bộ lọc Vietphrase" onClick={event=>{
          event.currentTarget.parentElement?.querySelector('input')?.focus();setQuery('');
        }}>×</button>}
      </div>
      <button type="button" aria-pressed={onlySelected} onClick={()=>setOnlySelected(value=>!value)}>Đã chọn ({chosen.length})</button>
    </div>
    <div className="polish-term-list">
      <table aria-label="Vietphrase">
        <thead><tr><th scope="col">Convert</th><th scope="col">Chữ Trung</th><th scope="col">Nghĩa sửa</th></tr></thead>
        <tbody>{visible.map(term=>{
          const id = idOf(term);
          return <tr key={id} data-selected={selected[term.source]===id}>
            <td><label><input type="checkbox" aria-label={`Chọn $${term.source}=${term.meaning}`} disabled={saving} checked={selected[term.source]===id}
              onChange={event=>setSelected(old=>({...old,[term.source]:event.target.checked?id:''}))}/><span>{term.convert}</span></label></td>
            <td><code>${term.source}</code></td>
            <td><input aria-label={`Nghĩa Vietphrase của ${term.source}`} value={edits[id]??term.meaning} maxLength={2048} disabled={saving}
              onChange={event=>setEdits(old=>({...old,[id]:event.target.value}))}/></td>
          </tr>;
        })}
        {!visible.length&&<tr><td colSpan={3}>{!available.length?'Chưa có đề xuất Vietphrase.':onlySelected&&!chosen.length?'Chưa chọn mục từ.':'Không có mục từ khớp.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="name-discovery-save">
      <button type="button" className="name-discovery-primary" disabled={busy||saving||!validSelection} onClick={()=>void save()}>{saving?'Đang lưu…':'Lưu Vietphrase đã chọn'}</button>
      <button disabled={!validSelection} onClick={()=>void copy()}>Sao chép đã chọn</button>
      {status&&<small role="status">{status}</small>}
    </div>
  </section>;
}
