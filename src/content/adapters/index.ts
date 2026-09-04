import type { PlatformAdapter } from '../../core/canonical';
import { TwitterAdapter } from './twitter';
import { RedditAdapter } from './reddit';
import { GenericAdapter } from './generic';

export const adapters: PlatformAdapter[] = [
  new TwitterAdapter(),
  new RedditAdapter(),
  new GenericAdapter(), // must stay last: matches everything
];

export function adapterFor(url: string): PlatformAdapter {
  return adapters.find((a) => a.matches(url)) ?? adapters[adapters.length - 1];
}
