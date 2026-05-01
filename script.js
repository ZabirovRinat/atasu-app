// ==================== КОНФИГУРАЦИЯ ====================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbymCZRkr5i12vox8xfbdMrXileNMLMYAWOg3a69SwASH1wV0Sug620fo0GZXgQ1A2a-8A/exec';
let TECH = [], JOURNAL = [], OPERATORS = [];
let currentUser = null, currentScreen = 'journal';
let journalPeriod = 'week', customFrom = null, customTo = null;
let shiftStep = 1, shiftType = 'Прием смены', shiftData = {};
let defectsArray = [];

const checklistLabels = {
  oil_motor: 'Уровень моторного масла',
  oil_coolant: 'Уровень охлаждающей жидкости',
  trans: 'Уровень трансмиссионного масла',
  brake_fluid: 'Уровень тормозной жидкости',
  brakes: 'Состояние тормозов',
  hydro: 'Уровень гидравлического масла',
  hoses: 'Состояние шлангов гидросистемы',
  steering: 'Состояние тяги рулевого управления',
  cabin: 'Состояние кабины оператора',
  glass: 'Состояние стекол кабины',
  mirrors: 'Состояние зеркал заднего вида',
  signal_rev: 'Исправность звукового сигнала заднего хода',
  signal_alarm: 'Исправность аварийной сигнализации',
  beacon: 'Исправность проблескового маячка',
  visual: 'Визуальный осмотр (наличие повреждений, утечек)',
  fire_ext: 'Наличие огнетушителя и аптечки'
};

// ==================== API ====================
async function gasGet(sheet) {
  try {
    const url = `${GAS_URL}?sheet=${encodeURIComponent(sheet)}&t=${Date.now()}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok && json.rows) {
      return json.rows.map(row => {
        const cleanRow = {};
        for (let key in row) cleanRow[key.trim()] = row[key];
        return cleanRow;
      });
    }
    return [];
  } catch (e) {
    console.error('gasGet error', e);
    return [];
  }
}

async function gasPost(action, sheet, data, key = null, extra = null) {
  const payload = { action, sheet, data };
  if (key) payload.key = key;
  if (extra) Object.assign(payload, extra);
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Ошибка сервера');
  }
  return json;
}

async function uploadPhoto(base64, fileName, folder = 'Журнал_смен_Images') {
  if (!base64 || base64.length < 10) return '';
  const res = await gasPost('upload_photo', 'Журнал смен', null, null, {
    fileName,
    base64,
    folder
  });
  return res.url || '';
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  t.style.background = isError ? '#dc2626' : '#1e293b';
  setTimeout(() => t.classList.remove('show'), 4000);
}

function getNowFormatted() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDate(d, withTime = false) {
  if (!d) return '';
  let date = new Date(d);
  if (isNaN(date)) return d.slice(0,16);
  return withTime ? date.toLocaleString('ru', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : date.toISOString().slice(0,10);
}

function parsePhotoValue(val) {
  if (!val || typeof val !== 'string') return '';
  if (val.includes('drive.google.com')) return `<a href="${val}" target="_blank">📷 Фото</a>`;
  if (val.startsWith('/Photos/')) {
    return `<a href="https://www.appsheet.com/template/gettablefileurl?appName=ReachStacker_Logbook-100235370138&tableName=${encodeURIComponent('Журнал смен')}&fileName=${encodeURIComponent(val)}" target="_blank">📷 Фото (AppSheet)</a>`;
  }
  return val;
}

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadAllData() {
  const [tech, journal, ops, defects] = await Promise.all([
    gasGet('Техника'), gasGet('Журнал смен'), gasGet('Операторы'), gasGet('Дефекты')
  ]);
  TECH = tech.map(t => ({ ...t, Статус: (t.Статус || '').trim() }));
  JOURNAL = (journal || []).sort((a,b) => new Date(b.Дата) - new Date(a.Дата));
  OPERATORS = ops || [];
  DEFECTS = defects || [];
  renderJournal();
}

function getDateRange() { /* ... без изменений ... */ }

function renderJournal() {
  const { from, to } = getDateRange();
  let filtered = JOURNAL.filter(j => { let d = new Date(j.Дата); return d >= from && d <= to; });
  if (currentUser?.roleKey === 'operator') {
    filtered = filtered.filter(j => j.Тип_записи !== 'Сдача смены');
  }
  document.getElementById('journalBody').innerHTML = filtered.map(j => {
    const hasDefect = DEFECTS.some(d => d.ID_Смены === j.ID_Записи);
    return `<tr class="clickable-row" onclick="openJournalCard('${j.ID_Записи}')">
      <td>${formatDate(j.Дата, true)}</td>
      <td>${j.ID_Техники || ''}</td>
      <td>${j.Оператор || ''}</td>
      <td>${j["Смена (День/Ночь)"] || j.Смена || ''}</td>
      <td>${j.Моточасы || 0}</td>
      <td>${j["Уровень топлива (л)"] || j.Топливо || 0}</td>
      <td>${j.Аккамуляторная_батарея || ''}</td>
      <td>${hasDefect ? '🔺 Дефекты' : ''}</td>
    </tr>`;
  }).join('');
}

// ==================== НАВИГАЦИЯ (без изменений) ====================
// ... весь код buildSidebar, switchScreen, openShiftForm, closeShiftModal, и т.д.

// ==================== ФОРМА СМЕНЫ (исправлено) ====================
function renderShiftStep() {
  const container = document.getElementById('shiftStepContent');
  const backBtn = document.getElementById('shiftBackBtn');
  const nextBtn = document.getElementById('shiftNextBtn');
  const saveBtn = document.getElementById('shiftSaveBtn');

  if (shiftStep === 1) {
    // ... как у вас, без изменений
  } else if (shiftStep === 2 && shiftType === 'Сдача смены') {
    saveShiftFinal(); return;
  } else if (shiftStep === 2 && shiftType === 'Прием смены') {
    let html = '<div style="max-height:55vh; overflow-y:auto; padding:0 18px;">...';
    for (let [id, label] of Object.entries(checklistLabels)) {
      if (id === 'oil_motor' || id === 'oil_coolant') {
        const existingPhoto = shiftData[`photo_${id}`] ? `<img src="data:image/jpeg;base64,${shiftData[`photo_${id}`]}" style="width:48px; height:48px; object-fit:cover; border-radius:8px; display:block;">` : '';
        html += `<div style="border:1px solid var(--b); border-radius:12px; padding:12px; margin-bottom:12px;">
          <div style="font-weight:600; margin-bottom:10px;">${label}</div>
          <div style="display:flex; align-items:center; gap:10px;">
            <label style="background:#f97316; color:#fff; padding:5px 12px; border-radius:20px; cursor:pointer;">📷 Фото<input type="file" accept="image/*" capture="environment" style="display:none" onchange="handlePhotoUpload('${id}', this)"></label>
            <div id="prev_${id}">${existingPhoto}</div>
          </div>
        </div>`;
      } else {
        const status = shiftData[`status_${id}`];
        const okActive = status === 'норме' ? 'background:#10b981; color:#fff;' : 'background:#fff; color:#10b981;';
        const badActive = status === 'дефект' ? 'background:#ef4444; color:#fff;' : 'background:#fff; color:#ef4444;';
        html += `<div style="border:1px solid var(--b); border-radius:12px; padding:12px; margin-bottom:12px;">
          <div style="font-weight:600; margin-bottom:10px;">${label}</div>
          <div style="display:flex; gap:10px;">
            <button type="button" id="ok_${id}" onclick="setCheckStatus('${id}', 'норме')" style="flex:1; padding:8px; border-radius:8px; border:1.5px solid #10b981; ${okActive} font-weight:600;">✓ В норме</button>
            <button type="button" id="bad_${id}" onclick="setCheckStatus('${id}', 'дефект')" style="flex:1; padding:8px; border-radius:8px; border:1.5px solid #ef4444; ${badActive} font-weight:600;">✗ Дефект</button>
          </div>
        </div>`;
      }
    }
    html += `<div class="fp"><button id="checklistSaveBtn" class="btn btn-full">✓ Готово, продолжить</button></div></div>`;
    container.innerHTML = html;
    backBtn.style.display = 'flex'; nextBtn.style.display = 'none'; saveBtn.style.display = 'none';

    // Единый обработчик, который не накапливается
    document.getElementById('checklistSaveBtn').onclick = () => {
      let allSelected = true;
      for (let id of Object.keys(checklistLabels)) {
        if (id !== 'oil_motor' && id !== 'oil_coolant') {
          if (!shiftData[`status_${id}`]) { allSelected = false; break; }
        } else {
          if (!shiftData[`photo_${id}`]) { allSelected = false; break; }
        }
      }
      if (!allSelected) {
        showToast('Заполните все пункты чек-листа (фото для масла и ОЖ, статус для остальных)', true);
        return;
      }
      const hasDefects = Object.entries(shiftData).some(([k,v]) => k.startsWith('status_') && v === 'дефект');
      if (hasDefects) { shiftStep = 3; renderShiftStep(); } else { saveShiftFinal(); }
    };

  } else if (shiftStep === 3 && shiftType === 'Прием смены') {
    // ... (сохраняем почти как было, но финальную кнопку привязываем один раз через глобальную функцию)
    container.innerHTML = `
      <div class="fp"><label class="fl">ОБЩЕЕ ОПИСАНИЕ ДЕФЕКТОВ</label>
        <textarea id="shiftDefects" class="ft" rows="2"></textarea>
      </div>
      <div style="border-top: 1px solid var(--b); margin: 16px 0;"></div>
      <div class="fp" style="background: var(--bg3); border-radius: 12px; padding: 12px; margin: 0 18px 16px 18px;">
        <label class="fl">ДОБАВИТЬ НОВЫЙ ДЕФЕКТ</label>
        <input type="text" id="newDefectDesc" class="fi" placeholder="Описание..." style="margin-bottom: 8px;">
        <label class="btn btn-outline" style="display: block; text-align: center; cursor: pointer; margin-bottom: 8px;">
          📷 Выбрать фото
          <input type="file" id="newDefectPhoto" accept="image/*" capture="environment" style="display: none;">
        </label>
        <button id="addNewDefectToListBtn" class="btn" style="width: 100%; background: var(--grn);">+ Добавить в список</button>
      </div>
      <div id="defectsList" style="padding: 0 18px;"></div>
      <div class="fp">
        <button id="saveShiftFinalBtn" class="btn btn-full">✓ СОХРАНИТЬ СМЕНУ</button>
      </div>
    `;

    let tempPhoto = null, tempPreview = null;
    document.getElementById('newDefectPhoto').onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        const r = new FileReader();
        r.onload = (ev) => { tempPhoto = ev.target.result.split(',')[1]; tempPreview = ev.target.result; showToast('Фото готово'); };
        r.readAsDataURL(e.target.files[0]);
      }
    };

    const renderList = () => {
      document.getElementById('defectsList').innerHTML = defectsArray.map((d, i) => `
        <div style="padding: 10px; background: #fff; border: 1px solid var(--b); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div><b>${d.text}</b><br>${d.photoPreview ? `<img src="${d.photoPreview}" style="height:40px;">` : ''}</div>
          <button class="btn btn-outline small" onclick="removeDefect(${i})">✕</button>
        </div>
      `).join('');
    };
    window.removeDefect = (i) => { defectsArray.splice(i,1); renderList(); };

    document.getElementById('addNewDefectToListBtn').onclick = () => {
      const txt = document.getElementById('newDefectDesc').value.trim();
      if (!txt) { showToast('Введите описание дефекта', true); return; }
      defectsArray.push({ text: txt, photoBase64: tempPhoto, photoPreview: tempPreview });
      document.getElementById('newDefectDesc').value = '';
      tempPhoto = null; tempPreview = null;
      document.getElementById('newDefectPhoto').value = '';
      renderList();
    };

    document.getElementById('saveShiftFinalBtn').onclick = () => saveShiftFinal();
  }
}

// setCheckStatus – без изменений, но теперь он обновляет стили сразу
window.setCheckStatus = function (itemId, status) {
  const okBtn = document.getElementById(`ok_${itemId}`);
  const badBtn = document.getElementById(`bad_${itemId}`);
  if (status === 'норме') {
    okBtn.style.background = '#10b981'; okBtn.style.color = '#fff';
    badBtn.style.background = '#fff'; badBtn.style.color = '#ef4444';
  } else {
    badBtn.style.background = '#ef4444'; badBtn.style.color = '#fff';
    okBtn.style.background = '#fff'; okBtn.style.color = '#10b981';
  }
  shiftData[`status_${itemId}`] = status;
};

// saveShiftFinal – теперь с ожиданием загрузки фото
async function saveShiftFinal() {
  const saveBtn = document.getElementById('saveShiftFinalBtn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Сохранение...';
  }
  try {
    const nowFormatted = getNowFormatted();
    const rec = {
      ID_Записи: Math.random().toString(36).substr(2,8),
      Дата: nowFormatted,
      Тип_записи: shiftType,
      "Смена (День/Ночь)": shiftData.shift,
      Оператор: currentUser.name,
      ID_Техники: shiftData.tech,
      Моточасы: shiftData.h,
      "Уровень топлива (л)": shiftData.fuel,
      Аккамуляторная_батарея: shiftData.bat,
      Дефекты: document.getElementById('shiftDefects')?.value || ''
    };
    if (shiftType === 'Прием смены') {
      for (let [id, label] of Object.entries(checklistLabels)) {
        if (id === 'oil_motor' || id === 'oil_coolant') {
          const photoBase64 = shiftData[`photo_${id}`];
          if (photoBase64 && photoBase64.length > 10) {
            rec[label] = await uploadPhoto(photoBase64, `shift_${rec.ID_Записи}_${id}.jpg`);
          } else {
            rec[label] = '';
          }
        } else {
          const st = shiftData[`status_${id}`];
          rec[label] = st === 'дефект' ? 'Дефект' : 'В норме';
        }
      }
    }
    // Сначала основная запись
    await gasPost('append', 'Журнал смен', rec);
    // Затем дефекты
    for (let def of defectsArray) {
      const defectId = Math.random().toString(36).substr(2,8);
      let photoUrl = '';
      if (def.photoBase64 && def.photoBase64.length > 10) {
        photoUrl = await uploadPhoto(def.photoBase64, `defect_${defectId}.jpg`, 'Defects');
      }
      await gasPost('append', 'Дефекты', {
        ID_Дефекта: defectId,
        ID_Смены: rec.ID_Записи,
        Описание: def.text,
        Фото: photoUrl
      });
    }
    showToast(`✅ ${shiftType} сохранена`);
    closeShiftModal();
    shiftData = {};
    defectsArray = [];
    await loadAllData();
  } catch (e) {
    showToast('Ошибка сохранения: ' + e.message, true);
    console.error(e);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = '✓ Сохранить смену';
    }
  }
}
