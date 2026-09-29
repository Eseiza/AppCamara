// ===== Configuración =====
var PASILLOS = 6;   // pasillos conectados
var CARROS = 5;     // capacidad de carros por pasillo
var GRUPOS = {
  'Pan de Molde': ['Lacteado Familiar', 'Lacteado Chico', 'Salvado Familiar', 'Salvado Chico', 'Integral', 'Multicereal'],
  'Bollería': ['Pancho', 'Super', 'Hamburguesa', 'Max']
};
var KEY = 'camara_fermentado_v2';

// ===== Datos =====
var rows = [];
try { rows = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { rows = []; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} }

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
// LUNES: domingo 22:00 → martes 06:00
// MARTES: martes 06:00 → miércoles 06:00
// MIERCOLES: miércoles 06:00 → jueves 06:00
// JUEVES: jueves 06:00 → viernes 06:00
// VIERNES: viernes 06:00 → sábado 06:00
// SABADO: sábado 06:00 → sábado 22:00
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
  if (dia === 'LUNES') return [at(monday, -1, 22), at(monday, 1, 6)];
  if (dia === 'SABADO') return [at(monday, off, 6), at(monday, off, 22)];
  return [at(monday, off, 6), at(monday, off + 1, 6)];
}
function classifyNow() {
  var now = Date.now(), monday = mondayOf(new Date());
  for (var i = 0; i < DIAS.length; i++) {
    var w = windowFor(DIAS[i], monday);
    if (now >= w[0] && now < w[1]) return { dia: DIAS[i], monday: monday };
  }
  // domingo antes de las 22:00, o sábado después de las 22:00: sin turno activo, mostrar Lunes de la semana en curso
  return { dia: 'LUNES', monday: monday };
}

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
    rows.push({ id: id, p: Number(id.split('-')[0]), c: Number(id.split('-')[1]), prod: t.dataset.prod, in: Date.now(), out: null });
    save(); cerrarModal(); render();
  }
  if (t.dataset.out) {
    var r = abierto(t.dataset.out);
    if (r) { r.out = Date.now(); save(); }
    cerrarModal(); render();
  }
});
document.getElementById('ov').addEventListener('click', function (e) { if (e.target.id === 'ov') cerrarModal(); });

render();
