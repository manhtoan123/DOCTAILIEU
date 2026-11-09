import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from '../src/core/db';
import {defaults} from '../src/core/domain';
import {queueAiSettings} from '../src/features/ai/services/ai-reading';
import {setReaderTheme} from '../src/features/reader/services/reader-theme';
import {applyUiTheme,bootstrapUiTheme,cachedUiTheme,normalizeUiTheme,type UiTheme} from '../src/shared/ui-theme';

beforeEach(async()=>{
  await Promise.all([db.settings.clear(),db.books.clear(),db.chapters.clear(),db.progress.clear()]);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('independent UI theme preference regressions',()=>{
  it('changes only preset and custom colors while keeping reader extensions and unrelated data',async()=>{
    const reader={...defaults,theme:'gray',background:'#102030',textColor:'#abcdef',voiceId:'custom-voice',ttsRate:1.7,font:'palatino',fontSize:26,libraryBackground:{sha256:'a'.repeat(64),bytes:123,mime:'image/png'},futureReaderOption:{enabled:true,items:['kept']}};
    await db.settings.bulkPut([{key:'reader',value:reader},{key:'ai-book-settings:synthetic',value:{custom:'kept'}},{key:'tts-cursor:synthetic',value:{offset:42,audioTime:9}}]);
    await db.books.put({id:'synthetic',title:'Synthetic',author:'Synthetic',createdAt:1,updatedAt:2,status:'ready',chapterCount:1,charCount:4});
    await db.chapters.put({id:'chapter',bookId:'synthetic',order:1,title:'Chapter',text:'Text',revision:3,sourceId:'synthetic-source'});
    await db.progress.put({bookId:'synthetic',chapterId:'chapter',paragraph:2,offset:5,revision:3,updatedAt:6});
    const before=await Promise.all([db.books.toArray(),db.chapters.toArray(),db.progress.toArray()]);
    await setReaderTheme('light');
    expect((await db.settings.get('reader'))?.value).toEqual({...reader,theme:'light',background:'',textColor:''});
    expect(await Promise.all([db.books.toArray(),db.chapters.toArray(),db.progress.toArray()])).toEqual(before);
    expect(await db.settings.where('key').notEqual('reader').toArray()).toEqual([{key:'ai-book-settings:synthetic',value:{custom:'kept'}},{key:'tts-cursor:synthetic',value:{offset:42,audioTime:9}}]);
  });

  it('waits for the shared reader queue and reads settings after the preceding writer finishes',async()=>{
    await db.settings.put({key:'reader',value:{...defaults,voiceId:'before',libraryBackground:null}});
    let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    const preceding=queueAiSettings('reader',async()=>{
      entered();await gate;
      return db.transaction('rw',db.settings,async()=>{
        const current=(await db.settings.get('reader'))?.value as object;
        await db.settings.put({key:'reader',value:{...current,voiceId:'latest',ttsRate:2.2,futureReaderOption:'latest',libraryBackground:{sha256:'b'.repeat(64),bytes:321,mime:'image/webp'}}});
      });
    });
    await started;
    const put=vi.spyOn(db.settings,'put');
    const theme=setReaderTheme('dark');
    await Promise.resolve();await Promise.resolve();
    const writesBeforeRelease=put.mock.calls.length;
    release();await Promise.all([preceding,theme]);
    expect(writesBeforeRelease).toBe(0);
    expect((await db.settings.get('reader'))?.value).toMatchObject({theme:'dark',voiceId:'latest',ttsRate:2.2,futureReaderOption:'latest',libraryBackground:{sha256:'b'.repeat(64)}});
  });

  it('rejects malformed or legacy-only choices before starting any write',async()=>{
    const reader={...defaults,theme:'gray'};
    await db.settings.put({key:'reader',value:reader});
    const put=vi.spyOn(db.settings,'put'),transaction=vi.spyOn(db,'transaction');
    for(const invalid of ['gray','LIGHT','',undefined,null,{},['light'],0])await expect(setReaderTheme(invalid as UiTheme)).rejects.toThrow('không hợp lệ');
    expect(put).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
    expect((await db.settings.get('reader'))?.value).toEqual(reader);
  });

  it('leaves the previous choice intact on commit failure and releases the reader queue',async()=>{
    const reader={...defaults,theme:'gray',background:'#123456',voiceId:'kept'};
    await db.settings.put({key:'reader',value:reader});
    vi.spyOn(db.settings,'put').mockImplementationOnce(()=>{throw new Error('synthetic write failure');});
    await expect(setReaderTheme('dark')).rejects.toThrow('synthetic write failure');
    expect((await db.settings.get('reader'))?.value).toEqual(reader);
    await setReaderTheme('sepia');
    expect((await db.settings.get('reader'))?.value).toEqual({...reader,theme:'sepia',background:'',textColor:''});
  });

  it('creates valid defaults when the reader preference does not exist',async()=>{
    await setReaderTheme('dark');
    expect(await db.settings.toArray()).toEqual([{key:'reader',value:{...defaults,theme:'dark',background:'',textColor:''}}]);
  });

  it('renders a legacy gray choice as dark without rewriting the saved reader preference',async()=>{
    const reader={...defaults,theme:'gray',background:'#314159',textColor:'#eeeeee'};
    await db.settings.put({key:'reader',value:reader});
    const cache=new Map([['reader-ui-theme','gray']]),dataset:Record<string,string>={};
    vi.stubGlobal('document',{documentElement:{dataset}});
    vi.stubGlobal('localStorage',{getItem:(key:string)=>cache.get(key)??null,setItem:(key:string,value:string)=>cache.set(key,value)});
    const put=vi.spyOn(db.settings,'put');
    bootstrapUiTheme();
    expect(dataset.uiTheme).toBe('dark');expect(cachedUiTheme()).toBe('dark');
    applyUiTheme(normalizeUiTheme(reader.theme));
    expect(put).not.toHaveBeenCalled();expect((await db.settings.get('reader'))?.value).toEqual(reader);
  });

  it('still applies the DOM preference when localStorage is unavailable',()=>{
    const dataset:Record<string,string>={};
    vi.stubGlobal('document',{documentElement:{dataset}});
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('disabled');},setItem:()=>{throw Error('disabled');}});
    expect(cachedUiTheme()).toBe('sepia');
    expect(()=>applyUiTheme('dark')).not.toThrow();expect(dataset.uiTheme).toBe('dark');
  });
});
