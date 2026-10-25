import type {PagesFunction} from '@cloudflare/workers-types';
import {handleCapcutTts,type CapcutTtsEnv} from '../../server/capcut-tts';
export const onRequest:PagesFunction<CapcutTtsEnv>=context=>handleCapcutTts(context.request,context.env);
