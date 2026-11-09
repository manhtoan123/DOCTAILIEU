import {useLayoutEffect,useRef,useState} from 'react';
import type {ReadingAiSettings} from '../types/ai-settings-type';
import type {PromptProfile} from '../prompt/prompt-schema';
import {AI_MODELS,supportsAiTemperature} from '../types/ai-models';
import {runPromptComparison,type PromptTrialResult} from '../services/ai-prompt-trial';
import {parseConvertNames} from '../../names-convert/services/convert-names';
import {errorText} from '../../../shared/components/common';
import {AiExecutionView} from './AiExecutionView';
interface Props {settings:ReadingAiSettings;title:string;profiles:PromptProfile[]}
export function PromptTrial({settings,title,profiles}:Props){
 const [text,setText]=useState('陈景然推开门，轻声问：“你怎么还没休息？”\n她放下书，笑着说：“我在等你。”'),[names,setNames]=useState('陈景然=Trần Cảnh Nhiên');
 const [model,setModel]=useState<string>(AI_MODELS[0].id),[temperature,setTemperature]=useState(.3),[other,setOther]=useState('');
 const [running,setRunning]=useState(false),[results,setResults]=useState<PromptTrialResult[]>([]),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 const selected=profiles.find(p=>p.id===other),identity=JSON.stringify([text,names,model,temperature,title,settings,selected]);
 useLayoutEffect(()=>{generation.current++;controller.current?.abort();controller.current=null;setRunning(false);setResults([]);setError('');return()=>{generation.current++;controller.current?.abort();controller.current=null;};},[identity]);
 function stop(){generation.current++;controller.current?.abort();controller.current=null;setRunning(false);}
 async function run(){
  if(controller.current||!selected)return;const ticket=++generation.current,abort=new AbortController();controller.current=abort;setRunning(true);setResults([]);setError('');
  try{await runPromptComparison({text,names:parseConvertNames(names),model,temperature,variants:[{label:title||'Bản đang soạn',settings},{label:selected.title,settings:selected.settings}]},abort.signal,result=>{if(!abort.signal.aborted&&generation.current===ticket)setResults(old=>[...old,result]);});}
  catch(e){if(!abort.signal.aborted&&generation.current===ticket)setError(errorText(e));}
  finally{if(generation.current===ticket){controller.current=null;setRunning(false);}}
 }
 return <details className="prompt-trial"><summary>Thử và so sánh prompt</summary><p>So bản đang soạn (A) với một mẫu đã lưu (B). Hai lượt dùng cùng nguồn, Name, model và nhiệt độ; chạy lần lượt, không đổi prompt của truyện và không lưu bản dịch vào cache.</p>
  <label>Nguồn thử<textarea aria-label="Nguồn thử prompt" rows={4} maxLength={3200} value={text} onChange={e=>setText(e.target.value)}/></label>
  <label>Name cho mẫu thử<textarea aria-label="Name thử prompt" rows={2} maxLength={8000} value={names} onChange={e=>setNames(e.target.value)}/></label>
  <div className="prompt-trial-options"><label>So với prompt B<select aria-label="Prompt B" value={other} onChange={e=>setOther(e.target.value)}><option value="">Chọn mẫu đã lưu</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Model thử<select aria-label="Model thử prompt" value={model} onChange={e=>setModel(e.target.value)}>{AI_MODELS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>{supportsAiTemperature(model)?<label>Nhiệt độ thử<input aria-label="Nhiệt độ thử" type="number" min={0} max={1} step={.1} value={temperature} onChange={e=>setTemperature(Number(e.target.value))}/></label>:<p className="muted">Model thử không dùng nhiệt độ.</p>}</div>
  <p className="muted">Suy nghĩ: theo model. Chỉ thay prompt; chất lượng cần đối chiếu nghĩa, tên và xưng hô bằng mắt. Thử sẽ dùng quota AI; không tự chạy khi mở trang.</p>
  <div className="ai-actions"><button type="button" disabled={running||!selected||!text.trim()} onClick={()=>void run()}>{running?`Đang thử ${Math.min(2,results.length+1)}/2…`:'Chạy so sánh A/B'}</button>{running&&<button type="button" onClick={stop}>Dừng thử</button>}</div>{error&&<p role="alert">{error}</p>}
  <div className="prompt-trial-results" aria-live="polite">{results.map(row=><article key={row.index} aria-label={`Kết quả ${row.index?'B':'A'}`}><h4>{row.index?'B':'A'} · {row.label}</h4><p>{(row.durationMs/1000).toFixed(1)} giây{row.response?` · Vào ${row.response.inputTokens} / ra ${row.response.outputTokens} token`:''}{row.response?.thinkingTokens!==undefined?` · suy nghĩ ${row.response.thinkingTokens} token`:''}{row.response?.totalTokens!==undefined?` · tổng ${row.response.totalTokens} token`:''}</p>{row.error?<p role="status">{row.error}</p>:row.response&&<><pre>{row.response.result}</pre><details><summary>Cấu hình lượt thử</summary><AiExecutionView execution={row.response.execution}/></details></>}</article>)}</div>
 </details>;
}
