// /column/:id → 운영자 칼럼 본문 페이지 (api/column.js)
import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler('column', context, { id: context.params.id });
