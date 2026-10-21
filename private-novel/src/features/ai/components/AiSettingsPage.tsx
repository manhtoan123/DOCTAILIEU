import {AiSettingsEditor} from './AiSettingsEditor';
interface Props {onClose:()=>void;notify:(message:string)=>void}
export function AiSettingsPage({onClose,notify}:Props){
 return <section className="ai-settings-page" aria-label="Cài đặt dịch AI"><div className="ai-settings-heading"><div><h2>Dịch AI</h2><p>Cài đặt chung cho mọi truyện. Chọn prompt và bật dịch chia phần ngay trong trang đọc.</p></div></div><AiSettingsEditor names={[]} globalNames={[]} chapterText="" sourceIdentity="settings:global" notify={notify} onClose={onClose}/></section>;
}
