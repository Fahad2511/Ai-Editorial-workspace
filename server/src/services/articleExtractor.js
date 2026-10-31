import dns from 'node:dns/promises'
import net from 'node:net'
import { load } from 'cheerio'
import { AppError } from '../config/gemini.js'

function privateV4(ip) {
  const a = ip.split('.').map(Number)
  return (
    a[0] === 0 ||
    a[0] === 10 ||
    a[0] === 127 ||
    a[0] >= 224 ||
    (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
    (a[0] === 169 && a[1] === 254) ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && (a[1] === 168 || (a[1] === 0 && (a[2] === 0 || a[2] === 2)))) ||
    (a[0] === 198 && (a[1] === 18 || a[1] === 19 || (a[1] === 51 && a[2] === 100))) ||
    (a[0] === 203 && a[1] === 0 && a[2] === 113)
  )
}
function privateV6(ip) {
  const x = ip.toLowerCase()
  if (x.includes('.')) {
    const match = x.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (match) return privateV4(match[1])
  }
  const parts = x.split('::')
  let left = parts[0] ? parts[0].split(':') : []
  let right = parts[1] ? parts[1].split(':') : []
  const groups =
    parts.length === 1
      ? left
      : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  const g = groups.map((v) => parseInt(v || '0', 16))
  const zero = g.every((v) => v === 0)
  if (zero || (g.slice(0, 7).every((v) => v === 0) && g[7] === 1)) return true
  if (g.slice(0, 5).every((v) => v === 0) && g[5] === 0xffff) {
    const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')
    return privateV4(v4)
  }
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80
}
async function readErrorPreview(response) {
  const reader = response.clone().body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  try {
    while (size < 4096) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, 4096 - size)
      chunks.push(chunk)
      size += chunk.length
      if (chunk.length < value.length) break
    }
    reader.cancel().catch(() => {})
  } catch {
    // The preview is diagnostic only; the HTTP status and headers remain useful without it.
  }
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}
async function safeUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new AppError(400, 'Enter a valid article URL.', 'INVALID_URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new AppError(400, 'Only public HTTP and HTTPS article URLs are supported.', 'UNSAFE_URL')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    throw new AppError(400, 'Local and private network addresses cannot be fetched.', 'UNSAFE_URL')
  if (net.isIP(host)) {
    if ((net.isIPv4(host) && privateV4(host)) || (net.isIPv6(host) && privateV6(host)))
      throw new AppError(
        400,
        'Local and private network addresses cannot be fetched.',
        'UNSAFE_URL',
      )
  } else {
    let records
    try {
      records = await dns.lookup(host, { all: true, verbatim: true })
    } catch {
      throw new AppError(422, 'The article host could not be resolved.', 'HOST_UNAVAILABLE')
    }
    if (
      !records.length ||
      records.some(
        (r) =>
          (net.isIPv4(r.address) && privateV4(r.address)) ||
          (net.isIPv6(r.address) && privateV6(r.address)),
      )
    )
      throw new AppError(
        400,
        'This address resolves to a private network and cannot be fetched.',
        'UNSAFE_URL',
      )
  }
  return url
}

// Validate every redirect destination too, so a public URL cannot redirect to a private host.
async function fetchSafe(url) {
  const requestedUrl = `${url.origin}${url.pathname}`
  for (let hop = 0; hop <= 4; hop++) {
    const checked = await safeUrl(url.href)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 12000)
    let response
    try {
      response = await fetch(checked, {
        redirect: 'manual',
        signal: abort.signal,
        headers: {
          'User-Agent': 'EditorialAI/1.0 (article text extraction)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        },
      })
    } catch (e) {
      const cause = e?.cause
      console.error('[ArticleExtractor] Request failed', {
        requestedUrl,
        finalResponseUrl: null,
        httpStatus: null,
        contentType: null,
        errorName: e?.name || 'Error',
        errorMessage: e?.message || 'Unknown network error',
        errorCode: e?.code || cause?.code || null,
        causeCode: cause?.code || null,
        requestTimeoutMs: 12000,
        timedOut: e?.name === 'AbortError',
      })
      if (e.name === 'AbortError')
        throw new AppError(
          504,
          `${checked.hostname} timed out while fetching this URL. Paste its text to continue.`,
          'EXTRACTION_TIMEOUT',
          { sourceUrl: `${checked.origin}${checked.pathname}` },
        )
      throw new AppError(
        422,
        `${checked.hostname} could not be reached while fetching this URL. Paste its text to continue.`,
        'SOURCE_UNAVAILABLE',
        { sourceUrl: `${checked.origin}${checked.pathname}` },
      )
    } finally {
      clearTimeout(timer)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      console.info('[ArticleExtractor] Following redirect', {
        requestedUrl,
        redirectStatus: response.status,
        fromUrl: `${checked.origin}${checked.pathname}`,
        toUrl: location
          ? (() => {
              const next = new URL(location, checked)
              return `${next.origin}${next.pathname}`
            })()
          : null,
        redirectHop: hop + 1,
      })
      if (!location)
        throw new AppError(422, 'The source redirected without a destination.', 'INVALID_REDIRECT')
      url = new URL(location, checked)
      continue
    }
    if (!response.ok) {
      const type = response.headers.get('content-type') || ''
      const bodyPreview = await readErrorPreview(response)
      const server = response.headers.get('server') || ''
      const via = response.headers.get('via') || ''
      const edge =
        response.headers.get('cf-ray') ||
        response.headers.get('x-amz-cf-id') ||
        response.headers.get('x-sucuri-id') ||
        response.headers.get('x-akamai-transformed') ||
        ''
      const layer =
        /cloudflare|akamai|cloudfront|sucuri/i.test(`${server} ${via}`) || edge
          ? 'cdn_or_edge'
          : /captcha|verify you are human|access denied|request blocked|security check/i.test(
                bodyPreview,
              )
            ? 'site_or_security_layer'
            : 'http_origin_or_unknown'
      console.warn('[ArticleExtractor] Source returned an HTTP error', {
        requestedUrl,
        finalResponseUrl: `${checked.origin}${checked.pathname}`,
        httpStatus: response.status,
        contentType: type,
        server,
        via,
        edgeSignal: edge ? 'present' : null,
        likelyLayer: layer,
        sanitizedBodyPreview: bodyPreview,
      })
      throw new AppError(
        422,
        `${checked.hostname} returned HTTP ${response.status} for this URL. Paste its text to continue.`,
        'SOURCE_UNAVAILABLE',
        {
          sourceUrl: `${checked.origin}${checked.pathname}`,
          finalResponseUrl: `${checked.origin}${checked.pathname}`,
          httpStatus: response.status,
          contentType: type,
          likelyLayer: layer,
          sanitizedBodyPreview: bodyPreview,
        },
      )
    }
    const type = response.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(type))
      throw new AppError(
        415,
        'This URL does not return readable article text. Paste its text to continue.',
        'UNSUPPORTED_CONTENT',
      )
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > 2_000_000)
      throw new AppError(413, 'This page is too large to extract safely.', 'SOURCE_TOO_LARGE')
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > 2_000_000) {
        await reader.cancel()
        throw new AppError(413, 'This page is too large to extract safely.', 'SOURCE_TOO_LARGE')
      }
      chunks.push(value)
    }
    return { body: Buffer.concat(chunks).toString('utf8'), url: checked, type }
  }
  throw new AppError(
    422,
    'The source redirected too many times. Paste its text to continue.',
    'TOO_MANY_REDIRECTS',
  )
}
export async function extractArticle(rawUrl) {
  const result = await fetchSafe(new URL(rawUrl))
  const titleFallback = result.url.hostname
  let title = '',
    publishedAt = '',
    content = ''
  if (result.type.includes('text/plain')) {
    content = result.body
    title = titleFallback
  } else {
    const $ = load(result.body)
    title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').first().text().trim() ||
      titleFallback
    publishedAt =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      ''
    $('script,style,noscript,svg,iframe,nav,footer,header,aside,form,button').remove()
    const article =
      $('article').text() || $('[role="main"]').text() || $('main').text() || $('body').text()
    content = article.replace(/\s+/g, ' ').trim()
  }
  content = content.replace(/\s+/g, ' ').trim().slice(0, 60000)
  if (content.length < 80)
    throw new AppError(
      422,
      'Too little readable article text was found. Paste the source text to continue.',
      'INSUFFICIENT_CONTENT',
    )
  return {
    title: title.trim().slice(0, 240),
    url: result.url.href,
    content,
    publishedAt,
    publisher: result.url.hostname.replace(/^www\./, ''),
  }
}
