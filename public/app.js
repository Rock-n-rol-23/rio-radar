// Рио Радар: состояние, календарь, панель предложений.

const DEFAULTS = {
  mode: 'oneway', adults: 1, maxTransfers: 2, sort: 'price', source: 'aviasales',
  returnMode: 'window', minDays: 7, maxDays: 21,
  depart: null, ret: null,
};
const NUMERIC = new Set(['adults', 'maxTransfers', 'minDays', 'maxDays']);
const ORIGIN = 'MOW';
const DESTINATION = 'RIO';
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const state = { ...DEFAULTS };
let cal = null;            // ответ /api/calendar
let google = null;         // public/data/google.json, если есть
const activeSource = () => (state.source === 'google' && google && state.mode === 'oneway') ? 'google' : 'aviasales';
const activeDays = () => activeSource() === 'google' ? google.days : cal.days;
const SOURCE_NAME = { aviasales: 'Aviasales (кеш поисков за 48 часов)', google: 'Google Flights (живые цены, обновляются раз в день)' };
let panelRequest = 0;      // защита от гонок запросов панели
const today = new Date().toISOString().slice(0, 10);

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/* ---------- Форматирование ---------- */
const nf = new Intl.NumberFormat('ru-RU');
const fmtPrice = (n) => `${nf.format(n)} ₽`;
const fmtCompact = (n) => `${Math.round(n / 1000)}к`;
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
const fmtTransfers = (n) => n === 0 ? 'без пересадок' : `${n} ${plural(n, ['пересадка', 'пересадки', 'пересадок'])}`;
const fmtDays = (n) => `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
function fmtDuration(min) {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
function fmtDate(iso, withWeekday = true) {
  const d = new Date(iso + 'T00:00:00Z');
  const s = `${d.getUTCDate()} ${MONTHS_RU[d.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${s}` : s;
}
function fmtStamp(ms) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(ms)) + ' МСК';
}
const priceFor = (offer, adults) => ({ price: offer.price * adults, estimated: adults > 1 });
const ddmm = (iso) => iso.slice(8, 10) + iso.slice(5, 7);
const searchLink = (depart, ret) => `https://www.aviasales.ru/search/${ORIGIN}${ddmm(depart)}${DESTINATION}${ret ? ddmm(ret) : ''}${state.adults}`;
// Ссылка на конкретный билет из кеша; число взрослых подставляем в код маршрута
const ticketLink = (o) => o.source === 'google' ? o.link : (o.link ? o.link.replace(/1\?t=/, `${state.adults}?t=`) : searchLink(o.date, o.returnDate));
const logoUrl = (code) => `https://pics.avs.io/100/50/${code}.png`;
// Ссылка на сайт авиакомпании с подстановкой маршрута, где сайт это умеет
function airlineLink(o) {
  const site = cal?.airlineSites?.[o.airline];
  if (!site) return null;
  const tpl = o.returnDate ? site.roundtrip : site.oneway;
  const compact = (iso) => iso.replaceAll('-', '');
  const url = tpl
    .replaceAll('{origin}', ORIGIN).replaceAll('{destination}', DESTINATION)
    .replaceAll('{depart}', o.date).replaceAll('{ret}', o.returnDate ?? '')
    .replaceAll('{departCompact}', compact(o.date)).replaceAll('{retCompact}', o.returnDate ? compact(o.returnDate) : '')
    .replaceAll('{adults}', String(state.adults));
  return { url, prefill: site.prefill };
}
function airlineButton(o) {
  const a = airlineLink(o);
  if (!a) return [];
  const btn = link(a.url, `Сайт ${shortName(o.airlineName)}`, true);
  const note = el('p', 'card__note', a.prefill === 'full'
    ? 'Откроется выдача авиакомпании с вашим маршрутом, датами и пассажирами.'
    : a.prefill === 'partial'
      ? 'Сайт подставит вылет и дату, пункт назначения проверьте вручную.'
      : 'Сайт не принимает маршрут из ссылки: откроется форма поиска, маршрут и даты введите вручную.');
  return [btn, note];
}
const shortName = (name) => name.replace(/\s+(Airways|Airlines)$/i, '');
const via = (names) => names.length ? `через ${names.join(' и ')}` : 'прямой';

/* ---------- Состояние и URL ---------- */
function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) {
    if (!p.has(k)) continue;
    const v = p.get(k);
    state[k] = NUMERIC.has(k) ? Number(v) : v;
  }
  if (state.minDays > state.maxDays) [state.minDays, state.maxDays] = [state.maxDays, state.minDays];
}
function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== null && v !== DEFAULTS[k]) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}
function syncControls() {
  document.body.dataset.mode = state.mode;
  document.body.dataset.return = state.returnMode;
  document.body.dataset.source = state.source;
  for (const seg of document.querySelectorAll('.seg')) {
    const key = seg.dataset.key;
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value) === String(state[key]));
  }
  $('#minDays').value = state.minDays;
  $('#maxDays').value = state.maxDays;
  $('#minDaysVal').value = state.minDays;
  $('#maxDaysVal').value = state.maxDays;
  requestAnimationFrame(measureControls);
}
function measureControls() {
  document.documentElement.style.setProperty('--controls-h', `${$('#controls').offsetHeight}px`);
}
window.addEventListener('resize', measureControls);

/* ---------- Данные ---------- */
const fits = (o) => o.transfers <= state.maxTransfers && (o.returnTransfers ?? 0) <= state.maxTransfers;
// Варианты дня, подходящие под клиентский фильтр пересадок
const byDuration = (a, b) => (a.durationMin ?? 1e9) - (b.durationMin ?? 1e9) || a.price - b.price;
const byPrice = (a, b) => a.price - b.price;
const sortFn = () => state.sort === 'duration' ? byDuration : byPrice;
const optionsFor = (day) => (day?.options ?? []).filter(fits).sort(sortFn());
const bestFor = (day) => optionsFor(day)[0] ?? null;
const metric = (o) => state.sort === 'duration' ? (o.durationMin ?? 1e9) : o.price;

function reasonText(offer, short = false) {
  const name = shortName(offer.airlineName);
  if (offer.reason === 'airline') return short ? name : `только ${name}`;
  if (offer.reason === 'partner') return short ? `плечо ${shortName(offer.reasonDetailName)}` : `плечо на ${shortName(offer.reasonDetailName)}`;
  return short ? `${offer.transfers} пер.` : fmtTransfers(offer.transfers);
}

async function loadCalendar() {
  $('#calendar').classList.add('is-loading');
  renderCalendarSkeleton();
  try {
    const [res, gres] = await Promise.all([fetch('/api/calendar'), fetch('/data/google.json').catch(() => null)]);
    google = gres && gres.ok ? await gres.json() : null;
    document.body.dataset.google = google ? '1' : '0';
    if (!res.ok) throw new Error(res.status === 503 ? 'source' : 'http');
    cal = await res.json();
    if (google) {
      // Данные Google хранят только коды хабов, названия берём из справочника сервера
      const nameOf = (c) => cal.hubs?.[c] ?? c;
      for (const day of Object.values(google.days)) {
        for (const o of [day.best, day.fastest, day.cheapestAny, ...(day.options ?? [])]) {
          if (o && !o.hubNames) { o.hubNames = (o.hubs ?? []).map(nameOf); o.returnHubNames = (o.returnHubs ?? []).map(nameOf); }
        }
      }
    }
    hideBanner();
    if (cal.stale) showBanner('warn', `Источник временно недоступен. Показываем цены от ${fmtStamp(cal.fetchedAt)}.`);
    else if (cal.demo) showBanner('info', 'Демо-режим: цены выдуманы, чтобы посмотреть интерфейс. Вставьте токен Travelpayouts в .env для настоящих.');
    else if (cal.stats.daysWithData === 0) showBanner('warn', 'Aviasales пока не нашёл билетов на этот период: кеш хранит поиски за 48 часов. Загляните позже.');
  } catch (err) {
    cal = null;
    showBanner('error', 'Не удалось получить цены: источник недоступен.', loadCalendar);
  } finally {
    $('#calendar').classList.remove('is-loading');
  }
  renderCalendar();
  renderPanel();
  renderStatus();
  renderStats();
  renderLivePill();
}

/* ---------- Плитки лучшей цены по месяцам ---------- */
function renderStats() {
  const root = $('#stats');
  if (!root) return;
  root.replaceChildren();
  if (!cal) return;
  for (const ym of cal.months) {
    const meta = monthMeta(ym);
    const entries = Object.entries(activeDays()).filter(([d]) => d.startsWith(ym)).map(([date, day]) => [date, bestFor(day)]).filter(([, b]) => b);
    const tile = el('button', 'stat');
    tile.type = 'button';
    tile.append(el('span', 'stat__label', `${meta.title} · ${state.sort === 'duration' ? 'самый быстрый' : 'самый дешёвый'}`));
    if (!entries.length) {
      tile.classList.add('is-empty');
      tile.append(el('span', 'stat__value', 'нет подходящих'));
      tile.append(el('span', 'stat__sub', 'кеш пока пуст'));
    } else {
      entries.sort((a, b) => metric(a[1]) - metric(b[1]));
      const [date, best] = entries[0];
      const v = el('span', 'stat__value', state.sort === 'duration' ? fmtDuration(best.durationMin) : fmtPrice(priceFor(best, state.adults).price));
      v.append(el('small', null, state.sort === 'duration' ? fmtPrice(priceFor(best, state.adults).price) : (state.adults === 2 ? 'за двоих' : 'за одного')));
      tile.append(v);
      tile.append(el('span', 'stat__sub', `${fmtDate(date)} · ${shortName(best.airlineName)} ${via(best.hubNames)}`));
      tile.addEventListener('click', () => {
        state.depart = date; state.ret = null;
        writeUrl(); renderCalendar(); renderPanel();
        const cell = document.querySelector(`.day[data-date="${date}"]`);
        if (cell) {
          cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
          cell.classList.add('is-pulse');
          setTimeout(() => cell.classList.remove('is-pulse'), 1000);
        }
      });
    }
    root.append(tile);
  }
}

function renderLivePill() {
  const pill = $('#livePill');
  if (!pill) return;
  pill.classList.remove('is-stale', 'is-demo');
  if (!cal) { pill.textContent = 'нет данных'; pill.classList.add('is-stale'); return; }
  if (cal.demo) { pill.textContent = 'демо-данные'; pill.classList.add('is-demo'); return; }
  const t = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(cal.fetchedAt));
  pill.textContent = `${cal.stale ? 'данные от' : 'обновлено'} ${t} МСК`;
  if (cal.stale) pill.classList.add('is-stale');
}

/* ---------- Баннер ---------- */
function showBanner(kind, text, retry) {
  const b = $('#banner');
  b.className = `banner banner--${kind}`;
  b.replaceChildren(el('span', null, text));
  if (retry) {
    const btn = el('button', null, 'Повторить');
    btn.addEventListener('click', retry);
    b.append(btn);
  }
  b.hidden = false;
}
function hideBanner() { $('#banner').hidden = true; }

/* ---------- Календарь ---------- */
function monthMeta(ym) {
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // 0 = понедельник
  return { y, m, days, firstDow, title: `${MONTHS_RU_NOM[m - 1]} ${y}` };
}

function renderCalendarSkeleton() {
  const root = $('#calendar');
  root.replaceChildren();
  for (const ym of ['2026-12', '2027-01', '2027-02']) {
    const meta = monthMeta(ym);
    const block = el('section', 'month');
    block.append(el('h2', 'month__title', meta.title));
    const grid = el('div', 'grid');
    for (let i = 0; i < meta.firstDow + meta.days; i++) grid.append(el('div', `day${i < meta.firstDow ? ' is-pad' : ''}`));
    block.append(grid);
    root.append(block);
  }
}

function renderCalendar() {
  const root = $('#calendar');
  root.replaceChildren();
  if (!cal) { renderCalendarSkeleton(); return; }

  const legend = el('div', 'legend');
  legend.append(
    legendItem('cheap', state.sort === 'duration' ? 'три самых быстрых дня месяца' : 'три самых выгодных дня месяца'),
    legendItem('', 'лучший подходящий билет, цена в одну сторону'),
    legendItem('filtered', 'подходит, но пересадок больше, чем в фильтре'),
    legendItem('blocked', 'есть билеты, но перевозчик вне списка'),
    legendItem('empty', 'нет данных за 48 часов'),
  );
  root.append(legend);
  const note = el('p', 'source-note');
  note.append('Источник календаря: ', el('b', null, SOURCE_NAME[activeSource()]));
  if (activeSource() === 'google') note.append(`, обновляется частями каждые 3 часа, последний раз ${fmtStamp(google.fetchedAt)}`);
  else if (google) note.append('. Переключатель «Google Flights» покажет живые цены перевозчиков.');
  root.append(note);

  const days = activeDays();
  const bests = Object.values(days).map(bestFor).filter(Boolean);
  const cheap = new Set(cheapestDates());
  const values = bests.map(metric);
  const minP = Math.min(...values), maxP = Math.max(...values);

  for (const ym of cal.months) {
    const meta = monthMeta(ym);
    const block = el('section', 'month');
    const title = el('h2', 'month__title');
    title.append(el('span', null, meta.title));
    const monthBests = Object.entries(days).filter(([d]) => d.startsWith(ym)).map(([, day]) => bestFor(day)).filter(Boolean);
    if (monthBests.length) {
      const m = el('span', 'month__min');
      if (state.sort === 'duration') m.append('быстрее всего ', el('b', null, fmtDuration(Math.min(...monthBests.map((o) => o.durationMin ?? 1e9)))));
      else m.append('от ', el('b', null, fmtPrice(priceFor({ price: Math.min(...monthBests.map((o) => o.price)) }, state.adults).price)));
      title.append(m);
    }
    block.append(title);

    const wd = el('div', 'weekdays');
    for (const w of WEEKDAYS) wd.append(el('span', null, w));
    block.append(wd);

    const grid = el('div', 'grid');
    for (let i = 0; i < meta.firstDow; i++) grid.append(el('div', 'day is-pad'));
    for (let d = 1; d <= meta.days; d++) {
      const date = `${ym}-${String(d).padStart(2, '0')}`;
      grid.append(renderDay(date, d, days[date], cheap, minP, maxP));
    }
    block.append(grid);
    root.append(block);
  }
}

// Три самых дешёвых дня месяца с учётом клиентского фильтра пересадок
function cheapestDates() {
  const byMonth = new Map();
  for (const [date, day] of Object.entries(activeDays())) {
    const b = bestFor(day);
    if (!b) continue;
    const m = date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push([date, metric(b)]);
  }
  return [...byMonth.values()].flatMap((list) => list.sort((a, b) => a[1] - b[1]).slice(0, 3).map(([d]) => d));
}

function legendItem(cls, text) {
  const s = el('span');
  s.append(el('i', cls), text);
  return s;
}

function renderDay(date, num, day, cheap, minP, maxP) {
  const b = el('button', 'day');
  b.type = 'button';
  b.dataset.date = date;
  b.append(el('span', 'day__num', String(num)));

  const past = date < today;
  if (past) b.classList.add('is-past');
  const best = bestFor(day);

  if (best) {
    const { price } = priceFor(best, state.adults);
    b.classList.add('is-usable');
    const heat = maxP > minP ? 1 - (metric(best) - minP) / (maxP - minP) : 0.5;
    b.style.setProperty('--heat', heat.toFixed(2));
    if (cheap.has(date)) b.classList.add('is-cheap');
    b.append(el('span', 'day__price', fmtPrice(price)));
    b.append(el('span', 'day__price-compact', fmtCompact(price)));
    const n = optionsFor(day).length;
    b.append(el('span', 'day__meta', state.sort === 'duration'
      ? `${fmtDuration(best.durationMin)} · ${shortName(best.airlineName)}`
      : `${shortName(best.airlineName)}${n > 1 ? ` +${n - 1}` : ''}`));
    b.title = `${fmtDate(date)}: ${best.airlineName}, ${fmtTransfers(best.transfers)} ${via(best.hubNames)}, ${fmtDuration(best.durationMin)}. Вариантов: ${n}.`;
  } else if (day?.best) {
    const b0 = day.best;
    b.classList.add('is-filtered');
    b.append(el('span', 'day__price', fmtPrice(priceFor(b0, state.adults).price)));
    b.append(el('span', 'day__price-compact', fmtCompact(priceFor(b0, state.adults).price)));
    b.append(el('span', 'day__meta', `${shortName(b0.airlineName)} · ${b0.transfers} перес.`));
    b.title = `${fmtDate(date)}: подходящие билеты есть (${day.allowedCount}), но все с ${b0.transfers} пересадками. Переключите фильтр на «до 2 пересадок».`;
  } else if (day) {
    const any = day.cheapestAny;
    b.classList.add('is-blocked');
    b.append(el('span', 'day__price', fmtPrice(priceFor(any, state.adults).price)));
    b.append(el('span', 'day__price-compact', fmtCompact(priceFor(any, state.adults).price)));
    b.append(el('span', 'day__meta', reasonText(any, true)));
    b.title = `${fmtDate(date)}: ${day.total} ${plural(day.total, ['билет', 'билета', 'билетов'])} в кеше, но ни один не проходит фильтр. Самый дешёвый у ${any.airlineName}: ${reasonText(any)}.`;
  } else {
    b.classList.add('is-empty');
    b.append(el('span', 'day__price', '—'));
    b.append(el('span', 'day__price-compact', '—'));
    b.append(el('span', 'day__meta', ''));
    b.title = `${fmtDate(date)}: Aviasales не нашёл билетов за последние 48 часов. Можно проверить вручную.`;
  }

  if (date === state.depart) b.classList.add('is-selected');
  if (date === state.ret) b.classList.add('is-return');
  if (state.depart && state.ret && date > state.depart && date < state.ret) b.classList.add('is-range');
  if (!past) b.addEventListener('click', () => onDayClick(date));
  return b;
}

function onDayClick(date) {
  if (state.mode === 'roundtrip' && state.returnMode === 'exact') {
    if (!state.depart || state.ret || date <= state.depart) { state.depart = date; state.ret = null; }
    else state.ret = date;
  } else {
    state.depart = date;
    state.ret = null;
  }
  writeUrl();
  renderCalendar();
  renderPanel();
  if (window.matchMedia('(max-width: 900px)').matches) {
    $('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- Панель ---------- */
function renderPanel() {
  const panel = $('#panel');
  panel.replaceChildren();
  if (!cal) return;

  if (!state.depart) {
    const c = el('div', 'card card--hint');
    c.append(hintText('Выберите день вылета в календаре.', 'Дни со звёздочкой ★ — три самых выгодных в месяце. Полосатые дни: билеты есть, но перевозчик или пересадки не проходят фильтр.'));
    panel.append(c);
    return;
  }

  if (state.mode === 'oneway') { renderOneWay(panel); return; }
  if (state.returnMode === 'exact' && !state.ret) {
    const c = el('div', 'card card--hint');
    c.append(hintText(`Вылет ${fmtDate(state.depart)}.`, 'Теперь выберите день возврата в календаре.'));
    panel.append(c);
    return;
  }
  renderRoundTrip(panel);
}

function hintText(strong, rest) {
  const p = el('p');
  p.style.margin = '0';
  p.append(el('b', null, strong), ' ', rest);
  return p;
}

function compareRow(date) {
  // Лучшая цена по другому источнику на эту дату
  const other = activeSource() === 'google' ? 'aviasales' : 'google';
  const otherDays = other === 'google' ? google?.days : cal?.days;
  if (!otherDays) return null;
  const b = bestFor(otherDays[date]);
  const r = el('div', 'compare');
  const label = other === 'google' ? `Google Flights, ${fmtStamp(google.fetchedAt)}` : 'Aviasales, кеш за 48 часов';
  if (b) {
    r.append(el('span', null, `${label}: `), el('b', null, `${fmtPrice(priceFor(b, state.adults).price)} · ${shortName(b.airlineName)}`));
    const a = el('a', null, 'сравнить ↗');
    a.href = ticketLink(b); a.target = '_blank'; a.rel = 'noopener';
    r.append(a);
  } else {
    r.append(el('span', null, `${label}: подходящих билетов нет`));
  }
  return r;
}

function renderOneWay(panel) {
  const day = activeDays()[state.depart];
  const options = optionsFor(day);
  const card = el('div', 'card');
  const srcLabel = activeSource() === 'google' ? 'Google Flights' : 'Aviasales';
  card.append(el('div', 'card__dates', `${fmtDate(state.depart)} · в одну сторону · ${state.adults === 1 ? '1 взрослый' : '2 взрослых'} · ${srcLabel}`));

  if (options.length) {
    const best = options[0];
    card.append(airlineBlock(best));
    card.append(row('Маршрут', via(best.hubNames)));
    card.append(row('В пути', fmtDuration(best.durationMin)));
    card.append(row('Пересадки', fmtTransfers(best.transfers)));
    card.append(row('Аэропорты', `${best.originAirport} → ${best.destinationAirport}`));
    card.append(priceBlock(best));
    card.append(link(ticketLink(best), best.source === 'google' ? 'Открыть в Google Flights' : 'Открыть на Aviasales'));
    card.append(...airlineButton(best));
    const cmp = compareRow(state.depart);
    if (cmp) card.append(cmp);
    if (options.length > 1) {
      card.append(el('div', 'card__sub', `Ещё ${options.length - 1} ${plural(options.length - 1, ['вариант', 'варианта', 'вариантов'])} на этот день, ${state.sort === 'duration' ? 'по времени в пути' : 'по цене'}`));
      const list = el('div', 'offers');
      for (const o of options.slice(1)) list.append(offerRow(o, false));
      card.append(list);
    }
    const hidden = day.total - day.allowedCount;
    card.append(el('p', 'card__note', `${hidden > 0 ? `Ещё ${hidden} ${plural(hidden, ['билет', 'билета', 'билетов'])} скрыто фильтром. ` : ''}${best.source === 'google' ? `Цены Google Flights от ${fmtStamp(day.fetchedAt ?? google.fetchedAt)}, точную стоимость покажет сайт перевозчика.` : 'Цены из кеша Aviasales за 48 часов, точную стоимость покажет бронирование.'}`));
  } else if (day?.best) {
    const b0 = day.best;
    const p = el('p', 'card--hint');
    p.style.margin = '0';
    p.append(hintText(`Есть ${day.allowedCount} ${plural(day.allowedCount, ['подходящий билет', 'подходящих билета', 'подходящих билетов'])}, но все с ${b0.transfers} пересадками.`, `Лучший: ${b0.airlineName} ${via(b0.hubNames)}, ${fmtPrice(priceFor(b0, state.adults).price)}, ${fmtDuration(b0.durationMin)}.`));
    card.append(p);
    const btn = el('button', 'btn', 'Показать с 2 пересадками');
    btn.type = 'button';
    btn.addEventListener('click', () => { state.maxTransfers = 2; writeUrl(); syncControls(); renderCalendar(); renderPanel(); renderStats(); });
    card.append(btn);
    card.append(link(searchLink(state.depart), 'Искать на Aviasales', true));
  } else {
    const p = el('p', 'card--hint');
    p.style.margin = '0';
    if (day) {
      const any = day.cheapestAny;
      p.append(hintText('На эту дату ничего не проходит фильтр.', `В кеше ${day.total} ${plural(day.total, ['билет', 'билета', 'билетов'])}, самый дешёвый у ${any.airlineName} за ${fmtPrice(priceFor(any, state.adults).price)} (${reasonText(any)}). Живой поиск может найти больше.`));
    } else {
      p.append(hintText('На эту дату нет данных.', 'Aviasales показывает только поиски за последние 48 часов. Откройте живой поиск, и через пару часов цена появится здесь.'));
    }
    card.append(p);
    card.append(link(searchLink(state.depart), 'Искать на Aviasales', true));
    const cmp = compareRow(state.depart);
    if (cmp) card.append(cmp);
  }
  panel.append(card);
  if (options.length) panel.append(renderShopping(options.flatMap((o) => o.hubs)));
}

/* ---------- Шопинг на пересадке ---------- */
function shoppingBadges(o) {
  const out = [];
  const codes = [...new Set([...(o.hubs ?? []), ...(o.returnHubs ?? [])])];
  if (codes.some((c) => cal.shopping?.[c]?.apple === 'yes')) out.push(el('i', 'badge badge--shop', 'Apple'));
  if (codes.some((c) => (cal.shopping?.[c]?.brands ?? []).length)) out.push(el('i', 'badge badge--shop', 'бренды'));
  return out;
}

function renderShopping(hubCodes) {
  const codes = [...new Set(hubCodes)];
  const card = el('div', 'card card--shop');
  card.append(el('div', 'card__dates', 'Шопинг на пересадке'));
  for (const code of codes) {
    const name = cal.hubs?.[code] ?? code;
    const d = cal.shopping?.[code];
    const block = el('div', 'shop');
    block.append(el('h4', 'shop__hub', `${name} · ${code}`));
    if (!d) {
      block.append(el('p', 'shop__row', 'По этому аэропорту сведений о магазинах у нас нет.'));
      card.append(block);
      continue;
    }
    const appleLabel = d.apple === 'yes' ? 'есть' : d.apple === 'no' ? 'нет' : 'не нашли';
    block.append(shopRow('Apple', `${appleLabel}. ${d.appleWhere}`, d.apple === 'yes' ? 'ok' : d.apple === 'no' ? 'no' : 'unknown'));
    block.append(shopRow('Бренды', d.brands.length ? `${d.brands.join(', ')}. ${d.brandsNote}` : d.brandsNote, d.brands.length ? 'ok' : 'unknown'));
    block.append(shopRow('Доступ', d.access, d.access.startsWith('Внимание') ? 'no' : null));
    const src = el('p', 'shop__src');
    src.append(`Проверено ${fmtDate(d.checkedAt, false)} 2026`);
    if (d.sources.length) {
      src.append(' · источники: ');
      d.sources.forEach((x, i) => {
        if (i) src.append(', ');
        const a = el('a', null, x.title);
        a.href = x.url; a.target = '_blank'; a.rel = 'noopener';
        src.append(a);
      });
    } else src.append(' · надёжных источников не нашли');
    block.append(src);
    card.append(block);
  }
  card.append(el('p', 'card__note', 'Справочник собран вручную по открытым источникам и может устареть. Ассортимент и доступ зависят от терминала и времени стыковки.'));
  return card;
}
function shopRow(label, text, tone) {
  const r = el('p', `shop__row${tone ? ` is-${tone}` : ''}`);
  r.append(el('b', null, `${label}: `), text);
  return r;
}

async function renderRoundTrip(panel) {
  const id = ++panelRequest;
  const head = el('div', 'card');
  const windowText = state.returnMode === 'exact'
    ? `обратно ${fmtDate(state.ret)}`
    : `поездка ${state.minDays}–${state.maxDays} дн.`;
  head.append(el('div', 'card__dates', `Вылет ${fmtDate(state.depart)} · ${windowText} · ${state.adults === 1 ? '1 взрослый' : '2 взрослых'}`));
  const list = el('div', 'offers');
  for (let i = 0; i < 3; i++) list.append(el('div', 'skeleton'));
  head.append(list);
  panel.append(head);

  const q = new URLSearchParams({ depart: state.depart, sort: state.sort });
  if (state.returnMode === 'exact') q.set('return', state.ret);
  else { q.set('minDays', state.minDays); q.set('maxDays', state.maxDays); }

  let body;
  try {
    const res = await fetch(`/api/roundtrip?${q}`);
    if (!res.ok) throw new Error(String(res.status));
    body = await res.json();
  } catch {
    if (id !== panelRequest) return;
    list.replaceChildren(hintText('Не удалось загрузить варианты.', 'Источник временно недоступен, попробуйте ещё раз через минуту.'));
    return;
  }
  if (id !== panelRequest) return;

  list.replaceChildren();
  const offers = body.offers.filter(fits).sort(sortFn());
  if (body.nearby && offers.length) {
    list.append(hintText(`Точно на ${fmtDate(state.ret)} билетов в кеше нет.`, 'Показываем ближайшие даты возврата в пределах трёх дней.'));
  }
  if (!offers.length) {
    list.append(hintText('Подходящих вариантов не нашлось.', body.hidden
      ? `Есть ${body.hidden} ${plural(body.hidden, ['вариант', 'варианта', 'вариантов'])} вне фильтра. Живой поиск покажет всё.`
      : 'Кеш Aviasales пуст для этих дат. Живой поиск покажет актуальные цены.'));
  }
  offers.forEach((o, i) => list.append(offerRow(o, i === 0)));
  if (body.hidden > 0 && offers.length) {
    head.append(el('p', 'card__note', `Ещё ${body.hidden} ${plural(body.hidden, ['вариант', 'варианта', 'вариантов'])} скрыто фильтром по перевозчику или пересадкам.`));
  }
  head.append(link(searchLink(state.depart, state.returnMode === 'exact' ? state.ret : null), state.returnMode === 'exact' ? 'Все варианты на Aviasales' : 'Искать на Aviasales', true));
  if (offers.length) {
    const b = airlineButton(offers[0]);
    if (b.length) { b[0].textContent = `Сайт ${shortName(offers[0].airlineName)}: лучший вариант ↗`; head.append(...b); }
  }
  if (body.stale) head.append(el('p', 'card__note', `Данные от ${fmtStamp(body.fetchedAt)}, источник временно недоступен.`));
  if (offers.length) panel.append(renderShopping(offers.flatMap((o) => [...o.hubs, ...(o.returnHubs ?? [])])));
}

function offerRow(o, best) {
  const a = el('a', `offer${best ? ' is-best' : ''}`);
  a.href = ticketLink(o);
  a.target = '_blank';
  a.rel = 'noopener';
  const { price, estimated } = priceFor(o, state.adults);
  const main = el('span', 'offer__main');
  main.append(o.returnDate ? `${shortName(o.airlineName)} · ${fmtDate(o.date, false)} → ${fmtDate(o.returnDate, false)}` : `${shortName(o.airlineName)} ${via(o.hubNames)}`);
  if (o.convenient) main.append(' ', el('i', 'badge', 'удобный'));
  main.append(...shoppingBadges(o));
  a.append(main);
  const sub = o.returnDate
    ? `${fmtDays(Math.round((Date.parse(o.returnDate) - Date.parse(o.date)) / 86400000))} · туда ${via(o.hubNames)}, обратно ${via(o.returnHubNames)} · ${o.transfers}+${o.returnTransfers ?? 0} перес. · ${fmtDuration(o.durationMin)}`
    : `${fmtTransfers(o.transfers)} · ${fmtDuration(o.durationMin)} · ${o.originAirport} → ${o.destinationAirport}`;
  a.append(el('span', 'offer__sub', sub));
  const p = el('span', 'offer__price', fmtPrice(price));
  p.append(el('small', null, estimated ? 'расчётно за двоих' : 'за одного'));
  a.append(p);
  return a;
}

function airlineBlock(offer) {
  const w = el('div', 'card__airline');
  const img = el('img', 'card__logo');
  img.src = logoUrl(offer.airline);
  img.alt = '';
  img.addEventListener('error', () => img.remove());
  const t = el('div');
  const b = el('b', null, offer.airlineName);
  if (offer.convenient) b.append(' ', el('i', 'badge', 'удобный'));
  t.append(b, el('small', null, `вылет ${offer.departureAt.slice(11, 16)}, ${offer.originAirport}`));
  w.append(img, t);
  return w;
}
function row(label, value) {
  const r = el('div', 'card__row');
  r.append(el('span', null, label), el('b', null, value));
  return r;
}
function priceBlock(offer) {
  const { price, estimated } = priceFor(offer, state.adults);
  const p = el('div', 'card__price', fmtPrice(price));
  p.append(el('small', null, estimated ? 'расчётно за двоих: цена за одного × 2, точную покажет Aviasales' : 'за одного взрослого'));
  return p;
}
function link(href, text, ghost = false) {
  const a = el('a', `btn${ghost ? ' btn--ghost' : ''}`, text + ' ↗');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/* ---------- Статус и перевозчики ---------- */
function renderStatus() {
  const s = $('#status');
  s.replaceChildren();
  if (!cal) { s.append(el('span', null, 'Нет данных.')); return; }
  const parts = [];
  if (cal.demo) parts.push(el('span', 'demo', 'ДЕМО-ДАННЫЕ'));
  parts.push(span('Источник: ', 'Aviasales (кеш поисков за 48 часов)'));
  parts.push(span('Проверено: ', fmtStamp(cal.fetchedAt)));
  parts.push(span('Билетов в кеше: ', `${cal.stats.offersTotal}, подходят ${cal.stats.offersAllowed}`));
  parts.push(span('Дней с подходящими: ', `${cal.stats.daysAllowed} из ${cal.stats.daysTotal}`));
  if (google) {
    const gAllowed = Object.values(google.days).filter((d) => d.best).length;
    parts.push(span('Google Flights: ', `обновлено ${fmtStamp(google.fetchedAt)}, дней с подходящими ${gAllowed} из ${Object.keys(google.days).length}${google.errors?.length ? `, ошибок ${google.errors.length}` : ''}`));
  }
  parts.push(el('span', null, 'Цены меняются. Окончательную стоимость проверяйте при бронировании.'));
  s.append(...parts);
}
function span(label, value) {
  const x = el('span');
  x.append(label, el('b', null, value));
  return x;
}

/* ---------- Управление ---------- */
function bindControls() {
  $('#controls').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg button');
    if (!btn) return;
    const key = btn.closest('.seg').dataset.key;
    const value = NUMERIC.has(key) ? Number(btn.dataset.value) : btn.dataset.value;
    if (state[key] === value) return;
    state[key] = value;
    if (key === 'mode' || key === 'returnMode') state.ret = null;
    writeUrl();
    syncControls();
    renderCalendar();
    renderPanel();
    renderStats();
  });

  let timer = null;
  const onRange = (which) => (e) => {
    const v = Number(e.target.value);
    if (which === 'min') { state.minDays = v; if (state.maxDays < v) state.maxDays = v; }
    else { state.maxDays = v; if (state.minDays > v) state.minDays = v; }
    syncControls();
    writeUrl();
    clearTimeout(timer);
    timer = setTimeout(renderPanel, 300);
  };
  $('#minDays').addEventListener('input', onRange('min'));
  $('#maxDays').addEventListener('input', onRange('max'));
}

/* ---------- Старт ---------- */
readUrl();
syncControls();
bindControls();
loadCalendar();
