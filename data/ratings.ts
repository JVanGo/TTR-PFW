export type RatingSystem = {
  id: string;
  country: string;
  name: string;
  description: string;
  min: number;
  max: number;
  placeholder: number;
};

export const ratingSystems: RatingSystem[] = [
  {
    id: 'germany-ttr',
    country: 'Germany',
    name: 'TTR (Tischtennis-Rating)',
    description: 'Used by the German Table Tennis Federation (DTTB)',
    min: 0,
    max: 3000,
    placeholder: 1500,
  },
  {
    id: 'austria-ttr',
    country: 'Austria',
    name: 'Rating (ÖTTV)',
    description: 'Used by the Austrian Table Tennis Federation (ÖTTV)',
    min: 0,
    max: 3000,
    placeholder: 1500,
  },
  {
    id: 'belgium-index',
    country: 'Belgium',
    name: 'Index (VTTL/AFTT)',
    description: 'Used by the Belgian Table Tennis Federation',
    min: 0,
    max: 10,
    placeholder: 6,
  },
  {
    id: 'france-classement',
    country: 'France',
    name: 'Classement (FFTT)',
    description: 'Used by the French Table Tennis Federation (FFTT)',
    min: 0,
    max: 2800,
    placeholder: 1000,
  },
  {
    id: 'netherlands-rating',
    country: 'Netherlands',
    name: 'Rating (NTTB)',
    description: 'Used by the Dutch Table Tennis Federation (NTTB)',
    min: 0,
    max: 3000,
    placeholder: 1500,
  },
  {
    id: 'ittf-points',
    country: 'International',
    name: 'ITTF World Ranking Points',
    description: 'International Table Tennis Federation world ranking',
    min: 0,
    max: 15000,
    placeholder: 2000,
  },
];
