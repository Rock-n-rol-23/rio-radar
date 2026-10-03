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

  // Белый список перевозчиков: код IATA → название
  airlines: {
    EK: 'Emirates',
    QR: 'Qatar Airways',
    TK: 'Turkish Airlines',
    EY: 'Etihad Airways',
    ET: 'Ethiopian Airlines',
    SU: 'Аэрофлот',
  },

  // Названия прочих перевозчиков, чтобы показывать причину фильтра по-человечески
  knownAirlines: {
    G9: 'Air Arabia', FZ: 'flydubai', PC: 'Pegasus', WZ: 'Red Wings',
    N4: 'Nordwind', U6: 'Уральские авиалинии', S7: 'S7', DP: 'Победа',
    UT: 'ЮТэйр', '5N': 'Smartavia', A4: 'Azimuth',
    CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern', HU: 'Hainan',
    AF: 'Air France', LH: 'Lufthansa', KL: 'KLM', LX: 'Swiss', AZ: 'ITA',
    IB: 'Iberia', TP: 'TAP', LA: 'LATAM', G3: 'GOL', AD: 'Azul',
    MS: 'EgyptAir', RJ: 'Royal Jordanian', J2: 'AZAL', HY: 'Uzbekistan Airways',
    KC: 'Air Astana', A3: 'Aegean', GF: 'Gulf Air', WY: 'Oman Air',
    SV: 'Saudia', XY: 'flynas', AI: 'Air India', B2: 'Belavia',
  },

  currency: 'rub',
  market: 'ru',

  // Сколько держать ответ Travelpayouts в кеше
  cacheTtlMs: 30 * 60 * 1000,

  // Окно длительности поездки для режима «туда и обратно»
  tripDays: { min: 3, max: 30, defaultMin: 7, defaultMax: 21 },

  // Сколько вариантов показывать в панели
  roundtripLimit: 5,
  durationLimit: 10,
};
