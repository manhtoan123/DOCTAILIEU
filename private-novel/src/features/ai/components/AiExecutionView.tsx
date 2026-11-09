import {readAiExecution,type AiExecution} from '../services/ai-execution';
import {aiModelLabel} from '../services/ai-hybrid-prompt';
import '../styles/ai-execution.css';
export function AiExecutionView({execution}:{execution?:AiExecution}){
 const value=readAiExecution(execution);
 if(!value)return <p className="muted">Chưa lưu cấu hình thực dùng của bản này; không suy ra từ cài đặt hiện tại.</p>;
 return <dl className="ai-execution-values"><dt>Model thực gọi</dt><dd>{aiModelLabel(value.model)}</dd><dt>Prompt</dt><dd><code>#{value.promptId.slice(0,12)}</code></dd><dt>Nhiệt độ</dt><dd>{value.temperature===null?'Model không dùng tham số này':value.temperature}</dd><dt>Suy nghĩ</dt><dd>{value.thinking==='disabled'?'Đã tắt để ưu tiên tốc độ dịch':'Theo model — web không gửi mức riêng'}</dd><dt>Giới hạn đầu ra</dt><dd>{value.maxOutputTokens.toLocaleString('vi-VN')} token</dd></dl>;
}
