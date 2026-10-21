// /sihwang → 주식 시황 목록 페이지 (api/column.js, board=sihwang)
import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler('column', context, { board: 'sihwang' });
