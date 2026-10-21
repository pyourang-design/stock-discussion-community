// /sihwang/:id → 주식 시황 본문 페이지 (api/column.js, board=sihwang)
import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler('column', context, { id: context.params.id, board: 'sihwang' });
