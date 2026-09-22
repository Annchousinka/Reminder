/* ============================================================
   ПРИЛОЖЕНИЕ «НАПОМИНАНИЯ И ЛЕКАРСТВА»
   Версия с Telegram, навигацией по неделям, точным временем
   ============================================================ */

// ============ НАСТРОЙКИ TELEGRAM ============
// ⚠️ ВСТАВЬТЕ СВОИ ЗНАЧЕНИЯ ИЛИ ОСТАВЬТЕ ПУСТЫМИ, ЧТОБЫ ОТКЛЮЧИТЬ
const TELEGRAM_ТОКЕН = '8809648802:AAFKyDzzKmbOO3g-4rDk0dQHiMOn0QtUkZg';        // например: '7123456789:AAEg...'
const TELEGRAM_CHAT_ID = '891225443';      // например: '123456789'

// ============ БАЗА ДАННЫХ (IndexedDB) ============
let db;

function открытьБД() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('напоминания', 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('напоминания'))
        d.createObjectStore('напоминания', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('лекарства'))
        d.createObjectStore('лекарства', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}

function сохранить(store, obj) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => res();
  });
}

function получитьВсе(store) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
  });
}

function удалитьИз(store, id) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => res();
  });
}

// ============ УТИЛИТЫ ============
function экранировать(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function сегодняISO() {
  return датаISO(new Date());
}

function датаISO(дата) {
  const г = дата.getFullYear();
  const м = String(дата.getMonth() + 1).padStart(2, '0');
  const д = String(дата.getDate()).padStart(2, '0');
  return `${г}-${м}-${д}`;
}

function форматВремени(ts) {
  return new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function форматДаты(ts) {
  return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

// Даты недели (Пн–Вс) для указанной опорной даты
function получитьДатыНедели(опорнаяДата) {
  const день = опорнаяДата.getDay() === 0 ? 7 : опорнаяДата.getDay();
  const пн = new Date(опорнаяДата);
  пн.setDate(опорнаяДата.getDate() - (день - 1));
  пн.setHours(0, 0, 0, 0);

  const даты = {};
  for (let i = 1; i <= 7; i++) {
    const д = new Date(пн);
    д.setDate(пн.getDate() + (i - 1));
    д.setHours(0, 0, 0, 0);
    даты[i] = д;
  }
  return даты;
}

// ============ НАВИГАЦИЯ ПО ЭКРАНАМ ============
function перейти(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const экран = document.getElementById(id);
  if (экран) экран.classList.add('active');
  window.scrollTo(0, 0);
  обновитьВсё();
}

// Привязка нижнего меню
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    перейти(btn.dataset.screen);
  });
});

// ============ НАВИГАЦИЯ ПО НЕДЕЛЯМ ============
let смещениеНедели = 0;

function сменитьНеделю(дельта) {
  смещениеНедели += дельта;
  обновитьТаблицу();
}

function сброситьНеделю() {
  смещениеНедели = 0;
  обновитьТаблицу();
}

// ============ TELEGRAM ============
async function отправитьВTelegram(текст) {
  if (!TELEGRAM_ТОКЕН || !TELEGRAM_CHAT_ID) return;
  if (!textOK(текст)) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_ТОКЕН}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: текст,
        parse_mode: 'HTML',
        disable_notification: false
      })
    });
  } catch (e) {
    console.warn('Telegram недоступен:', e);
  }
}

function textOK(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

// ============ УВЕДОМЛЕНИЯ ============
async function запроситьРазрешение() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const р = await Notification.requestPermission();
    return р === 'granted';
  } catch { return false; }
}

async function запланироватьУведомление(н) {
  const разрешено = await запроситьРазрешение();
  if (!разрешено) return;

  const задержка = н.когда - Date.now();
  if (задержка <= 0) return;

  try {
    const рег = await navigator.serviceWorker.ready;
    рег.active.postMessage({
      тип: 'ЗАПЛАНИРОВАТЬ',
      напоминание: н,
      задержка
    });
  } catch (e) {
    console.warn('SW недоступен:', e);
  }
}

// ============ НАПОМИНАНИЯ ============
let текущийИнтервал = 60;
let текущееФото = null;
let текущийДокумент = null;
let редактируемоеId = null;

// Привязка кнопок интервалов
document.querySelectorAll('.interval').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.interval').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    текущийИнтервал = parseInt(btn.dataset.мин);
    const когда = new Date(Date.now() + текущийИнтервал * 60000);
    document.getElementById('дата').value = датаISO(когда);
    document.getElementById('время').value =
      String(когда.getHours()).padStart(2, '0') + ':' +
      String(когда.getMinutes()).padStart(2, '0');
    показатьВремя();
  });
});

function открытьФормуНапоминания() {
  редактируемоеId = null;
  document.getElementById('текст').value = '';
  document.getElementById('важное').checked = false;
  текущееФото = null;
  текущийДокумент = null;
  document.getElementById('фото-метка').textContent = '';
  document.getElementById('док-метка').textContent = '';
  document.getElementById('блок-часов').classList.add('hidden');
  document.getElementById('дата').value = '';
  document.getElementById('время').value = '';
  document.getElementById('выбранное-время').textContent = '';
  document.querySelector('#screen-form h1').textContent = 'Новое напоминание';
  document.querySelector('#screen-form .row-btn.red').style.display = 'none';
  перейти('screen-form');
}

async function открытьНапоминание(id) {
  const все = await получитьВсе('напоминания');
  const н = все.find(x => x.id === id);
  if (!н) return;

  редактируемоеId = id;
  document.getElementById('текст').value = н.текст;
  document.getElementById('важное').checked = н.важное;
  текущееФото = н.фото;
  текущийДокумент = н.документ;
  document.getElementById('фото-метка').textContent = н.фото ? '✓' : '';
  document.getElementById('док-метка').textContent = н.документ ? '✓' : '';

  const д = new Date(н.когда);
  document.getElementById('дата').value = датаISO(д);
  document.getElementById('время').value =
    String(д.getHours()).padStart(2, '0') + ':' +
    String(д.getMinutes()).padStart(2, '0');
  показатьВремя();

  document.querySelector('#screen-form h1').textContent = 'Редактировать';
  document.querySelector('#screen-form .row-btn.red').style.display = 'flex';

  перейти('screen-form');
}

function показатьЧасы() {
  document.getElementById('блок-часов').classList.toggle('hidden');
}

function показатьВремя() {
  const д = document.getElementById('дата').value;
  const в = document.getElementById('время').value;
  document.getElementById('выбранное-время').textContent = д && в ? `${д} ${в}` : '';
}

document.getElementById('дата').addEventListener('change', показатьВремя);
document.getElementById('время').addEventListener('change', показатьВремя);

document.getElementById('фото').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    текущееФото = reader.result;
    document.getElementById('фото-метка').textContent = '✓';
  };
  reader.readAsDataURL(f);
});

document.getElementById('документ').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    текущийДокумент = { имя: f.name, данные: reader.result };
    document.getElementById('док-метка').textContent = '✓';
  };
  reader.readAsDataURL(f);
});

async function сохранитьНапоминание() {
  const текст = document.getElementById('текст').value.trim();
  if (!текст) return alert('Введите текст');

  const дата = document.getElementById('дата').value;
  const время = document.getElementById('время').value;
  let когда;
  if (дата && время) {
    когда = new Date(`${дата}T${время}`).getTime();
  } else {
    когда = Date.now() + текущийИнтервал * 60000;
  }

  if (редактируемоеId) {
    try {
      const рег = await navigator.serviceWorker.ready;
      рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: редактируемоеId });
    } catch {}
  }

  const н = {
    id: редактируемоеId || crypto.randomUUID(),
    текст,
    когда,
    интервал: текущийИнтервал,
    важное: document.getElementById('важное').checked,
    фото: текущееФото,
    документ: текущийДокумент,
    выполнено: false
  };

  await сохранить('напоминания', н);
  await запланироватьУведомление(н);

  // Дублируем в Telegram
  await отправитьВTelegram(
    `🔔 <b>${экранировать(текст)}</b>\n⏰ ${new Date(когда).toLocaleString('ru')}`
  );

  редактируемоеId = null;
  перейти('screen-home');
}

async function удалитьНапоминание() {
  if (!редактируемоеId) {
    перейти('screen-home');
    return;
  }
  if (!confirm('Удалить это напоминание?')) return;

  await удалитьИз('напоминания', редактируемоеId);
  try {
    const рег = await navigator.serviceWorker.ready;
    рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: редактируемоеId });
  } catch {}

  редактируемоеId = null;
  перейти('screen-home');
}

// ============ ЛЕКАРСТВА ============
let редактируемоеЛекарствоId = null;

function открытьФормуЛекарства(лекарство = null) {
  редактируемоеЛекарствоId = лекарство ? лекарство.id : null;

  document.getElementById('название-л').value = лекарство?.название || '';
  document.getElementById('дозировка-л').value = лекарство?.дозировка || '';
  document.getElementById('дней-курса').value = лекарство?.днейКурса || 7;
  document.getElementById('дата-начала').value =
    лекарство?.датаНачала || сегодняISO();

  const стандарт = { утро: '08:00', день: '14:00', вечер: '20:00' };
  const времена = лекарство?.времена || ['утро'];
  const точное = лекарство?.времяТочное || стандарт;

  document.getElementById('вкл-утро').checked = времена.includes('утро');
  document.getElementById('вкл-день').checked = времена.includes('день');
  document.getElementById('вкл-вечер').checked = времена.includes('вечер');

  document.getElementById('время-утро').value = точное.утро || '08:00';
  document.getElementById('время-день').value = точное.день || '14:00';
  document.getElementById('время-вечер').value = точное.вечер || '20:00';

  document.querySelectorAll('#дни-недели input').forEach(cb => {
    cb.checked = лекарство
      ? лекарство.дни.includes(parseInt(cb.value))
      : true;
  });

  document.querySelector('#screen-med-form h1').textContent =
    лекарство ? 'Редактировать' : 'Новое лекарство';

  перейти('screen-med-form');
}

async function сохранитьЛекарство() {
  const название = document.getElementById('название-л').value.trim();
  if (!название) return alert('Введите название');

  const времена = [];
  if (document.getElementById('вкл-утро').checked) времена.push('утро');
  if (document.getElementById('вкл-день').checked) времена.push('день');
  if (document.getElementById('вкл-вечер').checked) времена.push('вечер');

  if (времена.length === 0) return alert('Выберите хотя бы один приём');

  const времяТочное = {
    утро: document.getElementById('время-утро').value || '08:00',
    день: document.getElementById('время-день').value || '14:00',
    вечер: document.getElementById('время-вечер').value || '20:00'
  };

  const дни = [...document.querySelectorAll('#дни-недели input:checked')]
    .map(i => parseInt(i.value));
  if (дни.length === 0) return alert('Выберите хотя бы один день');

  const л = {
    id: редактируемоеЛекарствоId || crypto.randomUUID(),
    название,
    дозировка: document.getElementById('дозировка-л').value || '1 таблетка',
    времена,
    времяТочное,
    разВДень: времена.length,
    дни,
    днейКурса: parseInt(document.getElementById('дней-курса').value),
    датаНачала: document.getElementById('дата-начала').value,
    принято: {}
  };

  if (редактируемоеЛекарствоId) {
    const старые = (await получитьВсе('лекарства'))
      .find(x => x.id === редактируемоеЛекарствоId);
    if (старые?.принято) л.принято = старые.принято;
    await отменитьУведомленияЛекарства(редактируемоеЛекарствоId);
  }

  await сохранить('лекарства', л);
  await создатьНапоминаниеНаПриём(л);
  await запланироватьЛекарство(л);

  редактируемоеЛекарствоId = null;
  смещениеНедели = 0;

  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab[data-screen="screen-tracker"]')?.classList.add('active');
  перейти('screen-tracker');
}

async function создатьНапоминаниеНаПриём(л) {
  const старт = new Date(л.датаНачала);
  let ближайшее = null;

  for (let д = 0; д < л.днейКурса; д++) {
    const дата = new Date(старт);
    дата.setDate(дата.getDate() + д);
    const нашДень = дата.getDay() === 0 ? 7 : дата.getDay();
    if (!л.дни.includes(нашДень)) continue;

    for (const вр of л.времена) {
      const [ч, м] = (л.времяТочное[вр] || '08:00').split(':').map(Number);
      const когда = new Date(дата);
      когда.setHours(ч, м, 0, 0);
      if (когда.getTime() > Date.now()) {
        if (!ближайшее || когда < ближайшее.когда) {
          ближайшее = { когда, вр };
        }
      }
    }
    if (ближайшее) break;
  }

  if (!ближайшее) return;

  const напоминание = {
    id: `мед-${л.id}-${ближайшее.когда.getTime()}`,
    текст: `💊 Принять: ${л.название}`,
    когда: ближайшее.когда.getTime(),
    интервал: 60,
    важное: true,
    фото: null,
    документ: null,
    выполнено: false,
    лекарствоId: л.id,
    приём: ближайшее.вр
  };

  await сохранить('напоминания', напоминание);
  await запланироватьУведомление(напоминание);

  // Дублируем в Telegram
  await отправитьВTelegram(
    `💊 <b>${экранировать(л.название)}</b>\n` +
    `Приём: ${ближайшее.вр} (${л.времяТочное[ближайшее.вр]})\n` +
    `Дозировка: ${экранировать(л.дозировка)}\n` +
    `Дата: ${датаISO(ближайшее.когда)}`
  );
}

async function отменитьУведомленияЛекарства(лId) {
  const все = await получитьВсе('напоминания');
  const связанные = все.filter(н => н.лекарствоId === лId);
  try {
    const рег = await navigator.serviceWorker.ready;
    for (const н of связанные) {
      await удалитьИз('напоминания', н.id);
      рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: н.id });
    }
  } catch {
    for (const н of связанные) {
      await удалитьИз('напоминания', н.id);
    }
  }
}

async function запланироватьЛекарство(л) {
  const разрешено = await запроситьРазрешение();
  if (!разрешено) return;

  try {
    const рег = await navigator.serviceWorker.ready;
    const старт = new Date(л.датаНачала);

    for (let д = 0; д < л.днейКурса; д++) {
      const дата = new Date(старт);
      дата.setDate(дата.getDate() + д);
      const нашДень = дата.getDay() === 0 ? 7 : дата.getDay();
      if (!л.дни.includes(нашДень)) continue;

      for (const вр of л.времена) {
        const [ч, м] = (л.времяТочное[вр] || '08:00').split(':').map(Number);
        const когда = new Date(дата);
        когда.setHours(ч, м, 0, 0);
        const задержка = когда.getTime() - Date.now();
        if (задержка <= 0) continue;

        рег.active.postMessage({
          тип: 'ЗАПЛАНИРОВАТЬ',
          напоминание: {
            id: `${л.id}-${датаISO(дата)}-${вр}`,
            текст: `💊 ${л.название}`,
            подтекст: `${вр} · ${л.дозировка}`,
            когда: когда.getTime(),
            лекарствоId: л.id,
            приём: вр,
            метка: `${датаISO(дата)}-${вр}`
          },
          задержка
        });
      }
    }

    // Напоминание о повторе курса
    const конец = new Date(старт);
    конец.setDate(конец.getDate() + л.днейКурса - 1);
    конец.setHours(10, 0, 0, 0);
    const задержка = конец.getTime() - Date.now();
    if (задержка > 0) {
      рег.active.postMessage({
        тип: 'ЗАПЛАНИРОВАТЬ',
        напоминание: {
          id: `${л.id}-повтор`,
          текст: `🔄 Пора повторить курс`,
          подтекст: `«${л.название}» заканчивается`,
          когда: конец.getTime()
        },
        задержка
      });
    }
  } catch (e) {
    console.warn('SW недоступен при планировании лекарства:', e);
  }
}

async function редактироватьЛекарство(id) {
  const все = await получитьВсе('лекарства');
  const л = все.find(x => x.id === id);
  if (л) открытьФормуЛекарства(л);
}

async function удалитьЛекарство(id) {
  if (!confirm('Удалить это лекарство и все его напоминания?')) return;

  await удалитьИз('лекарства', id);
  await отменитьУведомленияЛекарства(id);

  await обновитьТаблицу();
  await обновитьБлижайшие();
  await обновитьСтатистику();
}

// ============ ОТМЕТКИ ПРИЁМА ============
async function отметитьПриёмДля(лId, время, датаСтрока) {
  const все = await получитьВсе('лекарства');
  const л = все.find(x => x.id === лId);
  if (!л) return;

  const ключ = `${датаСтрока}-${время}`;
  л.принято[ключ] = !л.принято[ключ];
  await сохранить('лекарства', л);

  if (л.принято[ключ]) {
    try {
      const рег = await navigator.serviceWorker.ready;
      рег.active.postMessage({
        тип: 'ОТМЕНИТЬ',
        id: `${л.id}-${датаСтрока}-${время}`
      });
    } catch {}
  }

  await обновитьТаблицу();
  await обновитьСтатистику();
}

async function отметитьПриём(лId) {
  const все = await получитьВсе('лекарства');
  const л = все.find(x => x.id === лId);
  if (!л) return;

  const сегодня = сегодняISO();

  if (л.времена.length === 1) {
    await отметитьПриёмДля(лId, л.времена[0], сегодня);
    return;
  }

  const варианты = л.времена.map((вр, i) => {
    const выпито = л.принято[`${сегодня}-${вр}`] ? '✓' : ' ';
    return `${i + 1}. [${выпито}] ${вр} (${л.времяТочное?.[вр] || ''})`;
  }).join('\n');

  const выбор = prompt(
    `Что отметить для «${л.название}» (${сегодня})?\n\n${варианты}\n\nВведите номер:`
  );
  const индекс = parseInt(выбор) - 1;
  if (индекс >= 0 && индекс < л.времена.length) {
    await отметитьПриёмДля(лId, л.времена[индекс], сегодня);
  }
}

// ============ ГЛАВНЫЙ ЭКРАН ============
async function обновитьВсё() {
  await обновитьБлижайшие();
  await обновитьТаблицу();
  await обновитьСтатистику();
}

async function обновитьБлижайшие() {
  const напоминания = await получитьВсе('напоминания');
  const сейчас = Date.now();

  const все = напоминания
    .filter(н => !н.выполнено)
    .sort((a, b) => a.когда - b.когда);

  const контейнер = document.getElementById('список-ближайших');
  if (!контейнер) return;

  if (все.length === 0) {
    контейнер.innerHTML = '<h2>Ближайшие</h2><p class="muted">Пока нет напоминаний</p>';
    return;
  }

  const сегодняКонец = new Date();
  сегодняКонец.setHours(23, 59, 59, 999);

  const завтраКонец = new Date(сегодняКонец);
  завтраКонец.setDate(завтраКонец.getDate() + 1);

  const группы = { 'Сегодня': [], 'Завтра': [], 'Позже': [] };

  все.forEach(н => {
    if (н.когда <= сегодняКонец.getTime()) группы['Сегодня'].push(н);
    else if (н.когда <= завтраКонец.getTime()) группы['Завтра'].push(н);
    else группы['Позже'].push(н);
  });

  let html = '';
  for (const [название, список] of Object.entries(группы)) {
    if (список.length === 0) continue;
    html += `<h2>${название}</h2>`;
    html += список.slice(0, 10).map(н => карточкаНапоминания(н, сейчас)).join('');
  }

  контейнер.innerHTML = html;
}

function карточкаНапоминания(н, сейчас) {
  const время = форматВремени(н.когда);
  const дата = форматДаты(н.когда);
  const просрочено = н.когда < сейчас;
  const этоЛекарство = !!н.лекарствоId;

  return `
    <div class="card ${н.важное ? 'important' : ''} ${этоЛекарство ? 'med-card' : ''}"
         onclick="открытьНапоминание('${н.id}')">
      <div class="time">${время}</div>
      <div class="body">
        <div class="title">${экранировать(н.текст)}</div>
        <div class="sub">
          ${дата}${просрочено ? ' · просрочено' : ''}
          ${этоЛекарство ? ' · нажмите для отметки' : ''}
        </div>
      </div>
      <button class="icon-btn" onclick="event.stopPropagation(); открытьНапоминание('${н.id}')">✏️</button>
    </div>
  `;
}

// ============ ТАБЛИЦА + СПИСОК ЛЕКАРСТВ ============
async function обновитьТаблицу() {
  const все = await получитьВсе('лекарства');
  const сегодня = сегодняISO();

  const опорная = new Date();
  опорная.setDate(опорная.getDate() + смещениеНедели * 7);
  const датыНедели = получитьДатыНедели(опорная);

  const датаСегодня = new Date();
  const деньСегодня = датаСегодня.getDay() === 0 ? 7 : датаСегодня.getDay();

  // Навигация по неделям
  const navEl = document.querySelector('.week-nav');
  const названиеEl = document.getElementById('название-недели');
  const диапазонEl = document.getElementById('диапазон-недели');

  if (названиеEl) {
    if (смещениеНедели === 0) названиеEl.textContent = 'Текущая неделя';
    else if (смещениеНедели === -1) названиеEl.textContent = 'Прошлая неделя';
    else if (смещениеНедели === 1) названиеEl.textContent = 'Следующая неделя';
    else if (смещениеНедели < 0) названиеEl.textContent = `${Math.abs(смещениеНедели)} нед. назад`;
    else названиеEl.textContent = `Через ${смещениеНедели} нед.`;

    const пн = датыНедели[1];
    const вс = датыНедели[7];
    const ф = (д) => `${String(д.getDate()).padStart(2,'0')}.${String(д.getMonth()+1).padStart(2,'0')}`;
    диапазонEl.textContent = `${ф(пн)} — ${ф(вс)}`;
  }
  if (navEl) navEl.classList.toggle('текущая', смещениеНедели === 0);

  // Шапка таблицы
  const шапка = document.getElementById('шапка-таблицы');
  if (шапка) {
    шапка.querySelectorAll('th[data-day]').forEach(th => {
      const день = parseInt(th.dataset.day);
      const дата = датыНедели[день];
      const буквы = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const дд = String(дата.getDate()).padStart(2, '0');
      const мм = String(дата.getMonth() + 1).padStart(2, '0');
      th.innerHTML = `${буквы[день-1]}<span class="дата">${дд}.${мм}</span>`;
      th.classList.toggle('сегодня', смещениеНедели === 0 && день === деньСегодня);
    });
  }

  // Ячейки
  document.querySelectorAll('#таблица-лекарств td[data-day]').forEach(td => {
    const день = parseInt(td.dataset.day);
    const время = td.dataset.time;
    const дата = датыНедели[день];
    const датаСтр = датаISO(дата);

    const подходящие = все.filter(л =>
      л.дни.includes(день) && л.времена.includes(время)
    );

    const активные = подходящие.filter(л => {
      const старт = new Date(л.датаНачала);
      старт.setHours(0, 0, 0, 0);
      const конец = new Date(старт);
      конец.setDate(конец.getDate() + л.днейКурса - 1);
      конец.setHours(23, 59, 59, 999);
      const д = new Date(дата);
      д.setHours(12, 0, 0, 0);
      return д >= старт && д <= конец;
    });

    td.innerHTML = активные.map(л => {
      const [ч, м] = (л.времяТочное?.[время] || '').split(':');
      const выпито = л.принято[`${датаСтр}-${время}`];
      return `<span class="pill" style="${выпито ? 'opacity:0.4' : ''}">${экранировать(л.название.slice(0, 3))}
        ${ч ? `<span class="pill-time">${ч}:${м}</span>` : ''}
      </span>`;
    }).join('<br>');

    const всеОтмечены = активные.length > 0 && активные.every(л =>
      л.принято[`${датаСтр}-${время}`]
    );

    td.classList.toggle('done', всеОтмечены);
    td.classList.toggle('неактивна', активные.length === 0);

    td.onclick = () => {
      if (активные.length === 0) return;

      if (активные.length === 1) {
        отметитьПриёмДля(активные[0].id, время, датаСтр);
      } else {
        const имена = активные.map((л, i) => `${i + 1}. ${л.название}`).join('\n');
        const выбор = prompt(
          `Какое лекарство отметить на ${датаСтр} (${время})?\n${имена}\n\nВведите номер:`
        );
        const индекс = parseInt(выбор) - 1;
        if (индекс >= 0 && индекс < активные.length) {
          отметитьПриёмДля(активные[индекс].id, время, датаСтр);
        }
      }
    };
  });

  await обновитьСегодня(все, сегодня, деньСегодня);

  // Список лекарств
  const список = document.getElementById('список-лекарств');
  if (!список) return;

  if (все.length === 0) {
    список.innerHTML = '<p class="muted">Пока нет лекарств. Нажмите «+» сверху.</p>';
    return;
  }

  список.innerHTML = все.map(л => {
    const принято = Object.values(л.принято).filter(Boolean).length;
    const нужно = л.днейКурса * л.времена.length;
    const прогресс = нужно ? Math.round((принято / нужно) * 100) : 0;
    const расписание = л.времена.map(вр =>
      `${вр} ${л.времяТочное?.[вр] || ''}`
    ).join(' · ');

    return `
      <div class="card med-info" onclick="отметитьПриём('${л.id}')">
        <div class="body">
          <div class="title">💊 ${экранировать(л.название)}</div>
          <div class="sub">${экранировать(л.дозировка)}</div>
          <div class="sub">${расписание}</div>
          <div class="sub">Курс: ${л.днейКурса} дн. · Принято: ${принято}/${нужно} (${прогресс}%)</div>
        </div>
        <div class="actions">
          <button class="icon-btn" onclick="event.stopPropagation(); редактироватьЛекарство('${л.id}')">✏️</button>
          <button class="icon-btn red" onclick="event.stopPropagation(); удалитьЛекарство('${л.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// ============ БЛОК "СЕГОДНЯ" ============
async function обновитьСегодня(все, сегодня, деньСегодня) {
  const контейнер = document.getElementById('сегодня-приёмы');
  if (!контейнер) return;

  const активные = все.filter(л => {
    if (!л.дни.includes(деньСегодня)) return false;
    const старт = new Date(л.датаНачала);
    старт.setHours(0, 0, 0, 0);
    const конец = new Date(старт);
    конец.setDate(конец.getDate() + л.днейКурса - 1);
    конец.setHours(23, 59, 59, 999);
    const с = new Date(сегодня);
    с.setHours(12, 0, 0, 0);
    return с >= старт && с <= конец;
  });

  if (активные.length === 0) {
    контейнер.innerHTML = '<p class="muted">Сегодня нет приёмов лекарств</p>';
    return;
  }

  контейнер.innerHTML = активные.map(л => {
    const кнопки = л.времена.map(вр => {
      const выпито = л.принято[`${сегодня}-${вр}`];
      const время = л.времяТочное?.[вр] || '';
      return `
        <button class="кнопка-приём ${выпито ? 'выпито' : ''}"
                onclick="отметитьПриёмДля('${л.id}', '${вр}', '${сегодня}')">
          ${выпито ? '✓ ' : ''}${вр}
          <span class="время">${время}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="сегодня-card">
        <div class="название">💊 ${экранировать(л.название)}</div>
        <div class="инфо">${экранировать(л.дозировка)}</div>
        <div class="кнопки">${кнопки}</div>
      </div>
    `;
  }).join('');
}

// ============ СТАТИСТИКА ============
async function обновитьСтатистику() {
  const все = await получитьВсе('лекарства');
  let всего = 0, принято = 0;

  все.forEach(л => {
    всего += л.днейКурса * л.времена.length;
    принято += Object.values(л.принято).filter(Boolean).length;
  });

  const процент = всего === 0 ? 0 : Math.round((принято / всего) * 100);
  const элПроцент = document.getElementById('процент');
  if (элПроцент) элПроцент.textContent = процент + '%';

  const круг = document.getElementById('прогресс');
  if (круг) {
    const длина = 534;
    круг.setAttribute('stroke-dashoffset', длина - (длина * процент / 100));
  }

  const контейнер = document.getElementById('список-статистики');
  if (!контейнер) return;

  if (все.length === 0) {
    контейнер.innerHTML = '<p class="muted" style="text-align:center">Нет данных для статистики</p>';
    return;
  }

  контейнер.innerHTML = все.map(л => {
    const прин = Object.values(л.принято).filter(Boolean).length;
    const нужно = л.днейКурса * л.времена.length;
    const расписание = л.времена.map(вр =>
      `${вр} ${л.времяТочное?.[вр] || ''}`
    ).join(' · ');

    return `
      <div class="card">
        <div class="body">
          <div class="title">${экранировать(л.название)}</div>
          <div class="sub">${экранировать(л.дозировка)}</div>
          <div class="sub">${расписание}</div>
          <div class="sub">Курс ${л.днейКурса} дн. · Принято: ${прин} из ${нужно}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============ ЭКСПОРТ PDF ============
async function экспортPDF() {
  const все = await получитьВсе('лекарства');

  const win = window.open('', '_blank');
  if (!win) {
    alert('Разрешите всплывающие окна, чтобы экспортировать отчёт');
    return;
  }

  let всего = 0, принято = 0;
  все.forEach(л => {
    всего += л.днейКурса * л.времена.length;
    принято += Object.values(л.принято).filter(Boolean).length;
  });
  const общийПроцент = всего ? Math.round(принято / всего * 100) : 0;

  win.document.write(`
    <!DOCTYPE html>
    <html lang="ru"><head><meta charset="UTF-8"><title>Отчёт по лекарствам</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 40px; color: #000; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      p.date { color: #666; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { padding: 10px; border: 1px solid #ccc; text-align: left; font-size: 14px; }
      th { background: #f2f2f7; }
      .summary { background: #e8f5e9; padding: 16px; border-radius: 8px; margin-bottom: 24px; }
    </style></head><body>
    <h1>Отчёт по приёму лекарств</h1>
    <p class="date">Дата: ${new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    ${все.length === 0
      ? '<p>Нет данных для отчёта</p>'
      : `<div class="summary">
          <strong>Всего лекарств: ${все.length}</strong><br>
          Общая приверженность: ${общийПроцент}%
        </div>
        <table>
          <tr><th>Лекарство</th><th>Дозировка</th><th>Время приёма</th><th>Курс</th><th>Принято</th></tr>
          ${все.map(л => `
            <tr>
              <td>${экранировать(л.название)}</td>
              <td>${экранировать(л.дозировка)}</td>
              <td>${л.времена.map(вр => `${вр} ${л.времяТочное?.[вр] || ''}`).join('<br>')}</td>
              <td>${л.днейКурса} дн.</td>
              <td>${Object.values(л.принято).filter(Boolean).length} / ${л.днейКурса * л.времена.length}</td>
            </tr>
          `).join('')}
        </table>`
    }
    <script>setTimeout(() => window.print(), 400);<\/script>
    </body></html>
  `);
  win.document.close();
}

// ============ СТАРТ ============
(async () => {
  try {
    await открытьБД();
  } catch (e) {
    console.error('Ошибка БД:', e);
    alert('Не удалось открыть базу данных. Возможно, приватный режим браузера.');
    return;
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('SW не зарегистрирован:', e);
    }
  }

  await обновитьВсё();

  setInterval(обновитьБлижайшие, 30000);

  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(запроситьРазрешение, 2000);
  }
})();
