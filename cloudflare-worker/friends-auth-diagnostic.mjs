// 인증 실패 원문은 반환·저장하지 않는다. 알려진 특징을 고정 분류로만 변환한다.
const BODY_LIMIT = 8192;
const MITIGATIONS = new Set(['CLOUDFLARE_CHALLENGE', 'UNCLASSIFIED']);
const GATEWAYS = new Set(['CLOUDFLARE', 'CLOUDFRONT', 'AKAMAI', 'OTHER', 'ABSENT']);
const CF_CODES = new Set(['1006', '1007', '1008', '1009', '1010', '1014', '1015', '1020', '1042']);
const PAGES = new Set(['CLOUDFRONT_REQUEST_BLOCKED', 'CLOUDFRONT_ERROR', 'AKAMAI_ACCESS_DENIED', 'CLOUDFLARE_BLOCKED', 'CLOUDFLARE_CHALLENGE_PAGE', 'UNCLASSIFIED', ...[...CF_CODES].map(code=>'CLOUDFLARE_ERROR_'+code)]);

async function limitedPage(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (size < BODY_LIMIT) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, BODY_LIMIT - size);
      chunks.push(chunk); size += chunk.length;
    }
  } catch { /* 본문을 읽지 못해도 고정 헤더 분류는 유지한다. */ }
  finally { try { await reader.cancel(); } catch {} }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function authFailureDiagnostic(response) {
  const server = (response.headers.get('server') || '').trim().toLowerCase();
  const mitigation = response.headers.get('cf-mitigated')?.trim().toLowerCase() === 'challenge' ? 'CLOUDFLARE_CHALLENGE' : 'UNCLASSIFIED';
  const gateway = server === 'cloudflare' ? 'CLOUDFLARE' : server === 'cloudfront' || response.headers.has('x-amz-cf-id') ? 'CLOUDFRONT' : server === 'akamaighost' ? 'AKAMAI' : server ? 'OTHER' : 'ABSENT';
  const headerCode = response.headers.get('cf-error-type');
  if (CF_CODES.has(headerCode)) {
    try { await response.body?.cancel(); } catch {}
    return { mitigation, gateway, page: 'CLOUDFLARE_ERROR_'+headerCode };
  }
  const page = await limitedPage(response);
  let pageClass = 'UNCLASSIFIED';
  const plain = page.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ');
  const cfCode = plain.match(/\berror\s*(?:code\s*)?:?\s*(1\d{3})\b/i)?.[1];
  if (gateway==='CLOUDFLARE' && CF_CODES.has(cfCode)) {
    pageClass = 'CLOUDFLARE_ERROR_'+cfCode;
  } else if (/sorry,?\s+you have been blocked/i.test(plain) && /cloudflare/i.test(page)) {
    pageClass = 'CLOUDFLARE_BLOCKED';
  } else if (/<title>\s*just a moment[.\s]*<\/title>/i.test(page) && /cloudflare/i.test(page)) {
    pageClass = 'CLOUDFLARE_CHALLENGE_PAGE';
  } else if (/the request could not be satisfied/i.test(page) && /cloudfront/i.test(page)) {
    pageClass = /request blocked/i.test(page) ? 'CLOUDFRONT_REQUEST_BLOCKED' : 'CLOUDFRONT_ERROR';
  } else if (/<title>\s*access denied\s*<\/title>/i.test(page) && /errors\.edgesuite\.net/i.test(page)) {
    pageClass = 'AKAMAI_ACCESS_DENIED';
  }
  return { mitigation, gateway, page: pageClass };
}

export function safeAuthDiagnostic(value) {
  if (!value || !MITIGATIONS.has(value.mitigation) || !GATEWAYS.has(value.gateway) || !PAGES.has(value.page)) return null;
  return { mitigation: value.mitigation, gateway: value.gateway, page: value.page };
}
