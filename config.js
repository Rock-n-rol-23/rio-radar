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

  // Сколько держать ответ Travelpayouts в кеше
  cacheTtlMs: 30 * 60 * 1000,

  // Окно длительности поездки для режима «туда и обратно»
  tripDays: { min: 3, max: 30, defaultMin: 7, defaultMax: 21 },

  // Сколько вариантов отдавать
  dayOptionsLimit: 10,   // вариантов на день в календаре «туда»
  roundtripLimit: 8,     // вариантов на пару дат
  durationLimit: 12,     // вариантов в окне длительности
};
