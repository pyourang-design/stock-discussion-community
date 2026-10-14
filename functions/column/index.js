// /column → 운영자 칼럼 목록 페이지 (api/column.js)
import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler('column', context);
