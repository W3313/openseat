// Fictional surnames, part B (SPEC 6.5): the 98 plain entries spanning many cultures.
// Alphabetical so the list is a stable input to the PRNG.
import type { Surname } from './namesLastA';

const PLAIN: readonly string[] = [
  'Abernethy', 'Achterberg', 'Adichie', 'Agyeman', 'Akintola', 'Alcantara', 'Amundsen', 'Anand', 'Arslan', 'Balogun',
  'Bancroft', 'Baptiste', 'Bhattacharya', 'Blackwood', 'Brandvold', 'Calloway', 'Castellano', 'Chaudhry', 'Chukwu', 'Danforth',
  'Delgadillo', 'Dimitriou', 'Eberhardt', 'Egwu', 'Ekwueme', 'Fairweather', 'Farahani', 'Fennimore', 'Galloway', 'Ghosh',
  'Grimaldi', 'Gunnarsson', 'Haldane', 'Halvorsen', 'Haruna', 'Hollingsworth', 'Iwamoto', 'Jankowski', 'Kaminski', 'Karimi',
  'Kealoha', 'Khoury', 'Kirchner', 'Kowalski', 'Kuroda', 'Lachance', 'Larkspur', 'Lindgren', 'Lonsdale', 'Macallister',
  'Madaki', 'Mahlangu', 'Marchetti', 'Matsuda', 'Mendonca', 'Mkhize', 'Montgomery', 'Nakashima', 'Nazarov', 'Ndlovu',
  'Ngata', 'Nwachukwu', 'Oyelaran', 'Pakhomov', 'Pellegrino', 'Petrakis', 'Quintanilla', 'Radovanovic', 'Rasmussen', 'Ravindran',
  'Reinholt', 'Rosenqvist', 'Saavedra', 'Salazar', 'Sarkisian', 'Sevilla', 'Shirazi', 'Sidibe', 'Stavros', 'Szymanski',
  'Takahashi', 'Thackeray', 'Thorvaldsen', 'Tremblay', 'Tsao', 'Uzoma', 'Valdivia', 'Vantreight', 'Varga', 'Venkataraghavan',
  'Villanueva', 'Waweru', 'Westergaard', 'Whitcombe', 'Wierzbicki', 'Yamaguchi', 'Zielinski', 'Zuniga',
];

export const PLAIN_SURNAMES: readonly Surname[] = PLAIN.map((name) => ({ name, shape: 'plain' as const }));
