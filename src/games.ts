// Add an independent game directory and one entry here. No shared game runtime.
export interface Game {
  id: string;
  title: string;
  description: string;
  href: string;
}

export const games: readonly Game[] = [
  {
    id: 'hikari-no-oekaki',
    title: 'ひかりのおえかき',
    description: 'さわると おはな。なぞると ひかりのみち。',
    href: 'hikari-no-oekaki/',
  },
  {
    id: 'fukifuki-mado',
    title: 'ふきふき、まど',
    description: 'まどを ふきふき。だれが いるかな？',
    href: 'fukifuki-mado/',
  },
  {
    id: 'pukapuka-fusen',
    title: 'ぷかぷか、ふうせん',
    description: 'おすと ふくらむ。はなすと ぷかぷか。',
    href: 'pukapuka-fusen/',
  },
  {
    id: 'ponpon-stamp',
    title: 'ぽんぽん、スタンプ',
    description: 'えらんで、ぽん！ なかまたちで えを つくろう。',
    href: 'ponpon-stamp/',
  },
  {
    id: 'korokoro-suberidai',
    title: 'ころころ、すべりだい',
    description: 'たまを さわると、ころころ！',
    href: 'korokoro-suberidai/',
  },
];
