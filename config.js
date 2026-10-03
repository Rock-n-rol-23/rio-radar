// Настройки Рио Радара. Меняйте здесь, код трогать не нужно.
export const config = {
  // Города (IATA-коды городов: все аэропорты сразу)
  origin: 'MOW',
  destination: 'RIO',
  originName: 'Москва',
  destinationName: 'Рио-де-Жанейро',

  // Месяцы периода поиска, по порядку
  months: ['2026-12', '2027-01', '2027-02'],

  // Максимум пересадок в одну сторону
  maxTransfers: 2,

  // Белый список: основной перевозчик билета должен быть отсюда
  airlines: {
    EK: 'Emirates',
    QR: 'Qatar Airways',
    TK: 'Turkish Airlines',
    EY: 'Etihad Airways',
    ET: 'Ethiopian Airlines',
    SU: 'Аэрофлот',
  },

  // Партнёры, которым разрешено выполнять отдельные плечи внутри билета
  // (обычно внутренний перелёт Сан-Паулу → Рио). Основным перевозчиком быть не могут.
  partnerAirlines: {
    LA: 'LATAM',
    JJ: 'LATAM Brasil',
    G3: 'GOL',
  },

  // Названия прочих перевозчиков, чтобы показывать причину фильтра по-человечески
  knownAirlines: {
    AD: 'Azul', G9: 'Air Arabia', FZ: 'flydubai', PC: 'Pegasus', VF: 'AJet', WZ: 'Red Wings',
    N4: 'Nordwind', U6: 'Уральские авиалинии', S7: 'S7', DP: 'Победа',
    UT: 'ЮТэйр', '5N': 'Smartavia', A4: 'Азимут', '2S': 'Southwind', '3F': 'Fly One Armenia', '5G': 'Al Masria',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HU: 'Hainan',
    AF: 'Air France', LH: 'Lufthansa', KL: 'KLM', LX: 'Swiss', AZ: 'ITA', UX: 'Air Europa',
    IB: 'Iberia', TP: 'TAP', AT: 'Royal Air Maroc', AV: 'Avianca', UA: 'United',
    MS: 'EgyptAir', RJ: 'Royal Jordanian', J2: 'AZAL', HY: 'Uzbekistan Airways',
    KC: 'Air Astana', A3: 'Aegean', GF: 'Gulf Air', WY: 'Oman Air',
    SV: 'Saudia', XY: 'flynas', AI: 'Air India', B2: 'Belavia',
  },

  // Названия аэропортов пересадки
  hubs: {
    DXB: 'Дубай', DWC: 'Дубай (Аль-Мактум)', XNB: 'Дубай (автобус)', AUH: 'Абу-Даби',
    DOH: 'Доха', IST: 'Стамбул', SAW: 'Стамбул (Сабиха)', ADD: 'Аддис-Абеба',
    GRU: 'Сан-Паулу', CGH: 'Сан-Паулу (Конгоньяс)', VCP: 'Кампинас', BSB: 'Бразилиа',
    LIS: 'Лиссабон', MAD: 'Мадрид', CDG: 'Париж', FRA: 'Франкфурт', AMS: 'Амстердам',
    CMN: 'Касабланка', CAI: 'Каир', BOG: 'Богота', PTY: 'Панама', FCO: 'Рим', MXP: 'Милан',
    SVO: 'Шереметьево', DME: 'Домодедово', VKO: 'Внуково', GIG: 'Галеан', SDU: 'Сантос-Дюмон',
  },

  // Шопинг в аэропортах пересадки. Ручной справочник: каждая строка с источником и датой проверки.
  // apple: 'yes' | 'no' | 'unknown'. access: доступно ли транзитному пассажиру без выхода в город.
  hubShopping: {
    DXB: {
      checkedAt: '2026-10-03',
      apple: 'yes',
      appleWhere: 'Два магазина Apple у Dubai Duty Free в Терминале 3 (конкорс B, у выходов B15 и A12): iPhone, iPad, Mac, Watch, аксессуары.',
      brands: ['Hermès', 'Gucci', 'Burberry', 'Chanel', 'Bulgari', 'Cartier'],
      brandsNote: 'Dubai Duty Free, крупнейший duty free в мире, с бутиками люксовых брендов по всему Терминалу 3.',
      access: 'Emirates прилетает и улетает из Терминала 3, транзитный пассажир остаётся в чистой зоне, магазины доступны.',
      sources: [
        { title: 'Arabian Business: два магазина Apple в DXB', url: 'https://www.arabianbusiness.com/gcc/two-apple-shops-open-at-dubai-international-airport-635903' },
        { title: 'Dubai Duty Free', url: 'https://www.dubaidutyfree.com/' },
      ],
    },
    DOH: {
      checkedAt: '2026-10-03',
      apple: 'yes',
      appleWhere: 'Apple Shop от Qatar Duty Free (86 м²) за жёлтым медведем Lamp Bear в южной части Retail Plaza: iPhone, iPad, Mac, Watch, Apple TV.',
      brands: ['Hermès', 'Gucci', 'Chanel', 'Bulgari', 'Loro Piana', 'Tiffany & Co.', 'Ralph Lauren', 'Moncler', 'Rolex'],
      brandsNote: 'Более 90 бутиков Qatar Duty Free в транзитной зоне Хамада.',
      access: 'Пересадка Qatar Airways проходит в чистой зоне, магазины доступны.',
      sources: [
        { title: 'Gulf Times: QDF открыл Apple Shop в HIA', url: 'https://gulf-times.com/story/702608/qdf-opens-apple-shop-at-hia' },
        { title: 'Moodie Davitt: люксовые бутики QDF', url: 'https://moodiedavittreport.com/qatar-duty-free-strengthens-hamad-international-airport-luxury-offer-with-branded-boutique-openings' },
      ],
    },
    IST: {
      checkedAt: '2026-10-03',
      apple: 'unknown',
      appleWhere: 'Отдельного магазина Apple не нашли. У Unifree есть магазины электроники со смартфонами, крупный (140 м²) расположен в зоне прилёта, транзитом туда не попасть.',
      brands: ['Louis Vuitton', 'Hermès', 'Gucci', 'Prada', 'Dior', 'Fendi', 'Bottega Veneta', 'Saint Laurent', 'Loro Piana', 'Bulgari'],
      brandsNote: 'Зона duty free 53 000 м², секция High&Lux Hills с люксовыми бутиками в международной транзитной зоне.',
      access: 'Международный транзит Turkish Airlines проходит в чистой зоне, бутики доступны.',
      sources: [
        { title: 'Istanbul Airport: магазины', url: 'https://www.istairport.com/en/services/shopping/stores' },
        { title: 'Moodie Davitt: магазин электроники Unifree', url: 'https://moodiedavittreport.com/?p=388325' },
      ],
    },
    SAW: {
      checkedAt: '2026-10-03',
      apple: 'unknown',
      appleWhere: 'Аэропорт Сабиха Гёкчен заметно меньше основного, сведений о магазине Apple нет.',
      brands: [],
      brandsNote: 'Данных о бутиках известных брендов нет.',
      access: 'Пересадка в SAW часто означает смену аэропорта на IST, уточняйте маршрут.',
      sources: [],
    },
    AUH: {
      checkedAt: '2026-10-03',
      apple: 'unknown',
      appleWhere: 'Отдельного магазина Apple не нашли; электроника и гаджеты в магазине Capi в Терминале A.',
      brands: ['Hermès', 'Bulgari', 'Bottega Veneta', 'Gucci', 'Dior', 'Saint Laurent', 'Ralph Lauren', 'Coach'],
      brandsNote: 'Терминал A: 163 магазина, флагманские бутики люксовых брендов.',
      access: 'Пересадка Etihad в Терминале A, магазины в чистой зоне доступны.',
      sources: [
        { title: 'Visit Abu Dhabi: аэропорт Зайед', url: 'https://visitabudhabi.ae/en/plan-your-trip/travelling-to-abu-dhabi/zayed-international-airport' },
      ],
    },
    ADD: {
      checkedAt: '2026-10-03',
      apple: 'no',
      appleWhere: 'Магазина Apple нет. Duty free Alfarag и Flemingo: парфюм, алкоголь, сувениры, немного гаджетов.',
      brands: [],
      brandsNote: 'Бутиков известных модных брендов не нашли.',
      access: 'Транзит Ethiopian в Терминале 2, duty free доступен, но выбор скромный.',
      sources: [
        { title: 'TRBusiness: обновлённые магазины Alfarag в Аддис-Абебе', url: 'https://www.trbusiness.com/regional-news/africa/alfarag-duty-free-unveils-revamped-stores-at-addis-ababa-bole-international-airport/267224' },
      ],
    },
    GRU: {
      checkedAt: '2026-10-03',
      apple: 'yes',
      appleWhere: 'Магазин Apple (58 м²) в зоне duty free международных вылетов Терминала 3.',
      brands: ['Burberry', 'Hugo Boss', 'Michael Kors', 'Coach', 'Emporio Armani', 'Salvatore Ferragamo', 'Tommy Hilfiger', 'Lacoste', 'Dunhill'],
      brandsNote: 'GRU Avenue в Терминале 3: бутики иностранных брендов в международной зоне.',
      access: 'Внимание: при пересадке на внутренний рейс до Рио вы проходите паспортный контроль и в международную зону с этими магазинами, скорее всего, не попадёте.',
      sources: [
        { title: 'Melhores Destinos: Apple в GRU', url: 'https://www.melhoresdestinos.com.br/apple-gru-iphone-desconto.html' },
        { title: 'Moodie Davitt: люксовые бутики в T3 GRU', url: 'https://moodiedavittreport.com/gru-airport-and-dufry-reveal-luxury-line-up-for-sao-paulo-t3/' },
      ],
    },
  },

  // Сколько держать ответ Travelpayouts в кеше
  cacheTtlMs: 30 * 60 * 1000,

  // Окно длительности поездки для режима «туда и обратно»
  tripDays: { min: 3, max: 30, defaultMin: 7, defaultMax: 21 },

  // Сколько вариантов отдавать
  dayOptionsLimit: 10,   // вариантов на день в календаре «туда»
  roundtripLimit: 8,     // вариантов на пару дат
  durationLimit: 12,     // вариантов в окне длительности
};
