export interface Part {
  title: string;
  text: string;
}

export interface SplitChapterPreview {
  order: number;
  title: string;
  charCount: number;
  snippet?: string;
}

// ─── REGEX BỘ NHẬN DIỆN CHƯƠNG ────────────────────────────────────────────────
// Hỗ trợ tiếng Việt và tiếng Anh (Chương 1, Hồi 2, Tiết 3, Tập 4, Phần 5, Mục 6, Chapter 1, Episode 1...)
export const REGEX_WESTERN_HEADING = /^\s*(?:(?:Chương|Chuong|Hồi|Hoi|Tiết|Tiet|Tập|Tap|Phần|Phan|Mục|Muc|Chapter|Episode|Part|Book|Volume)\s+[0-9零〇一二两兩三四五六七八九十百千万萬亿億ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ\.\-]+(?:\s|[:：.\-–—]|$))/iu;

// Hỗ trợ tiếng Trung tiêu chuẩn & truyện mạng (第X章/节/回/话/集/幕/期/关, 序章, 终章, 番外, v.v.)
// Chú ý: Không nhận standalone "卷" một mình để tránh chia nhầm Volume thành chương theo invariant cốt lõi
export const REGEX_CHINESE_HEADING = /^\s*((?:【(?=[^】]*[0-9])(?!\d+[\.\u3001\uff0e])[^】]{1,30}】|《(?=[^》]*[0-9])[^》]{1,30}》|[\uff08(]\s*[0-9]+\s*[)\uff09])(?:\uff08[0-9]+\uff09|\([0-9]+\))?|(?:第\s*[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ\.\-]+\s*[章節节回话話集季幕期关關]|(?:序章|序幕|序篇|序曲|序言|前言|引子|引言|楔子|终章|終章|终幕|终篇|终结|完结|大结局|番外|尾声|尾聲|后记|後記|附录|附錄|间章|間章|插曲|[上中下]篇|Prologue|Epilogue|Interlude))(?:[\s·\-\u2014:：]*(?:【[^】]{1,30}】|《[^》]{1,30}》|\[[^\]]{1,30}\]|[\uff08(][^)\uff09]{1,30}[)\uff09])|[\s·\-\u2014:：]+\S.*)?|章\s*[0-9零〇一二两兩三四五六七八九十百千万萬亿億\.\-]+|#\s*[0-9]+|#?\s*[0-9]+[\.\-:]?\s*$|#?\s*[0-9]+[\.\-:]?\s+(?![\u4e00-\u9fa5月天年日周时秒分前后号点层楼])|[iI][fF]\s*[\u4e00-\u9fa5][\u4e00-\u9fa5\w\s\-]{0,14}(?![\u4e00-\u9fa5\w]))/u;

// Nhận diện mốc số có dấu chấm/hai chấm: ví dụ "1. Tên chương" hoặc "12: Tên chương"
export const REGEX_NUMBER_DOT_TITLE = /^\s*(?:#\s*)?[0-9]{1,5}[\.、．：:](?!\d)\s*\S.{0,120}$/u;

// Nhận diện mốc số cách khoảng trắng: ví dụ "1 Tiêu đề"
export const REGEX_NUMBER_SPACE_TITLE = /^\s*(?:#\s*)?[0-9]{1,5}\s+[\u4e00-\u9fa5A-Za-z"“'‘【《\[\(].{0,120}$/u;
export const REGEX_NUMBER_EPISODE_TITLE = /^[0-9]{1,5}\s*[话話集](?=[。.：:\s<]|$)/u;
const episodeMarker = (title:string) => /^(?:第\s*)?([0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+)\s*[話话集]/u.exec(title);
const episodeKey = (number:string) => {
  const value = number.replace(/[０-９]/gu, c => String(c.charCodeAt(0) - 0xff10));
  return /^\d+$/u.test(value) ? String(Number(value)) : value;
};

// Nhận diện tiêu đề series / vòng mô phỏng
export const REGEX_SERIES_TITLE = /^[\u4e00-\u9fa5\w]{2,8}\d+[\s\u3000][\u4e00-\u9fa5]/u;
export const REGEX_SIMULATION_TITLE = /^\s*[—\-─]{0,6}\s*第[0-9零一二两三四五六七八九十百千万ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ.\-]+次(?:模拟|轮回|推演|演练|试炼|测试|实验|回放)(?:\s*[·•\-\u2014:：]?\s*(?:开始|开局|继续|结算|结束|完结|复盘|回放|序章|终章|最终章))?\s*[—\-─]{0,6}\s*$/u;

// Tiêu đề dính câu cuối của đoạn trước (embedded episode header)
export const REGEX_EMBEDDED_HEADING = /(?:^|[。！？.!?…」』）】\]"'”])\s*((?:第\s*[0-9０-９零〇一二两兩三四五六七八九十百千万萬]{1,12}\s*[章節节回话話集]|(?:Chương|Chuong|Chapter)\s+\d+))/iu;

export function isSkipHeading(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  // Numbered translator/resource notices are front matter, not chapter boundaries.
  if (/^\d+[.、．:：]\s*(?:由.{0,30}汉化|本小说|本资源|该小说仅供|这是全大陆|切勿传播)/u.test(s)) return true;
  if (/^第[零一二三四五六七八九十百千万0-9]+[节節](?:和|与|及|、)第[零一二三四五六七八九十百千万0-9]+[节節].*(?:手指|指骨)/u.test(s)) return true;
  if (/^IF\s+(?:场景|情景|条件|语句)(?:中|下|里|，|,|。)/iu.test(s)) return true;
  if (/^[\uff08(]\s*[0-9]+\s*[)\uff09]/.test(s) && s.length < 50) return true;
  if (/^\s*(?:#\s*)?(?:19|20)\d{2}[\.、．：:]/.test(s)) return true;
  if (/^\s*[0-9]{1,4}\s+(?:年|月|日|天|小时|分钟|秒|个|名|次|元|级|层|份|张|把|颗|块|瓶|条|枚|株|只|头|匹|件|套|组|包|箱|滴|两|斤|克|倍|成|分)/.test(s)) return true;
  if (/^第[0-9零一二两三四五六七八九十百千万.\-]+[夜天]\s*$/.test(s)) return true;
  if (/^第[0-9零一二两三四五六七八九十百千万.\-]+回合/.test(s)) return true;
  if (/^第[0-9零一二两三四五六七八九十百千万.\-]+节(?:课|下课|上课|课间)/.test(s)) return true;
  if (/^第[0-9零一二两三四五六七八九十百千万.\-]+层[^章节回话集\s]/.test(s)) return true;
  if (/^作者[\uff1a:]/i.test(s)) return true;
  if (/^--/.test(s)) return true;
  if (/^\[(?:uploadedimage|sxsy)/i.test(s)) return true;
  if (/^【\d+[\.\u3001\uff0e\s]/.test(s)) return true;
  if (/^【[^】]{0,12}[\uff1a:][^】]*】$/.test(s) && !/[第章节回话集]/.test(s)) return true;
  if (/^\[本帖/.test(s) || /^\[当前时间/.test(s)) return true;
  if (/\d{6,}\s*$/.test(s)) return true;
  if (/^【[^】]*(?:已到账|已获得|已领取|已解锁|已完成|已激活|已触发|系统|奖励|恭喜|提示|提醒|警告|通知|任务|成就|技能|属性|好感|孝心|积分|金币|银币|经验|体力|魅力|智力|声望|贡献|点数|升级|降级|扣除|增加|减少|获取|消耗|充值|签到|打卡|抽奖|宝箱|道具|装备|buff|debuff)[^】]*】\s*$/i.test(s)) return true;
  if (/^【[^】]*\d+\s*(?:点|个|次|元|级|层|份|张|把|颗|块|瓶|条|枚|株|只|头|匹|件|套|组|包|箱|滴|两|斤|克|倍|成|分)[^】]*】\s*$/.test(s)) return true;

  if (/^【[^】]*】\s*$/.test(s)) {
    if (/^【[^】]*。】\s*$/.test(s)) return true;
    if (/^【(?:由于|购买|总计|宿主|于是|次日|两人|就这样|可结果|如此|当|一夜|带着|您|第\d+天|第[一二三四五六七八九十]+天)/.test(s)) return true;
    if (/^【[^】]{1,8}\d*[\uff1a:]/.test(s)) return true;
    if (/(?:打赏了?\s*\d+|信用点|人气值|直播(?:间)?|录屏|私聊|主播之争|话不多说|礼物榜|榜一|热度值|在线人数)/.test(s)) return true;
    if (/^【获得/.test(s) || /降低|升高|值为|目前|当前/.test(s) || /[×+＋\-－−]\s*\d/.test(s) || /叮[！!]/.test(s) || /%/.test(s)) return true;
    if ((s.match(/！/g) || []).length >= 2 || /\d+[/／]\d+/.test(s) || /[Ll][Vv]\s*[\.\-:：]?\s*\d/.test(s)) return true;
    if (/(?:特效|触发|锁定|改写|覆盖|爆衣|爆裂|破衣)/.test(s)) return true;
  }
  if (/^【\d+\s*(?:号|[hH]ào)/.test(s)) return true;
  if (/^第[0-9零一二两三四五六七八九十百千万.\-]+[章节回话集](?:中(?:提|说|写|讲|述)|所(?:述|写|说|提|讲)|结束了|完毕|里(?:提|说|写))/.test(s)) return true;
  return false;
}

export function isStubHeading(line: string): boolean {
  const s = line.trim();
  return /^(?:#\s*[0-9]+|[0-9]+[\.\-:]?|(?:第\s*[0-9零〇一二两兩三四五六七八九十百千万萬亿億\.\-]+\s*[章節节回话話集]?)|(?:(?:Chương|Chuong|Chapter)\s+\d+[\.\-:]?))$/iu.test(s);
}

export function findEmbeddedHeading(line: string, episodeStyle = false,gluedChapterNumbers?:ReadonlySet<number>): { start: number; header: string;inferred?:boolean } | null {
  // A source credit may precede the first chapter (e.g. title @translator   第1集).
  const credit = /^.{1,100}@\S+\s{2,}(第\s*[0-9零〇一二三四五六七八九十百千万]+\s*[章話话集].*)$/u.exec(line.trimEnd());
  const numericEpisode = episodeStyle ? /[。！？.!?…」』）】\]"'”]\s+([0-9]{1,5}\s*[话話集][。.：:]\s*<)/u.exec(line) : null;
  const match = credit || REGEX_EMBEDDED_HEADING.exec(line) || numericEpisode;
  if (!match){
    if(!gluedChapterNumbers?.size)return null;
    const glued=/(第[ \t　]{0,4}([0-9０-９]{1,5})[ \t　]{0,4}章\S[^\r\n]{0,78})\s*$/u.exec(line);
    if(!glued||glued.index===0||glued[1].trim().length>80)return null;
    const number=Number(glued[2].replace(/[０-９]/gu,c=>String(c.charCodeAt(0)-0xff10)));
    const before=line.slice(0,glued.index).trimEnd();
    if(!gluedChapterNumbers.has(number)||/(?:翻到|读到|讀到|看到|提到|说起|說起|读完|讀完|写到|寫到|参考|參考|关于|關於|例如|比如)\s*$/u.test(before)||/[。；;]$/u.test(glued[1].trim())||!isHeading(glued[1]))return null;
    return {start:glued.index,header:glued[1].trim(),inferred:true};
  }
  const start = match.index + match[0].length - match[1].length;
  if(start===0)return null;
  const candidate = line.slice(start).trim();
  if (isHeading(candidate)) {
    return { start, header: candidate };
  }
  return null;
}

export function isHeading(line: string, custom?: RegExp): boolean {
  const raw = line.trim();
  if (!raw || raw.length > 180) return false;
  if (custom) return custom.test(raw);
  const wrapped = /^#{2,6}\s*(.+?)\s*#{2,6}$/u.exec(raw);
  const s = wrapped ? wrapped[1] : raw;
  if (!s || s.length > 180) return false;
  if (isSkipHeading(s)) return false;

  return (
    REGEX_WESTERN_HEADING.test(s) ||
    REGEX_CHINESE_HEADING.test(s) ||
    REGEX_NUMBER_DOT_TITLE.test(s) ||
    REGEX_NUMBER_SPACE_TITLE.test(s) ||
    REGEX_NUMBER_EPISODE_TITLE.test(s) ||
    REGEX_SERIES_TITLE.test(s) ||
    REGEX_SIMULATION_TITLE.test(s)
  );
}

/** Bounded working buffer, lossless over BOM/CRLF-normalized text. Long chapters become labelled parts. */
export class StreamingSplitter {
  inferredHeadings=0;
  private tail = '';
  private current = '';
  private title: string;
  private part = 1;
  private cr = false;
  private first = true;
  private continuedLine = false;
  private effectiveMax: number;
  private heading = '';
  private strongHeadingSeen = false;
  private episodeStyle = false;
  private episodeNumber = '';

  constructor(
    title: string,
    private emit: (part: Part) => void,
    private regex?: RegExp,
    private max = 64000,
    private detect = true,
    private gluedChapterNumbers?:ReadonlySet<number>
  ) {
    if (max !== 0 && (!Number.isInteger(max) || max < 2 || max>128000)) {
      throw new Error('Giới hạn chương phải từ 2 đến 128.000 ký tự hoặc bằng 0 (giữ nguyên chương trong giới hạn an toàn).');
    }
    // Backup/cloud v1 both require <=128000 UTF-16 units per chapter.
    this.effectiveMax = max === 0 ? 128000 : max;
    this.title = title;
  }

  private flush() {
    if (this.current.length) {
      this.emit({
        title: this.title + (this.part > 1 ? ` · phần ${this.part}` : ''),
        text: this.current
      });
      this.current = '';
      this.part++;
    }
  }

  private append(s: string) {
    const high = (code: number) => code >= 0xd800 && code <= 0xdbff;
    const low = (code: number) => code >= 0xdc00 && code <= 0xdfff;
    while (s.length) {
      const room = this.effectiveMax - this.current.length;
      if (!room) {
        // A huge-line chunk can end between the two units of an astral character.
        if (high(this.current.charCodeAt(this.current.length - 1)) && low(s.charCodeAt(0))) {
          const pending = this.current.slice(-1);
          this.current = this.current.slice(0, -1);
          this.flush();
          s = pending + s;
        } else {
          this.flush();
        }
        continue;
      }
      let count = Math.min(room, s.length);
      if (count < s.length && high(s.charCodeAt(count - 1)) && low(s.charCodeAt(count))) {
        count--;
      }
      if (!count) {
        this.flush();
        continue;
      }
      this.current += s.slice(0, count);
      s = s.slice(count);
      if (this.current.length === this.effectiveMax && !high(this.current.charCodeAt(this.current.length - 1))) {
        this.flush();
      }
    }
  }

  private line(s: string) {
    if (!this.continuedLine && this.detect) {
      // Bare subsection counters in a chapter must stay in its body. Numeric-only
      // books still work before an explicit chapter style has been established.
      const headingLine = !this.regex ? s.trim().replace(/^#{2,6}\s*(.+?)\s*#{2,6}$/u, '$1') : s.trim();
      const numberedEpisode = episodeMarker(headingLine);
      const damagedCandidate = /^([0-9]+)\s+\?[.。]?$/u.exec(headingLine);
      const damagedEpisode = this.episodeStyle && damagedCandidate && Number(damagedCandidate[1]) === Number(this.episodeNumber) + 1 ? damagedCandidate : null;
      // A damaged source heading such as "332 ?." is usable only as the next
      // number in an established episode sequence; keep its original label.
      const episode = numberedEpisode || damagedEpisode;
      const counter = !this.regex && (damagedCandidate && !damagedEpisode || this.strongHeadingSeen && /^\d+[.\-:]?$/u.test(headingLine)
        || this.episodeStyle && !episode && /^#?\s*\d+(?:[.、．:：]|\s)/u.test(headingLine));
      if (!counter && isHeading(s, this.regex)) {
        const trimmed = s.trim();
        const title = !this.regex ? trimmed.replace(/^#{2,6}\s*(.+?)\s*#{2,6}$/u, '$1') : trimmed;
        const canonical = (value:string) => value.trim().replace(/^#{2,6}\s*(.+?)\s*#{2,6}$/u, '$1').replace(/\s+/gu, '');
        const currentHeadingOnly = canonical(this.current) === canonical(this.heading);
        const duplicateSpacing = canonical(title) === canonical(this.heading) && currentHeadingOnly;
        // Duplicate markers remain in the text, but never become phantom chapters.
        const stubPrefix=this.heading&&isStubHeading(this.heading)&&title.startsWith(this.heading)&&/^[\s:：.\-–—]/u.test(title.slice(this.heading.length));
        const repeatedEpisode = !this.regex && episode && this.episodeStyle && episodeKey(episode[1]) === this.episodeNumber;
        if(title===this.heading||duplicateSpacing||repeatedEpisode||(stubPrefix&&currentHeadingOnly)){
          if(stubPrefix){this.title=title;this.heading=title;}
          this.append(s);return;
        }
        this.flush();
        this.title = title;
        this.heading = title;
        if (!this.regex && episode) { this.episodeStyle = true; this.strongHeadingSeen = true; this.episodeNumber = episodeKey(episode[1]); }
        else if (!this.regex && (REGEX_WESTERN_HEADING.test(title) || /^第\s*[^\s]{1,20}\s*[章節节回]/u.test(title))) {
          this.episodeStyle = false; this.episodeNumber = '';
          if (/^(?:Book|Volume|Part|Phần|Phan)\s/iu.test(title)) this.strongHeadingSeen = false;
        }
        if (/^(?:第\s*[^\s]{1,20}\s*[章節节回话話集]|(?:Chương|Chuong|Chapter|Hồi|Hoi|Tiết|Tiet|Tập|Tap|Episode)\s+\d)/iu.test(title)) this.strongHeadingSeen = true;
        this.part = 1;
      } else {
        // Kiểm tra tiêu đề dính câu cuối của đoạn trước
        // Once a physical line exceeds the retained window it cannot be scanned
        // reliably across feeds. Apply the same policy to full-line input.
        const embedded = this.regex || s.length>Math.max(180,this.effectiveMax) ? null : findEmbeddedHeading(s, this.episodeStyle,this.gluedChapterNumbers);
        if (embedded && embedded.start > 0) {
          if(embedded.inferred)this.inferredHeadings++;
          const before = s.slice(0, embedded.start);
          const after = s.slice(embedded.start);
          this.append(before);
          this.flush();
          const trimmedAfter = after.trim();
          this.title = trimmedAfter;
          this.heading = trimmedAfter;
          this.strongHeadingSeen = true;
          const embeddedEpisode = episodeMarker(trimmedAfter);
          this.episodeStyle = !!embeddedEpisode;
          this.episodeNumber = embeddedEpisode ? episodeKey(embeddedEpisode[1]) : '';
          this.part = 1;
          this.append(after);
          this.continuedLine = false;
          return;
        }
      }
    }
    this.append(s);
    this.continuedLine = false;
  }

  feed(text: string, done = false) {
    if (this.first && text.length) {
      text = text.replace(/^\uFEFF/, '');
      this.first = false;
    }
    if (this.cr) {
      text = '\r' + text;
      this.cr = false;
    }
    if (!done && text.endsWith('\r')) {
      text = text.slice(0, -1);
      this.cr = true;
    }
    this.tail += text.replace(/\r\n?/g, '\n');
    let pos: number;
    while ((pos = this.tail.indexOf('\n')) >= 0) {
      this.line(this.tail.slice(0, pos + 1));
      this.tail = this.tail.slice(pos + 1);
    }
    // Huge lines cannot be headings; retain only a bounded tail.
    while (this.tail.length > Math.max(180,this.effectiveMax)) {
      this.append(this.tail.slice(0, this.effectiveMax));
      this.tail = this.tail.slice(this.effectiveMax);
      this.continuedLine = true;
    }
    if (done) {
      if (this.tail) this.line(this.tail);
      this.tail = '';
      this.flush();
    }
  }
}

export function previewChapters(
  text: string,
  options: { maxChars?: number; pattern?: string; title?: string } = {}
): SplitChapterPreview[] {
  const parts: Part[] = [];
  const regex = options.pattern ? new RegExp(options.pattern, 'iu') : undefined;
  const splitter = new StreamingSplitter(
    options.title || 'Truyện',
    p => parts.push(p),
    regex,
    options.maxChars ?? 64000,
    true
  );
  splitter.feed(text, true);
  return parts.map((p, idx) => ({
    order: idx + 1,
    title: p.title,
    charCount: p.text.length,
    snippet: p.text.slice(0, 100).replace(/\s+/g, ' ').trim()
  }));
}
