import catalogue from './games.json';

export interface Game {
  id: string;
  title: string;
  description: string;
  href: string;
}

export const games: readonly Game[] = catalogue;
