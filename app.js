// ===== Configuración =====
var PASILLOS = 6;   // pasillos conectados
var CARROS = 5;     // capacidad de carros por pasillo
var GRUPOS = {
  'Pan de Molde': ['Lacteado Familiar', 'Lacteado Chico', 'Salvado Familiar', 'Salvado Chico', 'Integral', 'Multicereal'],
  'Bollería': ['Pancho', 'Super', 'Hamburguesa', 'Max']
};
var KEY = 'camara_fermentado_v2';

// ===== Firebase =====
// Se activa solo si /firebase-config.js tiene credenciales reales (no "TU_...").
// Si no, la app sigue funcionando 100% local (localStorage), como antes.
var FIREBASE_ACTIVO = false;
var db = null;
(function () {
  var cfg = window.firebaseConfig;
  if (cfg && cfg.apiKey && cfg.apiKey.indexOf('TU_') !== 0 && typeof firebase !== 'undefined') {
    try {
      firebase.initializeApp(cfg);
      db = firebase.firestore();
      FIREBASE_ACTIVO = true;
    } catch (e) { console.error('No se pudo inicializar Firebase:', e); }
  }
})();

// ===== Datos: movimientos de la cámara =====
var rows = [];
if (!FIREBASE_ACTIVO) {
  try { rows = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { rows = []; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} }

function agregarMovimiento(row) {
  if (FIREBASE_ACTIVO) {
    db.collection('movimientos').add(row).catch(function (e) { alert('No se pudo guardar: ' + e.message); });
  } else {
    rows.push(row); save(); render();
  }
}
function cerrarMovimiento(r) {
  r.out = Date.now();
  if (FIREBASE_ACTIVO) {
    db.collection('movimientos').doc(r.docId).update({ out: r.out }).catch(function (e) { alert('No se pudo guardar: ' + e.message); });
  } else {
    save(); render();
  }
}
function suscribirseMovimientos() {
  if (!FIREBASE_ACTIVO) return;
  db.collection('movimientos').onSnapshot(function (snap) {
    rows = snap.docs.map(function (d) { return Object.assign({ docId: d.id }, d.data()); });
    render();
  }, function (e) { console.error('Error leyendo movimientos:', e); });
}

// ===== Temperatura / humedad =====
var TKEY = 'camara_fermentado_temp_v1';
var temp = { setTemp: 28, setHum: 75, lecturas: [] };
if (!FIREBASE_ACTIVO) {
  try { var tt = JSON.parse(localStorage.getItem(TKEY) || 'null'); if (tt) temp = tt; } catch (e) {}
}
function saveTemp() { try { localStorage.setItem(TKEY, JSON.stringify(temp)); } catch (e) {} }
function guardarSetPoint() {
  if (FIREBASE_ACTIVO) db.collection('config').doc('temp').set({ setTemp: temp.setTemp, setHum: temp.setHum }, { merge: true });
  else saveTemp();
}
function agregarLectura(l) {
  if (FIREBASE_ACTIVO) {
    db.collection('lecturas').add(l);
  } else {
    temp.lecturas.push(l); saveTemp(); renderTemp();
  }
}
function suscribirseTemp() {
  if (!FIREBASE_ACTIVO) return;
  db.collection('config').doc('temp').onSnapshot(function (doc) {
    if (doc.exists) { var d = doc.data(); temp.setTemp = d.setTemp; temp.setHum = d.setHum; }
    renderTemp();
  });
  db.collection('lecturas').orderBy('t').onSnapshot(function (snap) {
    temp.lecturas = snap.docs.map(function (d) { return d.data(); });
    renderTemp();
  }, function (e) { console.error('Error leyendo lecturas:', e); });
}
var TOL_TEMP = 2, TOL_HUM = 5;
var INTERVALO_LECTURA = 30 * 60 * 1000; // 30 minutos
var recordado = false;

// ===== Roles y login =====
// Usuarios válidos por rol. Cambiá estas contraseñas cuando quieras.
var USUARIOS = {
  ADMIN: { user: 'admin', pass: 'romero123' },
  VISUALIZADOR: { user: 'visual', pass: 'romero123' },
  PRODUCCION: { user: 'produccion', pass: 'romero123' }
};
var ROL_LABEL = { ADMIN: 'Administrador', VISUALIZADOR: 'Visualizador', PRODUCCION: 'Producción' };
var RKEY = 'camara_fermentado_rol';
var rol = localStorage.getItem(RKEY) || null; // null = todavía no inició sesión
function setRol(r) { rol = r; try { localStorage.setItem(RKEY, r); } catch (e) {} applyRol(); render(); }

// ===== Utilidades =====
function color(p) {
  if (/Lacteado/.test(p)) return '#3f9bcc';
  if (/Salvado/.test(p)) return '#4caf6a';
  if (/Integral|Multicereal/.test(p)) return '#c98a2b';
  return '#c8202f';
}
function pad(n) { return String(n).padStart(2, '0'); }
function hm(t) {
  var d = new Date(t);
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function dur(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
}
function abierto(id) {
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id && !rows[i].out) return rows[i];
  return null;
}

// ===== Planilla por día (turnos no calendarios) =====
// LUNES: lunes 06:00 → martes 06:00
// MARTES: martes 06:00 → miércoles 06:00
// MIERCOLES: miércoles 06:00 → jueves 06:00
// JUEVES: jueves 06:00 → viernes 06:00
// VIERNES: viernes 06:00 → sábado 06:00
// SABADO: sábado 06:00 → lunes 06:00 (incluye el domingo)
var DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
var DIAS_LABEL = { LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado' };
var DIAS_OFFSET = { LUNES: 0, MARTES: 1, MIERCOLES: 2, JUEVES: 3, VIERNES: 4, SABADO: 5 };

function mondayOf(d) {
  var x = new Date(d);
  var day = x.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function at(monday, offsetDays, hour) {
  var x = new Date(monday);
  x.setDate(x.getDate() + offsetDays);
  x.setHours(hour, 0, 0, 0);
  return x.getTime();
}
function windowFor(dia, monday) {
  var off = DIAS_OFFSET[dia];
  if (dia === 'SABADO') return [at(monday, off, 6), at(monday, off + 2, 6)]; // sábado 06:00 → lunes 06:00
  return [at(monday, off, 6), at(monday, off + 1, 6)];
}
function classifyNow() {
  var now = Date.now(), monday = mondayOf(new Date());
  for (var i = 0; i < DIAS.length; i++) {
    var w = windowFor(DIAS[i], monday);
    if (now >= w[0] && now < w[1]) return { dia: DIAS[i], monday: monday };
  }
  // el turno SABADO puede empezar en la semana anterior y llegar hasta el lunes de esta semana
  var wSabAnt = windowFor('SABADO', mondayOf(new Date(monday.getTime() - 86400000)));
  if (now >= wSabAnt[0] && now < wSabAnt[1]) return { dia: 'SABADO', monday: mondayOf(new Date(monday.getTime() - 86400000)) };
  return { dia: 'LUNES', monday: monday };
}

var appStart = Date.now();
var estado = classifyNow();
var weekMonday = estado.monday;
var selectedDia = estado.dia;
var modo = 'turno'; // 'turno' o 'fecha'

function fechaCorta(t) { var d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
function horaCorta(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

// ===== Encabezado =====
var DIAS_SEMANA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
var MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function renderEncabezado() {
  var hoy = new Date();
  document.getElementById('fechaHoy').textContent =
    DIAS_SEMANA_LARGO[hoy.getDay()] + ' ' + hoy.getDate() + ' de ' + MESES_LARGO[hoy.getMonth()] + ' de ' + hoy.getFullYear();
  var e = classifyNow();
  document.getElementById('badgeTurno').textContent = 'Turno en curso: ' + DIAS_LABEL[e.dia];
}

// ===== Calendario "Por fecha" =====
var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
function medianoche(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
var calMonth = (function () { var d = medianoche(new Date()); d.setDate(1); return d; })();
var selectedFecha = medianoche(new Date());

function mismodia(t, d) {
  var a = new Date(t), b = d;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function tieneRegistros(d) { return rows.some(function (r) { return mismodia(r.in, d); }); }

function renderCalendario() {
  document.getElementById('mesLabel').textContent = MESES[calMonth.getMonth()] + ' ' + calMonth.getFullYear();
  var hoy = medianoche(new Date());
  var primerDow = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
  var dias = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
  var h = '';
  ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(function (d) { h += '<div class="dow">' + d + '</div>'; });
  for (var i = 0; i < primerDow; i++) h += '<div class="calday empty"></div>';
  for (var d = 1; d <= dias; d++) {
    var fecha = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
    var cls = 'calday';
    if (mismodia(fecha.getTime(), hoy)) cls += ' hoy';
    if (mismodia(fecha.getTime(), selectedFecha) && modo === 'fecha') cls += ' sel';
    h += '<div class="' + cls + '" data-d="' + d + '">' + d + (tieneRegistros(fecha) ? '<span class="dot"></span>' : '') + '</div>';
  }
  document.getElementById('calgrid').innerHTML = h;
  document.getElementById('rangoFecha').textContent =
    'Mostrando: ' + DIAS_SEMANA_LARGO[selectedFecha.getDay()] + ' ' + selectedFecha.getDate() + ' de ' + MESES_LARGO[selectedFecha.getMonth()];
}

function renderTabs() {
  document.getElementById('weekLabel').textContent = 'Semana del ' + fechaCorta(weekMonday.getTime());
  var h = '';
  DIAS.forEach(function (dia) {
    h += '<button class="diaTab' + (dia === selectedDia ? ' on' : '') + '" data-dia="' + dia + '">' + DIAS_LABEL[dia] + '</button>';
  });
  document.getElementById('diaTabs').innerHTML = h;
  var w = windowFor(selectedDia, weekMonday);
  document.getElementById('rango').textContent =
    'Turno: ' + fechaCorta(w[0]) + ' ' + horaCorta(w[0]) + ' → ' + fechaCorta(w[1]) + ' ' + horaCorta(w[1]);
}

function nombre(id) { var a = id.split('-'); return 'Pasillo ' + a[0] + ' · Carro ' + a[1]; }

// ===== Render temperatura/humedad =====
function proximaLectura() {
  var ultima = temp.lecturas.length ? temp.lecturas[temp.lecturas.length - 1].t : appStart;
  return ultima + INTERVALO_LECTURA;
}
function renderTemp() {
  document.getElementById('setTemp').value = temp.setTemp;
  document.getElementById('setHum').value = temp.setHum;
  var u = temp.lecturas[temp.lecturas.length - 1];
  document.getElementById('ultimaLectura').innerHTML = u
    ? 'Última lectura: <b>' + horaCorta(u.t) + ' · ' + fechaCorta(u.t) + '</b> — Temp <b>' + u.tempReal + '°C</b> (set ' + u.setTemp + '°C) · Hum <b>' + u.humReal + '%</b> (set ' + u.setHum + '%)'
    : 'Todavía no hay lecturas registradas.';
  var b = '';
  temp.lecturas.slice().reverse().forEach(function (l) {
    var tCls = Math.abs(l.tempReal - l.setTemp) > TOL_TEMP ? 'alerta' : 'ok';
    var hCls = Math.abs(l.humReal - l.setHum) > TOL_HUM ? 'alerta' : 'ok';
    b += '<tr><td>' + hm(l.t) + '</td><td class="' + tCls + '">' + l.tempReal + '°C</td><td>' + l.setTemp + '°C</td>' +
      '<td class="' + hCls + '">' + l.humReal + '%</td><td>' + l.setHum + '%</td><td>' + (l.obs || '') + '</td></tr>';
  });
  document.getElementById('logTemp').innerHTML = b || '<tr><td colspan="6">Sin lecturas todavía</td></tr>';
}

function abrirLectura() {
  document.getElementById('recordatorio').style.display = 'none';
  abrirModal(
    '<h3>Registrar lectura</h3>' +
    '<label>Set temperatura (°C)</label><input id="mSetTemp" type="number" step="0.1" value="' + temp.setTemp + '">' +
    '<label>Temperatura real (°C)</label><input id="mTempReal" type="number" step="0.1" placeholder="Ej: 28.5">' +
    '<label>Set humedad (%)</label><input id="mSetHum" type="number" step="1" value="' + temp.setHum + '">' +
    '<label>Humedad real (%)</label><input id="mHumReal" type="number" step="1" placeholder="Ej: 74">' +
    '<label>Observaciones</label><textarea id="mObs" rows="2" placeholder="Opcional"></textarea>' +
    '<button class="out" id="guardarLectura">Guardar lectura</button>' +
    '<button class="x" data-close="1">Cancelar</button>'
  );
  document.getElementById('guardarLectura').addEventListener('click', function () {
    var tR = parseFloat(document.getElementById('mTempReal').value);
    var hR = parseFloat(document.getElementById('mHumReal').value);
    if (isNaN(tR) || isNaN(hR)) { document.getElementById('mTempReal').focus(); return; }
    temp.setTemp = parseFloat(document.getElementById('mSetTemp').value) || temp.setTemp;
    temp.setHum = parseFloat(document.getElementById('mSetHum').value) || temp.setHum;
    guardarSetPoint();
    agregarLectura({
      t: Date.now(), setTemp: temp.setTemp, setHum: temp.setHum,
      tempReal: tR, humReal: hR, obs: document.getElementById('mObs').value.trim()
    });
    recordado = false; cerrarModal();
  });
}

function chequearRecordatorio() {
  if (rol !== 'ADMIN') return;
  if (Date.now() >= proximaLectura() && !recordado) {
    recordado = true;
    if (!document.getElementById('ov').classList.contains('on')) abrirLectura();
    else document.getElementById('recordatorio').style.display = 'block';
  }
}

// ===== Permisos por rol =====
function applyRol() {
  document.getElementById('rolActualLabel').innerHTML = 'Perfil<b>' + (ROL_LABEL[rol] || '') + '</b>';
  var produccion = rol === 'PRODUCCION';
  var visualizador = rol === 'VISUALIZADOR';

  // Cámara: solo lectura para VISUALIZADOR
  document.getElementById('grid').classList.toggle('solo-lectura', visualizador);

  // Módulo de temperatura/humedad: oculto para PRODUCCION
  document.getElementById('tempSection').style.display = produccion ? 'none' : '';
  document.getElementById('setTemp').readOnly = visualizador;
  document.getElementById('setHum').readOnly = visualizador;
  document.getElementById('btnLectura').style.display = visualizador ? 'none' : '';

  // Planilla: PRODUCCION solo ve el turno del día corriente, sin navegación
  document.getElementById('calToggle').style.display = produccion ? 'none' : '';
  document.getElementById('semanaNav').style.display = produccion ? 'none' : '';
  document.getElementById('diaTabs').style.display = produccion ? 'none' : '';
  if (produccion) {
    modo = 'turno';
    var e = classifyNow();
    weekMonday = e.monday; selectedDia = e.dia;
    document.getElementById('vistaTurno').style.display = '';
    document.getElementById('vistaFecha').style.display = 'none';
  }
}

// ===== Render =====
function render() {
  var h = '';
  for (var p = 1; p <= PASILLOS; p++) {
    h += '<div class="pasillo"><div class="ph">Pasillo ' + p + '</div>';
    for (var c = 1; c <= CARROS; c++) {
      var id = p + '-' + c, r = abierto(id);
      if (r) {
        h += '<button class="cell" data-id="' + id + '" style="border-color:' + color(r.prod) + ';background:' + color(r.prod) + '33">' +
          '<span class="pos">Carro ' + c + '</span><span class="prod">' + r.prod + '</span>' +
          '<span class="hora">Ingresó ' + hm(r.in) + '</span>' +
          '<span class="tmr" data-in="' + r.in + '">' + dur(Date.now() - r.in) + '</span></button>';
      } else {
        h += '<button class="cell libre" data-id="' + id + '"><span class="pos">Carro ' + c + '</span>Libre</button>';
      }
    }
    h += '</div>';
  }
  document.getElementById('grid').innerHTML = h;
  renderTabla();
}

function renderTabla() {
  renderEncabezado();
  var w;
  if (modo === 'turno') {
    renderTabs();
    w = windowFor(selectedDia, weekMonday);
  } else {
    renderCalendario();
    w = [selectedFecha.getTime(), selectedFecha.getTime() + 86400000];
  }
  var filtradas = rows.filter(function (r) { return r.in >= w[0] && r.in < w[1]; });
  filtradas.sort(function (a, b) { return a.in - b.in; });
  var b = '';
  filtradas.forEach(function (r) {
    b += '<tr><td>' + r.p + '</td><td>' + r.c + '</td><td>' + r.prod + '</td><td>' + hm(r.in) + '</td><td>' +
      (r.out ? hm(r.out) : 'En cámara') + '</td><td' + (r.out ? '' : ' data-in="' + r.in + '"') + '>' +
      dur((r.out || Date.now()) - r.in) + '</td></tr>';
  });
  document.getElementById('log').innerHTML = b || '<tr><td colspan="6">Sin registros</td></tr>';
}

document.getElementById('modoTurno').addEventListener('click', function () {
  modo = 'turno';
  document.getElementById('modoTurno').classList.add('on');
  document.getElementById('modoFecha').classList.remove('on');
  document.getElementById('vistaTurno').style.display = '';
  document.getElementById('vistaFecha').style.display = 'none';
  renderTabla();
});
document.getElementById('modoFecha').addEventListener('click', function () {
  modo = 'fecha';
  document.getElementById('modoFecha').classList.add('on');
  document.getElementById('modoTurno').classList.remove('on');
  document.getElementById('vistaFecha').style.display = '';
  document.getElementById('vistaTurno').style.display = 'none';
  renderTabla();
});

document.getElementById('diaTabs').addEventListener('click', function (e) {
  var t = e.target.closest('.diaTab'); if (!t) return;
  selectedDia = t.dataset.dia; renderTabla();
});
document.getElementById('prevWeek').addEventListener('click', function () {
  weekMonday = new Date(weekMonday); weekMonday.setDate(weekMonday.getDate() - 7); renderTabla();
});
document.getElementById('nextWeek').addEventListener('click', function () {
  weekMonday = new Date(weekMonday); weekMonday.setDate(weekMonday.getDate() + 7); renderTabla();
});
document.getElementById('hoy').addEventListener('click', function () {
  var e = classifyNow(); weekMonday = e.monday; selectedDia = e.dia; renderTabla();
});

document.getElementById('calgrid').addEventListener('click', function (e) {
  var t = e.target.closest('.calday'); if (!t || t.classList.contains('empty')) return;
  selectedFecha = new Date(calMonth.getFullYear(), calMonth.getMonth(), Number(t.dataset.d));
  renderTabla();
});
document.getElementById('prevMes').addEventListener('click', function () {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderTabla();
});
document.getElementById('nextMes').addEventListener('click', function () {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderTabla();
});

// Contador en vivo
setInterval(function () {
  document.querySelectorAll('[data-in]').forEach(function (e) {
    e.textContent = dur(Date.now() - Number(e.dataset.in));
  });
}, 1000);

// ===== Modal =====
function abrirModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('ov').classList.add('on');
}
function cerrarModal() { document.getElementById('ov').classList.remove('on'); }

document.getElementById('grid').addEventListener('click', function (e) {
  if (e.currentTarget.classList.contains('solo-lectura')) return;
  var c = e.target.closest('.cell'); if (!c) return;
  var id = c.dataset.id, r = abierto(id);
  if (r) {
    abrirModal('<h3>' + nombre(id) + '</h3><div class="big">' + r.prod + '</div>' +
      '<div class="sub">Ingresó ' + hm(r.in) + '<br>Lleva <b data-in="' + r.in + '">' + dur(Date.now() - r.in) + '</b></div>' +
      '<button class="out" data-out="' + id + '">Sacar de la cámara</button>' +
      '<button class="x" data-close="1">Cancelar</button>');
  } else {
    var h = '<h3>Ingresar: ' + nombre(id) + '</h3>';
    for (var g in GRUPOS) {
      h += '<div class="g">' + g + '</div><div class="btns">';
      GRUPOS[g].forEach(function (p) {
        h += '<button class="p" data-add="' + id + '" data-prod="' + p + '" style="background:' + color(p) + '">' + p + '</button>';
      });
      h += '</div>';
    }
    h += '<button class="x" data-close="1">Cancelar</button>';
    abrirModal(h);
  }
});

document.getElementById('modal').addEventListener('click', function (e) {
  var t = e.target;
  if (t.dataset.close) { cerrarModal(); return; }
  if (t.dataset.add) {
    var id = t.dataset.add;
    var nuevo = { id: id, p: Number(id.split('-')[0]), c: Number(id.split('-')[1]), prod: t.dataset.prod, in: Date.now(), out: null };
    cerrarModal(); agregarMovimiento(nuevo);
  }
  if (t.dataset.out) {
    var r = abierto(t.dataset.out);
    cerrarModal();
    if (r) cerrarMovimiento(r);
  }
});
document.getElementById('ov').addEventListener('click', function (e) { if (e.target.id === 'ov') cerrarModal(); });

// ===== Temperatura: listeners =====
document.getElementById('btnLectura').addEventListener('click', abrirLectura);
document.getElementById('recordatorio').addEventListener('click', abrirLectura);
document.getElementById('setTemp').addEventListener('change', function (e) {
  if (rol === 'VISUALIZADOR') return;
  temp.setTemp = parseFloat(e.target.value) || temp.setTemp; guardarSetPoint(); renderTemp();
});
document.getElementById('setHum').addEventListener('change', function (e) {
  if (rol === 'VISUALIZADOR') return;
  temp.setHum = parseFloat(e.target.value) || temp.setHum; guardarSetPoint(); renderTemp();
});
setInterval(chequearRecordatorio, 30000);

// ===== Login / logout =====
function mostrarLogin() {
  document.getElementById('loginOv').style.display = 'flex';
  document.getElementById('page').style.display = 'none';
}
function ocultarLogin() {
  document.getElementById('loginOv').style.display = 'none';
  document.getElementById('page').style.display = '';
}
document.getElementById('loginBtn').addEventListener('click', function () {
  var rSel = document.getElementById('loginRol').value;
  var u = document.getElementById('loginUser').value.trim();
  var p = document.getElementById('loginPass').value;
  var cred = USUARIOS[rSel];
  var err = document.getElementById('loginError');
  if (cred && u === cred.user && p === cred.pass) {
    err.style.display = 'none';
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    setRol(rSel);
    ocultarLogin();
    iniciarApp();
  } else {
    err.textContent = 'Usuario o contraseña incorrectos';
    err.style.display = 'block';
  }
});
document.getElementById('loginPass').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('logoutBtn').addEventListener('click', function () {
  try { localStorage.removeItem(RKEY); } catch (e) {}
  location.reload();
});

// ===== Arranque =====
var conEl = document.getElementById('conexion');
function iniciarApp() {
  applyRol();
  render();
  renderTemp();

  if (FIREBASE_ACTIVO) {
    conEl.textContent = 'Conectando…';
    firebase.auth().onAuthStateChanged(function (user) {
      if (user) {
        conEl.textContent = '● Conectado a Firebase — sincronizado en tiempo real';
        conEl.classList.add('on');
        suscribirseMovimientos();
        suscribirseTemp();
      }
    });
    firebase.auth().signInAnonymously().catch(function (e) {
      console.error('Error de autenticación:', e);
      conEl.textContent = 'No se pudo conectar a Firebase — revisá firebase-config.js y las reglas';
    });
  } else {
    conEl.textContent = '○ Modo local (sin sincronizar entre dispositivos)';
  }
}

if (rol && USUARIOS[rol]) {
  ocultarLogin();
  iniciarApp();
} else {
  mostrarLogin();
}
