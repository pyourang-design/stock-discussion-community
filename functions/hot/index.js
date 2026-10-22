// /hot → 핫이슈 종목 (공유·다른 페이지 하단 메뉴용 주소): 홈 화면을 그대로 주고 app.js openFromUrl이 핫이슈 창을 엶
export const onRequest = ({ request, env }) => env.ASSETS.fetch(new URL('/', request.url));
