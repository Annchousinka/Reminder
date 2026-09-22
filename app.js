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
    раз
