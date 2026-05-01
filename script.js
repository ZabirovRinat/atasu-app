// ==================== КОНФИГУРАЦИЯ ====================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyIqjwPpjcONp4WfG3R8UIaUBsaec7dKMl12hFrP5Nsp1PmXNVGJy11KlSLAq-N8oV1SQ/exec';

let TECH = [], JOURNAL = [], OPERATORS = [], DEFECTS = [];
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
    headers: { 'Content-Type': 'text/plain' },   // ← ЕДИНСТВЕННОЕ ИЗМЕНЕНИЕ
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
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload_photo', folder, base64, fileName })
    });
    const result = await res.json();
    return result.url || '';
  } catch (e) {
    console.error('uploadPhoto error', e);
    return '';
  }
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
  // Прямые ссылки Google Drive (новые и старые)
  if (val.includes('drive.google.com')) {
    return `<a href="${val}" target="_blank" class="photo-link">📷 Просмотр фото</a>`;
  }
  // Старые пути AppSheet – просто заглушка
  if (val.startsWith('/Photos/')) {
    return `<span style="color:var(--tx3); font-size:11px;">📁 Арх. фото (AppSheet)</span>`;
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

function getDateRange() {
  const now = new Date();
  let from, to = new Date();
  if (journalPeriod === 'week') {
    const day = now.getDay(), diff = day === 0 ? 6 : day-1;
    from = new Date(now); from.setDate(now.getDate()-diff); from.setHours(0,0,0,0);
    to = new Date(from); to.setDate(from.getDate()+6); to.setHours(23,59,59,999);
  } else if (journalPeriod === 'prevWeek') {
    const day = now.getDay(), diff = day === 0 ? 6 : day-1;
    from = new Date(now); from.setDate(now.getDate()-diff-7); from.setHours(0,0,0,0);
    to = new Date(from); to.setDate(from.getDate()+6); to.setHours(23,59,59,999);
  } else if (journalPeriod === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  } else if (journalPeriod === 'custom' && customFrom && customTo) {
    from = new Date(customFrom); from.setHours(0,0,0,0);
    to = new Date(customTo); to.setHours(23,59,59,999);
  } else {
    from = new Date(0); to = new Date();
  }
  return { from, to };
}

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

// ==================== НАВИГАЦИЯ ====================
const screenAccess = {
  journal: ['admin','manager','coordinator','mechanic','slesar','operator'],
  tech: ['admin','manager','coordinator','mechanic','slesar'],
  gsm: ['admin','manager','coordinator','mechanic'],
  repair: ['admin','manager','coordinator','slesar'],
  stock: ['admin','manager','coordinator','mechanic','slesar']
};

function buildSidebar() {
  const items = [
    { id:'journal', icon:'📋', label:'Журнал смен' },
    { id:'tech', icon:'🚜', label:'Техника' },
    { id:'gsm', icon:'⛽', label:'ГСМ' },
    { id:'repair', icon:'🔧', label:'Ремонты' },
    { id:'stock', icon:'📦', label:'Склад' }
  ];
  const role = currentUser?.roleKey || 'guest';
  const visible = items.filter(it => screenAccess[it.id]?.includes(role));
  document.getElementById('sidebarNav').innerHTML = visible.map(it => `
    <div class="sb-item" data-screen="${it.id}">
      <div class="sb-ic">${it.icon}</div><span>${it.label}</span>
    </div>
  `).join('');
  document.querySelectorAll('.sb-item').forEach(el => el.addEventListener('click', () => switchScreen(el.dataset.screen)));
}

function switchScreen(screen) {
  if (!screenAccess[screen]?.includes(currentUser?.roleKey)) {
    showToast('⛔ Нет доступа', true);
    return;
  }
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('on'));
  const activeItem = document.querySelector(`.sb-item[data-screen="${screen}"]`);
  if (activeItem) activeItem.classList.add('on');
  const actionBtn = document.getElementById('actionBtn');
  if (screen === 'journal' && (currentUser?.roleKey === 'operator' || currentUser?.roleKey === 'admin')) {
    actionBtn.style.display = '';
    actionBtn.onclick = openShiftForm;
  } else {
    actionBtn.style.display = 'none';
  }
  if (screen === 'journal') renderJournal();
}

// ==================== ФОРМА СМЕНЫ ====================
function openShiftForm() {
  shiftStep = 1;
  shiftData = {};
  defectsArray = [];
  renderShiftStep();
  document.getElementById('shiftModal').classList.add('open');
}
function closeShiftModal() {
  document.getElementById('shiftModal').classList.remove('open');
}

window.handlePhotoUpload = function (itemId, input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById(`prev_${itemId}`);
    if (prev) {
      prev.innerHTML = `<img src="${e.target.result}" style="width:48px; height:48px; object-fit:cover; border-radius:8px;">`;
    }
    shiftData[`photo_${itemId}`] = e.target.result.split(',')[1];
  };
  reader.readAsDataURL(input.files[0]);
};

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

function renderShiftStep() {
  const container = document.getElementById('shiftStepContent');
  const backBtn = document.getElementById('shiftBackBtn');
  const nextBtn = document.getElementById('shiftNextBtn');
  const saveBtn = document.getElementById('shiftSaveBtn');

  if (shiftStep === 1) {
    const techOptions = TECH.filter(t => t.Статус === 'В работе').map(t => `<option value="${t.ID_Техники}">${t.ID_Техники}</option>`).join('');
    container.innerHTML = `
      <div class="fp"><label class="fl">Тип записи</label>
        <div><label><input type="radio" name="shiftType" value="Прием смены" ${shiftType==='Прием смены'?'checked':''} onchange="updateShiftType(this.value)"> Прием</label>
        <label style="margin-left:16px;"><input type="radio" name="shiftType" value="Сдача смены" onchange="updateShiftType(this.value)"> Сдача</label></div></div>
      <div class="fp"><label class="fl">Техника</label><select id="shiftTech" class="fs">${techOptions}</select></div>
      <div class="fp"><label class="fl">Смена</label><select id="shiftShift" class="fs"><option>День</option><option>Ночь</option></select></div>
      <div class="fp"><label class="fl">Оператор</label><input id="shiftOp" class="fi" value="${currentUser ? currentUser.name : ''}" readonly></div>
      <div class="frow"><div><label class="fl">Моточасы *</label><input id="shiftH" type="number" step="0.01" class="fi"></div>
      <div><label class="fl">Топливо (л) *</label><input id="shiftFuel" type="number" step="0.01" class="fi"></div>
      <div><label class="fl">АКБ (В)</label><input id="shiftBattery" type="number" step="0.1" class="fi"></div></div>
    `;
    backBtn.style.display = 'none'; nextBtn.style.display = 'flex'; saveBtn.style.display = 'none';
  } else if (shiftStep === 2 && shiftType === 'Сдача смены') {
    saveShiftFinal();
    return;
  } else if (shiftStep === 2 && shiftType === 'Прием смены') {
    let html = '<div style="max-height:55vh; overflow-y:auto; padding:0 18px;"><div style="font-size:12px; color:var(--tx3); margin-bottom:10px;">Проверьте все пункты (обязательно)</div>';
    for (let [id, label] of Object.entries(checklistLabels)) {
      if (id === 'oil_motor' || id === 'oil_coolant') {
        const existingPhoto = shiftData[`photo_${id}`]
          ? `<img src="data:image/jpeg;base64,${shiftData[`photo_${id}`]}" style="width:48px; height:48px; object-fit:cover; border-radius:8px; display:block;">`
          : '';
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

window.updateShiftType = function (val) { shiftType = val; };

function shiftNext() {
  if (shiftStep === 1) {
    shiftData.tech = document.getElementById('shiftTech').value;
    shiftData.shift = document.getElementById('shiftShift').value;
    shiftData.h = +document.getElementById('shiftH').value;
    shiftData.fuel = +document.getElementById('shiftFuel').value;
    shiftData.bat = +document.getElementById('shiftBattery').value || 0;
    if (!shiftData.tech || !shiftData.h || !shiftData.fuel) {
      showToast('Заполните обязательные поля: Техника, Моточасы, Топливо', true);
      return;
    }
    shiftType = document.querySelector('input[name="shiftType"]:checked').value;
    shiftStep = 2;
    renderShiftStep();
  }
}
function shiftBack() { if (shiftStep > 1) shiftStep--; renderShiftStep(); }

async function saveShiftFinal() {
  const saveBtn = document.getElementById('saveShiftFinalBtn');
  if (saveBtn && saveBtn.disabled) return;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Сохранение...';
  }
  try {
    const nowFormatted = getNowFormatted();
    const recId = Math.random().toString(36).substr(2,8);

    // Загружаем фото и получаем прямые ссылки Drive
    let linkOilMotor = '';
    let linkOilCoolant = '';
    if (shiftType === 'Прием смены') {
      const b64motor = shiftData['photo_oil_motor'];
      if (b64motor) {
        linkOilMotor = await uploadPhoto(b64motor, `shift_${recId}_oil_motor.jpg`, 'Журнал_смен_Images');
      }
      const b64coolant = shiftData['photo_oil_coolant'];
      if (b64coolant) {
        linkOilCoolant = await uploadPhoto(b64coolant, `shift_${recId}_oil_coolant.jpg`, 'Журнал_смен_Images');
      }
    }

    const rec = {
      ID_Записи: recId,
      Дата: nowFormatted,
      Тип_записи: shiftType,
      "Смена (День/Ночь)": shiftData.shift,
      Оператор: currentUser.name,
      ID_Техники: shiftData.tech,
      Моточасы: shiftData.h,
      "Уровень топлива (л)": shiftData.fuel,
      Аккамуляторная_батарея: shiftData.bat,
      Дефекты: document.getElementById('shiftDefects')?.value || '',
      [checklistLabels.oil_motor]: linkOilMotor,
      [checklistLabels.oil_coolant]: linkOilCoolant
    };

    // Добавляем статусы остальных пунктов чек-листа
    if (shiftType === 'Прием смены') {
      for (let [id, label] of Object.entries(checklistLabels)) {
        if (id === 'oil_motor' || id === 'oil_coolant') continue;
        const st = shiftData[`status_${id}`];
        rec[label] = st === 'дефект' ? 'Дефект' : 'В норме';
      }
    }

    // Сохраняем основную запись
    await gasPost('append', 'Журнал смен', rec);

    // Сохраняем дефекты
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

document.getElementById('shiftNextBtn').onclick = shiftNext;
document.getElementById('shiftBackBtn').onclick = shiftBack;

// ==================== ОТКРЫТИЕ КАРТОЧКИ ====================
window.openJournalCard = async (id) => {
  try {
    const record = JOURNAL.find(j => j.ID_Записи === id);
    if (!record) throw new Error('Запись не найдена');
    let checklistHtml = '<div style="margin-top:12px;"><strong>Чеклист осмотра:</strong></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">';
    for (let [key, label] of Object.entries(checklistLabels)) {
      let val = record[label] || '—';
      let display = (key === 'oil_motor' || key === 'oil_coolant') ? parsePhotoValue(val) : val;
      checklistHtml += `<div style="background:var(--bg3); padding:8px; border-radius:8px;"><div style="font-size:11px;">${label}</div><div>${display}</div></div>`;
    }
    checklistHtml += '</div>';
    const relatedDefects = DEFECTS.filter(d => d.ID_Смены === id);
    let defectsHtml = '';
    if (relatedDefects.length) {
      defectsHtml = '<div style="margin-top:12px;"><strong>Зафиксированные дефекты:</strong></div>';
      for (let d of relatedDefects) {
        defectsHtml += `<div style="padding:8px; background:rgba(239,68,68,0.1); border-radius:8px; margin-top:6px;">⚠️ ${d.Описание}<br>${parsePhotoValue(d.Фото)}</div>`;
      }
    }
    document.getElementById('journalCardContent').innerHTML = `
      <div><strong>Дата:</strong> ${formatDate(record.Дата, true)}</div>
      <div><strong>Техника:</strong> ${record.ID_Техники}</div>
      <div><strong>Оператор:</strong> ${record.Оператор}</div>
      <div><strong>Смена:</strong> ${record["Смена (День/Ночь)"] || record.Смена}</div>
      <div><strong>Моточасы:</strong> ${record.Моточасы}</div>
      <div><strong>Топливо (л):</strong> ${record["Уровень топлива (л)"] || record.Топливо}</div>
      <div><strong>АКБ (В):</strong> ${record.Аккамуляторная_батарея || '—'}</div>
      <div><strong>Дефекты (текст):</strong> ${record.Дефекты || '—'}</div>
      ${checklistHtml}
      ${defectsHtml}
    `;
    document.getElementById('journalCardModal').classList.add('open');
  } catch (e) {
    showToast('Ошибка при открытии: ' + e.message, true);
    console.error(e);
  }
};

window.closeJournalCard = () => document.getElementById('journalCardModal').classList.remove('open');

// ==================== ФИЛЬТРЫ ЖУРНАЛА ====================
function setupJournalFilters() {
  document.querySelectorAll('[data-period]').forEach(btn => {
    btn.onclick = () => {
      journalPeriod = btn.dataset.period;
      document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('customPeriod').style.display = journalPeriod === 'custom' ? 'flex' : 'none';
      renderJournal();
    };
  });
  document.getElementById('applyPeriod').onclick = () => {
    customFrom = document.getElementById('dateFrom').value;
    customTo = document.getElementById('dateTo').value;
    if (customFrom && customTo) {
      journalPeriod = 'custom';
      renderJournal();
    } else {
      showToast('Выберите обе даты', true);
    }
  };
}

// ==================== АВТОРИЗАЦИЯ ====================
async function init() {
  const ops = await gasGet('Операторы');
  if (ops.length) OPERATORS = ops;
  document.getElementById('doLoginBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const user = OPERATORS.find(u => (u.Email === email || u.Логин === email) && u.Пароль === pass);
    if (!user) {
      document.getElementById('loginError').innerText = 'Неверный логин или пароль';
      return;
    }
    currentUser = user;
    currentUser.roleKey = user.Роль.includes('Админ') ? 'admin' : (user.Роль.includes('Оператор') ? 'operator' : 'guest');
    currentUser.name = user.ФИО;
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('atasu-app').style.visibility = 'visible';
    await loadAllData();
    buildSidebar();
    switchScreen('journal');
    document.getElementById('userName').innerText = currentUser.name;
    document.getElementById('userRole').innerText = user.Роль;
    document.getElementById('userAvatar').innerText = currentUser.name.charAt(0);
    document.getElementById('actionBtn').onclick = () => {
      if (currentUser.roleKey === 'operator') openShiftForm();
      else showToast('Доступно только оператору');
    };
    setupJournalFilters();
  };
}

init();
