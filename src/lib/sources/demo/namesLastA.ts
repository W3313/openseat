// Fictional surnames, part A (SPEC 6.5): the "shaped" entries — hyphenated (12), diacritics (10),
// particles (6) and apostrophes (4). Part B (namesLastB.ts) holds the plain entries. Every surname is
// checked against data/config/uiuc/real-instructor-keys.json at seed time, so none of these can be a
// real UIUC instructor once paired with a first name.

export type SurnameShape = 'plain' | 'hyphenated' | 'diacritic' | 'particle' | 'apostrophe';

export interface Surname {
  readonly name: string;
  readonly shape: SurnameShape;
}

export const HYPHENATED_SURNAMES: readonly Surname[] = [
  { name: 'Okonkwo-Reyes', shape: 'hyphenated' },
  { name: 'Delacroix-Moreau', shape: 'hyphenated' },
  { name: 'Ibarra-Quintero', shape: 'hyphenated' },
  { name: 'Tanaka-Whitfield', shape: 'hyphenated' },
  { name: 'Haddad-Lindqvist', shape: 'hyphenated' },
  { name: 'Mbeki-Sandoval', shape: 'hyphenated' },
  { name: 'Ferreira-Nakamura', shape: 'hyphenated' },
  { name: 'Castellanos-Berg', shape: 'hyphenated' },
  { name: 'Adeyemi-Park', shape: 'hyphenated' },
  { name: 'Rowan-Achebe', shape: 'hyphenated' },
  { name: 'Vasquez-Holm', shape: 'hyphenated' },
  { name: 'Sato-Kowalczyk', shape: 'hyphenated' },
];

export const DIACRITIC_SURNAMES: readonly Surname[] = [
  { name: 'Ólafsdóttir', shape: 'diacritic' },
  { name: 'Nguyễn', shape: 'diacritic' },
  { name: 'Müller', shape: 'diacritic' },
  { name: 'Sørensen', shape: 'diacritic' },
  { name: 'Bogusławski', shape: 'diacritic' },
  { name: 'Ćosić', shape: 'diacritic' },
  { name: 'Ibáñez', shape: 'diacritic' },
  { name: 'Đurić', shape: 'diacritic' },
  { name: 'Réaumur', shape: 'diacritic' },
  { name: 'Şahinoğlu', shape: 'diacritic' },
];

export const PARTICLE_SURNAMES: readonly Surname[] = [
  { name: 'van der Berg', shape: 'particle' },
  { name: 'de la Cruz', shape: 'particle' },
  { name: 'Van Heusden', shape: 'particle' },
  { name: 'di Stefano', shape: 'particle' },
  { name: 'von Ahlefeld', shape: 'particle' },
  { name: 'Da Silva Prado', shape: 'particle' },
];

export const APOSTROPHE_SURNAMES: readonly Surname[] = [
  { name: "O'Halloran", shape: 'apostrophe' },
  { name: "D'Amato", shape: 'apostrophe' },
  { name: "N'Diaye", shape: 'apostrophe' },
  { name: "O'Cuinneagain", shape: 'apostrophe' },
];
