// Curated fictional first names for the demo seed (SPEC 6.5). 100 entries spanning many cultures,
// including diacritics and hyphenated given names. Roughly a dozen belong to the matcher's nickname
// groups (SPEC 7.3 T4) so the "Last, Bob" perturbation and edge case (e) have material to work with.
// Kept in alphabetical order so the list itself is a stable input to the PRNG.

export const FIRST_NAMES: readonly string[] = [
  'Adaeze', 'Aiko', 'Akosua', 'Alejandro', 'Alexander', 'Amara', 'Anaïs', 'Andrew', 'Anjali', 'Arjun',
  'Astrid', 'Ayşe', 'Benjamin', 'Bjørn', 'Bolanle', 'Camille', 'Chiara', 'Chinedu', 'Christopher', 'Daniel',
  'Dagny', 'Dariusz', 'Dmitri', 'Edward', 'Eitan', 'Elif', 'Elizabeth', 'Elodie', 'Emeka', 'Esperanza',
  'Farida', 'Fátima', 'Fumiko', 'Geoffrey', 'Gwendolyn', 'Halvard', 'Hamid', 'Hana', 'Ibrahim', 'Ingrid',
  'Isabeau', 'Ivo', 'James', 'Jarosław', 'Jennifer', 'Jonathan', 'Joseph', 'Jun-Seo', 'Kalinda', 'Katherine',
  'Kehinde', 'Kirabo', 'Leilani', 'Liesbeth', 'Lucía', 'Magnus', 'Malaika', 'Margaret', 'Marisol', 'Matthew',
  'Mei-Lin', 'Michael', 'Mihail', 'Naledi', 'Nandini', 'Nicholas', 'Nkechi', 'Oluwaseun', 'Ondřej', 'Oriol',
  'Paloma', 'Pilar', 'Priya', 'Rafael', 'Ravi', 'Richard', 'Robert', 'Rohan', 'Rosalind', 'Rúnar',
  'Saoirse', 'Samuel', 'Sigrún', 'Soledad', 'Søren', 'Steven', 'Tadashi', 'Tanvir', 'Teodora', 'Thandiwe',
  'Thomas', 'Tomasz', 'Ulrike', 'Valentina', 'Wiremu', 'William', 'Xiomara', 'Yusuf', 'Zainab', 'Zoltán',
];

/**
 * Nicknames the matcher recognises (SPEC 7.3, 25 groups). Only groups whose canonical form appears in
 * FIRST_NAMES are listed — the seed uses this for the 5 % nickname perturbation of grade-row strings.
 */
export const NICKNAMES: Readonly<Record<string, readonly string[]>> = {
  Alexander: ['Alex'],
  Andrew: ['Andy', 'Drew'],
  Benjamin: ['Ben'],
  Christopher: ['Chris'],
  Daniel: ['Dan', 'Danny'],
  Edward: ['Ed', 'Ted'],
  Elizabeth: ['Liz', 'Beth', 'Betsy'],
  Geoffrey: ['Geoff', 'Jeff'],
  James: ['Jim', 'Jimmy'],
  Jennifer: ['Jen', 'Jenny'],
  Jonathan: ['Jon'],
  Joseph: ['Joe'],
  Katherine: ['Kate', 'Katie', 'Kathy'],
  Margaret: ['Maggie', 'Peggy', 'Meg'],
  Matthew: ['Matt'],
  Michael: ['Mike'],
  Nicholas: ['Nick'],
  Richard: ['Rick'],
  Robert: ['Bob', 'Rob', 'Bobby'],
  Samuel: ['Sam'],
  Steven: ['Steve'],
  Thomas: ['Tom'],
  William: ['Bill', 'Will', 'Billy'],
};

/** First names that have at least one nickname (sorted, so iteration is deterministic). */
export const NICKNAMED_FIRST_NAMES: readonly string[] = Object.keys(NICKNAMES).sort();
