import {deleteBook} from '../../../core/db';
import type {Book} from '../../../core/domain';
import {clearBookAiReadingCache} from '../../ai/services/ai-reading-cache';
import {clearTtsCursor} from '../../tts/services/tts-cursor';
/**
 * Xóa truyện khỏi thư viện: dọn kèm cache bản dịch AI và cursor nghe local của truyện đó.
 * Cache/cursor của truyện đã xóa không còn đường đọc (source guard) nhưng vẫn chiếm quota
 * và localStorage, nên dọn ngay thay vì chờ LRU. Các đường rollback nhập/khôi phục giữ
 * deleteBook trực tiếp vì bản staging chưa từng publish bản dịch hoặc cursor.
 */
export async function removeBookWithLocalData(id:string,guard?:(book:Book|undefined)=>void|Promise<void>){
  if(guard)await deleteBook(id,guard);else await deleteBook(id);
  clearTtsCursor(id);
  await clearBookAiReadingCache(id);
}
