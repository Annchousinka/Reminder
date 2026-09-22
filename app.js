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

// ============ ФОРМА НАПОМИНАНИЯ ============
let текущийИнтервал = 60;
let текущееФото = null;
let текущийДокумент = null;
let редактируемоеId = null;

document.querySelectorAll('.interval').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.interval').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    текущийИнтервал = parseInt(btn.dataset.мин);
    // Автоматически ставим дату = сейчас + интервал
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
  перейти('screen-home');
}

async function удалитьНапоминание() {
  if (редактируемоеId) {
    await удалитьИз('напоминания', редактируемоеId);
    // Отменяем уведомление
    const рег = await navigator.serviceWorker.ready;
    рег.getNotifications({ tag: редактируемоеId }).then(ns => ns.forEach(n => n.close()));
  }
  перейти('screen-home');
}

// ============ УВЕДОМЛЕНИЯ ============
async function запроситьРазрешение() {
  if (!('Notification' in window)) {
    alert('Ваш браузер не поддерживает уведомления');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  const р = await Notification.requestPermission();
  return р === 'granted';
}

async function запланироватьУведомление(н) {
  const разрешено = await запроситьРазрешение();
  if (!разрешено) return;

  const задержка = н.когда - Date.now();
  if (задержка <= 0) return;

  // Через Service Worker — работает, даже если вкладка закрыта (на Android)
  const рег = await navigator.serviceWorker.ready;
  рег.active.postMessage({
    тип: 'ЗАПЛАНИРОВАТЬ',
    напоминание: н,
    задержка
  });
}

// ============ ГЛАВНЫЙ ЭКРАН ============
async function обновитьВсё() {
  await обновитьБлижайшие();
  await обновитьТаблицу();
  await обновитьСтатистику();
}

async function обновитьБлижайшие() {
  const все = await получитьВсе('напоминания');
  const сейчас = Date.now();
  const ближайшие = все
    .filter(н => !н.выполнено)
    .sort((a, b) => a.когда - b.когда)
    .slice(0, 20);

  const контейнер = document.getElementById('список-ближайших');

  if (ближайшие.length === 0) {
    контейнер.innerHTML = '<p class="muted">Пока нет напоминаний</p>';
    return;
  }

  контейнер.innerHTML = ближайшие.map(н => {
    const д = new Date(н.когда);
    const время = д.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const дата = д.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
    const просрочено = н.когда < сейчас;
    return `
      <div class="card ${н.важное ? 'important' : ''}" onclick="открытьНапоминание('${н.id}')">
        <div class="time">${время}</div>
        <div class="body">
          <div class="title">${экранировать(н.текст)}</div>
          <div class="sub">${дата}${просрочено ? ' · просрочено' : ''}</div>
        </div>
      </div>
    `;
  }).join('');
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
  const д = new Date(н.когда);
  document.getElementById('дата').value = д.toISOString().slice(0, 10);
  document.getElementById('время').value =
    String(д.getHours()).padStart(2, '0') + ':' +
    String(д.getMinutes()).padStart(2, '0');
  показатьВремя();
  перейти('screen-form');
}

function экранировать(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============ ТРЕКЕР ЛЕКАРСТВ ============
function открытьФормуЛекарства() {
  document.getElementById('название-л').value = '';
  document.getElementById('дозировка-л').value = '';
  document.getElementById('раз-в-день').value = 1;
  document.getElementById('дней-курса').value = 7;
  document.getElementById('дата-начала').value =
    new Date().toISOString().slice(0, 10);
  перейти('screen-med-form');
}

// ============ ЛЕКАРСТВА: создание + редактирование ============
let редактируемоеЛекарствоId = null;

function открытьФормуЛекарства(лекарство = null) {
  редактируемоеЛекарствоId = лекарство ? лекарство.id : null;

  document.getElementById('название-л').value = лекарство?.название || '';
  document.getElementById('дозировка-л').value = лекарство?.дозировка || '';
  document.getElementById('раз-в-день').value = лекарство?.разВДень || 1;
  document.getElementById('дней-курса').value = лекарство?.днейКурса || 7;
  document.getElementById('дата-начала').value =
    лекарство?.датаНачала || new Date().toISOString().slice(0, 10);

  // Галочки времени
  document.querySelectorAll('.chips input[value="утро"],.chips input[value="день"],.chips input[value="вечер"]')
    .forEach(cb => cb.checked = лекарство ? лекарство.времена.includes(cb.value) : cb.value === 'утро');

  // Галочки дней недели
  document.querySelectorAll('#дни-недели input').forEach(cb => {
    cb.checked = лекарство
      ? лекарство.дни.includes(parseInt(cb.value))
      : true;
  });

  // Заголовок
  document.querySelector('#screen-med-form h1').textContent =
    лекарство ? 'Редактировать лекарство' : 'Новое лекарство';

  перейти('screen-med-form');
}

async function сохранитьЛекарство() {
  const название = document.getElementById('название-л').value.trim();
  if (!название) return alert('Введите название');

  const времена = [...document.querySelectorAll(
    '.chips input[value="утро"]:checked, .chips input[value="день"]:checked, .chips input[value="вечер"]:checked'
  )].map(i => i.value);
  if (времена.length === 0) return alert('Выберите время приёма');

  const дни = [...document.querySelectorAll('#дни-недели input:checked')]
    .map(i => parseInt(i.value));
  if (дни.length === 0) return alert('Выберите хотя бы один день');

  const л = {
    id: редактируемоеЛекарствоId || crypto.randomUUID(),
    название,
    дозировка: document.getElementById('дозировка-л').value,
    времена,
    разВДень: parseInt(document.getElementById('раз-в-день').value),
    дни,
    днейКурса: parseInt(document.getElementById('дней-курса').value),
    датаНачала: document.getElementById('дата-начала').value,
    принято: {}
  };

  // Если редактируем — сохраняем старые отметки "принято"
  if (редактируемоеЛекарствоId) {
    const старые = (await получитьВсе('лекарства'))
      .find(x => x.id === редактируемоеЛекарствоId);
    if (старые?.принято) л.принято = старые.принято;
    await отменитьУведомленияЛекарства(редактируемоеЛекарствоId);
  }

  await сохранить('лекарства', л);

  // 🆕 1. Сразу создаём напоминание на БЛИЖАЙШИЙ приём
  await создатьНапоминаниеНаПриём(л);

  // Планируем все приёмы на весь курс
  await запланироватьЛекарство(л);

  редактируемоеЛекарствоId = null;

  // 🆕 2. Переходим на трекер — там сразу видно лекарство
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab[data-screen="screen-tracker"]')?.classList.add('active');
  перейти('screen-tracker');
}

// 🆕 Создать обычное напоминание на ближайший приём лекарства
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
        if (!ближайшее || когда < ближайшее) {
          ближайшее = { когда, вр };
        }
      }
    }
    if (ближайшее) break; // первый подходящий день — достаточно
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

// 🆕 Отмена уведомлений старого лекарства при редактировании
async function отменитьУведомленияЛекарства(лId) {
  const все = await получитьВсе('напоминания');
  const связанные = все.filter(н => н.лекарствоId === лId);
  const рег = await navigator.serviceWorker.ready;

  for (const н of связанные) {
    await удалитьИз('напоминания', н.id);
    рег.active.postMessage({ тип: 'ОТМЕНИТЬ', id: н.id });
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

async function обновитьТаблицу() {
  const все = await получитьВсе('лекарства');
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

  document.getElementById('список-статистики').innerHTML = все.map(л => {
    const прин = Object.values(л.принято).filter(Boolean).length;
    const нужно = л.днейКурса * л.разВДень;
    return `
      <div class="card">
        <div class="body">
          <div class="title">${экранировать(л.название)}</div>
          <div class="sub">${л.дозировка} · курс ${л.днейКурса} дн.</div>
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
  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Отчёт</title>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 40px; }
      h1 { font-size: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { padding: 10px; border: 1px solid #ccc; text-align: left; font-size: 14px; }
      th { background: #f2f2f7; }
    </style></head><body>
    <h1>Отчёт по приёму лекарств</h1>
    <p>Дата: ${new Date().toLocaleDateString('ru')}</p>
    <table>
      <tr><th>Лекарство</th><th>Дозировка</th><th>Курс</th><th>Принято</th></tr>
      ${все.map(л => `
        <tr>
          <td>${экранировать(л.название)}</td>
          <td>${экранировать(л.дозировка)}</td>
          <td>${л.днейКурса} дн.</td>
          <td>${Object.values(л.принято).filter(Boolean).length} / ${л.днейКурса * л.разВДень}</td>
        </tr>
      `).join('')}
    </table>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ============ СТАРТ ============
(async () => {
  await открытьБД();
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('sw.js');
  }
  await обновитьВсё();

  // Проверяем сработавшие уведомления
  setInterval(обновитьБлижайшие, 30000);

  // Напоминаем о разрешении
  if (Notification.permission === 'default') {
    setTimeout(запроситьРазрешение, 2000);
  }
})();
