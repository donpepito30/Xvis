interface Env {
  // Add any environment variables if needed
}

// In-memory rate limiting map (reinitialized per isolate, perfect for basic Edge protection)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function rateLimiter(ip: string): boolean {
  const now = Date.now();
  const userData = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - userData.lastReset > RATE_LIMIT_WINDOW) {
    userData.count = 0;
    userData.lastReset = now;
  }

  userData.count++;
  rateLimitMap.set(ip, userData);

  return userData.count <= MAX_REQUESTS_PER_WINDOW;
}

// Retry Logic
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

export const onRequest = async (context: any) => {
  const { request, params } = context;
  
  // Only allow GET requests
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Get client IP safely in Cloudflare (always available in request.headers)
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  // Apply Rate Limiting
  if (!rateLimiter(ip)) {
    console.log(`[Cloudflare Pages - Rate Limit] Blocked IP: ${ip}`);
    return new Response(JSON.stringify({ error: "Too many requests. Data access throttled." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-App-Engine": "REDEX-Central-Core-Edge",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });
  }

  try {
    // Type parameter validation (e.g. models/online)
    const type = params.type;
    const typeStr = Array.isArray(type) ? type[0] : type;

    if (typeStr && typeStr !== "online") {
      return new Response(JSON.stringify({ error: "Invalid resource type requested" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const baseUrl = typeStr === "online"
      ? "https://go.whitetrafsa.com/api/models/online"
      : "https://go.whitetrafsa.com/api/models";

    // URL parsing & query param sanitization
    const url = new URL(request.url);
    const queryParams = new URLSearchParams();
    const safeKeyRegex = /^[a-zA-Z0-9_\-]+$/;

    url.searchParams.forEach((value, key) => {
      // Prevent parameter injection/pollution by validating query keys
      if (!safeKeyRegex.test(key)) {
        console.log(`[Cloudflare Pages - Security] Blocked key: "${key}"`);
        return;
      }
      // Sanitize values to prevent injection patterns or script-like content
      const sanitizedValue = value.replace(/[\langle\rangle"';\\]/g, "");
      queryParams.append(key, sanitizedValue);
    });

    const targetUrl = `${baseUrl}?${queryParams.toString()}`;
    console.log(`[Cloudflare Pages - Proxy] Fetching: ${targetUrl}`);

    // Fetch from target with retry mechanism & high-fidelity browser headers
    const data = await withRetry(async () => {
      const response = await fetch(targetUrl, {
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,en-US;q=0.7",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://go.whitetrafsa.com/",
          "Origin": "https://go.whitetrafsa.com",
          "Cache-Control": "no-cache"
        }
      });
      if (!response.ok) {
        throw new Error(`API Status ${response.status} (${response.statusText})`);
      }
      return response.json();
    });

    // Build standard secure response
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-App-Engine": "REDEX-Central-Core-Edge",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "public, max-age=15" // Cloudflare Edge micro-caching
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Network failure";
    console.log(`[Cloudflare Pages - Error] Reason: ${errorMsg}`);
    return new Response(JSON.stringify({ 
      error: "Discovery link unstable. Retrying synchronization.",
      details: errorMsg
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "X-App-Engine": "REDEX-Central-Core-Edge",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      }
    });
  }
};
