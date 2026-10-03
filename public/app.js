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
const logoUrl = (code) => `https://pics.avs.io/100/50/${code}.png`;
const shortName = (name) => name.replace(/\s+(Airways|Airlines)$/i, '');

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
function usable(offer) {
  return !!offer && offer.allowed && offer.transfers <= state.maxTransfers;
}
function blockedReason(offer, short = false) {
  if (offer.reason === 'airline') return short ? shortName(offer.airlineName) : `только ${shortName(offer.airlineName)}`;
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
  renderCarriers();
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
    legendItem('', 'подходящий билет, цена в одну сторону'),
    legendItem('blocked', 'лучшая цена вне фильтра'),
    legendItem('empty', 'нет данных за 48 часов'),
  );
  root.append(legend);

  const cheap = new Set(cal.cheapest);
  const usablePrices = Object.values(cal.days).filter(usable).map((o) => o.price);
  const minP = Math.min(...usablePrices), maxP = Math.max(...usablePrices);

  for (const ym of cal.months) {
    const meta = monthMeta(ym);
    const block = el('section', 'month');
    const title = el('h2', 'month__title');
    title.append(el('span', null, meta.title));
    const monthMin = Object.entries(cal.days).filter(([d, o]) => d.startsWith(ym) && usable(o)).map(([, o]) => o.price);
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

function legendItem(cls, text) {
  const s = el('span');
  s.append(el('i', cls), text);
  return s;
}

function renderDay(date, num, offer, cheap, minP, maxP) {
  const b = el('button', 'day');
  b.type = 'button';
  b.dataset.date = date;
  b.append(el('span', 'day__num', String(num)));

  const past = date < today;
  if (past) b.classList.add('is-past');

  if (usable(offer)) {
    const { price } = priceFor(offer, state.adults);
    b.classList.add('is-usable');
    const heat = maxP > minP ? 1 - (offer.price - minP) / (maxP - minP) : 0.5;
    b.style.setProperty('--heat', heat.toFixed(2));
    if (cheap.has(date)) b.classList.add('is-cheap');
    b.append(el('span', 'day__price', fmtPrice(price)));
    b.append(el('span', 'day__price-compact', fmtCompact(price)));
    b.append(el('span', 'day__meta', `${shortName(offer.airlineName)} · ${offer.transfers} пер.`));
    b.title = `${fmtDate(date)}: ${offer.airlineName}, ${fmtTransfers(offer.transfers)}, ${fmtDuration(offer.durationMin)}`;
  } else if (offer) {
    b.classList.add('is-blocked');
    b.append(el('span', 'day__price', fmtPrice(priceFor(offer, state.adults).price)));
    b.append(el('span', 'day__price-compact', fmtCompact(priceFor(offer, state.adults).price)));
    b.append(el('span', 'day__meta', blockedReason(offer, true)));
    b.title = `${fmtDate(date)}: самый дешёвый билет у ${offer.airlineName}, ${fmtTransfers(offer.transfers)}. Не проходит фильтр.`;
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
    c.append(hintText('Выберите день вылета в календаре.', 'Дни со звёздочкой ★ — три самых выгодных в месяце. Серые полосатые дни скрыты фильтром по перевозчику или пересадкам, но их можно открыть на Aviasales вручную.'));
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
  const offer = cal.days[state.depart];
  const card = el('div', 'card');
  card.append(el('div', 'card__dates', `${fmtDate(state.depart)} · в одну сторону · ${state.adults === 1 ? '1 взрослый' : '2 взрослых'}`));

  if (usable(offer)) {
    card.append(airlineBlock(offer));
    card.append(row('В пути', fmtDuration(offer.durationMin)));
    card.append(row('Пересадки', fmtTransfers(offer.transfers)));
    card.append(row('Аэропорты', `${offer.originAirport} → ${offer.destinationAirport}`));
    card.append(priceBlock(offer));
    card.append(link(searchLink(state.depart), 'Открыть на Aviasales'));
    card.append(el('p', 'card__note', 'Цена из кеша Aviasales за последние 48 часов. Точную стоимость и условия проверяйте при бронировании.'));
  } else {
    const p = el('p', 'card--hint');
    p.style.margin = '0';
    if (offer) p.append(hintText('На эту дату лучшая цена не проходит фильтр.', `Самый дешёвый билет у ${offer.airlineName}, ${fmtTransfers(offer.transfers)}, ${fmtPrice(priceFor(offer, state.adults).price)}. Проверенные перевозчики могут быть дороже: посмотрите живую выдачу.`));
    else p.append(hintText('На эту дату нет данных.', 'Aviasales показывает только поиски за последние 48 часов. Откройте живой поиск, и через пару часов цена появится здесь.'));
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
  const offers = body.offers.filter((o) => o.transfers <= state.maxTransfers && (o.returnTransfers ?? 0) <= state.maxTransfers);
  if (!offers.length) {
    list.append(hintText('Подходящих вариантов не нашлось.', body.hidden
      ? `Есть ${body.hidden} ${plural(body.hidden, ['вариант', 'варианта', 'вариантов'])} вне фильтра. Живой поиск покажет всё.`
      : 'Кеш Aviasales пуст для этих дат. Живой поиск покажет актуальные цены.'));
  }
  offers.forEach((o, i) => {
    const a = el('a', `offer${i === 0 ? ' is-best' : ''}`);
    a.href = searchLink(o.date, o.returnDate);
    a.target = '_blank';
    a.rel = 'noopener';
    const { price, estimated } = priceFor(o, state.adults);
    const len = Math.round((Date.parse(o.returnDate) - Date.parse(o.date)) / 86400000);
    a.append(el('span', 'offer__main', `${o.airlineName} · ${fmtDate(o.date, false)} → ${fmtDate(o.returnDate, false)}`));
    a.append(el('span', 'offer__sub', `${fmtDays(len)} · пересадки: ${o.transfers} туда, ${o.returnTransfers ?? 0} обратно · в пути ${fmtDuration(o.durationMin)}`));
    const p = el('span', 'offer__price', fmtPrice(price));
    p.append(el('small', null, estimated ? 'расчётно за двоих' : 'за одного'));
    a.append(p);
    list.append(a);
  });
  if (body.hidden > 0 && offers.length) {
    head.append(el('p', 'card__note', `Ещё ${body.hidden} ${plural(body.hidden, ['вариант', 'варианта', 'вариантов'])} скрыто фильтром по перевозчику или пересадкам.`));
  }
  head.append(link(searchLink(state.depart, state.returnMode === 'exact' ? state.ret : null), state.returnMode === 'exact' ? 'Все варианты на Aviasales' : 'Искать на Aviasales', true));
  if (body.stale) head.append(el('p', 'card__note', `Данные от ${fmtStamp(body.fetchedAt)}, источник временно недоступен.`));
}

function airlineBlock(offer) {
  const w = el('div', 'card__airline');
  const img = el('img', 'card__logo');
  img.src = logoUrl(offer.airline);
  img.alt = '';
  img.addEventListener('error', () => img.remove());
  const t = el('div');
  t.append(el('b', null, offer.airlineName), el('small', null, `вылет ${offer.departureAt.slice(11, 16)}, ${offer.originAirport}`));
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
  parts.push(span('Дней с данными: ', `${cal.stats.daysWithData} из ${cal.stats.daysTotal}`));
  parts.push(span('Подходят под фильтр: ', String(cal.stats.daysAllowed)));
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
  c.append(el('b', null, names.join(' · ')));
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
