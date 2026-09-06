// getRepository(): the process-wide Repository singleton (SPEC 3.0, 5). Pages, route handlers and
// scripts all go through this so a DB-backed Repository can be swapped in later without touching them.
import { env } from '@/lib/config/env';
import type { Repository } from './Repository';
import { JsonRepository } from './JsonRepository';

let singleton: Repository | null = null;

/** JsonRepository over data/processed/<school> (or <school>-live when DATA_MODE=live). */
export function getRepository(): Repository {
  if (!singleton) singleton = new JsonRepository({ mode: env.DATA_MODE });
  return singleton;
}

/** Tests and scripts: replace the singleton (pass null to fall back to the default on next call). */
export function setRepository(repository: Repository | null): void {
  singleton = repository;
}

export type { Repository } from './Repository';
export {
  JsonRepository, RepositoryFileError, RepositoryNotFoundError, clearRepositoryCache, repositoryCacheStats,
} from './JsonRepository';
export type { JsonRepositoryOptions } from './JsonRepository';
