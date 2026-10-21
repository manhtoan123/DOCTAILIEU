/** Client for the editable Gemini key pool. The server only ever returns masked values. */
export interface AiKeyRow { id: string; label: string; masked: string; createdAt: number; source?:string; selected?:boolean; status?:string; lastUsedAt?:number; httpStatus?:number; cooldownUntil?:number; model?:string }
export interface AiKeyList { keys: AiKeyRow[]; stored: number; secretPool: number; active: number; added?: number; rejected?: number; removed?: boolean; excluded?:number }

const MESSAGES: Record<string, string> = {
  keys_not_configured: 'Máy chủ chưa bật kho key (thiếu bảng D1).',
  method_not_allowed: 'Yêu cầu không hợp lệ.',
  too_many_requests: 'Bạn thao tác quá nhanh; chờ vài phút rồi thử lại.',
  invalid_id: 'Key này không còn tồn tại.',
  invalid_json: 'Dữ liệu gửi lên không hợp lệ.',
  no_keys: 'Chưa dán key nào.',
  invalid_key: 'Không có key Gemini hợp lệ (key phải bắt đầu bằng AIza).',
  keys_full: 'Kho đã đầy (tối đa 50 key).',
  request_too_large: 'Dữ liệu quá lớn.',
};

function normalize(data: Record<string, unknown>): AiKeyList {
  const rows = Array.isArray(data.keys) ? data.keys : [];
  const keys = rows.flatMap(value => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return typeof row.id === 'string' && typeof row.masked === 'string'
      ? [{ id: row.id, label: typeof row.label === 'string' ? row.label : '', masked: row.masked, createdAt: Number(row.createdAt) || 0,source:typeof row.source==='string'?row.source:'stored',selected:row.selected!==false,status:typeof row.status==='string'?row.status:'ready',lastUsedAt:Number(row.lastUsedAt)||0,httpStatus:Number(row.httpStatus)||0,cooldownUntil:Number(row.cooldownUntil)||0,model:typeof row.model==='string'?row.model:'' }]
      : [];
  });
  const count = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  return {
    keys,
    stored: count(data.stored),
    secretPool: count(data.secretPool),
    active: count(data.active),excluded:count(data.excluded),
    added: count(data.added),
    rejected: count(data.rejected),
    removed: data.removed === true,
  };
}

async function send(path: string, init?: RequestInit, signal?: AbortSignal): Promise<AiKeyList> {
  let response: Response;
  try { response = await fetch(path, { ...init, signal }); }
  catch { throw new Error('Không kết nối được máy chủ.'); }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error('Máy chủ trả lời không hợp lệ.'); }
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (!response.ok) {
    const code = typeof record.error === 'string' ? record.error : '';
    throw new Error(MESSAGES[code] ?? `Không thực hiện được (${code || response.status}).`);
  }
  return normalize(record);
}

export function listAiKeys(signal?: AbortSignal): Promise<AiKeyList> { return send('/api/ai/keys', undefined, signal); }
export function addAiKeys(text: string, signal?: AbortSignal): Promise<AiKeyList> {
  return send('/api/ai/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, signal);
}
export function deleteAiKey(id: string, signal?: AbortSignal): Promise<AiKeyList> {
  return send('/api/ai/keys?id=' + encodeURIComponent(id), { method: 'DELETE' }, signal);
}
