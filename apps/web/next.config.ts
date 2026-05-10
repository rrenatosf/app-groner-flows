import type { NextConfig } from "next";

// CSP — só em produção. Em dev, Turbopack injeta scripts inline e estilos
// do hot-reload que violariam a política, quebrando HMR.
//
// Allowlist:
// - 'self' para tudo da própria origem
// - Supabase (DB / storage)
// - API Groner CRM (subdomínios *.api.groner.app)
// - API AWS Groner Zap (instâncias WhatsApp)
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Tailwind/JIT injeta inline
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.api.groner.app https://*.supabase.co https://*.execute-api.us-east-2.amazonaws.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // HSTS — só em prod (precisa HTTPS)
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
        {
          key: "Content-Security-Policy",
          value: CSP_PROD,
        },
      ]
    : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
