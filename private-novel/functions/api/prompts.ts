import {handleSharedPrompts} from '../../server/shared-prompts';
export const onRequest:PagesFunction<{DB:D1Database}>=context=>handleSharedPrompts(context.request,context.env);
