import express, { Request, Response, NextFunction } from "express";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Persona: Senior Software Engineer - High Reliability Architecture
// Optimized for direct data proxying without AI overhead

/**
 * Robust Network Retry Mechanism (withRetry)
 * Implements exponential backoff for external API synchronization
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.log(`[Retry Logic] Operation failed. Retrying in ${delay}ms... (${retries} attempts left)`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

/**
 * Simple In-Memory Rate Limiter
 * Ensures API quota protection and endpoint security.
 * Uses a robust IP resolution mechanism to prevent IP spoofing attacks.
 */
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Safe IP extraction protecting against spoofed headers
  const rawIp = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(rawIp) 
    ? rawIp[0] 
    : typeof rawIp === 'string' 
      ? rawIp.split(',')[0].trim() 
      : req.socket.remoteAddress) || 'unknown';

  const now = Date.now();
  const userData = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - userData.lastReset > RATE_LIMIT_WINDOW) {
    userData.count = 0;
    userData.lastReset = now;
  }

  userData.count++;
  rateLimitMap.set(ip, userData);

  if (userData.count > MAX_REQUESTS_PER_WINDOW) {
    console.log(`[Rate Limit] Blocked IP: ${ip}`);
    return res.status(429).json({ error: "Too many requests. Data access throttled." });
  }

  next();
};

const app = express();

// Disable powered-by header to prevent server-profiling fingerprint attacks
app.disable("x-powered-by");

// Enable trust proxy to receive accurate client IPs from Vercel/Cloud Run routers
app.set("trust proxy", 1);

app.use(express.json({ limit: '2mb' }));

// Global Middleware & Essential Security Headers
app.use((req, res, next) => {
  res.header("X-App-Engine", "REDEX-Central-Core");
  
  // Custom headers to prevent MIME sniffing and cross-site scripting vulnerabilities
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-XSS-Protection", "1; mode=block");
  res.header("Referrer-Policy", "strict-origin-when-cross-origin");
  
  next();
});

// Direct Favicon Redirect Route to handle all background browser icon requests
app.get("/favicon.ico", (req, res) => {
  res.redirect("https://i.ibb.co/DDyZd6b2/redex-logo-transparent.png");
});

// Proxy GET: Discover Models with withRetry and Proxy Security
app.get("/api/models/:type?", rateLimiter, async (req, res) => {
  try {
    const { type } = req.params;
    
    // Strict parameter validation: Only allow undefined/empty or 'online'
    if (type && type !== "online") {
      return res.status(400).json({ error: "Invalid resource type requested" });
    }

    const baseUrl = type === "online" 
      ? "https://go.whitetrafsa.com/api/models/online" 
      : "https://go.whitetrafsa.com/api/models";

    const queryParams = new URLSearchParams();
    const safeKeyRegex = /^[a-zA-Z0-9_\-]+$/;

    Object.entries(req.query).forEach(([key, value]) => {
      // Prevent parameter injection/pollution by validating query keys
      if (!safeKeyRegex.test(key)) {
        console.log(`[Proxy Security] Safe filter blocked parameter key: "${key}"`);
        return;
      }

      const appendSanitized = (val: string) => {
        // Sanitize values to prevent injection patterns or script-like content
        const sanitized = val.replace(/[\langle\rangle"';\\]/g, "");
        queryParams.append(key, sanitized);
      };

      if (Array.isArray(value)) {
        value.forEach(v => {
          if (v) appendSanitized(String(v));
        });
      } else if (value) {
        appendSanitized(String(value));
      }
    });

    const targetUrl = `${baseUrl}?${queryParams.toString()}`;
    console.log(`[Discovery Proxy] Synchronizing Target: ${targetUrl}`);

    const data = await withRetry(async () => {
      const response = await fetch(targetUrl);
      if (!response.ok) throw new Error(`API Status ${response.status}`);
      return response.json();
    });

    res.json(data);
  } catch (error) {
    console.log(`[Proxy Link Error] Recovery triggered. Reason: ${error instanceof Error ? error.message : "Network failure"}`);
    res.status(500).json({ error: "Discovery link unstable. Retrying synchronization." });
  }
});

// Production Assets & SPA Routing or Dev Vite Middleware Setup
if (process.env.NODE_ENV !== "production") {
  // Dynamically load Vite only in development to keep production bundle clean of dev dependencies
  import("vite").then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
      
      const PORT = 3000;
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[System] REDEX Central Dev Server operational on http://localhost:${PORT}`);
      });
    });
  }).catch(err => {
    console.log(`[Vite Loader Error] Failed to initialize Vite: ${err}`);
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  // Only listen on port if not running on Vercel serverless environment
  if (process.env.VERCEL !== "1") {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[System] REDEX Central Server operational on port ${PORT}`);
    });
  }
}

export default app;
