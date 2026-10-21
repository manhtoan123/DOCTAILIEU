import {chromium} from '@playwright/test';
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const outDir = resolve('.dsh-tmp/tts-p0');
mkdirSync(outDir, {recursive: true});

// Test fixtures with synthetic Vietnamese sentences
const fixtures = [
  // 1. Short dialogue (5-30 chars)
  {
    category: 'short_dialogue',
    name: 'Câu thoại ngắn',
    sentences: [
      'Được.',
      'Nàng đi đâu?',
      'Ta đi dạo quanh đây.',
      'Có mệt không?',
      'Không sao cả.',
      'Vậy chúng ta cùng đi nhé.'
    ]
  },
  // 2. Medium narrative (40-80 chars)
  {
    category: 'medium_narrative',
    name: 'Câu trần thuật vừa',
    sentences: [
      'Trong buổi sáng yên tĩnh, người đọc đi qua khu vườn xanh mát.',
      'Những giọt sương mai vẫn còn đọng lại trên từng phiến lá non.',
      'Cơn gió thoảng đưa hương hoa ngọc lan bay qua khung cửa sổ.',
      'Tiếng chim ríu rít chuyền cành làm cho không gian thêm sinh động.'
    ]
  },
  // 3. Long descriptive (100-180 chars)
  {
    category: 'long_descriptive',
    name: 'Câu miêu tả dài',
    sentences: [
      'Khi trở về căn nhà nhỏ nơi bìa rừng, mọi người cùng nhau chuẩn bị một bữa cơm chiều giản dị và ấm cúng sau một ngày dài làm việc vất vả ngoài đồng.',
      'Ánh hoàng hôn buông dần xuống thung lũng xa xa, nhuộm đỏ cả một khoảng trời phía tây trước khi những ngôi sao đầu tiên bắt đầu lấp lánh xuất hiện.',
      'Người khách lạ dừng bước trước cổng làng cổ kính, ngắm nhìn cây đa trăm tuổi và hỏi thăm đường đến ngôi chùa cổ nằm trên đỉnh ngọn đồi phía bắc.'
    ]
  }
];

async function run() {
  console.log('--- BẮT ĐẦU ĐO ĐẠC P0 TTS ---');
  const browser = await chromium.launch({channel: 'msedge'});
  const page = await browser.newPage();
  
  const report = {
    timestamp: new Date().toISOString(),
    browser: browser.version(),
    results: []
  };

  for (const fix of fixtures) {
    console.log(`\nĐo nhóm: ${fix.name} (${fix.category})`);
    const groupResult = {
      category: fix.category,
      name: fix.name,
      sentencesCount: fix.sentences.length,
      transitions: [],
      samples: []
    };

    // Step A: Fetch MP3 for each sentence and measure gateway + PCM silence
    const audioDataList = [];
    for (let i = 0; i < fix.sentences.length; i++) {
      const text = fix.sentences[i];
      const t0 = performance.now();
      const res = await fetch('https://ottsy.weilbyte.dev/api/generation', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({text, voice: 'BV074_streaming'})
      });
      const json = await res.json();
      const gatewayMs = Math.round(performance.now() - t0);
      const b64 = json.data;

      // Analyze PCM silence using Web Audio API in page
      const pcmInfo = await page.evaluate(async (dataB64) => {
        const bin = atob(dataB64);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        const ctx = new AudioContext({sampleRate: 24000});
        const audioBuf = await ctx.decodeAudioData(bytes.buffer);
        const pcm = audioBuf.getChannelData(0);
        const sr = audioBuf.sampleRate;
        let first = -1, last = -1;
        for (let j = 0; j < pcm.length; j++) {
          if (Math.abs(pcm[j]) > 0.01) {
            if (first === -1) first = j;
            last = j;
          }
        }
        return {
          durationMs: Math.round(audioBuf.duration * 1000),
          leadSilenceMs: first >= 0 ? Math.round((first / sr) * 1000) : 0,
          tailSilenceMs: last >= 0 ? Math.round(((pcm.length - last) / sr) * 1000) : 0
        };
      }, b64);

      const item = {
        index: i,
        chars: text.length,
        text,
        gatewayMs,
        ...pcmInfo,
        b64
      };
      audioDataList.push(item);
      groupResult.samples.push({
        index: i,
        chars: text.length,
        gatewayMs,
        durationMs: pcmInfo.durationMs,
        leadSilenceMs: pcmInfo.leadSilenceMs,
        tailSilenceMs: pcmInfo.tailSilenceMs
      });
      console.log(`  [${i}] "${text.slice(0, 25)}..." chars=${text.length} dur=${pcmInfo.durationMs}ms leadSil=${pcmInfo.leadSilenceMs}ms tailSil=${pcmInfo.tailSilenceMs}ms gateway=${gatewayMs}ms`);
    }

    // Step B: Simulate sequential playback with lookahead = 2 (like TikTokPlayer)
    // and measure the gap at each transition
    const simulationResult = await page.evaluate(async (items) => {
      const toBlob = (b64) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], {type: 'audio/mpeg'});
      };

      const audio = new Audio();
      audio.preload = 'auto';

      const transitions = [];

      for (let i = 0; i < items.length - 1; i++) {
        const curr = items[i];
        const next = items[i + 1];

        // Did prefetch finish before curr audio ended?
        // curr audio takes curr.durationMs.
        // next fetch started when curr started playing, and took next.gatewayMs.
        const isBufferStarved = next.gatewayMs > curr.durationMs;
        const starvationDelayMs = isBufferStarved ? (next.gatewayMs - curr.durationMs) : 0;

        // Measure native media transition gap:
        const urlCurr = URL.createObjectURL(toBlob(curr.b64));
        const urlNext = URL.createObjectURL(toBlob(next.b64));

        audio.src = urlCurr;
        await audio.play();

        // Wait until curr finishes, then immediately switch to next
        const timing = await new Promise((resolve) => {
          audio.onended = () => {
            const tEnded = performance.now();
            audio.onended = null;
            audio.src = urlNext;
            audio.onplaying = () => {
              const tPlaying = performance.now();
              audio.onplaying = null;
              resolve({
                eventGapMs: Math.round(tPlaying - tEnded)
              });
            };
            audio.play().catch(() => {});
          };
        });

        URL.revokeObjectURL(urlCurr);
        URL.revokeObjectURL(urlNext);

        const totalAudibleSilenceMs = curr.tailSilenceMs + next.leadSilenceMs + timing.eventGapMs + starvationDelayMs;

        transitions.push({
          fromIndex: i,
          toIndex: i + 1,
          currDurationMs: curr.durationMs,
          nextGatewayMs: next.gatewayMs,
          isBufferStarved,
          starvationDelayMs,
          eventGapMs: timing.eventGapMs,
          tailSilenceMs: curr.tailSilenceMs,
          leadSilenceMs: next.leadSilenceMs,
          pcmSilenceMs: curr.tailSilenceMs + next.leadSilenceMs,
          totalAudibleSilenceMs
        });
      }

      return transitions;
    }, audioDataList);

    groupResult.transitions = simulationResult;
    for (const t of simulationResult) {
      console.log(`  Chuyển [${t.fromIndex}->${t.toIndex}]: eventGap=${t.eventGapMs}ms pcmSil=${t.pcmSilenceMs}ms starved=${t.isBufferStarved} (wait +${t.starvationDelayMs}ms) => TỔNG KHOẢNG LẶNG TAI NGHE = ${t.totalAudibleSilenceMs}ms`);
    }

    report.results.push(groupResult);
  }

  await browser.close();
  const reportPath = resolve(outDir, 'tts-p0-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nĐã lưu báo cáo P0: ${reportPath}`);
}

run().catch(console.error);
