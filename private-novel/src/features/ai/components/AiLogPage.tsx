import {useEffect,useMemo,useRef,useState} from 'react';
import type {AiLogResponse} from '../../../shared/types/ai-log';
import {fetchAiLogs,flushAiLogOutbox} from '../services/ai-log-client';
import {aggregateAiLogs,aiLogDuration,AI_LOG_TIME_ZONE,type AiLogModelSummary} from '../services/ai-log-stats';
import './ai-log-page.css';
import {AiLogInsights} from './AiLogInsights';

const clock=new Intl.DateTimeFormat('vi-VN',{timeZone:AI_LOG_TIME_ZONE,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const num=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1});
const time=(value:number|null)=>value===null?'—':`${num.format(value/1000)} s`;
const percent=(value:number|null)=>value===null?'—':`${num.format(value*100)}%`;
const modelName=(value:string)=>value==='unknown'?'Chưa xác định':value==='mixed'?'Nhiều model':value;
const statuses={success:'Thành công',error:'Lỗi',cancelled:'Đã dừng',cache:'Cache'};
const reasonLabels:Record<string,string>={
 output_limit:'Chạm giới hạn đầu ra / bản dịch bị cắt',ai_incomplete_result:'Bản dịch chưa hoàn chỉnh',
 timeout:'Hết thời gian',ai_timeout:'Hết thời gian',chapter_deadline:'Hết thời gian hoàn thành chương',
 ai_rate_limited:'Hết quota hoặc giới hạn lượt gọi (429)',http_429:'Hết quota hoặc giới hạn lượt gọi (429)',cooldown:'Key đang tạm chờ',send_limit:'Đã hết số lượt thử',
 network:'Lỗi kết nối',ai_network_error:'Lỗi kết nối',body_stream:'Lỗi đọc dữ liệu trả về',upstream_body_read:'Lỗi đọc dữ liệu trả về',
 ai_auth_error:'Key không được chấp nhận / thiếu quyền',http_401:'Key không được chấp nhận',http_403:'Không có quyền truy cập',
 ai_not_configured:'Chưa cấu hình dịch AI',not_configured:'Chưa cấu hình dịch AI',ai_invalid_model:'Model không hợp lệ',model:'Model không hợp lệ',
 untranslated_source:'Nguồn bị chép lại / còn phần chưa dịch',ai_untranslated_result:'Nguồn bị chép lại / còn phần chưa dịch',
 ai_invalid_response:'Phản hồi không đúng định dạng',invalid_result:'Kết quả không hợp lệ',schema:'Cấu trúc phản hồi không hợp lệ',upstream_schema:'Cấu trúc phản hồi không hợp lệ',result_type:'Loại kết quả không hợp lệ',
 json:'Phản hồi JSON không hợp lệ',invalid_json:'Phản hồi JSON không hợp lệ',upstream_invalid_json:'Phản hồi JSON không hợp lệ',
 content_type:'Loại dữ liệu trả về không hợp lệ',invalid_content_type:'Loại dữ liệu trả về không hợp lệ',upstream_content_type:'Loại dữ liệu trả về không hợp lệ',
 ai_empty_result:'Kết quả dịch rỗng',empty_result:'Kết quả dịch rỗng',empty_body:'Phản hồi rỗng',upstream_empty_result:'Kết quả dịch rỗng',
 finish_reason:'AI dừng trước khi hoàn tất',upstream_finish_reason:'AI dừng trước khi hoàn tất',upstream_candidates:'Phản hồi thiếu kết quả',upstream_parts:'Phản hồi thiếu phần nội dung',
 ai_response_too_large:'Phản hồi vượt giới hạn dung lượng',size_limit:'Vượt giới hạn dung lượng',
 ai_request_rejected:'Nhà cung cấp từ chối yêu cầu',request_validation:'Yêu cầu không hợp lệ',invalid_request:'Yêu cầu không hợp lệ',
 ai_upstream_error:'Nhà cung cấp trả lỗi',upstream_http:'Nhà cung cấp trả lỗi HTTP',http:'Lỗi HTTP',ai_gateway_error:'Gateway trả lỗi',
 ai_cancelled:'Đã dừng',cancelled:'Đã dừng',ai_location_unavailable:'Model không khả dụng tại khu vực này',ai_recovery_exhausted:'Đã hết khả năng tự thử lại',
 unknown:'Chưa xác định',
};
function Reason({code}:{code?:string}){
 if(!code)return <>—</>;
 return <>{reasonLabels[code]||(code.startsWith('http_')?'Nhà cung cấp trả lỗi HTTP':'Lỗi chưa có diễn giải')}<small>{code}</small></>;
}
function ModelTable({rows,chapter=false}:{rows:AiLogModelSummary[];chapter?:boolean}){
 return <div className="ai-log-scroll" tabIndex={0} role="region" aria-label={chapter?'Thống kê chương theo model':'Thống kê request theo model'}><table><thead><tr><th scope="col">Model</th><th scope="col">Tổng lượt</th><th scope="col">Thành công</th><th scope="col">Lỗi</th><th scope="col">Mẫu N</th><th scope="col">{chapter?'Tỉ lệ hoàn tất':'Đạt kiểm tra tự động'}</th><th scope="col">Tỉ lệ lỗi</th><th scope="col">TB thành công</th><th scope="col">Median</th><th scope="col">P90</th><th scope="col">Thời gian / 1.000 ký tự</th></tr></thead><tbody>{rows.map(row=><tr key={row.model}><th scope="row">{modelName(row.model)}</th><td>{row.total}</td><td>{row.success}</td><td>{row.errors}</td><td>{row.sample}{row.sample<20&&<small>Mẫu ít</small>}</td><td>{percent(row.successRate)}</td><td>{percent(row.failureRate)}</td><td>{time(row.meanMs)}<small>N={row.durationN}</small></td><td>{time(row.medianMs)}</td><td>{time(row.p90Ms)}</td><td>{time(row.per1000CharsMs)}</td></tr>)}</tbody></table></div>;
}
export function AiLogPage(){
 const [data,setData]=useState<AiLogResponse>(),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [days,setDays]=useState(7),[model,setModel]=useState(''),[visible,setVisible]=useState(100),[purpose,setPurpose]=useState('reading');
 const request=useRef<AbortController|null>(null);
 async function refresh(){
  request.current?.abort();const controller=new AbortController();request.current=controller;setLoading(true);setError('');
  try{
   void flushAiLogOutbox();
   if(controller.signal.aborted)return;
   const result=await fetchAiLogs(controller.signal);
   if(!controller.signal.aborted){setData(result);setVisible(100);}
  }catch{if(!controller.signal.aborted)setError('Chưa tải được nhật ký. Kiểm tra kết nối rồi thử lại.');}
  finally{if(!controller.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[]);
 const models=useMemo(()=>Array.from(new Set([...(data?.rows.map(row=>row.model)||[]),...(model?[model]:[])])).sort(),[data,model]);
 const result=useMemo(()=>aggregateAiLogs(data?.rows||[],{now:data?.serverNow??Date.now(),days,model,purpose}),[data,days,model,purpose]);
 const cutoff=(data?.serverNow??Date.now())-days*86400000;
 return <section className="ai-log-page" aria-label="Nhật ký dịch AI">
  <header className="ai-log-heading"><div><h2>Nhật ký dịch AI</h2><p>Số liệu chung của thư phòng trên mọi thiết bị. Chỉ ghi từ khi tính năng được bật; không hồi dựng các lượt cũ.</p></div><button onClick={()=>void refresh()} disabled={loading}>{loading?'Đang tải…':'Làm mới'}</button></header>
  <div className="ai-log-filters"><label>Thời gian<select value={days} onChange={event=>{setDays(Number(event.target.value));setVisible(100);}}><option value={1}>24 giờ qua</option><option value={7}>7 ngày qua</option><option value={30}>30 ngày qua</option></select></label><label>Vai trò thống kê<select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="reading">Đọc truyện · bỏ trial đã biết</option><option value="all">Tất cả lượt</option><option value="foreground">Đang đọc</option><option value="prewarm">Dịch sẵn</option><option value="trial">Thử prompt</option><option value="unknown">Chưa biết vai trò</option></select></label><label>Model<select value={model} onChange={event=>{setModel(event.target.value);setVisible(100);}}><option value="">Tất cả model</option>{models.map(value=><option key={value} value={value}>{modelName(value)}</option>)}</select></label></div>
  {loading&&<p role="status">Đang tải nhật ký…</p>}
  {error&&<div className="ai-log-error" role="alert"><p>{error}{data?' Đang giữ số liệu của lần tải trước.':''}</p><button onClick={()=>void refresh()} disabled={loading}>Thử lại</button></div>}
  {data&&<><p className="ai-log-meta">Cập nhật {clock.format(data.serverNow)} · Giờ Việt Nam (UTC+7). Giữ tối đa {data.limit.toLocaleString('vi-VN')} sự kiện trong {data.retentionDays} ngày.</p><p className="ai-log-note">{data.earliest!==null?`Mẫu sớm nhất còn lưu: ${clock.format(data.earliest)}. ${data.earliest>cutoff?'Khoảng đã chọn có thể thiếu lịch sử trước mốc này.':'Dữ liệu có thể bị cắt theo giới hạn lưu trữ.'}`:'Chưa có sự kiện được lưu.'}</p></>}
  {!loading&&data&&result.rows.length===0&&<p className="ai-log-note" role="status">Chưa có dữ liệu trong bộ lọc này. Dấu “—” nghĩa là chưa có mẫu để tính.</p>}
  {data&&<><AiLogInsights rows={result.rows}/><section className="ai-log-section"><h3>Request model · kiểm tra tự động</h3><p>Một lượt là một request từ ứng dụng, có thể gồm nhiều lần thử upstream. Thành công nghĩa là qua kiểm tra tự động, không đánh giá văn phong hoặc độ đúng nghĩa. Tỉ lệ dùng thành công + lỗi; loại Dừng và Cache.</p>
   <div className="ai-log-summary"><span>Tổng lượt <strong>{result.request.total}</strong></span><span>Thành công <strong>{result.request.success}</strong></span><span>Lỗi <strong>{result.request.errors}</strong><small>{percent(result.request.failureRate)} · N={result.request.sample}</small></span><span>Tỉ lệ <strong>{percent(result.request.successRate)}</strong><small>N={result.request.sample}{result.request.sample>0&&result.request.sample<20?' · Mẫu ít':''}</small></span><span>Dừng / Cache <strong>{result.request.cancelled} / {result.request.cache}</strong></span></div>
   {result.requestModels.length>0&&<ModelTable rows={result.requestModels}/>}
   <p className="ai-log-meta">Thời gian chỉ tính mẫu thành công không cache. Median là trung vị; P90 theo hạng gần nhất. Thời gian / 1.000 ký tự = tổng thời gian của mẫu có độ dài nguồn ÷ tổng ký tự nguồn × 1.000. Các bảng không xếp hạng model.</p>
  </section>
  <section className="ai-log-section"><h3>Hoàn thành chương · báo cáo từ ứng dụng</h3><p>Model chương v2 lấy từ các phần thực sự được chấp nhận; thiếu chứng cứ giữ “Chưa xác định”, dùng nhiều model giữ “Nhiều model”. Dữ liệu cũ không được suy đoán lại. Khi lọc model cụ thể, có thể không có mẫu chương; chọn “Tất cả model” để xem tổng chương. Thời gian từ bắt đầu đến hoàn tất chương, gồm ghép và kiểm tra sau dịch. Không cộng thời gian các request chạy song song. Model chưa xác định hoặc nhiều model được giữ riêng.</p>
   <div className="ai-log-summary"><span>Hoàn tất <strong>{result.chapter.success}</strong></span><span>Lỗi <strong>{result.chapter.errors}</strong></span><span>TB thành công <strong>{time(result.chapter.meanMs)}</strong><small>N={result.chapter.durationN}{result.chapter.durationN>0&&result.chapter.durationN<20?' · Mẫu ít':''}</small></span><span>Median / P90 <strong>{time(result.chapter.medianMs)} / {time(result.chapter.p90Ms)}</strong></span><span>Dừng / Cache <strong>{result.chapter.cancelled} / {result.chapter.cache}</strong></span></div>
   {result.chapterModels.length>0&&<ModelTable rows={result.chapterModels} chapter/>}
  </section>
  <section className="ai-log-section"><h3>Lần thử upstream / key</h3><p>Chỉ tính kết nối và mã HTTP của các lần thử upstream trong request thành công hoặc lỗi. HTTP 2xx chưa xác nhận bản dịch đạt kiểm tra; kết quả kiểm tra nội dung nằm ở bảng request.</p><div className="ai-log-summary"><span>Tổng lần thử ghi nhận <strong>{result.upstream.total}</strong></span><span>HTTP 2xx <strong>{result.upstream.httpOk}</strong></span><span>HTTP lỗi <strong>{result.upstream.httpErrors}</strong></span><span>Lỗi kết nối <strong>{result.upstream.transportErrors}</strong></span><span>Có mã lỗi <strong>{result.upstream.reportedErrors}</strong></span></div></section>
    <section className="ai-log-section"><h3>Nguyên nhân lỗi upstream / key</h3><p>Tính cả lần thử lỗi trước khi request cuối cùng thành công. Mỗi lần thử có HTTP lỗi, lỗi kết nối hoặc mã lỗi được tính một lần; mẫu N={result.upstream.failed}. Tỉ lệ dưới đây chia cho tổng lần thử lỗi, tách riêng lỗi request sau kiểm tra tự động. Thời gian upstream trong nhật ký chỉ đo đến khi nhận response headers, không phải toàn bộ thời gian suy luận hay nhận nội dung.</p>{result.upstreamReasons.length===0?<p>Chưa có metadata lần thử lỗi trong bộ lọc này.</p>:<div className="ai-log-scroll" tabIndex={0} role="region" aria-label="Nguyên nhân lỗi upstream"><table><thead><tr><th scope="col">Nguyên nhân upstream</th><th scope="col">Số lần thử lỗi</th><th scope="col">Tỉ lệ / tổng lần thử lỗi</th></tr></thead><tbody>{result.upstreamReasons.map(row=><tr key={row.reason}><th scope="row"><Reason code={row.reason}/></th><td>{row.count}</td><td>{percent(row.share)}<small>N={result.upstream.failed}</small></td></tr>)}</tbody></table></div>}</section>
  <section className="ai-log-section"><h3>Request theo giờ bắt đầu</h3><p>Gộp cùng giờ trong khoảng đã chọn, theo Asia/Ho_Chi_Minh. Chưa đủ dữ liệu để suy ra giờ dịch tốt nhất.</p><div className="ai-log-scroll" tabIndex={0} role="region" aria-label="Request theo 24 giờ"><table><thead><tr><th scope="col">Giờ Việt Nam</th><th scope="col">Tổng lượt</th><th scope="col">Thành công</th><th scope="col">Lỗi</th><th scope="col">Mẫu N</th><th scope="col">Đạt kiểm tra tự động</th><th scope="col">Dừng / Cache</th></tr></thead><tbody>{result.hours.map(row=><tr key={row.hour}><th scope="row">{String(row.hour).padStart(2,'0')}:00–{String(row.hour).padStart(2,'0')}:59</th><td>{row.total}</td><td>{row.success}</td><td>{row.errors}</td><td>{row.sample}{row.sample>0&&row.sample<20&&<small>Mẫu ít</small>}</td><td>{percent(row.successRate)}</td><td>{row.cancelled} / {row.cache}</td></tr>)}</tbody></table></div></section>
  <section className="ai-log-section"><h3>Nguyên nhân lỗi</h3>{result.reasons.length===0?<p>Chưa ghi nhận lỗi trong bộ lọc này.</p>:<div className="ai-log-scroll" tabIndex={0} role="region" aria-label="Nguyên nhân lỗi"><table><thead><tr><th scope="col">Mã nguyên nhân</th><th scope="col">Request lỗi</th><th scope="col">Chương lỗi</th></tr></thead><tbody>{result.reasons.map(row=><tr key={row.reason}><th scope="row"><Reason code={row.reason}/></th><td>{row.requests}</td><td>{row.chapters}</td></tr>)}</tbody></table></div>}</section>
  <section className="ai-log-section"><h3>Nhật ký mới nhất</h3><p>Hiển thị {Math.min(visible,result.rows.length)} / {result.rows.length} sự kiện trong bộ lọc. Chỉ có metadata kỹ thuật, không có nội dung truyện hay thông tin key.</p>{result.rows.length>0&&<div className="ai-log-scroll" tabIndex={0} role="region" aria-label="Nhật ký sự kiện gần đây"><table><thead><tr><th scope="col">Bắt đầu · giờ VN</th><th scope="col">Loại</th><th scope="col">Model</th><th scope="col">Trạng thái</th><th scope="col">Nguyên nhân / mã lỗi</th><th scope="col">Thời gian</th><th scope="col">Ký tự nguồn</th><th scope="col">Lần thử</th><th scope="col">Kết quả upstream</th></tr></thead><tbody>{result.rows.slice(0,visible).map(row=><tr key={row.id}><td>{clock.format(row.startedAt)}</td><td>{row.kind==='request'?'Request':'Chương'}</td><td>{modelName(row.model)}</td><td>{statuses[row.status]}</td><td><Reason code={row.reason||row.errorCode}/>{row.reason&&row.errorCode&&row.reason!==row.errorCode&&<small>{row.errorCode}</small>}</td><td>{time(aiLogDuration(row)??null)}</td><td>{num.format(row.sourceChars)}</td><td>{row.attempts}</td><td>{row.upstream?.length?row.upstream.map((attempt,index)=><small key={index}>{index+1}. {attempt.status?`HTTP ${attempt.status}`:'Lỗi kết nối'} · {attempt.errorCode?<Reason code={attempt.errorCode}/>:'không có mã lỗi'} · {time(attempt.durationMs)}</small>):'—'}</td></tr>)}</tbody></table></div>}{visible<result.rows.length&&<button onClick={()=>setVisible(value=>value+100)}>Xem thêm 100 sự kiện</button>}</section>
  </>}
 </section>;
}
