// getRepository(): the process-wide Repository singleton (SPEC 3.0, 5). Pages, route handlers and
// scripts all go through this so a DB-backed Repository can be swapped in later without touching them.
import type { Repository } from './Repository';
import { JsonRepository } from './JsonRepository';

let singleton: Repository | null = null;

/** JsonRepository over data/processed/<school> for every school in the SCHOOLS allowlist. */
export function getRepository(): Repository {
  if (!singleton) singleton = new JsonRepository();
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
