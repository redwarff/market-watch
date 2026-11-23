import { RedditProvider } from './reddit';
import type { SocialProvider } from './types';

/** Add XProvider here when a budget for post reads exists. */
export function socialProviders(): SocialProvider[] {
  return [new RedditProvider()];
}
