// ===== Configuración =====
var PASILLOS = 8;
var LUGARES = ['A', 'B']; // A = arriba, B = abajo
var GRUPOS = {
  'Pan de Molde': ['Lacteado Familiar', 'Lacteado Chico', 'Salvado Familiar', 'Salvado Chico', 'Integral', 'Multicereal'],
  'Bollería': ['Pancho', 'Super', 'Hamburguesa', 'Max']
};
var KEY = 'camara_fermentado_v1';

// ===== Datos =====
var rows = [];
try { rows = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { rows = []; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} }

// ===== Utilidades =====
function color(p) {
  if (/Lacteado/.test(p)) return '#2f7fa8';
  if (/Salvado/.test(p)) return '#2f8a4b';
  if (/Integral|Multicereal/.test(p)) return '#a87b22';
  return '#b3202d';
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

// ===== Render =====
function render() {
  var h = '';
  for (var p = 1; p <= PASILLOS; p++) h += '<div class="ph">Pasillo ' + p + '</div>';
  LUGARES.forEach(function (l) {
    for (var p = 1; p <= PASILLOS; p++) {
      var id = p + l, r = abierto(id);
      if (r) {
        h += '<button class="cell" data-id="' + id + '" style="border-color:' + color(r.prod) + ';background:' + color(r.prod) + '33">' +
          '<span class="pos">' + id + '</span><span class="prod">' + r.prod + '</span>' +
          '<span class="hora">Ingresó ' + hm(r.in) + '</span>' +
          '<span class="tmr" data-in="' + r.in + '">' + dur(Date.now() - r.in) + '</span></button>';
      } else {
        h += '<button class="cell libre" data-id="' + id + '"><span class="pos">' + id + '</span>Libre</button>';
      }
    }
  });
  document.getElementById('grid').innerHTML = h;

  var b = '';
  rows.slice().reverse().forEach(function (r) {
    b += '<tr><td>' + r.p + '</td><td>' + r.l + '</td><td>' + r.prod + '</td><td>' + hm(r.in) + '</td><td>' +
      (r.out ? hm(r.out) : 'En cámara') + '</td><td' + (r.out ? '' : ' data-in="' + r.in + '"') + '>' +
      dur((r.out || Date.now()) - r.in) + '</td></tr>';
  });
  document.getElementById('log').innerHTML = b || '<tr><td colspan="6">Sin registros todavía</td></tr>';
}

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
    abrirModal('<h3>Lugar ' + id + '</h3><div class="big">' + r.prod + '</div>' +
      '<div class="sub">Ingresó ' + hm(r.in) + '<br>Lleva <b data-in="' + r.in + '">' + dur(Date.now() - r.in) + '</b></div>' +
      '<button class="out" data-out="' + id + '">Sacar de la cámara</button>' +
      '<button class="x" data-close="1">Cancelar</button>');
  } else {
    var h = '<h3>Ingresar al lugar ' + id + '</h3>';
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
    rows.push({ id: id, p: parseInt(id), l: id.slice(-1), prod: t.dataset.prod, in: Date.now(), out: null });
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
