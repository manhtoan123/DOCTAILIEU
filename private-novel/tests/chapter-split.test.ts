import {describe,it,expect} from 'vitest';
import {StreamingSplitter,previewChapters,isHeading,isSkipHeading,type Part} from '../src/features/import-export/services/splitter';

describe('mandatory chapter boundary integrity',()=>{
  it.each([1,2,3,7,64,262144])('preserves Chinese headings, long unheaded text and astral characters with feed size %s',chunk=>{
    const source='序章\r\n前文🙂\r\n第1章 起点\n'+'文🙂'.repeat(50000)+'\n第2章 终点\n完成';
    const parts:Part[]=[];const splitter=new StreamingSplitter('原文',part=>parts.push(part));
    for(let pos=0;pos<source.length;pos+=chunk)splitter.feed(source.slice(pos,pos+chunk));
    splitter.feed('',true);
    expect(parts.map(part=>part.text).join('')).toBe(source.replace(/\r\n?/g,'\n'));
    expect(parts.every(part=>part.text.length<=64000&&!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(part.text))).toBe(true);
    expect(parts.at(-1)?.title).toBe('第2章 终点');
  });
  it('can move an astral character across a nearly-full small part without losing data or hanging',()=>{
    const parts:Part[]=[];const splitter=new StreamingSplitter('Text',part=>parts.push(part),undefined,2);
    splitter.feed('a🙂🙂z',true);
    expect(parts.map(part=>part.text).join('')).toBe('a🙂🙂z');
    expect(parts.every(part=>part.text.length<=2&&!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(part.text))).toBe(true);
  });
});

describe('extended chapter splitting logic & controls',()=>{
  it('keeps zero-limit imports portable with the existing 128000-unit cloud/backup contract',()=>{
    const source='Chương 1: Dài\n'+'文🙂'.repeat(100000);
    const parts:Part[]=[];const splitter=new StreamingSplitter('Text',p=>parts.push(p),undefined,0);
    splitter.feed(source,true);
    expect(parts.every(p=>p.text.length<=128000)).toBe(true);
    expect(parts.map(p=>p.text).join('')).toBe(source);
    expect(parts).toHaveLength(3);
    expect(()=>new StreamingSplitter('Text',()=>{},undefined,128001)).toThrow();
  });
  it('uses only the explicit custom regex for embedded text',()=>{
    const parts:Part[]=[];const source='正文。第2章 标题\n正文';
    const splitter=new StreamingSplitter('Text',p=>parts.push(p),/^ONLY$/iu,0);
    splitter.feed(source,true);expect(parts).toHaveLength(1);expect(parts[0].text).toBe(source);
  });
  it.each([2,8,100,180,4000])('keeps headings independent of feed size even with limit %s',max=>{
    const source='prefix\nChương 1: heading\nbody\n第2章 标题\nend';
    const split=(chunk:number)=>{const parts:Part[]=[];const s=new StreamingSplitter('Text',p=>parts.push(p),undefined,max);for(let at=0;at<source.length;at+=chunk)s.feed(source.slice(at,at+chunk));s.feed('',true);return parts;};
    expect(split(1)).toEqual(split(source.length));
    expect(split(1).map(p=>p.text).join('')).toBe(source);
  });
  it('merges repeated markers and adjacent numbered stubs without deleting or reordering text',()=>{
    const source='第1章\n第1章 标题\n正文\n第1章 标题\n重复正文\n第2章 结尾\n尾';
    const parts:Part[]=[];const s=new StreamingSplitter('Text',p=>parts.push(p),undefined,0);s.feed(source,true);
    expect(parts.map(p=>p.title)).toEqual(['第1章 标题','第2章 结尾']);
    expect(parts.map(p=>p.text).join('')).toBe(source);
  });
  it('applies the same embedded-heading policy to huge lines regardless of feed size',()=>{
    const source='x'.repeat(4500)+'。第2章 标题\n正文';
    const split=(chunk:number)=>{const p:Part[]=[];const s=new StreamingSplitter('Text',r=>p.push(r),undefined,4000);for(let at=0;at<source.length;at+=chunk)s.feed(source.slice(at,at+chunk));s.feed('',true);return p;};
    expect(split(100)).toEqual(split(source.length));expect(split(100).map(p=>p.text).join('')).toBe(source);
  });
  it('keeps whole chapters without creating parts when max is 0 (KEEP_WHOLE_CHAPTERS)',()=>{
    const source='Chương 1: Mở đầu\n'+'Nội dung dài '.repeat(9000)+'\nChương 2: Tiếp theo\nKết thúc.';
    const parts:Part[]=[];
    const splitter=new StreamingSplitter('Truyện',part=>parts.push(part),undefined,0);
    splitter.feed(source,true);
    expect(parts).toHaveLength(2);
    expect(parts[0].title).toBe('Chương 1: Mở đầu');
    expect(parts[0].text.length).toBeGreaterThan(100000);
    expect(parts[0].title).not.toContain('· phần');
    expect(parts[1].title).toBe('Chương 2: Tiếp theo');
  });

  it('splits into parts when exceeding custom max limit (e.g. 4000 chars)',()=>{
    const source='Chương 1: Khởi hành\n'+'Một đoạn văn bản dài '.repeat(500)+'\nChương 2: Đích đến\nNgắn.';
    const parts:Part[]=[];
    const splitter=new StreamingSplitter('Truyện',part=>parts.push(part),undefined,4000);
    splitter.feed(source,true);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0].title).toBe('Chương 1: Khởi hành');
    expect(parts[1].title).toBe('Chương 1: Khởi hành · phần 2');
    expect(parts.at(-1)?.title).toBe('Chương 2: Đích đến');
  });

  it('recognizes Vietnamese and English chapter heading variations',()=>{
    const headings=[
      'Chương 1: Khởi đầu mới',
      'Chuong 2 - Tiến bước',
      'Hồi 3: Trận chiến lớn',
      'Tiết 4: Bí mật',
      'Tập 5: Thử thách',
      'Phần 6: Kết thúc',
      'Chapter 7: The Journey',
      'Episode 8: The Return'
    ];
    for(const h of headings){
      expect(isHeading(h)).toBe(true);
    }
  });

  it('recognizes Chinese chapter headings and special markers',()=>{
    const headings=[
      '第100话 觉醒',
      '第5集 开始',
      '第12回 聚会',
      '第1幕 序曲',
      '序章',
      '大结局',
      '番外篇',
      '间章',
      '尾声',
      '后记',
      '1. Mở đầu',
      '# 12 Khởi hành'
    ];
    for(const h of headings){
      expect(isHeading(h)).toBe(true);
    }
  });

  it('filters out system prompt noise, quantities and dates',()=>{
    const noiseLines=[
      '【恭喜宿主获得神级天赋】',
      '【系统提示：任务完成】',
      '【打赏了 100 阅币】',
      '【已获得技能：飞剑术】',
      '【LV.10 升级成功】',
      '2024.10.15',
      '100 个',
      '50 元',
      '第1天',
      '第2回合',
      '作者：Trần Nam'
    ];
    for(const line of noiseLines){
      expect(isSkipHeading(line)).toBe(true);
      expect(isHeading(line)).toBe(false);
    }
  });

  it('splits chapter when heading is embedded in sentence after punctuation',()=>{
    const source='Đoạn kết thúc trước đó。第2章 Tiêu đề mới\nNội dung chương 2.';
    const parts:Part[]=[];
    const splitter=new StreamingSplitter('Gốc',p=>parts.push(p),undefined,0);
    splitter.feed(source,true);
    expect(parts).toHaveLength(2);
    expect(parts[0].text).toContain('Đoạn kết thúc trước đó。');
    expect(parts[1].title).toBe('第2章 Tiêu đề mới');
    expect(parts[1].text).toContain('Nội dung chương 2.');
  });

  it('previewChapters returns accurate chapter count and titles',()=>{
    const source='Lời tựa\r\nChương 1: Bắt đầu\r\nNội dung 1\r\nChương 2: Tiếp tục\r\nNội dung 2';
    const preview=previewChapters(source,{maxChars:0});
    expect(preview).toHaveLength(3);
    expect(preview[0].title).toBe('Truyện');
    expect(preview[1].title).toBe('Chương 1: Bắt đầu');
    expect(preview[2].title).toBe('Chương 2: Tiếp tục');
    expect(preview.reduce((sum,p)=>sum+p.charCount,0)).toBe(source.replace(/\r\n?/g,'\n').length);
  });
});
