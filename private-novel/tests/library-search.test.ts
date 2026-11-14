import {describe,it,expect,vi} from 'vitest';
import type {NameEntry} from '../src/core/domain';

vi.mock('../src/features/names-convert/services/title-converter',()=>({convertBatchTitles:vi.fn(async(titles:string[],names:NameEntry[])=>titles.map(title=>names.find(name=>name.key===title)?.value||({'初见':'Lần đầu gặp','山门':'Sơn môn'}[title]||title)))}));
import {searchChapterTitles,searchFuzzyLibraryBooks,type SearchChapter,type FuzzyLibraryBook} from '../src/features/library/services/library-search';
import {convertBatchTitles} from '../src/features/names-convert/services/title-converter';

const chapters:SearchChapter[]=[
  {id:'later',bookId:'one',order:1,title:'山门',displayTitle:'Sơn môn'},
  {id:'first',bookId:'one',order:0,title:'初见'},
  {id:'other',bookId:'two',order:0,title:'序言',displayTitle:'Lời mở đầu'},
];

describe('library chapter search',()=>{
  it('finds original Chinese, persisted Vietnamese and converted legacy titles without changing metadata',async()=>{
    const before=JSON.stringify(chapters);
    for(const query of ['初见','LAN DAU GAP'])expect((await searchChapterTitles(chapters,query,new Map(),new AbortController().signal)).one).toEqual({chapterId:'first',title:'初见',displayTitle:'Lần đầu gặp',count:1});
    expect((await searchChapterTitles(chapters,'son mon',new Map(),new AbortController().signal)).one.chapterId).toBe('later');
    expect((await searchChapterTitles(chapters,'loi mo dau',new Map(),new AbortController().signal)).two.chapterId).toBe('other');
    expect(JSON.stringify(chapters)).toBe(before);
  });

  it('uses per-book Names while keeping both the original and persisted title searchable',async()=>{
    const names=new Map([['one',[{id:'name',bookId:'one',key:'山门',value:'Cổng Mới'}]]]);
    for(const query of ['cong moi','山门','son mon'])expect((await searchChapterTitles(chapters,query,names,new AbortController().signal)).one.displayTitle).toBe('Cổng Mới');
    const matches=await searchChapterTitles(chapters,'m',new Map(),new AbortController().signal);
    expect(matches.one).toMatchObject({chapterId:'later',count:1});
  });

  it('counts matches in chapter order and stops a cancelled conversion before returning results',async()=>{
    const matches=await searchChapterTitles([{...chapters[0],displayTitle:'Lần đầu gặp sau'},chapters[1]],'lan dau gap',new Map(),new AbortController().signal);
    expect(matches.one).toMatchObject({chapterId:'first',count:2});
    const controller=new AbortController();
    vi.mocked(convertBatchTitles).mockImplementationOnce(async titles=>{controller.abort();return titles;});
    await expect(searchChapterTitles(chapters,'初见',new Map(),controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
});

describe('fuzzy library metadata search',()=>{
  const books:FuzzyLibraryBook[]=[
    {bookId:'vi-title',title:'Lâm Viễn Trở Về',convertedTitle:'Lâm Viễn Trở Về',author:'Người Khác',album:''},
    {bookId:'zh-title',title:'重生之我是大佬',convertedTitle:'Ta Là Đại Lão',author:'Mộ Dung Liễu',album:'Tác giả/Huyền Huyễn'},
    {bookId:'author-hit',title:'Một Truyện Khác',convertedTitle:'',author:'Lâm Viễn Trở Về',album:''},
  ];

  it('matches Vietnamese typos across normalized title, author and Album fields',async()=>{
    expect((await searchFuzzyLibraryBooks(books,'lam vien tro vef')).map(hit=>hit.bookId)).toEqual(['vi-title','author-hit']);
    expect((await searchFuzzyLibraryBooks(books,'mo dung liue')).map(hit=>hit.bookId)).toEqual(['zh-title']);
    expect((await searchFuzzyLibraryBooks(books,'huyen huyehn')).map(hit=>hit.bookId)).toEqual(['zh-title']);
  });

  it('matches a typo in the raw CJK title while keeping the query separate from chapter text',async()=>{
    expect((await searchFuzzyLibraryBooks(books,'重生之我是不佬')).map(hit=>hit.bookId)).toEqual(['zh-title']);
  });

  it('does not fuzz short queries or unrelated strings',async()=>{
    expect(await searchFuzzyLibraryBooks(books,'la')).toEqual([]);
    expect(await searchFuzzyLibraryBooks(books,'xyz')).toEqual([]);
    expect(await searchFuzzyLibraryBooks(books,'x'.repeat(65))).toEqual([]);
  });
});