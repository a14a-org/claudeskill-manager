/**
 * Performance and mobile optimization configuration
 *
 * Serves performance hints, responsive image configs, font loading
 * directives, and mobile UX guidelines that the frontend uses to
 * render optimized pages — especially on mobile connections.
 */

const SITE_URL = "https://claudeskill.io";

export type ResourceHint = {
  rel: "preload" | "preconnect" | "dns-prefetch";
  href: string;
  as?: "font" | "image" | "style" | "script";
  type?: string;
  crossorigin?: boolean;
};

export type ResponsiveImageConfig = {
  srcset: string;
  sizes: string;
  loading: "eager" | "lazy";
  decoding: "async" | "sync" | "auto";
  fetchpriority: "high" | "low" | "auto";
  width: number;
  height: number;
};

export type FontConfig = {
  family: string;
  weights: number[];
  display: "swap" | "block" | "fallback" | "optional";
  preload: boolean;
  src: string;
};

export type TouchTargetConfig = {
  minSize: number;
  minSpacing: number;
  recommendedSize: number;
};

export type ViewportConfig = {
  meta: string;
  themeColor: string;
  colorScheme: string;
};

export type MobileConfig = {
  viewport: ViewportConfig;
  touchTargets: TouchTargetConfig;
  fontSizing: {
    minBodySize: number;
    minCtaSize: number;
    lineHeight: number;
  };
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
};

export type PerformanceConfig = {
  resourceHints: ResourceHint[];
  fonts: FontConfig[];
  mobile: MobileConfig;
  heroImage: ResponsiveImageConfig;
  cachePolicy: {
    staticAssets: string;
    apiResponses: string;
    htmlPages: string;
  };
};

/**
 * Resource preconnect/preload hints for the frontend to embed in <head>
 */
const resourceHints = (): ResourceHint[] => [
  {
    rel: "preconnect",
    href: SITE_URL,
    crossorigin: true,
  },
  {
    rel: "dns-prefetch",
    href: "https://fonts.googleapis.com",
  },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossorigin: true,
  },
  {
    rel: "preload",
    href: `${SITE_URL}/fonts/inter-var.woff2`,
    as: "font",
    type: "font/woff2",
    crossorigin: true,
  },
];

/**
 * Font loading configuration with font-display: swap for visible text
 * during load and limited weights to reduce payload
 */
const fontConfigs = (): FontConfig[] => [
  {
    family: "Inter",
    weights: [400, 500, 600, 700],
    display: "swap",
    preload: true,
    src: `${SITE_URL}/fonts/inter-var.woff2`,
  },
  {
    family: "JetBrains Mono",
    weights: [400, 500],
    display: "swap",
    preload: false,
    src: `${SITE_URL}/fonts/jetbrains-mono-var.woff2`,
  },
];

/**
 * Mobile UX configuration — touch targets, font sizing, viewport
 */
const mobileConfig = (): MobileConfig => ({
  viewport: {
    meta: "width=device-width, initial-scale=1, viewport-fit=cover",
    themeColor: "#0f172a",
    colorScheme: "dark light",
  },
  touchTargets: {
    minSize: 44,
    minSpacing: 8,
    recommendedSize: 48,
  },
  fontSizing: {
    minBodySize: 16,
    minCtaSize: 16,
    lineHeight: 1.5,
  },
  breakpoints: {
    mobile: 640,
    tablet: 768,
    desktop: 1024,
  },
});

/**
 * Hero/above-the-fold image responsive configuration
 * NOT lazy-loaded (eager) to optimize LCP
 */
const heroImageConfig = (): ResponsiveImageConfig => ({
  srcset: [
    `${SITE_URL}/images/hero-400w.webp 400w`,
    `${SITE_URL}/images/hero-800w.webp 800w`,
    `${SITE_URL}/images/hero-1200w.webp 1200w`,
    `${SITE_URL}/images/hero-1600w.webp 1600w`,
  ].join(", "),
  sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 1200px",
  loading: "eager",
  decoding: "async",
  fetchpriority: "high",
  width: 1200,
  height: 630,
});

/**
 * Full performance configuration for the frontend
 */
export const performanceConfig = (): PerformanceConfig => ({
  resourceHints: resourceHints(),
  fonts: fontConfigs(),
  mobile: mobileConfig(),
  heroImage: heroImageConfig(),
  cachePolicy: {
    staticAssets: "public, max-age=31536000, immutable",
    apiResponses: "public, max-age=300, stale-while-revalidate=600",
    htmlPages: "public, max-age=60, stale-while-revalidate=300",
  },
});
