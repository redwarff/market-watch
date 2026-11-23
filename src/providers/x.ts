import type { SocialDraft } from '@/lib/types';
import type { SocialProvider } from './types';

/**
 * X charges per post read. This slot is ready for a later provider.
 * v1 does not construct it, so the worker never calls X.
 */
export class XProvider implements SocialProvider {
  readonly network = 'x' as const;
  readonly configured = false;

  async fetchMentions(_symbols: string[], _subreddits: string[]): Promise<SocialDraft[]> {
    return [];
  }
}
