/** A build-time selector only. Session credentials always belong to the server. */
export function ttsGateway(mode:unknown){return mode==='capcut-v2'?'/api/tts':'https://ottsy.weilbyte.dev/api/generation';}
export function capcutSessionFailure(code:unknown):string|undefined{
  if(code==='capcut_access_denied')return 'CapCut đang từ chối truy cập; cần kiểm tra quyền hoặc kết nối, chưa xác định là phiên hết hạn.';
  if(code==='capcut_session_expired')return 'Phiên CapCut hết hạn hoặc không được chấp nhận. Cần kết nối lại phiên CapCut trên server.';
  if(code==='capcut_not_configured'||code==='capcut_configuration_invalid')return 'Chưa kết nối phiên CapCut hợp lệ trên server.';
  if(code==='capcut_request_rejected')return 'CapCut chưa chấp nhận yêu cầu giọng đọc. Cần kiểm tra phiên và quyền sử dụng giọng trên server.';
  return undefined;
}
