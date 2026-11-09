import {useEffect, useRef, useState} from 'react';
import type {NameEntry} from '../../../core/domain';
import {db} from '../../../core/db';
import {errorText} from '../../../shared/components/common';
import {AI_MODELS, DEFAULT_AI_MODEL, normalizeAiModel} from '../../ai/types/ai-models';
import {AiNameDiscoveryRun, AI_NAME_PROMPT_KEY, DEFAULT_AI_NAME_PROMPT, type AiNameCandidate, type NameDiscoveryProgress, type SkippedNamePart} from '../../ai/services/ai-name-discovery';
import {saveDiscoveredNames} from '../../ai/services/save-discovered-names';
import type {AiPartsControl} from '../../ai/services/ai-parts';
import {normalizeLibrarySearch} from '../../library/services/library-search';
import {canonicalNameKey, displayNameKey, formatNameList} from '../../names-convert/services/name-format';
import {readNameScope} from '../../names-convert/services/scoped-names';
import './name-discovery.css';

export interface NameDiscoveryInput {bookId:string;chapterId:string;revision:number;source:string;title:string;model:string;album:string|null;names:NameEntry[]}
interface Candidate extends AiNameCandidate {id:string;selected:boolean}

function partLabel(id: string) {
  return 'Phần '+id.split('/').map(position => Number(position)+1).join('.');
}

export default function NameDiscoveryPanel({input, control, onClose}: {input:NameDiscoveryInput;control:AiPartsControl;onClose:()=>void}) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [reports, setReports] = useState<Record<string,string>>({});
  const [progress, setProgress] = useState<NameDiscoveryProgress>();
  const [skipped, setSkipped] = useState<SkippedNamePart[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [model, setModel] = useState(normalizeAiModel(input.model) ?? DEFAULT_AI_MODEL);
  const run = useRef<AiNameDiscoveryRun>(undefined);
  const alive = useRef(true);
  const locked = useRef(false);
  const stopRequested = useRef(false);
  const baseline = useRef(input.names);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; run.current?.cancel(); };
  }, []);

  async function start(retrySkipped: boolean) {
    if (locked.current) return;
    locked.current = true;
    stopRequested.current = false;
    setBusy(true);
    setError('');
    setStatus(retrySkipped ? 'Đang thử lại phần lỗi kỹ thuật…' : 'Đang tìm Name trong chương…');
    try {
      if (!run.current) {
        const saved = await db.settings.get(AI_NAME_PROMPT_KEY);
        if (!alive.current) return;
        if (stopRequested.current) throw new DOMException('Cancelled','AbortError');
        const prompt = typeof saved?.value === 'string' ? saved.value : DEFAULT_AI_NAME_PROMPT;
        run.current = new AiNameDiscoveryRun({
          bookId:input.bookId, id:input.chapterId, revision:input.revision,
          text:input.source, title:input.title, names:input.names,
        }, model, prompt, control);
      }
      const failures = await run.current.run(p => {
        if (alive.current) setProgress(p);
      }, (found, report, part) => {
        if (!alive.current) return;
        setReports(old => ({...old, [part.id]:report}));
        setRows(old => {
          const known = new Set(old.map(row => row.id));
          const existing = new Set(baseline.current.map(row => canonicalNameKey(row.key)));
          const additions = found.filter(row => !existing.has(canonicalNameKey(row.key)))
            .map(row => ({...row,id:JSON.stringify([row.key,row.value]),selected:false}));
          return [...old,...additions.filter(row => !known.has(row.id))].sort((a,b) =>
            Array.from(b.key).length - Array.from(a.key).length || a.key.localeCompare(b.key));
        });
      }, model, retrySkipped);
      if (alive.current) {
        setStatus(failures.length ? 'Đã quét chương và bỏ qua phần lỗi.' : 'Đã quét chương.');
      }
    } catch (error) {
      if (alive.current) {
        const stopped = error instanceof DOMException && error.name === 'AbortError';
        setStatus(stopped ? 'Đã dừng. Các đề xuất được giữ lại.' : 'Đã tạm dừng. Các đề xuất được giữ lại.');
        if (!stopped) setError(errorText(error));
      }
    } finally {
      locked.current = false;
      if (alive.current) {
        setSkipped(run.current?.skippedParts() ?? []);
        setBusy(false);
      }
    }
  }

  async function save() {
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      const selected = rows.filter(row => row.selected);
      await saveDiscoveredNames({...input,baseline:baseline.current}, selected);
      if (!alive.current) return;
      const scope = await readNameScope(input.bookId);
      if (alive.current) {
        baseline.current = scope.rows;
        const existing = new Set(scope.rows.map(row => canonicalNameKey(row.key)));
        setRows(old => old.filter(row => !existing.has(canonicalNameKey(row.key))));
        setOnlySelected(false);
        setStatus('Đã lưu '+selected.length+' Name.');
      }
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      locked.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function updateRow(target: Candidate, patch: Partial<Pick<Candidate,'selected'|'value'>>) {
    const key = canonicalNameKey(target.key);
    setRows(old => old.map(row => {
      if (row.id === target.id) return {...row,...patch};
      if (patch.selected && row.selected && canonicalNameKey(row.key) === key) return {...row,selected:false};
      return row;
    }));
  }

  const needle = normalizeLibrarySearch(query).replace(/^\$/,'');
  const selectedCount = rows.filter(row => row.selected).length;
  const visible = rows.filter(row => (!onlySelected || row.selected) &&
    (!needle || normalizeLibrarySearch(row.key+' '+row.value).includes(needle)));
  const scanned = !!progress && progress.done+progress.skipped === progress.total;
  const retrySkipped = scanned && skipped.some(part => part.retryable);
  const canStart = !scanned || retrySkipped;
  const startLabel = !progress ? 'Bắt đầu tìm Name' : retrySkipped ? 'Thử lại phần lỗi kỹ thuật' : 'Tiếp tục tìm Name';

  return <section className="name-discovery" aria-label="Tìm và dịch Name">
    <header>
      <strong>Tìm và dịch Name</strong>
      <button className="name-discovery-icon" type="button" aria-label="Đóng tìm Name" disabled={saving} onClick={onClose}>×</button>
    </header>
    <div className="name-discovery-toolbar">
      <select aria-label="Model tìm Name" value={model} disabled={busy || saving || !canStart}
        onChange={event => setModel(normalizeAiModel(event.target.value) ?? DEFAULT_AI_MODEL)}>
        {AI_MODELS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      {busy ? <button onClick={() => { stopRequested.current = true; run.current?.cancel(); }}>Dừng tìm Name</button>
        : canStart && <button className="name-discovery-primary" disabled={saving} onClick={() => void start(retrySkipped)}>{startLabel}</button>}
    </div>
    {!scanned && <small>Tối đa 4 phần song song khi có đủ key.</small>}
    {progress && <div className="name-discovery-progress">
      <progress aria-label="Tiến độ tìm Name" value={progress.done+progress.skipped} max={progress.total}/>
      <small>{progress.done}/{progress.total} phần xong{progress.skipped > 0 && ' · '+progress.skipped+' bỏ qua'}</small>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    {skipped.length > 0 && <details>
      <summary>Xem phần đã bỏ qua</summary>
      <ul>{skipped.map(({part,message}) => <li key={part.id}>{partLabel(part.id)} · {message}</li>)}</ul>
    </details>}

    {rows.length > 0 ? <div className="name-discovery-results">
      <div className="name-discovery-filters">
        <div className="name-discovery-search">
          <input type="search" aria-label="Lọc Name đề xuất" placeholder="Tìm chữ Trung hoặc nghĩa Việt" value={query}
            onChange={event => setQuery(event.target.value)}/>
          {query && <button className="name-discovery-icon" type="button" aria-label="Xóa bộ lọc"
            onClick={event => { event.currentTarget.parentElement?.querySelector('input')?.focus(); setQuery(''); }}>×</button>}
        </div>
        <button aria-pressed={onlySelected} onClick={() => setOnlySelected(!onlySelected)}>Đã chọn ({selectedCount})</button>
      </div>
      <small aria-live="polite">{visible.length === rows.length ? rows.length : visible.length+'/'+rows.length} đề xuất · Mỗi chữ Trung chọn một nghĩa</small>
      {visible.length > 0 ? <div className="name-discovery-list">
        {visible.map(row => (
          <div className="name-discovery-row" data-selected={row.selected} key={row.id}>
            <label><input type="checkbox" disabled={saving} aria-label={'Chọn '+displayNameKey(row.key)} checked={row.selected}
              onChange={event => updateRow(row,{selected:event.target.checked})}/><span>{displayNameKey(row.key)}</span></label>
            <input aria-label={'Nghĩa '+displayNameKey(row.key)} value={row.value} maxLength={4096} disabled={saving}
              onChange={event => updateRow(row,{value:event.target.value})}/>
          </div>
        ))}
      </div> : <p>{onlySelected && !selectedCount ? 'Chưa chọn Name nào.' : 'Không có Name khớp bộ lọc.'}</p>}
      <div className="name-discovery-save">
        <button className="name-discovery-primary" disabled={busy || saving || !selectedCount} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu Name đã chọn'}
        </button>
        <small>{input.album ? 'Kho Name Album '+input.album : 'Kho Name riêng của truyện'}</small>
      </div>
      <details><summary>Danh sách $Name để sao chép</summary>
        <textarea aria-label="Danh sách Name đề xuất" readOnly rows={6} value={formatNameList(rows)}/>
      </details>
    </div> : <p>{scanned ? 'Chưa có đề xuất Name.' : 'Quét chương đang mở. Bạn duyệt đề xuất trước khi lưu.'}</p>}
    {Object.keys(reports).length > 0 && <details>
      <summary>Giải thích của AI</summary>
      {Object.entries(reports).map(([id,report]) => <details key={id}><summary>{partLabel(id)}</summary><pre>{report}</pre></details>)}
    </details>}
  </section>;
}
