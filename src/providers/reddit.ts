import type { SocialDraft } from '@/lib/types';
import { sleep } from '@/server/pacer';
import type { SocialProvider } from './types';

type RedditChild = {
  data?: {
    name?: string;
    title?: string;
    selftext?: string;
    author?: string;
    permalink?: string;
    score?: number;
    created_utc?: number;
  };
};

export class RedditProvider implements SocialProvider {
  readonly network = 'reddit' as const;
  private token = '';
  private tokenExp = 0;

  private get clientId(): string {
    return (process.env.REDDIT_CLIENT_ID || '').trim();
  }

  private get secret(): string {
    return (process.env.REDDIT_CLIENT_SECRET || '').trim();
  }

  private get username(): string {
    return (process.env.REDDIT_USERNAME || '').trim();
  }

  private get password(): string {
    return (process.env.REDDIT_PASSWORD || '').trim();
  }

  get configured(): boolean {
    return Boolean(this.clientId && this.secret && this.username && this.password);
  }

  async fetchMentions(symbols: string[], subreddits: string[]): Promise<SocialDraft[]> {
    if (!this.configured || symbols.length === 0 || subreddits.length === 0) return [];
    await this.auth();
    const subQuery = subreddits.map((sub) => `subreddit:${sub}`).join(' OR ');
    const hits: SocialDraft[] = [];
    for (const symbol of symbols) {
      const query = `(${subQuery}) (${symbol} OR $${symbol})`;
      const url = new URL('https://oauth.reddit.com/search');
      url.searchParams.set('q', query);
      url.searchParams.set('sort', 'new');
      url.searchParams.set('t', 'week');
      url.searchParams.set('limit', '15');
      url.searchParams.set('type', 'link');
      url.searchParams.set('restrict_sr', 'false');
      const response = await fetch(url, { headers: this.headers(), cache: 'no-store' });
      if (response.status === 401) {
        this.token = '';
        await this.auth();
        continue;
      }
      if (!response.ok) throw new Error(`Reddit ${response.status}.`);
      const body = (await response.json()) as { data?: { children?: RedditChild[] } };
      for (const child of body.data?.children ?? []) {
        const data = child.data;
        if (!data?.name || !data.permalink) continue;
        const text = `${data.title || ''} ${data.selftext || ''}`;
        if (!mentions(text, symbol)) continue;
        hits.push({
          network: 'reddit',
          externalId: data.name,
          symbol,
          author: data.author || '',
          title: data.title || '',
          excerpt: (data.selftext || '').replace(/\s+/g, ' ').slice(0, 280),
          url: `https://www.reddit.com${data.permalink}`,
          score: Number(data.score) || 0,
          createdAt: Math.round(Number(data.created_utc || 0) * 1000),
        });
      }
      await sleep(1000);
    }
    return hits;
  }

  private headers(): HeadersInit {
    return {
      authorization: `Bearer ${this.token}`,
      'user-agent': `node:market-watch:0.1 (by /u/${this.username})`,
    };
  }

  private async auth() {
    if (this.token && Date.now() < this.tokenExp - 60_000) return;
    const body = new URLSearchParams({
      grant_type: 'password',
      username: this.username,
      password: this.password,
    });
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': `node:market-watch:0.1 (by /u/${this.username})`,
      },
      body,
      cache: 'no-store',
    });
    const json = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !json.access_token) {
      throw new Error(json.error || `Reddit auth ${response.status}.`);
    }
    this.token = json.access_token;
    this.tokenExp = Date.now() + (json.expires_in ?? 3600) * 1000;
  }
}

function mentions(text: string, symbol: string): boolean {
  const pattern = new RegExp(`(^|[^A-Z0-9])\\$?${symbol}([^A-Z0-9]|$)`, 'i');
  return pattern.test(text);
}
