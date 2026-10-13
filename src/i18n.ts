import type { ThemeId } from './game/levels';

export type Locale = 'be' | 'en';

export const DEFAULT_LOCALE: Locale = 'be';
export const LOCALE_KEY = 'cvl.locale';

export interface Copy {
  docTitle: string;
  score: (n: number) => string;
  musicOn: string;
  musicOff: string;
  restart: string;
  play: string;
  title: string;
  vs: string;
  blurb1: string;
  blurb2: string;
  hintSplit: string;
  hintDive: string;
  hintBurst: string;
  raising: string;
  cleared: string;
  clearedScore: (n: number, stars: string) => string;
  next: string;
  finish: string;
  gameOver: string;
  gameOverSub: string;
  retry: string;
  victory: string;
  victoryScore: (n: number) => string;
  menu: string;
  levels: Record<ThemeId, string>;
  history: Record<ThemeId, string>;
}

export const STRINGS: Record<Locale, Copy> = {
  be: {
    docTitle: 'Кіберпартызаны супраць Лукашэнкі',
    score: (n) => `ЛІК ${n}`,
    musicOn: '♪ УКЛ',
    musicOff: '♪ ВЫКЛ',
    restart: 'ЗНОЎ',
    play: 'ГУЛЯЦЬ',
    title: 'КІБЕРПАРТЫЗАНЫ',
    vs: 'СУПРАЦЬ РЭЖЫМУ',
    blurb1: 'Партызанскія птушкі супраць рэжыму Лукашэнкі за Вольную Беларусь. Лукашэнкаўскі сцяг трымаецца да зачысткі.',
    blurb2: 'Адцягніце прашчу з птушкай, выбіраючы цэль. Страляйце па прусаках, абараняючых сцяг. Адпусціце птушку, каб запусціць яе ў палёт. Падчас палёта націсніце на экран дзе заўгодна, каб актываваць здольнасць птушкі. У кожнай птушкі свая здольнасць. Калі прусакоў Лукашэнкі не стане, паднімецца беларускі сцяг!',
    hintSplit: 'КЛІК — рой',
    hintDive: 'КЛІК — піке',
    hintBurst: 'КЛІК — імпульс',
    raising: 'АБ\'ЕКТ ЧЫСТЫ — УЗДЫМАЕМ СЦЯГ',
    cleared: 'ЗАЧЫШЧАНА',
    clearedScore: (n, stars) => `Лік ${n}  ·  ${stars}`,
    next: 'ДАЛЕЙ',
    finish: 'КАНЕЦ',
    gameOver: 'РЭЖЫМ ТРЫМАЕЦЦА',
    gameOverSub: 'Птушкі скончыліся — апарат стаіць.',
    retry: 'ЯШЧЭ РАЗ',
    victory: 'РЭЖЫМ ЗВАЛЕНЫ',
    victoryScore: (n) => `Канчатковы лік ${n}`,
    menu: 'МЕНЮ',
    levels: {
      belta: 'Рэдакцыя БелТА',
      mvd: 'Пашпартны МУС',
      okrestina: 'Ізалятар Акрэсціна',
      railway: 'Грузавы двор БЧ',
      azot: 'Гродна Азот',
      kgb: 'Сетка КДБ',
      border: 'Памежны пункт',
      aeroflot: 'Мінск-2',
    },
    history: {
      belta: 'Жнівень 2020. Кіберпартызаны ўзламалі БелТА і дзяржаўны інфармаправод: злілі рэдакцыйныя загады і пусцілі ў эфір гісторыю скрадзеных выбараў.',
      mvd: '2021. Яны выклалі базы пашпартнага стала МУС і ГУБАЗіКа — імёны, фота і хатнія адрасы амапаўцаў.',
      okrestina: 'Пасля катаванняў жніўня 2020 на Акрэсціна яны апублікавалі спісы зняволеных і назвалі супрацоўнікаў ізалятара.',
      railway: 'Студзень 2022. Заблакавалі Беларускую чыгунку, каб замарудзіць эшалоны расійскіх войскаў на Украіну. Білеты палеглі; пагражалі сігналізацыі.',
      azot: '2022. Узлом «Гродна Азот» зліў вытворчыя і экспартныя ведамасці, якімі абыходзілі санкцыі і кармілі ваенную эканоміку.',
      kgb: 'Урэзаліся ў сеткі КДБ і злілі даносы: хто на каго пісаў у камітэт, спісы афіцэраў і ўнутраную пошту — таемная паліцыя і яе стукачы названыя ўголас.',
      border: 'Злілі базы Дзяржпагражкамітэта: журналы пераходаў і падраздзяленні, якія пасля 2020 палявалі на людзей па-за мапамі.',
      aeroflot: 'Ліпень 2025. Разам з Silent Crow паклалі «Аэрафлот»: сцерлі тысячы сервераў, Шэрэмецьева стала, злілі ваенна-лагістычныя файлы авіякампаніі.',
    },
  },
  en: {
    docTitle: 'Cyberpartisans vs. Lukashenko',
    score: (n) => `SCORE ${n}`,
    musicOn: '♪ ON',
    musicOff: '♪ OFF',
    restart: 'RESTART',
    play: 'PLAY',
    title: 'CYBERPARTISANS',
    vs: 'vs. THE REGIME',
    blurb1: "Partisan birds against Lukashenko's regime for a Free Belarus. The Lukashenko flag stays up until the site is cleared.",
    blurb2: 'Drag the slingshot with the bird to pick a target. Fire at the cockroaches guarding the flag. Release the bird to launch it into flight. During flight, tap anywhere on the screen to trigger the bird\'s ability. Each bird has its own ability. When Lukashenko\'s cockroaches are gone, the Belarusian flag will rise!',
    hintSplit: 'CLICK — split',
    hintDive: 'CLICK — dive',
    hintBurst: 'CLICK — burst',
    raising: 'SITE CLEARED — RAISING THE FLAG',
    cleared: 'LEVEL CLEARED',
    clearedScore: (n, stars) => `Score ${n}  ·  ${stars}`,
    next: 'NEXT LEVEL',
    finish: 'FINISH',
    gameOver: 'THE REGIME HOLDS',
    gameOverSub: 'Out of birds — the apparatus stands.',
    retry: 'RETRY',
    victory: 'REGIME TOPPLED',
    victoryScore: (n) => `Final score ${n}`,
    menu: 'MAIN MENU',
    levels: {
      belta: 'BelTA newsroom',
      mvd: 'MVD passport hall',
      okrestina: 'Akrestsina isolator',
      railway: 'BCh freight yard',
      azot: 'Grodno Azot',
      kgb: 'KGB network',
      border: 'Border checkpoint',
      aeroflot: 'Minsk-2',
    },
    history: {
      belta: 'August 2020. Cyber Partisans breached BelTA and the state news stack, leaking editorial orders and putting the stolen-election story on the wire.',
      mvd: '2021. They dumped the Interior Ministry passport hall and GUBOPiK files — names, photos, and home addresses of the riot police.',
      okrestina: 'After the August 2020 torture at Akrestsina, they published detainee lists and named the isolator staff who ran the cages.',
      railway: 'January 2022. They locked Belarusian Railway to slow Russian troop trains toward Ukraine. Ticket systems died; they threatened the signaling layer.',
      azot: '2022. A breach at Grodno Azot leaked production and export ledgers used to dodge sanctions and feed the war economy.',
      kgb: 'They cut into KGB networks and leaked the denunciation files — who informed on whom — plus officer lists and internal mail. The secret police and their snitches, named in public.',
      border: 'They dumped State Border Committee crossing logs and the units that hunted people off the maps after 2020.',
      aeroflot: 'July 2025. With Silent Crow they wrecked Aeroflot: thousands of servers wiped, Sheremetyevo grounded, and the airline’s war-logistics files dumped.',
    },
  },
};

export function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === 'be' || v === 'en') return v;
  } catch { /* private mode */ }
  return DEFAULT_LOCALE;
}

export function applyLocale(locale: Locale): void {
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* private mode */ }
  document.documentElement.lang = locale;
  document.title = STRINGS[locale].docTitle;
}
