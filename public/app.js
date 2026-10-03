// Рио Радар: состояние, календарь, панель предложений.

const DEFAULTS = {
  mode: 'oneway', adults: 1, maxTransfers: 2,
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
const ticketLink = (o) => o.link ? o.link.replace(/1\?t=/, `${state.adults}?t=`) : searchLink(o.date, o.returnDate);
const logoUrl = (code) => `https://pics.avs.io/100/50/${code}.png`;
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
const optionsFor = (day) => (day?.options ?? []).filter(fits);
const bestFor = (day) => optionsFor(day)[0] ?? null;

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
    const res = await fetch('/api/calendar');
    if (!res.ok) throw new Error(res.status === 503 ? 'source' : 'http');
    cal = await res.json();
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
    legendItem('cheap', 'три самых выгодных дня месяца'),
    legendItem('', 'лучший подходящий билет, цена в одну сторону'),
    legendItem('blocked', 'есть билеты, но вне фильтра'),
    legendItem('empty', 'нет данных за 48 часов'),
  );
  root.append(legend);

  const bests = Object.values(cal.days).map(bestFor).filter(Boolean);
  const cheap = new Set(cheapestDates());
  const prices = bests.map((o) => o.price);
  const minP = Math.min(...prices), maxP = Math.max(...prices);

  for (const ym of cal.months) {
    const meta = monthMeta(ym);
    const block = el('section', 'month');
    const title = el('h2', 'month__title');
    title.append(el('span', null, meta.title));
    const monthMin = Object.entries(cal.days).filter(([d]) => d.startsWith(ym)).map(([, day]) => bestFor(day)).filter(Boolean).map((o) => o.price);
    if (monthMin.length) {
      const m = el('span', 'month__min');
      m.append('от ', el('b', null, fmtPrice(priceFor({ price: Math.min(...monthMin) }, state.adults).price)));
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
      grid.append(renderDay(date, d, cal.days[date], cheap, minP, maxP));
    }
    block.append(grid);
    root.append(block);
  }
}

// Три самых дешёвых дня месяца с учётом клиентского фильтра пересадок
function cheapestDates() {
  const byMonth = new Map();
  for (const [date, day] of Object.entries(cal.days)) {
    const b = bestFor(day);
    if (!b) continue;
    const m = date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push([date, b.price]);
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
    const heat = maxP > minP ? 1 - (best.price - minP) / (maxP - minP) : 0.5;
    b.style.setProperty('--heat', heat.toFixed(2));
    if (cheap.has(date)) b.classList.add('is-cheap');
    b.append(el('span', 'day__price', fmtPrice(price)));
    b.append(el('span', 'day__price-compact', fmtCompact(price)));
    const n = optionsFor(day).length;
    b.append(el('span', 'day__meta', `${shortName(best.airlineName)}${n > 1 ? ` +${n - 1}` : ''}`));
    b.title = `${fmtDate(date)}: ${best.airlineName}, ${fmtTransfers(best.transfers)} ${via(best.hubNames)}, ${fmtDuration(best.durationMin)}. Вариантов: ${n}.`;
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

function renderOneWay(panel) {
  const day = cal.days[state.depart];
  const options = optionsFor(day);
  const card = el('div', 'card');
  card.append(el('div', 'card__dates', `${fmtDate(state.depart)} · в одну сторону · ${state.adults === 1 ? '1 взрослый' : '2 взрослых'}`));

  if (options.length) {
    const best = options[0];
    card.append(airlineBlock(best));
    card.append(row('Маршрут', via(best.hubNames)));
    card.append(row('В пути', fmtDuration(best.durationMin)));
    card.append(row('Пересадки', fmtTransfers(best.transfers)));
    card.append(row('Аэропорты', `${best.originAirport} → ${best.destinationAirport}`));
    card.append(priceBlock(best));
    card.append(link(ticketLink(best), 'Открыть на Aviasales'));
    if (options.length > 1) {
      card.append(el('div', 'card__sub', `Ещё ${options.length - 1} ${plural(options.length - 1, ['вариант', 'варианта', 'вариантов'])} на этот день`));
      const list = el('div', 'offers');
      for (const o of options.slice(1)) list.append(offerRow(o, false));
      card.append(list);
    }
    const hidden = day.total - day.allowedCount;
    card.append(el('p', 'card__note', `${hidden > 0 ? `Ещё ${hidden} ${plural(hidden, ['билет', 'билета', 'билетов'])} скрыто фильтром. ` : ''}Цены из кеша Aviasales за 48 часов, точную стоимость покажет бронирование.`));
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
  }
  panel.append(card);
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

  const q = new URLSearchParams({ depart: state.depart });
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
  const offers = body.offers.filter(fits);
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
  if (body.stale) head.append(el('p', 'card__note', `Данные от ${fmtStamp(body.fetchedAt)}, источник временно недоступен.`));
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
  parts.push(el('span', null, 'Цены меняются. Окончательную стоимость проверяйте при бронировании.'));
  s.append(...parts);
}
function span(label, value) {
  const x = el('span');
  x.append(label, el('b', null, value));
  return x;
}
function renderCarriers() {
  const names = ['Emirates', 'Qatar Airways', 'Turkish Airlines', 'Etihad', 'Ethiopian', 'Аэрофлот'];
  const c = $('#carriers');
  c.replaceChildren('Проверенные перевозчики: ');
  c.append(el('b', null, names.join(' · ')), '. Внутри Бразилии допускаем LATAM и GOL.');
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
renderCarriers();
loadCalendar();
