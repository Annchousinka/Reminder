/* ============================================================
   ПРИЛОЖЕНИЕ «НАПОМИНАНИЯ И ЛЕКАРСТВА»
   ============================================================ */

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

// ============ НАВИГАЦИЯ ============
function перейти(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  обновитьВсё();
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    перейти(btn.dataset.screen);
  };
});

// ============ УТИЛИТЫ ============
function экранировать(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function сегодняISO() {
  return new Date().toISOString().slice(0, 10);
}

function форматВремени(ts) {
  return new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function форматДаты(ts) {
  return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

// ============ НАПОМИНАНИЯ: СОЗДАНИЕ / РЕДАКТИРОВАНИЕ ============
let текущийИнтервал = 60;
let текущееФото = null;
let текущийДокумент = null;
let редактируемоеId = null;

document.querySelectorAll('.interval').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.interval').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    текущийИнтервал = parseInt(btn.dataset.мин);
    const когда = new Date(Date.now() + текущийИнтервал * 60000);
    document.getElementById('дата').value = когда.toISOString().slice(0, 10);
    document.getElementById('время').value =
      String(когда.getHours()).padStart(2, '0') + ':' +
      String(когда.getMinutes()).padStart(2, '0');
    показатьВремя();
  };
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
  document.getElementById('дата').value = д.toISOString().slice(0, 10);
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

document.getElementById('дата').onchange = показатьВремя;
document.getElementById('время').onchange = показатьВремя;

document.getElementById('фото').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    текущееФото = reader.result;
    document.getElementById('фото-метка').textContent = '✓';
  };
  reader.readAsDataURL(f);
};

document.getElementById('документ').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    текущийДокумент = { имя: f.name, данные: reader.result };
    document.getElementById('док-метка').textContent = '✓';
  };
  reader.readAsDataURL(f);
};

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
    const рег = await navigator.serviceWorker.ready;
    рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: редактируемоеId });
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
  const рег = await navigator.serviceWorker.ready;
  рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: редактируемоеId });

  редактируемоеId = null;
  перейти('screen-home');
}

// ============ УВЕДОМЛЕНИЯ ============
async function запроситьРазрешение() {
  if (!('Notification' in window)) {
    alert('Ваш браузер не поддерживает уведомления');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const р = await Notification.requestPermission();
  return р === 'granted';
}

async function запланироватьУведомление(н) {
  const разрешено = await запроситьРазрешение();
  if (!разрешено) return;

  const задержка = н.когда - Date.now();
  if (задержка <= 0) return;

  const рег = await navigator.serviceWorker.ready;
  рег.active.postMessage({
    тип: 'ЗАПЛАНИРОВАТЬ',
    напоминание: н,
    задержка
  });
}

// ============ ЛЕКАРСТВА ============
let редактируемоеЛекарствоId = null;

function открытьФормуЛекарства(лекарство = null) {
  редактируемоеЛекарствоId = лекарство ? лекарство.id : null;

  document.getElementById('название-л').value = лекарство?.название || '';
  document.getElementById('дозировка-л').value = лекарство?.дозировка || '';
  document.getElementById('раз-в-день').value = лекарство?.разВДень || 1;
  document.getElementById('дней-курса').value = лекарство?.днейКурса || 7;
  document.getElementById('дата-начала').value =
    лекарство?.датаНачала || сегодняISO();

  document.querySelectorAll('#chips-времени input').forEach(cb => {
    cb.checked = лекарство
      ? лекарство.времена.includes(cb.value)
      : cb.value === 'утро';
  });

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

  const времена = [...document.querySelectorAll('#chips-времени input:checked')]
    .map(i => i.value);
  if (времена.length === 0) return alert('Выберите время приёма');

  const дни = [...document.querySelectorAll('#дни-недели input:checked')]
    .map(i => parseInt(i.value));
  if (дни.length === 0) return alert('Выберите хотя бы один день');

  const л = {
    id: редактируемоеЛекарствоId || crypto.randomUUID(),
    название,
    дозировка: document.getElementById('дозировка-л').value || '1 таблетка',
    времена,
    разВДень: parseInt(document.getElementById('раз-в-день').value),
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

  // 1. Сразу создаём напоминание на ближайший приём
  await создатьНапоминаниеНаПриём(л);

  // 2. Планируем ВСЕ приёмы на весь курс + напоминание о повторе
  await запланироватьЛекарство(л);

  редактируемоеЛекарствоId = null;

  // 3. Переключаемся на трекер
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab[data-screen="screen-tracker"]')?.classList.add('active');
  перейти('screen-tracker');
}

// Создать обычное напоминание на ближайший приём лекарства
async function создатьНапоминаниеНаПриём(л) {
  const часы = { утро: 8, день: 14, вечер: 20 };
  const старт = new Date(л.датаНачала);
  let ближайшее = null;

  for (let д = 0; д < л.днейКурса; д++) {
    const дата = new Date(старт);
    дата.setDate(дата.getDate() + д);
    const нашДень = дата.getDay() === 0 ? 7 : дата.getDay();
    if (!л.дни.includes(нашДень)) continue;

    for (const вр of л.времена) {
      const когда = new Date(дата);
      когда.setHours(часы[вр], 0, 0, 0);
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
    лекарствоId: л.id
  };

  await сохранить('напоминания', напоминание);
  await запланироватьУведомление(напоминание);
}

// Отмена всех уведомлений лекарства
async function отменитьУведомленияЛекарства(лId) {
  const все = await получитьВсе('напоминания');
  const связанные = все.filter(н => н.лекарствоId === лId);
  const рег = await navigator.serviceWorker.ready;

  for (const н of связанные) {
    await удалитьИз('напоминания', н.id);
    рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: н.id });
  }
}

async function запланироватьЛекарство(л) {
  const разрешено = await запроситьРазрешение();
  if (!разрешено) return;

  const часы = { утро: 8, день: 14, вечер: 20 };
  const рег = await navigator.serviceWorker.ready;
  const старт = new Date(л.датаНачала);

  for (let д = 0; д < л.днейКурса; д++) {
    const дата = new Date(старт);
    дата.setDate(дата.getDate() + д);
    const нашДень = дата.getDay() === 0 ? 7 : дата.getDay();
    if (!л.дни.includes(нашДень)) continue;

    for (const вр of л.времена) {
      const когда = new Date(дата);
      когда.setHours(часы[вр], 0, 0, 0);
      const задержка = когда.getTime() - Date.now();
      if (задержка <= 0) continue;

      рег.active.postMessage({
        тип: 'ЗАПЛАНИРОВАТЬ',
        напоминание: {
          id: `${л.id}-${д}-${вр}`,
          текст: `💊 ${л.название}`,
          подтекст: `${вр} · ${л.дозировка}`,
          когда: когда.getTime(),
          лекарствоId: л.id,
          метка: `${дата.toISOString().slice(0,10)}-${вр}`
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

// Отметить приём
async function отметитьПриём(лId) {
  const все = await получитьВсе('лекарства');
  const л = все.find(x => x.id === лId);
  if (!л) return;

  const сегодня = сегодняISO();
  const время = prompt(
    `Какое время отметить для «${л.название}»?\n\nДоступно: ${л.времена.join(', ')}`,
    л.времена[0]
  );
  if (!время || !л.времена.includes(время)) return;

  const ключ = `${сегодня}-${время}`;
  л.принято[ключ] = !л.принято[ключ];
  await сохранить('лекарства', л);

  await обновитьТаблицу();
  await обновитьСтатистику();
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

// ============ ТАБЛИЦА + КАРТОЧКИ ЛЕКАРСТВ ============
async function обновитьТаблицу() {
  const все = await получитьВсе('лекарства');

  // Таблица
  document.querySelectorAll('#таблица-лекарств td[data-day]').forEach(td => {
    const день = parseInt(td.dataset.day);
    const время = td.dataset.time;
    const подходящие = все.filter(л =>
      л.дни.includes(день) && л.времена.includes(время)
    );
    td.innerHTML = подходящие
      .map(л => `<span class="pill">${экранировать(л.название.slice(0, 3))}</span>`)
      .join('<br>');
  });

  // Список карточек
  const список = document.getElementById('список-лекарств');
  if (все.length === 0) {
    список.innerHTML = '<p class="muted">Пока нет лекарств. Нажмите «+» сверху.</p>';
    return;
  }

  список.innerHTML = все.map(л => {
    const принято = Object.values(л.принято).filter(Boolean).length;
    const нужно = л.днейКурса * л.разВДень;
    const прогресс = нужно ? Math.round((принято / нужно) * 100) : 0;

    return `
      <div class="card med-info" onclick="отметитьПриём('${л.id}')">
        <div class="body">
          <div class="title">💊 ${экранировать(л.название)}</div>
          <div class="sub">${экранировать(л.дозировка)} · ${л.времена.join(', ')} · ${л.днейКурса} дн.</div>
          <div class="sub">Принято: ${принято} из ${нужно} (${прогресс}%)</div>
        </div>
        <div class="actions">
          <button class="icon-btn" onclick="event.stopPropagation(); редактироватьЛекарство('${л.id}')">✏️</button>
          <button class="icon-btn red" onclick="event.stopPropagation(); удалитьЛекарство('${л.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// ============ СТАТИСТИКА ============
async function обновитьСтатистику() {
  const все = await получитьВсе('лекарства');
  let всего = 0, принято = 0;

  все.forEach(л => {
    всего += л.днейКурса * л.разВДень;
    принято += Object.values(л.принято).filter(Boolean).length;
  });

  const процент = всего === 0 ? 0 : Math.round((принято / всего) * 100);
  document.getElementById('процент').textContent = процент + '%';

  const круг = document.getElementById('прогресс');
  const длина = 534;
  круг.setAttribute('stroke-dashoffset', длина - (длина * процент / 100));

  const контейнер = document.getElementById('список-статистики');
  if (все.length === 0) {
    контейнер.innerHTML = '<p class="muted" style="text-align:center">Нет данных для статистики</p>';
    return;
  }

  контейнер.innerHTML = все.map(л => {
    const прин = Object.values(л.принято).filter(Boolean).length;
    const нужно = л.днейКурса * л.разВДень;
    return `
      <div class="card">
        <div class="body">
          <div class="title">${экранировать(л.название)}</div>
          <div class="sub">${экранировать(л.дозировка)} · курс ${л.днейКурса} дн.</div>
          <div class="sub">Принято: ${прин} из ${нужно}</div>
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
          Общая приверженность: ${
            (() => {
              let в = 0, п = 0;
              все.forEach(л => {
                в += л.днейКурса * л.разВДень;
                п += Object.values(л.принято).filter(Boolean).length;
              });
              return в ? Math.round(п / в * 100) : 0;
            })()
          }%
        </div>
        <table>
          <tr><th>Лекарство</th><th>Дозировка</th><th>Время</th><th>Курс</th><th>Принято</th></tr>
          ${все.map(л => `
            <tr>
              <td>${экранировать(л.название)}</td>
              <td>${экранировать(л.дозировка)}</td>
              <td>${л.времена.join(', ')}</td>
              <td>${л.днейКурса} дн.</td>
              <td>${Object.values(л.принято).filter(Boolean).length} / ${л.днейКурса * л.разВДень}</td>
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
  await открытьБД();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('SW не зарегистрирован:', e);
    }
  }

  await обновитьВсё();

  // Обновление главной каждые 30 сек
  setInterval(обновитьБлижайшие, 30000);

  // Запрос разрешения на уведомления
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(запроситьРазрешение, 2000);
  }
})();
