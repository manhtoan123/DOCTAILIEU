import {handleCloudDictionaries, type CloudDictionariesEnv} from '../../../../server/cloud-dictionaries';

export const onRequest: PagesFunction<CloudDictionariesEnv> = context =>
  handleCloudDictionaries(context.request, context.env, promise=>context.waitUntil(promise));
