import { runVercelHandler } from '../_adapter.js';

export const onRequest = context => runVercelHandler(context.params.name, context);
