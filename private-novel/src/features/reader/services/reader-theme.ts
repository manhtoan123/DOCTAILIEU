import {db} from '../../../core/db';
import {defaults,type ReaderSettings} from '../../../core/domain';
import type {UiTheme} from '../../../shared/ui-theme';
import {queueAiSettings} from '../../ai/services/ai-reading';

/** Share the existing reader preference and lock; never save a stale settings snapshot. */
export function setReaderTheme(theme:UiTheme):Promise<unknown>{
  if(!['light','sepia','dark'].includes(theme))return Promise.reject(new Error('Màu giao diện không hợp lệ.'));
  return queueAiSettings('reader',()=>db.transaction('rw',db.settings,async()=>{
    const current=(await db.settings.get('reader'))?.value as Partial<ReaderSettings>|undefined;
    return db.settings.put({key:'reader',value:{...defaults,...current,theme,background:'',textColor:''}});
  }));
}
