export interface NormalizedItem {
  /** Stable per-source identifier — used to dedupe. URL is a fine fallback. */
  externalId: string;
  url: string;
  title: string;
  publishedAt?: Date;
  excerpt?: string;
  /**
   * Full article body if the adapter already has it (e.g. comes from an API
   * or CSV). When set, the alert page and summarizer use this directly and
   * skip the lazy HTML scrape.
   */
  fullText?: string;
  /**
   * Optional secondary "watch live / archive" URL — e.g. Sejm sitting
   * transmission. Rendered as a separate button on the alert detail page.
   */
  streamUrl?: string;
}

export interface AdapterFetchInit {
  headers?: Record<string, string>;
  /** Some PL gov sites use Certum roots not in Node's CA bundle. */
  allowInsecureTls?: boolean;
  timeoutMs?: number;
}

export interface AdapterContext {
  /** Per-source base URL from the DB row. */
  baseUrl: string;
  /** Per-source JSON config from the DB row — used by config-driven adapters. */
  config?: unknown;
  /** Hard deadline; adapter should bail before this. */
  deadline: Date;
  /** Use this instead of global fetch — follows redirects, has UA + timeout. */
  fetch: (url: string, init?: AdapterFetchInit) => Promise<Response>;
}

export interface SourceAdapter {
  /** Must match `sources.adapter_key` in the DB. */
  key: string;
  fetchItems(ctx: AdapterContext): Promise<NormalizedItem[]>;
}
