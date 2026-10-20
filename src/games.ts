// Add an independent game directory and one entry here. No shared game runtime.
export interface Game {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
}

export const games: readonly Game[] = [
  {
    id: 'hikari-no-oekaki',
    title: 'ひかりのおえかき',
    subtitle: 'ゆびさきから、ひかりが ぽっ。',
    description: 'さわると おはな。なぞると ひかりのみち。',
    href: 'hikari-no-oekaki/',
  },
  {
    id: 'fukifuki-mado',
    title: 'ふきふき、まど',
    subtitle: 'ふくと、にわの ともだち。',
    description: 'まどを ふきふき。だれが いるかな？',
    href: 'fukifuki-mado/',
  },
];
