export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // HTTP와 www 주소는 한 번에 같은 HTTPS 장부 주소로 이동하며 쿼리를 보존합니다.
    if (url.hostname === 'www.maple-trackers.com' || (url.hostname === 'maple-trackers.com' && url.protocol === 'http:')) {
      url.protocol = 'https:';
      url.hostname = 'maple-trackers.com';
      return Response.redirect(url.toString(), 301);
    }
    const response = await env.ASSETS.fetch(request);
    // 복구 확인용 주소는 검색 결과에 노출하지 않습니다.
    if (url.hostname.endsWith('.workers.dev')) {
      const preview = new Response(response.body, response);
      preview.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return preview;
    }
    return response;
  }
};
