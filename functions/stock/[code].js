// /stock/:code → /api/page?code=:code (vercel.json rewrite와 동일)
import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler('page', context, { code: context.params.code });
