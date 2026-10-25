import {handleReaderRoute} from '../../server/reader-route-registry';
import type {CloudDeviceEnv} from '../../server/cloud-device-auth';
export const onRequest:PagesFunction<CloudDeviceEnv>=context=>handleReaderRoute(context.request,context.env);
