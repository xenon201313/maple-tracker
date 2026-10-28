export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // HTTP와 www 주소는 한 번에 같은 HTTPS 장부 주소로 이동하며 쿼리를 보존합니다.
    if (url.hostname === 'www.maple-trackers.com' || (url.hostname === 'maple-trackers.com' && url.protocol === 'http:')) {
      url.protocol = 'https:';
      url.hostname = 'maple-trackers.com';
      return Response.redirect(url.toString(), 301);
    }
    const rootPage = url.pathname === '/' || url.pathname === '/index.html';
    // 사용자·크롤러 구분 없이 공개 홈을 제공합니다. 기존 장부·OAuth 주소는 그대로 유지합니다.
    const ledgerRequest = rootPage && ['page', 'code', 'state', 'error'].some(key => url.searchParams.has(key));
    if (['/welcome', '/welcome/', '/welcome/index.html'].includes(url.pathname)) {
      url.pathname = '/';
      return new Response(null, { status: 301, headers: {
        Location: url.toString(),
        ...(url.hostname.endsWith('.workers.dev') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
      } });
    }
    let assetRequest = request;
    if (rootPage && !ledgerRequest) {
      const publicUrl = new URL(url);
      publicUrl.pathname = '/welcome/';
      assetRequest = new Request(publicUrl, request);
    }
    let response = await env.ASSETS.fetch(assetRequest);
    if (ledgerRequest) {
      response = new Response(response.body, response);
      response.headers.set('X-Robots-Tag', 'noindex, follow');
    }
    // 복구 확인용 주소는 검색 결과에 노출하지 않습니다.
    if (url.hostname.endsWith('.workers.dev')) {
      const preview = new Response(response.body, response);
      preview.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return preview;
    }
    return response;
  }
};
