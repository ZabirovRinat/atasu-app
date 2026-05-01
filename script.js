// ==================== КОНФИГУРАЦИЯ ====================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzfzDb-nx2qP9KilC3R9ahmCzpIVm3G81-kUxSFeCdPqVG-jzO5lXU0jTIB8-P0il-Mgg/exec'; 

let TECH = [], JOURNAL = [], OPERATORS = [], DEFECTS = [];
let currentUser = null;
let shiftStep = 1, shiftType = 'Прием смены', shiftData = {}, defectsArray = [];

// Точное соответствие колонкам в Google Таблице
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

// ==================== API (FIX CORS) ====================
async function gasGet(sheet) {
  try {
    const url = `${GAS_URL}?sheet=${encodeURIComponent(sheet)}&t=${Date.now()}`;
    const res = await fetch(url);
    const json = await res.json();
    return (json.ok && json.rows) ? json.rows.map(r => {
      const c = {}; for (let k in r) c[k.trim()] = r[k]; return c;
    }) : [];
  } catch (e) { return []; }
}

async function gasPost(action, sheet, data, extra = null) {
  const payload = { action, sheet, data, ...extra };
  // Используем mode: no-cors и text/plain для обхода блокировок Google
  await fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
  return { ok: true };
}

async function uploadPhoto(base64, fileName, folder) {
  if (!base64) return '';
  await gasPost('upload_photo', 'Журнал смен', null, { fileName, base64, folder });
  return `/Photos/${folder}/${fileName}`;
}

function parsePhotoValue(val) {
  if (!val || typeof val !== 'string') return '';
  if (val.includes('drive.google.com')) return `<a href="${val}" target="_blank">📷 Фото</a>`;
  if (val.startsWith('/Photos/')) {
    const tn = val.toLowerCase().includes('defects') ? 'Дефекты' : 'Журнал смен';
    const u = `https://www.appsheet.com/template/gettablefileurl?appName=ReachStacker_Logbook-100235370138&tableName=${encodeURIComponent(tn)}&fileName=${encodeURIComponent(val)}`;
    return `<a href="${u}" target="_blank">📷 Фото</a>`;
  }
  return val;
}

// ==================== ЛОГИКА СОХРАНЕНИЯ ====================
async function saveShiftFinal() {
  const btn = document.getElementById('saveShiftFinalBtn');
  if (btn.disabled) return;
  btn.disabled = true; btn.innerText = 'Сохранение...';

  try {
    const recId = Math.random().toString(36).substr(2, 8);
    const rec = {
      ID_Записи: recId,
      Дата: new Date().toISOString(),
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
          rec[label] = await uploadPhoto(shiftData[`photo_${id}`], `shift_${recId}_${id}.jpg`, 'Журнал_смен_Images');
        } else {
          rec[label] = shiftData[`status_${id}`] === 'дефект' ? 'Дефект' : 'В норме';
        }
      }
    }

    await gasPost('append', 'Журнал смен', rec);

    for (let def of defectsArray) {
      const dId = Math.random().toString(36).substr(2, 8);
      const url = await uploadPhoto(def.photoBase64, `defect_${dId}.jpg`, 'Defects');
      await gasPost('append', 'Дефекты', { ID_Дефекта: dId, ID_Смены: recId, Описание: def.text, Фото: url });
    }

    alert('✅ Смена успешно сохранена!');
    location.reload(); 
  } catch (e) {
    alert('Ошибка: ' + e.message);
    btn.disabled = false; btn.innerText = '✓ Сохранить смену';
  }
}

// Глобальные функции для кнопок
window.setCheckStatus = (id, status) => {
  shiftData[`status_${id}`] = status;
  const ok = document.getElementById(`ok_${id}`), bad = document.getElementById(`bad_${id}`);
  ok.style.background = status === 'норме' ? '#10b981' : '#fff';
  ok.style.color = status === 'норме' ? '#fff' : '#10b981';
  bad.style.background = status === 'дефект' ? '#ef4444' : '#fff';
  bad.style.color = status === 'дефект' ? '#fff' : '#ef4444';
};

window.handlePhotoUpload = (id, input) => {
  if (input.files[0]) {
    const r = new FileReader();
    r.onload = e => {
      shiftData[`photo_${id}`] = e.target.result.split(',')[1];
      document.getElementById(`prev_${id}`).innerHTML = '✅ Фото готово';
    };
    r.readAsDataURL(input.files[0]);
  }
};
