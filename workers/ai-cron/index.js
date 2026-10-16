// 5분마다 AI 운영자 글 처리 요청 (functions/api/ai.js)
export default {
  async scheduled(event, env, ctx) {
    const r = await fetch('https://upjong.com/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cron-Key': env.CRON_KEY },
      body: JSON.stringify({ op: 'run' }),
    });
    const text = await r.text();
    if (!r.ok || /실패|error/.test(text)) console.error('ai run', r.status, text.slice(0, 1000));
    else console.log('ai run', text.slice(0, 1000));
  },
};
