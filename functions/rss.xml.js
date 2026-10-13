// /rss.xml → /api/rss (vercel.json rewrite와 동일)
import { runVercelHandler } from './_adapter.js';

export const onRequest = context => runVercelHandler('rss', context);
