import {handleCloudLibrary, type CloudLibraryEnv} from '../../../server/cloud-library';

export const onRequest: PagesFunction<CloudLibraryEnv> = context =>
  handleCloudLibrary(context.request, context.env, promise=>context.waitUntil(promise));
