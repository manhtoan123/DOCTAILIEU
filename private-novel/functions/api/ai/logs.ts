import type {PagesFunction} from '@cloudflare/workers-types';
import {handleAiLogs} from '../../../server/ai-log';
import type {CloudDeviceEnv} from '../../../server/cloud-device-auth';
export const onRequest:PagesFunction<CloudDeviceEnv>=context=>handleAiLogs(context.request,context.env);
