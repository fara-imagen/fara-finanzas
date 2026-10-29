/* FÁRA Finanzas · app offline. Los datos viven en este teléfono (localStorage) y se respaldan en Google Sheets. */
'use strict';

const CLAVE_LS = 'fara-finanzas-v1';
const VERSION = '1.8.0';

/* ================= utilidades ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyISO = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mesDe = (iso) => (iso || '').slice(0, 7);
const mesActual = () => hoyISO().slice(0, 7);
const sumarMes = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nombreMes = (ym) => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' }); return t[0].toUpperCase() + t.slice(1) + ' ' + y; };
const fechaCorta = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''); };
const fechaLarga = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }); };

const fmtARS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtUSD = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const plata = (n, moneda = 'ARS') => (moneda === 'USD' ? 'US$ ' + fmtUSD.format(n || 0) : '$ ' + fmtARS.format(Math.round(n || 0)));

/* Acepta "1.234.567", "1234,50", "1234.5", "$ 12.000" */
function leerMonto(txt) {
  let s = String(txt ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  else if (/\.\d{3}$/.test(s)) s = s.replace('.', '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const montoInput = (n) => (n ? fmtUSD.format(n) : '');

/* ================= datos ================= */
function datosIniciales() {
  return {
    v: 1,
    ajustes: {
      mep: null, mepFecha: '', mepManual: 0,
      comprasActivo: true, monoActivo: false, monoTope: 0,
      metaSueldo: 0, ticket: 0, vidaUtil: 4,
      sheetUrl: '', sheetClave: '', ultimoRespaldo: '', pendiente: false,
      medioGasto: 'Transferencia', medioCobro: 'Transferencia'
    },
    listas: {
      gasto: ['Equipo', 'Insumos de producción', 'Software y suscripciones', 'Web y dominio', 'Marketing', 'Traslados', 'Formación', 'Impuestos y comisiones', 'Mantenimiento', 'Otros'],
      servicio: ['Fotografía de producto', 'Retoque y edición', 'Diseño', 'Otros'],
      medio: ['Efectivo', 'Transferencia', 'Mercado Pago', 'Tarjeta de débito', 'Tarjeta de crédito'],
      equipo: ['Cámara', 'Lente', 'Luz / Flash', 'Almacenamiento', 'Accesorio', 'Filtro', 'Mochila / Bolso', 'Electrónica', 'Escritorio / Oficina']
    },
    clientes: [],
    trabajos: [],
    gastos: [],
    fijos: [],
    compras: [],
    equipo: []
  };
}

let D;
try { D = JSON.parse(localStorage.getItem(CLAVE_LS)); } catch (e) { D = null; }
if (!D || D.v !== 1) D = datosIniciales();

function guardar({ respaldo = true } = {}) {
  if (respaldo) D.ajustes.pendiente = true;
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(D)); }
  catch (e) { toast('No pude guardar: el teléfono no tiene espacio'); }
  pintarEstado();
  if (respaldo) programarRespaldo();
}

const A = () => D.ajustes;
const mep = () => A().mepManual || A().mep || 1530;
const aARS = (monto, moneda, cot) => (moneda === 'USD' ? monto * (cot || mep()) : monto);
const aUSD = (ars) => ars / mep();

/* ================= cálculos ================= */
function totalesTrabajo(t) {
  const cobrado = t.cobros.filter(c => c.pagado).reduce((s, c) => s + c.monto, 0);
  const saldo = Math.max(0, t.total - cobrado);
  const hoy = hoyISO();
  const atrasado = t.cobros.some(c => !c.pagado && c.vence && c.vence < hoy);
  return { cobrado, saldo, atrasado };
}
const clienteNombre = (cod) => (D.clientes.find(c => c.codigo === cod) || {}).nombre || '';

function cobrosDelMes(ym) {
  const out = [];
  for (const t of D.trabajos) for (const c of t.cobros)
    if (c.pagado && mesDe(c.fechaPago) === ym) out.push({ t, c, ars: aARS(c.monto, t.moneda, c.mep || t.mep) });
  return out;
}
function gastosPagadosDelMes(ym) {
  return D.gastos.filter(g => g.pagado && !g.retiro && mesDe(g.fechaPago || g.fecha) === ym)
    .map(g => ({ g, ars: aARS(g.monto, g.moneda, g.mep) }));
}
function pendientesCobro() {
  const hoy = hoyISO(), out = [];
  for (const t of D.trabajos) for (const c of t.cobros) if (!c.pagado) out.push({ t, c, ars: aARS(c.monto, t.moneda), atrasado: !!(c.vence && c.vence < hoy) });
  return out.sort((a, b) => (a.c.vence || '9').localeCompare(b.c.vence || '9'));
}
function pendientesPago() {
  const hoy = hoyISO();
  return D.gastos.filter(g => !g.pagado).map(g => ({ g, ars: aARS(g.monto, g.moneda), atrasado: !!(g.vence && g.vence < hoy) }))
    .sort((a, b) => (a.g.vence || '9').localeCompare(b.g.vence || '9'));
}
function agrupar(items, clave) {
  const m = new Map();
  for (const it of items) { const k = clave(it); m.set(k, (m.get(k) || 0) + it.ars); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const fijosMensualesARS = () => D.fijos.filter(f => f.activo).reduce((s, f) => s + aARS(f.monto, f.moneda), 0);
function ticketPromedio() {
  const ts = D.trabajos.filter(t => t.total > 0);
  if (ts.length >= 3) return ts.reduce((s, t) => s + aARS(t.total, t.moneda, t.mep), 0) / ts.length;
  return A().ticket || 0;
}
function valorHoyUSD(e) {
  if (!e.fechaCompra) return e.usd;
  const años = (Date.now() - new Date(e.fechaCompra).getTime()) / (365.25 * 864e5);
  const vida = A().vidaUtil || 4;
  return Math.max(e.usd * 0.1, e.usd * (1 - años / vida)); // nunca baja del 10 %: siempre se puede revender
}
function mesesEntre(desdeISO, hastaISO) {
  const a = new Date(desdeISO), b = new Date(hastaISO);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
function planCompra(c) {
  const objetivo = new Date(c.creado); objetivo.setMonth(objetivo.getMonth() + (c.meses || 1));
  const restantes = Math.max(1, mesesEntre(hoyISO(), hoyISO(objetivo)));
  const falta = Math.max(0, (c.precio || 0) - (c.ahorrado || 0));
  return { objetivo: hoyISO(objetivo), restantes, falta, porMes: falta / restantes };
}

/* Gastos fijos: se cargan solos como "por pagar" el mes en curso */
function generarFijos() {
  if (typeof pGenerarFijos === 'function') pGenerarFijos();
  const ym = mesActual(); let cambio = false;
  for (const f of D.fijos) {
    if (!f.activo || (f.desde && f.desde > ym)) continue;
    if (D.gastos.some(g => g.fijoId === f.id && mesDe(g.fecha) === ym)) continue;
    const dia = String(Math.min(28, Math.max(1, f.dia || 1))).padStart(2, '0');
    D.gastos.push({
      id: uid(), fijoId: f.id, fecha: `${ym}-${dia}`, vence: `${ym}-${dia}`, descripcion: f.descripcion, categoria: f.categoria,
      monto: f.monto, moneda: f.moneda, medio: f.medio, pagado: false, fechaPago: '', mep: 0, nota: 'Gasto fijo'
    });
    cambio = true;
  }
  if (cambio) guardar();
}

/* ================= tema claro / oscuro ================= */
const TEMA_LS = 'fara-finanzas-tema';
const temaGuardado = () => { try { return localStorage.getItem(TEMA_LS) || 'auto'; } catch (e) { return 'auto'; } };
const mqOscuro = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const esOscuro = () => { const t = temaGuardado(); return t === 'oscuro' || (t === 'auto' && !!(mqOscuro && mqOscuro.matches)); };
function aplicarTema() {
  const osc = esOscuro();
  document.documentElement.classList.toggle('oscuro', osc);
  const personal = document.body && document.body.dataset.modo === 'personal';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = osc ? (personal ? '#0D1718' : '#1A1410') : (personal ? '#E7EBE5' : '#F2EBDD');
}
function elegirTema(t) { try { localStorage.setItem(TEMA_LS, t); } catch (e) { } aplicarTema(); pintar(); }
if (mqOscuro && mqOscuro.addEventListener) mqOscuro.addEventListener('change', () => { if (temaGuardado() === 'auto') { aplicarTema(); pintar(); } });
const ICO_SOL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICO_LUNA = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>';
function bloqueTema() {
  const t = temaGuardado();
  return `<section class="bloque"><h2 class="subtitulo">Apariencia</h2>
    <div class="segmento segmento--3" style="margin-top:12px">
      <button class="${t === 'auto' ? 'is-on' : ''}" data-a="tema" data-v="auto">Automático</button>
      <button class="${t === 'claro' ? 'is-on' : ''}" data-a="tema" data-v="claro">Claro</button>
      <button class="${t === 'oscuro' ? 'is-on' : ''}" data-a="tema" data-v="oscuro">Oscuro</button></div>
    <p class="micro" style="margin-top:6px">Automático sigue la configuración del teléfono. También podés cambiarlo con el botón de arriba.</p></section>`;
}

/* ================= estado de la vista ================= */
const UI = { modo: (() => { try { return localStorage.getItem('fara-finanzas-modo') === 'personal' ? 'personal' : 'fara'; } catch (e) { return 'fara'; } })(), tab: 'mes', mes: mesActual(), filtroT: 'todos', filtroG: 'mes', per: '6', anio: new Date().getFullYear(), sel: null };

/* ================= gráficos ================= */
const fmtCorto = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e3) return Math.round(n / 1e3) + ' k';
  return String(Math.round(n));
};
const mesCorto = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''); };
function mesesPeriodo() {
  if (UI.per === 'Y') return Array.from({ length: 12 }, (_, i) => `${UI.anio}-${String(i + 1).padStart(2, '0')}`);
  const n = +UI.per; return Array.from({ length: n }, (_, i) => sumarMes(UI.mes, i - n + 1));
}
function datosPeriodo() {
  return mesesPeriodo().map(m => {
    const ts = D.trabajos.filter(t => mesDe(t.fecha) === m);
    const vendido = ts.reduce((s, t) => s + aARS(t.total, t.moneda, t.mep), 0);
    return {
      m, entro: cobrosDelMes(m).reduce((s, x) => s + x.ars, 0), salio: gastosPagadosDelMes(m).reduce((s, x) => s + x.ars, 0),
      trabajos: ts.length, promedio: ts.length ? vendido / ts.length : 0
    };
  });
}
// escala con números redondos: 0, 1, 2, 5, 10, 20, 50…
function escala(max, pasos = 3) {
  if (max <= 0) return { tope: pasos, marcas: Array.from({ length: pasos + 1 }, (_, i) => i) };
  const bruto = max / pasos, p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= bruto);
  const tope = paso * Math.ceil(max / paso);
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}
const barraRedonda = (x, y, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `<path d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z"/>`;
};
function graficos() {
  const d = datosPeriodo(), n = d.length, hoyM = mesActual();
  const pasados = d.filter(x => x.m <= hoyM).length;
  const sel = UI.sel != null && UI.sel < pasados ? UI.sel : Math.max(0, pasados - 1);
  const W = 340, H = 150, izq = 34, arriba = 8, abajo = 20, alto = H - arriba - abajo, ancho = W - izq;
  const gw = ancho / n, cx = (i) => izq + gw * i + gw / 2, base = arriba + alto;
  const etiquetaMes = (x, i) => `<text x="${cx(i)}" y="${H - 4}" class="g-eje ${i === sel ? 'is-sel' : ''}" ${x.m > hoyM ? 'opacity=".45"' : ''} text-anchor="middle">${n === 12 ? mesCorto(x.m).slice(0, 1).toUpperCase() : mesCorto(x.m)}</text>`;

  // 1 · entró y salió
  const e1 = escala(Math.max(...d.map(x => Math.max(x.entro, x.salio))));
  const y1 = (v) => base - (v / e1.tope) * alto;
  const bw = Math.min(14, (gw - 6) / 2);
  const barras = `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Entró y salió por mes">
    ${e1.marcas.map(v => `<line x1="${izq}" x2="${W}" y1="${y1(v)}" y2="${y1(v)}" class="g-grilla"/><text x="${izq - 6}" y="${y1(v) + 3}" class="g-eje" text-anchor="end">${fmtCorto(v)}</text>`).join('')}
    ${d.map((x, i) => `${i === sel ? `<rect x="${izq + gw * i + 1}" y="${arriba}" width="${gw - 2}" height="${alto}" rx="6" class="g-sel"/>` : ''}
      <g class="g-entro">${barraRedonda(cx(i) - bw - 1, y1(x.entro), bw, base - y1(x.entro))}</g>
      <g class="g-salio">${barraRedonda(cx(i) + 1, y1(x.salio), bw, base - y1(x.salio))}</g>
      ${etiquetaMes(x, i)}
      ${x.m <= hoyM ? `<rect x="${izq + gw * i}" y="0" width="${gw}" height="${H}" fill="transparent" data-a="grafSel" data-i="${i}" style="cursor:pointer"/>` : ''}`).join('')}
  </svg>`;

  // 2 · trabajos cerrados (líneas)
  const e2 = escala(Math.max(...d.map(x => x.trabajos)), 3);
  const y2 = (v) => base - (v / e2.tope) * alto;
  const pts = d.slice(0, Math.max(1, pasados)).map((x, i) => [cx(i), y2(x.trabajos)]);
  const lineas = `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Trabajos cerrados por mes">
    ${e2.marcas.map(v => `<line x1="${izq}" x2="${W}" y1="${y2(v)}" y2="${y2(v)}" class="g-grilla"/><text x="${izq - 6}" y="${y2(v) + 3}" class="g-eje" text-anchor="end">${v}</text>`).join('')}
    ${pts[sel] ? `<line x1="${pts[sel][0]}" x2="${pts[sel][0]}" y1="${arriba}" y2="${base}" class="g-cruz"/>` : ''}
    <polyline points="${pts.map(p => p.join(',')).join(' ')}" class="g-linea"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === sel ? 5.5 : 4}" class="g-punto"/>`).join('')}
    ${pts[sel] ? `<text x="${pts[sel][0]}" y="${pts[sel][1] - 10}" text-anchor="middle" class="g-valor">${d[sel].trabajos}</text>` : ''}
    ${d.map((x, i) => etiquetaMes(x, i) + (x.m <= hoyM ? `<rect x="${izq + gw * i}" y="0" width="${gw}" height="${H}" fill="transparent" data-a="grafSel" data-i="${i}" style="cursor:pointer"/>` : '')).join('')}
  </svg>`;

  const s = d[sel];
  const tot = d.reduce((a, x) => ({ e: a.e + x.entro, s: a.s + x.salio, t: a.t + x.trabajos }), { e: 0, s: 0, t: 0 });
  return `<section class="bloque">
    <p class="etiqueta">Evolución</p>
    <div class="fila" style="margin:14px 0 6px"><h3 class="subtitulo" style="font-size:16px">Entró y salió</h3>
      <span class="leyenda"><i class="l-entro"></i>Entró <i class="l-salio"></i>Salió</span></div>
    ${barras}
    <p class="lectura"><strong>${nombreMes(s.m)}</strong><br>Entró <strong class="num">${plata(s.entro)}</strong> · salió <strong class="num">${plata(s.salio)}</strong> · ganancia <strong class="num ${s.entro - s.salio < 0 ? 'mal' : ''}">${plata(s.entro - s.salio)}</strong></p>

    <hr class="sep">
    <h3 class="subtitulo" style="font-size:16px;margin:4px 0 6px">Trabajos cerrados</h3>
    ${lineas}
    <p class="lectura"><strong>${nombreMes(s.m)}</strong><br>${s.trabajos} trabajo${s.trabajos === 1 ? '' : 's'}${s.trabajos ? ` · precio promedio <strong class="num">${plata(s.promedio)}</strong>` : ''}</p>
    <p class="micro" style="margin-top:8px">En el período: entró ${plata(tot.e)}, salió ${plata(tot.s)} y cerraste ${tot.t} trabajo${tot.t === 1 ? '' : 's'}. Tocá un mes para ver el detalle.</p>
  </section>`;
}

/* ================= íconos ================= */
const ICO = {
  izq: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  der: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  gasto: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/></svg>',
  trabajo: '<svg viewBox="0 0 24 24"><path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16"/></svg>',
  equipo: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  compra: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6zM9 8a3 3 0 016 0"/></svg>',
  fijo: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M20 4v5h-5M4 20v-5h5"/></svg>',
  mes: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  analisis: '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 8-8M15 7h5v5"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  movs: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  ahorro: '<svg viewBox="0 0 24 24"><path d="M12 3v3M7 9h10a3 3 0 013 3v5a3 3 0 01-3 3H7a3 3 0 01-3-3v-5a3 3 0 013-3zM12 12v5M9.5 14.5h5"/></svg>',
  ingreso: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  reservas: '<svg viewBox="0 0 24 24"><path d="M4 8l8-4 8 4v2H4zM6 10v7M10 10v7M14 10v7M18 10v7M3 20h18"/></svg>',
  cuotas: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 14h3"/></svg>'
};

/* ================= vista: MES ================= */
function vistaMes() {
  const ym = UI.mes;
  const ing = cobrosDelMes(ym), gas = gastosPagadosDelMes(ym);
  const entro = ing.reduce((s, x) => s + x.ars, 0), salio = gas.reduce((s, x) => s + x.ars, 0);
  const ganancia = entro - salio;
  const pc = pendientesCobro(), pp = pendientesPago();
  const debenARS = pc.reduce((s, x) => s + x.ars, 0), debesARS = pp.reduce((s, x) => s + x.ars, 0);
  const atrC = pc.filter(x => x.atrasado).length, atrP = pp.filter(x => x.atrasado).length;

  const necesario = fijosMensualesARS() + (A().metaSueldo || 0);
  const pct = necesario ? Math.min(100, (entro / necesario) * 100) : 0;
  const tk = ticketPromedio();
  const faltan = necesario > entro && tk ? Math.ceil((necesario - entro) / tk) : 0;

  let mono = '';
  if (A().monoActivo) {
    const desde = hoyISO(new Date(Date.now() - 365 * 864e5));
    const fact = D.trabajos.filter(t => t.facturado && t.fecha >= desde).reduce((s, t) => s + aARS(t.total, t.moneda, t.mep), 0);
    const tope = A().monoTope || 0;
    const p = tope ? Math.min(100, fact / tope * 100) : 0;
    mono = `<section class="bloque">
      <p class="etiqueta">Monotributo · últimos 12 meses</p>
      <div class="fila" style="margin:10px 0 8px"><span class="subtitulo num">${plata(fact)}</span><span class="micro num">de ${tope ? plata(tope) : 'tope sin cargar'}</span></div>
      <div class="barra"><i style="width:${p}%;${p >= 80 ? 'background:var(--error)' : ''}"></i></div>
      <p class="micro" style="margin-top:8px">${!tope ? 'Cargá el tope de tu categoría en Ajustes.' : p >= 80 ? `Estás al ${Math.round(p)} % del tope. Conviene revisar tu categoría con ARCA.` : `Usaste el ${Math.round(p)} % del tope. Solo suma lo facturado.`}</p>
    </section>`;
  }

  const compras = `<button class="item" data-a="ir" data-v="reservas">
      <span class="codigo codigo--gasto">${ICO.reservas}</span>
      <span class="item__cuerpo"><span class="item__titulo">Reservas</span><span class="micro">Renuncia, equipo y próximas compras</span></span>
      <span class="item__monto num">${plata(totalReservado())}</span></button>`;

  return `
  <div class="mesbar">
    <button class="flecha" data-a="mes" data-v="-1" aria-label="Mes anterior">${ICO.izq}</button>
    <h1 class="titulo">${nombreMes(ym)}</h1>
    <button class="flecha" data-a="mes" data-v="1" aria-label="Mes siguiente">${ICO.der}</button>
  </div>

  <section class="bloque bloque--oscuro">
    <p class="etiqueta">Ganancia real del mes</p>
    <p class="grande num" style="margin:10px 0 2px">${plata(ganancia)}</p>
    <p class="micro num">US$ ${fmtUSD.format(Math.round(aUSD(ganancia)))} al dólar MEP de hoy</p>
    <hr class="sep" style="background:rgba(242,235,221,.14)">
    <div class="grilla2">
      <div class="pila"><span class="micro">Entró</span><span class="subtitulo num">${plata(entro)}</span></div>
      <div class="pila"><span class="micro">Salió</span><span class="subtitulo num">${plata(salio)}</span></div>
    </div>
  </section>

  <div class="grilla2">
    <button class="bloque item" style="margin:0;flex-direction:column;align-items:flex-start" data-a="ir" data-v="trabajos" data-f="pend">
      <span class="micro">Te deben</span><span class="subtitulo num">${plata(debenARS)}</span>
      ${atrC ? `<span class="estado estado--mal">${atrC} atrasado${atrC > 1 ? 's' : ''}</span>` : `<span class="micro">${pc.length} cobro${pc.length === 1 ? '' : 's'}</span>`}
    </button>
    <button class="bloque item" style="margin:0;flex-direction:column;align-items:flex-start" data-a="ir" data-v="gastos" data-f="pend">
      <span class="micro">Debés</span><span class="subtitulo num">${plata(debesARS)}</span>
      ${atrP ? `<span class="estado estado--mal">${atrP} vencido${atrP > 1 ? 's' : ''}</span>` : `<span class="micro">${pp.length} pago${pp.length === 1 ? '' : 's'}</span>`}
    </button>
  </div>

  <section class="bloque">
    <p class="etiqueta">Punto de equilibrio</p>
    ${necesario ? `
      <p class="chico" style="margin:10px 0">Necesitás <strong class="num">${plata(necesario)}</strong> por mes para cubrir tus gastos fijos${A().metaSueldo ? ' y tu sueldo' : ''}.</p>
      <div class="barra"><i style="width:${pct}%"></i></div>
      <p class="chico" style="margin-top:10px">${pct >= 100 ? '<span class="marcador">Cubriste todo</span> lo de este mes. Lo que entre ahora es ganancia.' :
        `Llevás el <strong>${Math.round(pct)} %</strong>.${faltan ? ` Te faltan <span class="marcador">${faltan} trabajo${faltan > 1 ? 's' : ''}</span> de ${plata(tk)}.` : ''}`}</p>`
      : '<p class="micro" style="margin-top:8px">Cargá tus gastos fijos en Ajustes para ver cuánto necesitás vender por mes.</p>'}
  </section>

  ${(() => {
    const vence = pp.filter(x => x.atrasado || mesDe(x.g.vence) === ym).slice(0, 6);
    if (!vence.length) return '';
    return `<section class="bloque"><p class="etiqueta">Vencimientos</p><div class="lista">${vence.map(x => `
      <button class="item" data-a="editarGasto" data-id="${x.g.id}" style="box-shadow:none;background:var(--superficie)">
        <span class="item__cuerpo"><span class="item__titulo">${h(x.g.descripcion || x.g.categoria)}</span>
        <span class="micro ${x.atrasado ? 'mal' : ''}">${x.atrasado ? 'Venció el ' : 'Vence el '}${fechaCorta(x.g.vence)}</span></span>
        <span class="item__monto num">${plata(x.g.monto, x.g.moneda)}</span></button>`).join('')}</div></section>`;
  })()}
  ${(() => {
    const cm = D.gastos.filter(g => g.cuotas > 1 && mesDe(g.fecha) === ym), fut = D.gastos.filter(g => g.cuotas > 1 && mesDe(g.fecha) > ym);
    if (!cm.length && !fut.length) return '';
    const nm = new Set(fut.map(g => mesDe(g.fecha))).size;
    return `<section class="bloque"><p class="etiqueta">Cuotas</p>
      ${cm.length ? `<div class="lista">${cm.map(g => `<button class="item item--plano" data-a="editarGasto" data-id="${g.id}">
        <span class="item__cuerpo"><span class="item__titulo">${h(g.descripcion || g.categoria)}</span><span class="micro">Cuota ${g.cuotaN} de ${g.cuotas}</span></span>
        <span class="item__monto num">${plata(g.monto, g.moneda)}</span></button>`).join('')}</div>` : '<p class="micro" style="margin-top:8px">No hay cuotas este mes.</p>'}
      ${fut.length ? `<p class="chico" style="margin-top:12px">Comprometido en cuotas para los próximos ${nm} mes${nm > 1 ? 'es' : ''}: <strong class="num">${plata(fut.reduce((s, g) => s + aARS(g.monto, g.moneda), 0))}</strong>.</p>` : ''}
    </section>`;
  })()}
  ${compras}
  ${mono}
  <button class="item" data-a="ir" data-v="analisis" style="margin-top:12px">
    <span class="codigo codigo--gasto">${ICO.analisis}</span>
    <span class="item__cuerpo"><span class="item__titulo">Ver gráficos y análisis</span><span class="micro">Evolución, servicios, clientes y categorías</span></span></button>`;
}

/* ================= vista: ANÁLISIS ================= */
function barrasHTML(filas, clase = '') {
  if (!filas.length) return '<p class="micro">Nada cargado en este período.</p>';
  const max = filas[0][1] || 1;
  return filas.map(([k, v]) => `<div class="cat"><div class="fila chico"><span>${h(k)}</span><span class="num">${plata(v)}</span></div>
    <div class="barra ${clase}"><i style="width:${Math.max(3, (v / max) * 100)}%"></i></div></div>`).join('');
}
function vistaAnalisis() {
  const meses = mesesPeriodo().filter(m => m <= mesActual());
  const ing = meses.flatMap(cobrosDelMes), gas = meses.flatMap(gastosPagadosDelMes);
  // si un trabajo tiene varios servicios, el cobro se reparte en partes iguales
  const porServ = [];
  for (const x of ing) { const s = x.t.servicios.length ? x.t.servicios : ['Sin servicio']; for (const n of s) porServ.push({ k: n, ars: x.ars / s.length }); }
  const servicios = agrupar(porServ, it => it.k);
  const clientes = agrupar(ing, x => x.t.cliente || 'Sin cliente');
  const cats = agrupar(gas, x => x.g.categoria || 'Otros');
  const chip = (v, txt) => `<button class="chip chip--chico ${UI.per === v ? 'is-on' : ''}" data-a="per" data-v="${v}">${txt}</button>`;
  const rango = meses.length ? (meses.length === 1 ? nombreMes(meses[0]) : `${nombreMes(meses[0])} a ${nombreMes(meses[meses.length - 1])}`) : '';
  return `
  <h1 class="titulo">Análisis</h1>
  <div class="chips chips--scroll" style="margin:12px -16px 4px">${chip('3', '3 meses')}${chip('6', '6 meses')}${chip('12', '12 meses')}${chip('Y', 'Año')}</div>
  ${UI.per === 'Y' ? `<div class="fila" style="justify-content:center;gap:16px;margin:8px 0 0">
    <button class="flecha flecha--chica" data-a="anio" data-v="-1" aria-label="Año anterior">${ICO.izq}</button><strong class="num">${UI.anio}</strong>
    <button class="flecha flecha--chica" data-a="anio" data-v="1" aria-label="Año siguiente">${ICO.der}</button></div>` : ''}
  <p class="micro" style="margin:8px 0 0">${rango}</p>
  ${graficos()}
  <section class="bloque">
    <p class="etiqueta">Ingresos por servicio</p>
    ${barrasHTML(servicios)}
    ${clientes.length ? `<hr class="sep"><p class="etiqueta">Ingresos por cliente</p>${barrasHTML(clientes.map(([k, v]) => [k + (clienteNombre(k) ? ' · ' + clienteNombre(k) : ''), v]))}` : ''}
  </section>
  <section class="bloque">
    <p class="etiqueta">Gastos por categoría</p>
    ${barrasHTML(cats, 'barra--gasto')}
  </section>`;
}

/* ================= vista: TRABAJOS ================= */
function vistaTrabajos() {
  const f = UI.filtroT;
  let lista = [...D.trabajos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (f === 'pend') lista = lista.filter(t => totalesTrabajo(t).saldo > 0);
  if (f === 'ok') lista = lista.filter(t => totalesTrabajo(t).saldo === 0);
  const chip = (v, txt) => `<button class="chip ${f === v ? 'is-on' : ''}" data-a="filtroT" data-v="${v}">${txt}</button>`;
  const deben = pendientesCobro().reduce((s, x) => s + x.ars, 0);
  return `
  <h1 class="titulo">Trabajos</h1>
  <p class="chico sec" style="margin:0 0 12px">Te deben <strong class="num">${plata(deben)}</strong> en total.</p>
  <div class="chips chips--scroll">${chip('todos', 'Todos')}${chip('pend', 'Por cobrar')}${chip('ok', 'Cobrados')}</div>
  <div class="lista">
    ${lista.length ? lista.map(itemTrabajo).join('') : vacio('Todavía no hay trabajos acá.', 'Tocá + para cargar el primero.')}
  </div>`;
}
function itemTrabajo(t) {
  const { saldo, atrasado } = totalesTrabajo(t);
  const est = saldo === 0 ? '<span class="estado estado--ok">Cobrado</span>'
    : atrasado ? `<span class="estado estado--mal">Atrasado · falta ${plata(saldo, t.moneda)}</span>`
      : `<span class="estado estado--pend">Falta ${plata(saldo, t.moneda)}</span>`;
  return `<button class="item" data-a="verTrabajo" data-id="${t.id}">
    <span class="codigo">${h(t.cliente || '···')}</span>
    <span class="item__cuerpo"><span class="item__titulo">${h(t.descripcion || 'Trabajo sin descripción')}</span>
      <span class="micro">${fechaCorta(t.fecha)}${t.facturado ? ' · Facturado' : ''}</span><span style="display:block;margin-top:4px">${est}</span></span>
    <span class="item__monto num">${plata(t.total, t.moneda)}</span></button>`;
}

/* ================= vista: GASTOS ================= */
function vistaGastos() {
  const f = UI.filtroG;
  let lista = [...D.gastos];
  if (f === 'mes') lista = lista.filter(g => mesDe(g.fechaPago || g.fecha) === UI.mes || (!g.pagado && mesDe(g.fecha) === UI.mes));
  if (f === 'pend') lista = lista.filter(g => !g.pagado);
  if (f === 'cuotas') lista = lista.filter(g => g.cuotas > 1);
  lista.sort((a, b) => (b.fechaPago || b.fecha).localeCompare(a.fechaPago || a.fecha));
  const chip = (v, txt) => `<button class="chip ${f === v ? 'is-on' : ''}" data-a="filtroG" data-v="${v}">${txt}</button>`;
  const grupos = new Map();
  for (const g of lista) { const k = f === 'todos' || f === 'cuotas' ? mesDe(g.fecha) : (g.fechaPago || g.fecha); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(g); }
  const tot = gastosPagadosDelMes(UI.mes).reduce((s, x) => s + x.ars, 0);
  return `
  <h1 class="titulo">Gastos</h1>
  <p class="chico sec" style="margin:0 0 12px">Pagaste <strong class="num">${plata(tot)}</strong> en ${nombreMes(UI.mes)}.</p>
  <div class="chips chips--scroll">${chip('mes', 'Este mes')}${chip('pend', 'Por pagar')}${chip('cuotas', 'Cuotas')}${chip('todos', 'Todos')}</div>
  ${lista.length ? [...grupos.entries()].map(([k, gs]) => `
    <p class="etiqueta grupo">${f === 'todos' || f === 'cuotas' ? nombreMes(k) : fechaLarga(k)}</p>
    <div class="lista">${gs.map(itemGasto).join('')}</div>`).join('')
    : `<div class="lista">${vacio('No hay gastos acá.', 'Tocá + para cargar uno.')}</div>`}`;
}
function itemGasto(g) {
  const atr = !g.pagado && g.vence && g.vence < hoyISO();
  if (g.retiro) return `<button class="item" data-a="editarGasto" data-id="${g.id}">
    <span class="codigo">${ICO.ingreso}</span>
    <span class="item__cuerpo"><span class="item__titulo">Pago a mí</span><span class="micro">Pasó a Personal · ${h(g.medio || '')}</span></span>
    <span class="item__monto num">${plata(g.monto, g.moneda)}</span></button>`;
  const est = g.pagado ? `<span class="micro">${g.cuotas > 1 ? `Cuota ${g.cuotaN}/${g.cuotas} · ` : ''}${h(g.medio || '')}</span>`
    : `<span class="estado ${atr ? 'estado--mal' : 'estado--pend'}">${atr ? 'Vencido' : 'Por pagar'}${g.vence ? ' · ' + fechaCorta(g.vence) : ''}</span>`;
  return `<button class="item" data-a="editarGasto" data-id="${g.id}">
    <span class="codigo codigo--gasto">${g.fijoId ? ICO.fijo : g.cuotas > 1 ? ICO.cuotas : ICO.gasto}</span>
    <span class="item__cuerpo"><span class="item__titulo">${h(g.descripcion || g.categoria)}</span>
      <span class="micro">${h(g.categoria)}</span><span style="display:block;margin-top:2px">${est}</span></span>
    <span class="item__monto num">${plata(g.monto, g.moneda)}</span></button>`;
}

/* ================= vista: EQUIPO ================= */
function vistaEquipo() {
  const totUSD = D.equipo.reduce((s, e) => s + e.usd, 0);
  const hoyUSD = D.equipo.reduce((s, e) => s + valorHoyUSD(e), 0);
  const grupos = new Map();
  for (const cat of D.listas.equipo) grupos.set(cat, []);
  for (const e of D.equipo) { if (!grupos.has(e.categoria)) grupos.set(e.categoria, []); grupos.get(e.categoria).push(e); }

  return `
  <h1 class="titulo">Equipo</h1>
  <section class="bloque bloque--oscuro">
    <p class="etiqueta">Valor de tu equipo</p>
    <p class="grande num" style="margin:10px 0 2px">${plata(totUSD * mep())}</p>
    <p class="micro num">US$ ${fmtUSD.format(Math.round(totUSD))} · ${D.equipo.length} ítems · MEP ${plata(mep())}</p>
    ${Math.round(hoyUSD) < Math.round(totUSD) ? `<p class="micro num" style="margin-top:6px">Valor estimado hoy, con desgaste: ${plata(hoyUSD * mep())}</p>` : ''}
  </section>
  <div class="fila" style="margin-top:18px"><h2 class="subtitulo">Inventario</h2><button class="btn btn--suave btn--chico" data-a="nuevoEquipo">+ Agregar</button></div>
  ${[...grupos.entries()].filter(([, es]) => es.length).map(([cat, es]) => `
    <p class="etiqueta grupo">${h(cat)} · ${plata(es.reduce((s, e) => s + e.usd, 0) * mep())}</p>
    <div class="lista">${es.map(e => `<button class="item" data-a="editarEquipo" data-id="${e.id}">
      <span class="item__cuerpo"><span class="item__titulo">${h(e.item)}</span><span class="micro">US$ ${fmtUSD.format(e.usd)}${e.serie ? ' · N.º ' + h(e.serie) : ''}</span></span>
      <span class="item__monto num">${plata(e.usd * mep())}</span></button>`).join('')}</div>`).join('')}`;
}

/* ================= vista: AJUSTES ================= */
function vistaAjustes() {
  const a = A();
  const editorLista = (clave, titulo, ayuda) => `
  <details class="bloque">
    <summary><span class="subtitulo">${titulo}</span><p class="micro" style="margin:4px 0 0">${ayuda}</p></summary>
    <div style="margin-top:10px">
      ${D.listas[clave].map((v, i) => `<div class="editable">
        <input class="input" value="${h(v)}" data-a="renombrar" data-lista="${clave}" data-i="${i}" aria-label="Nombre">
        <button class="quitar" data-a="quitarDeLista" data-lista="${clave}" data-i="${i}" aria-label="Quitar ${h(v)}">×</button></div>`).join('')}
      <form class="fila" style="margin-top:10px" data-form="agregarALista" data-lista="${clave}">
        <input class="input" name="valor" placeholder="Agregar…" required><button class="btn btn--secundario btn--chico">Agregar</button></form>
    </div>
  </details>`;

  return `
  <h1 class="titulo">Ajustes</h1>

  ${bloqueTema()}

  <section class="bloque">
    <h2 class="subtitulo">Respaldo en Google Sheets</h2>
    <p class="micro" style="margin:4px 0 0">${a.sheetUrl ? (a.ultimoRespaldo ? `Último respaldo: ${new Date(a.ultimoRespaldo).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.` : 'Conectado, todavía sin respaldar.') + (a.pendiente ? ' Hay cambios sin subir.' : '') : 'Sin conectar. Seguí la guía del archivo GUIA-SHEETS para crear tu enlace.'}</p>
    <form data-form="sheet">
      <label class="campo"><span>Enlace del Apps Script</span><input class="input" name="url" value="${h(a.sheetUrl)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url"></label>
      <label class="campo"><span>Clave</span><input class="input" name="clave" value="${h(a.sheetClave)}" placeholder="La misma que pusiste en el script" autocomplete="off"></label>
      <div class="acciones"><button class="btn btn--primario">Guardar y respaldar</button></div>
    </form>
    ${a.sheetUrl ? '<button class="link" data-a="restaurar">Traer mis datos desde el Sheet</button>' : ''}
  </section>

  <section class="bloque">
    <h2 class="subtitulo">Dólar MEP</h2>
    <p class="chico" style="margin:6px 0"><strong class="num">${plata(mep())}</strong> ${a.mepManual ? '· cargado a mano' : a.mepFecha ? '· actualizado ' + new Date(a.mepFecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '· todavía sin actualizar'}</p>
    <form class="fila" data-form="mepManual">
      <input class="input" name="valor" inputmode="decimal" placeholder="Fijar a mano (vacío = automático)" value="${a.mepManual ? montoInput(a.mepManual) : ''}">
      <button class="btn btn--secundario btn--chico">Guardar</button></form>
    <button class="link" data-a="actualizarMep">Actualizar ahora</button>
  </section>

  <section class="bloque">
    <h2 class="subtitulo">Funciones</h2>
    <label class="interruptor"><span><strong>Próximas compras</strong><br><span class="micro">Planear equipo y cuánto separar por mes</span></span>
      <input type="checkbox" data-a="toggle" data-k="comprasActivo" ${a.comprasActivo ? 'checked' : ''}></label>
    <label class="interruptor"><span><strong>Medidor de monotributo</strong><br><span class="micro">Facturado en 12 meses contra el tope</span></span>
      <input type="checkbox" data-a="toggle" data-k="monoActivo" ${a.monoActivo ? 'checked' : ''}></label>
    ${a.monoActivo ? `<form class="fila" data-form="numero" data-k="monoTope"><input class="input" name="valor" inputmode="decimal" placeholder="Tope anual de tu categoría" value="${montoInput(a.monoTope)}"><button class="btn btn--secundario btn--chico">Guardar</button></form>
    <p class="micro" style="margin-top:6px">El tope de cada categoría lo publica ARCA y se actualiza dos veces por año.</p>` : ''}
  </section>

  <section class="bloque">
    <h2 class="subtitulo">Punto de equilibrio</h2>
    <form data-form="equilibrio">
      <label class="campo"><span>Sueldo que querés sacarte por mes (opcional)</span><input class="input" name="sueldo" inputmode="decimal" value="${montoInput(a.metaSueldo)}" placeholder="0"></label>
      <label class="campo"><span>Precio de un trabajo típico</span><input class="input" name="ticket" inputmode="decimal" value="${montoInput(a.ticket)}"></label>
      <p class="ayuda">Con 3 trabajos cargados o más, la app usa tu promedio real.</p>
      <label class="campo"><span>Vida útil del equipo (años)</span><input class="input" name="vida" inputmode="numeric" value="${a.vidaUtil}"></label>
      <div class="acciones"><button class="btn btn--secundario">Guardar</button></div>
    </form>
  </section>

  <section class="bloque">
    <div class="fila"><h2 class="subtitulo">Gastos fijos</h2><button class="btn btn--suave btn--chico" data-a="nuevoFijo">+ Agregar</button></div>
    <p class="micro" style="margin:4px 0 8px">Se cargan solos cada mes como "por pagar". Total: <strong class="num">${plata(fijosMensualesARS())}</strong></p>
    <div class="lista">${D.fijos.map(f => `<button class="item" data-a="editarFijo" data-id="${f.id}" style="box-shadow:none;background:var(--superficie)">
      <span class="item__cuerpo"><span class="item__titulo">${h(f.descripcion)}</span><span class="micro">${h(f.categoria)} · día ${f.dia}${f.activo ? '' : ' · pausado'}</span></span>
      <span class="item__monto num">${plata(f.monto, f.moneda)}</span></button>`).join('') || '<p class="micro">Sin gastos fijos.</p>'}</div>
  </section>

  <section class="bloque">
    <div class="fila"><h2 class="subtitulo">Clientes</h2><button class="btn btn--suave btn--chico" data-a="nuevoCliente">+ Agregar</button></div>
    <div class="lista">${D.clientes.map(c => `<button class="item" data-a="editarCliente" data-id="${c.codigo}" style="box-shadow:none;background:var(--superficie)">
      <span class="codigo">${h(c.codigo)}</span><span class="item__cuerpo"><span class="item__titulo">${h(c.nombre || 'Sin nombre')}</span></span></button>`).join('') || '<p class="micro">Se agregan solos cuando cargás un trabajo.</p>'}</div>
  </section>

  ${editorLista('gasto', 'Categorías de gasto', 'Si renombrás una, se actualizan los gastos que la usan.')}
  ${editorLista('servicio', 'Servicios', 'Etiquetas para saber qué vendés más.')}
  ${editorLista('medio', 'Medios de pago y cobro', 'Dónde entra y sale la plata.')}
  ${editorLista('equipo', 'Categorías de equipo', 'Cómo se agrupa tu inventario.')}

  <section class="bloque">
    <h2 class="subtitulo">Tus datos</h2>
    <p class="micro" style="margin:4px 0 10px">Una copia en archivo sirve para pasar todo a otro teléfono.</p>
    <div class="acciones" style="flex-wrap:wrap">
      <button class="btn btn--suave btn--chico" data-a="exportarJSON">Descargar copia</button>
      <button class="btn btn--suave btn--chico" data-a="exportarCSV">Descargar CSV</button>
      <label class="btn btn--suave btn--chico">Cargar copia<input type="file" accept=".json,application/json" data-a="importar" hidden></label>
    </div>
    <hr class="sep">
    <button class="btn btn--peligro btn--chico" data-a="borrarTodo">Borrar todo y empezar de cero</button>
    <hr class="sep">
    <div class="fila"><span class="micro">FÁRA Finanzas ${VERSION}</span><button class="btn btn--suave btn--chico" data-a="actualizarApp">Actualizar app</button></div>
    <p class="micro" style="margin-top:6px">Baja la última versión. Tus datos no se tocan.</p>
  </section>`;
}

function vacio(t, s) {
  return `<div class="vacio"><img src="icons/simbolo.svg" alt=""><p class="chico" style="margin:0"><strong>${t}</strong></p><p class="micro" style="margin:4px 0 0">${s}</p></div>`;
}

/* ================= pintar ================= */
function pintar() {
  const mapa = VISTAS[UI.modo];
  if (!mapa[UI.tab]) UI.tab = 'mes';
  pintarNav();
  $('#vista').innerHTML = mapa[UI.tab]();
  $('#fab').hidden = ['ajustes', 'analisis', 'ahorro', 'reservas'].includes(UI.tab);
  pintarEstado();
}
function pintarEstado() {
  const a = A();
  let resp;
  if (!a.sheetUrl) resp = '<span class="pastilla is-off"><i></i>Sin respaldo</span>';
  else if (a.pendiente) resp = `<span class="pastilla is-pend"><i></i>${navigator.onLine ? 'Subiendo…' : 'Sin conexión'}</span>`;
  else resp = '<span class="pastilla"><i></i>Respaldado</span>';
  $('#estado').innerHTML = `<span class="pastilla num">MEP ${plata(mep())}</span>${resp}<button class="tema" data-a="temaRapido" aria-label="${esOscuro() ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}">${esOscuro() ? ICO_SOL : ICO_LUNA}</button>`;
}

/* ================= hoja (modal) ================= */
let alCerrar = null;
function abrirHoja(titulo, cuerpo, onClose) {
  const hoja = $('#hoja');
  hoja.innerHTML = `<div class="hoja__cab"><h2 class="subtitulo">${titulo}</h2><button class="cerrar" data-a="cerrar" aria-label="Cerrar">×</button></div>${cuerpo}`;
  hoja.hidden = false; $('#velo').hidden = false;
  document.body.style.overflow = 'hidden';
  alCerrar = onClose || null;
  const primero = $('[autofocus]', hoja); if (primero) setTimeout(() => primero.focus(), 280);
}
function cerrarHoja() {
  $('#hoja').hidden = true; $('#velo').hidden = true; $('#hoja').innerHTML = '';
  document.body.style.overflow = '';
  if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600); }

/* piezas de formulario */
const campoMonto = (nombre, valor, moneda, etiqueta = 'Monto') => `
  <label class="campo"><span>${etiqueta}</span>
  <div class="monto"><input class="input" name="${nombre}" inputmode="decimal" placeholder="0" value="${montoInput(valor)}" autocomplete="off" ${nombre === 'monto' || nombre === 'total' ? 'autofocus' : ''} required>
  <div class="moneda" data-grupo="moneda"><input type="hidden" name="moneda" value="${moneda}">
    <button type="button" class="${moneda === 'ARS' ? 'is-on' : ''}" data-a="moneda" data-v="ARS">$</button>
    <button type="button" class="${moneda === 'USD' ? 'is-on' : ''}" data-a="moneda" data-v="USD">US$</button></div></div></label>`;
const chips = (nombre, opciones, elegido, multi = false) => {
  const sel = multi ? (elegido || []) : [elegido];
  return `<div class="chips" data-chips="${nombre}" data-multi="${multi ? 1 : 0}"><input type="hidden" name="${nombre}" value="${h(multi ? sel.join('|') : elegido || '')}">
  ${opciones.map(o => `<button type="button" class="chip ${sel.includes(o) ? 'is-on' : ''}" data-a="chip" data-v="${h(o)}">${h(o)}</button>`).join('')}</div>`;
};
const interruptor = (nombre, txt, on, sub = '') => `<label class="interruptor"><span><strong>${txt}</strong>${sub ? `<br><span class="micro">${sub}</span>` : ''}</span><input type="checkbox" name="${nombre}" ${on ? 'checked' : ''} data-a="interr"></label>`;

/* ================= formularios: GASTO ================= */
// En FÁRA, "Personal" es un medio más: significa que lo pagó tu plata personal.
const mediosFara = () => ['Personal', ...D.listas.medio.filter(m => m !== 'Personal')];
function formGasto(g) {
  const nuevo = !g;
  g = g || { fecha: hoyISO(), monto: 0, moneda: 'ARS', categoria: '', medio: A().medioGasto, pagado: true, vence: '', descripcion: '', nota: '' };
  abrirHoja(nuevo ? 'Nuevo gasto' : g.cuotas > 1 ? `Cuota ${g.cuotaN} de ${g.cuotas}` : 'Editar gasto', `
  <form data-form="gasto" data-id="${g.id || ''}">
    ${campoMonto('monto', g.monto, g.moneda)}
    <label class="campo"><span>Qué fue</span><input class="input" name="descripcion" value="${h(g.descripcion)}" placeholder="Ej.: Fondo blanco infinito"></label>
    <div class="campo"><span>Categoría</span>${chips('categoria', D.listas.gasto, g.categoria || D.listas.gasto[0])}</div>
    <div class="campo"><span>¿De dónde salió la plata?</span>${chips('medio', mediosFara(), g.medio)}</div>
    <p class="ayuda" style="margin-top:-6px">Si elegís Personal, el gasto aparece también en Personal con categoría FÁRA.</p>
    ${nuevo ? `${interruptor('enCuotas', 'En cuotas', false, 'Se carga una cuota por mes')}
    <div data-si="enCuotas" hidden><div class="grilla2">
      <label class="campo"><span>Cantidad de cuotas</span><input class="input" name="cuotas" inputmode="numeric" value="3"></label>
      <label class="campo"><span>Primera cuota</span><input class="input" type="month" name="primera" value="${mesActual()}"></label></div>
      <p class="ayuda">Poné arriba el total de la compra; la app lo divide.</p></div>` : ''}
    <div data-no="enCuotas">
    ${interruptor('pagado', 'Ya está pagado', g.pagado)}
    <div data-si="pagado" ${g.pagado ? '' : 'hidden'}><label class="campo"><span>Fecha de pago</span><input class="input" type="date" name="fechaPago" value="${g.fechaPago || g.fecha}"></label></div>
    <div data-no="pagado" ${g.pagado ? 'hidden' : ''}><label class="campo"><span>Vence el</span><input class="input" type="date" name="vence" value="${g.vence || ''}"></label></div>
    </div>
    <label class="campo"><span>Nota (opcional)</span><input class="input" name="nota" value="${h(g.nota)}"></label>
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarGasto" data-id="' + g.id + '">' + (g.cuotas > 1 ? 'Borrar cuotas' : 'Borrar') + '</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function guardarGasto(form, datos) {
  const id = form.dataset.id;
  if (!id && datos.enCuotas) {
    const total = leerMonto(datos.monto); if (!total) return toast('Poné un monto');
    const n = Math.min(60, Math.max(2, parseInt(datos.cuotas) || 2)), grupo = uid();
    const dia = String(Math.min(28, +hoyISO().slice(8, 10))).padStart(2, '0'), primera = datos.primera || mesActual();
    for (let i = 0; i < n; i++) {
      const f = `${sumarMes(primera, i)}-${dia}`;
      D.gastos.push({ id: uid(), fecha: f, fechaPago: f, pagado: true, vence: '', monto: Math.round(total / n * 100) / 100, moneda: datos.moneda,
        descripcion: datos.descripcion.trim(), categoria: datos.categoria, medio: datos.medio, nota: datos.nota.trim(), mep: mep(), grupo, cuotas: n, cuotaN: i + 1 });
      sincPersonal(D.gastos.at(-1));
    }
    if (datos.medio) A().medioGasto = datos.medio;
    guardar(); cerrarHoja(); toast(`${n} cuotas cargadas`); pintar(); return;
  }
  const pagado = !!datos.pagado;
  const base = id ? D.gastos.find(x => x.id === id) : { id: uid(), mep: mep() };
  Object.assign(base, {
    monto: leerMonto(datos.monto), moneda: datos.moneda, descripcion: datos.descripcion.trim(), categoria: datos.categoria,
    medio: datos.medio, pagado, nota: datos.nota.trim(),
    fechaPago: pagado ? (datos.fechaPago || hoyISO()) : '',
    vence: pagado ? '' : datos.vence,
    fecha: base.fecha && id ? base.fecha : (pagado ? datos.fechaPago || hoyISO() : datos.vence || hoyISO())
  });
  if (pagado && !base.mep) base.mep = mep();
  if (!base.monto) return toast('Poné un monto');
  if (!id) D.gastos.push(base);
  if (datos.medio) A().medioGasto = datos.medio;
  sincPersonal(base);
  guardar(); cerrarHoja(); toast(base.medio === 'Personal' && base.pagado ? 'Cargado en FÁRA y en Personal' : id ? 'Gasto actualizado' : 'Gasto cargado'); pintar();
}

/* ================= formularios: TRABAJO ================= */
function filaCobro(c, i) {
  return `<div class="cobro" data-cobro="${i}">
    <label class="campo"><span>Concepto</span><input class="input" name="c_concepto" value="${h(c.concepto)}"></label>
    <label class="campo"><span>Monto</span><input class="input" name="c_monto" inputmode="decimal" value="${montoInput(c.monto)}" data-a="recalc"></label>
    <button type="button" class="quitar" data-a="quitarCobro" aria-label="Quitar">×</button>
    <label class="campo"><span>${c.pagado ? 'Cobrado el' : 'Vence el'}</span><input class="input" type="date" name="c_fecha" value="${c.pagado ? c.fechaPago : c.vence || ''}"></label>
    <label class="campo"><span>Estado</span><select class="input" name="c_pagado"><option value="0">Por cobrar</option><option value="1" ${c.pagado ? 'selected' : ''}>Cobrado</option></select></label>
    <input type="hidden" name="c_id" value="${c.id || ''}"><input type="hidden" name="c_medio" value="${h(c.medio || '')}">
  </div>`;
}
function formTrabajo(t) {
  const nuevo = !t;
  t = t || { fecha: hoyISO(), cliente: '', descripcion: '', servicios: [], total: 0, moneda: 'ARS', facturado: false, factura: '', cobros: [], nota: '', medio: A().medioCobro };
  const cobros = t.cobros.length ? t.cobros : [{ concepto: 'Pago total', monto: t.total, pagado: false, vence: '' }];
  abrirHoja(nuevo ? 'Nuevo trabajo' : 'Editar trabajo', `
  <form data-form="trabajo" data-id="${t.id || ''}">
    <div class="grilla2">
      <label class="campo"><span>Cliente (3 letras)</span><input class="input" name="cliente" value="${h(t.cliente)}" maxlength="3" list="lista-clientes" placeholder="SNL" style="text-transform:uppercase;font-weight:700;letter-spacing:.08em" required data-a="cliente"></label>
      <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${t.fecha}"></label>
    </div>
    <datalist id="lista-clientes">${D.clientes.map(c => `<option value="${h(c.codigo)}">${h(c.nombre)}</option>`).join('')}</datalist>
    <label class="campo" data-nombre-cliente ${t.cliente && clienteNombre(t.cliente) ? 'hidden' : ''}><span>Nombre del cliente (para la lista)</span><input class="input" name="clienteNombre" value="${h(clienteNombre(t.cliente))}" placeholder="Ej.: Snail DI"></label>
    <label class="campo"><span>Descripción</span><input class="input" name="descripcion" value="${h(t.descripcion)}" placeholder="Ej.: Catálogo de 20 productos con fondo blanco" required></label>
    <div class="campo"><span>Servicios</span>${chips('servicios', D.listas.servicio, t.servicios, true)}</div>
    ${campoMonto('total', t.total, t.moneda, 'Precio total')}
    <div class="campo"><div class="fila"><span>Cobros</span><span class="micro" data-resto></span></div>
      <div data-cobros>${cobros.map(filaCobro).join('')}</div>
      <div class="fila"><button type="button" class="link" data-a="senaSaldo">Dividir en seña y saldo</button><button type="button" class="link" data-a="agregarCobro">+ Otro cobro</button></div>
    </div>
    <div class="campo"><span>Medio de cobro</span>${chips('medio', D.listas.medio, t.medio || A().medioCobro)}</div>
    ${interruptor('facturado', 'Lo facturé', t.facturado, 'Para el medidor de monotributo')}
    <div data-si="facturado" ${t.facturado ? '' : 'hidden'}><label class="campo"><span>N.º de factura</span><input class="input" name="factura" value="${h(t.factura)}"></label></div>
    <label class="campo"><span>Nota (opcional)</span><textarea class="input" name="nota">${h(t.nota)}</textarea></label>
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarTrabajo" data-id="' + t.id + '">Borrar</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
  recalcCobros();
}
function recalcCobros() {
  const f = $('form[data-form="trabajo"]'); if (!f) return;
  const total = leerMonto(f.total.value);
  const filas = $$('[data-cobro]', f);
  const suma = filas.reduce((s, r) => s + leerMonto($('[name="c_monto"]', r).value), 0);
  if (filas.length === 1 && !$('[name="c_monto"]', filas[0]).dataset.tocado) { $('[name="c_monto"]', filas[0]).value = montoInput(total); }
  const suma2 = $$('[data-cobro]', f).reduce((s, r) => s + leerMonto($('[name="c_monto"]', r).value), 0);
  const resto = total - suma2;
  const el = $('[data-resto]', f);
  el.textContent = Math.abs(resto) < 0.01 ? '' : resto > 0 ? `Falta asignar ${plata(resto, f.moneda.value)}` : `Te pasaste ${plata(-resto, f.moneda.value)}`;
  el.className = Math.abs(resto) < 0.01 ? 'micro' : 'micro mal';
  return suma;
}
function guardarTrabajo(form, datos) {
  const id = form.dataset.id;
  const cod = (datos.cliente || '').toUpperCase().replace(/[^A-ZÑ0-9]/g, '').slice(0, 3);
  if (cod.length < 2) return toast('El código del cliente lleva 3 letras');
  const total = leerMonto(datos.total);
  if (!total) return toast('Poné el precio total');
  const medio = datos.medio;
  const viejo = id ? D.trabajos.find(x => x.id === id) : null;
  const cobros = $$('[data-cobro]', form).map(r => {
    const g = (n) => $(`[name="${n}"]`, r).value;
    const pagado = g('c_pagado') === '1';
    const prev = viejo && viejo.cobros.find(c => c.id === g('c_id'));
    return {
      id: g('c_id') || uid(), concepto: g('c_concepto').trim() || 'Cobro', monto: leerMonto(g('c_monto')), pagado,
      fechaPago: pagado ? (g('c_fecha') || hoyISO()) : '', vence: pagado ? (prev ? prev.vence : '') : g('c_fecha'),
      medio: pagado ? (g('c_medio') || medio) : '', mep: pagado ? (prev && prev.mep) || mep() : 0
    };
  }).filter(c => c.monto > 0);
  if (!cobros.length) cobros.push({ id: uid(), concepto: 'Pago total', monto: total, pagado: false, vence: '', fechaPago: '', medio: '', mep: 0 });
  const t = viejo || { id: uid(), mep: mep() };
  Object.assign(t, {
    cliente: cod, fecha: datos.fecha || hoyISO(), descripcion: datos.descripcion.trim(), servicios: datos.servicios ? datos.servicios.split('|').filter(Boolean) : [],
    total, moneda: datos.moneda, facturado: !!datos.facturado, factura: datos.facturado ? datos.factura.trim() : '', cobros, nota: datos.nota.trim(), medio
  });
  if (!viejo) D.trabajos.push(t);
  const cli = D.clientes.find(c => c.codigo === cod);
  if (!cli) D.clientes.push({ codigo: cod, nombre: (datos.clienteNombre || '').trim() });
  else if (datos.clienteNombre && !cli.nombre) cli.nombre = datos.clienteNombre.trim();
  if (medio) A().medioCobro = medio;
  guardar(); cerrarHoja(); toast(viejo ? 'Trabajo actualizado' : 'Trabajo cargado'); pintar();
}
function verTrabajo(t) {
  const { cobrado, saldo } = totalesTrabajo(t);
  const hoy = hoyISO();
  abrirHoja(h(t.cliente) + (clienteNombre(t.cliente) ? ' · ' + h(clienteNombre(t.cliente)) : ''), `
    <p class="chico" style="margin:0 0 4px"><strong>${h(t.descripcion)}</strong></p>
    <p class="micro" style="margin:0">${fechaLarga(t.fecha)}${t.servicios.length ? ' · ' + t.servicios.map(h).join(', ') : ''}${t.facturado ? ' · Factura ' + h(t.factura || 's/n') : ''}</p>
    <section class="bloque bloque--suave">
      <div class="grilla2"><div class="pila"><span class="micro">Total</span><span class="subtitulo num">${plata(t.total, t.moneda)}</span></div>
      <div class="pila"><span class="micro">${saldo ? 'Falta cobrar' : 'Cobrado'}</span><span class="subtitulo num ${saldo ? '' : 'ok'}">${plata(saldo || cobrado, t.moneda)}</span></div></div>
    </section>
    <p class="etiqueta">Cobros</p>
    <div class="lista">${t.cobros.map(c => `<div class="item" style="box-shadow:none;background:var(--superficie)">
      <span class="item__cuerpo"><span class="item__titulo">${h(c.concepto)} · <span class="num">${plata(c.monto, t.moneda)}</span></span>
      <span class="micro">${c.pagado ? `Cobrado ${fechaCorta(c.fechaPago)}${c.medio ? ' · ' + h(c.medio) : ''}` : c.vence ? (c.vence < hoy ? 'Atrasado desde ' : 'Vence ') + fechaCorta(c.vence) : 'Sin fecha'}</span></span>
      ${c.pagado ? '<span class="estado estado--ok">Cobrado</span>' : `<button class="btn btn--primario btn--chico" data-a="marcarCobro" data-id="${t.id}" data-c="${c.id}">Cobrado</button>`}
    </div>`).join('')}</div>
    ${t.nota ? `<p class="chico sec">${h(t.nota)}</p>` : ''}
    <div class="acciones"><button class="btn btn--suave" data-a="editarTrabajo" data-id="${t.id}">Editar</button></div>`);
}
function formMarcar(titulo, medioDef, alGuardar) {
  abrirHoja(titulo, `<form data-form="marcar">
    <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${hoyISO()}"></label>
    <div class="campo"><span>Medio</span>${chips('medio', D.listas.medio, medioDef)}</div>
    <div class="acciones"><button class="btn btn--primario">Confirmar</button></div></form>`);
  formMarcar.cb = alGuardar;
}

/* ================= formularios: EQUIPO, COMPRAS, FIJOS, CLIENTES ================= */
function formEquipo(e) {
  const nuevo = !e;
  e = e || { item: '', categoria: D.listas.equipo[0], usd: 0, fechaCompra: '', serie: '', nota: '' };
  abrirHoja(nuevo ? 'Nuevo equipo' : 'Editar equipo', `
  <form data-form="equipo" data-id="${e.id || ''}">
    <label class="campo"><span>Nombre</span><input class="input" name="item" value="${h(e.item)}" required ${nuevo ? 'autofocus' : ''}></label>
    <div class="campo"><span>Categoría</span>${chips('categoria', D.listas.equipo, e.categoria)}</div>
    ${campoMonto('valor', e.usd, 'USD', 'Valor')}
    <p class="ayuda">Se guarda en dólares. Si lo cargás en pesos, se convierte al MEP de hoy (${plata(mep())}).</p>
    <div class="grilla2">
      <label class="campo"><span>Fecha de compra</span><input class="input" type="date" name="fechaCompra" value="${e.fechaCompra}"></label>
      <label class="campo"><span>N.º de serie</span><input class="input" name="serie" value="${h(e.serie)}"></label>
    </div>
    <label class="campo"><span>Nota</span><input class="input" name="nota" value="${h(e.nota)}"></label>
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarEquipo" data-id="' + e.id + '">Borrar</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function formCompra(c) {
  const nuevo = !c;
  c = c || { item: '', precio: 0, moneda: 'USD', meses: 6, ahorrado: 0, creado: hoyISO() };
  abrirHoja(nuevo ? 'Nueva compra' : 'Editar compra', `
  <form data-form="compra" data-id="${c.id || ''}">
    <label class="campo"><span>Qué querés comprar</span><input class="input" name="item" value="${h(c.item)}" required></label>
    ${campoMonto('precio', c.precio, c.moneda, 'Precio')}
    <label class="campo"><span>¿En cuántos meses?</span><input class="input" name="meses" inputmode="numeric" value="${c.meses}"></label>
    <label class="campo"><span>Ya ahorrado</span><input class="input" name="ahorrado" inputmode="decimal" value="${montoInput(c.ahorrado)}" placeholder="0"></label>
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarCompra" data-id="' + c.id + '">Borrar</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function verCompra(c) {
  const p = planCompra(c);
  abrirHoja(h(c.item), `
    <section class="bloque bloque--suave">
      <div class="grilla2"><div class="pila"><span class="micro">Precio</span><span class="subtitulo num">${c.precio ? plata(c.precio, c.moneda) : '—'}</span></div>
      <div class="pila"><span class="micro">Ahorrado</span><span class="subtitulo num">${plata(c.ahorrado || 0, c.moneda)}</span></div></div>
      ${c.precio ? `<p class="chico" style="margin:12px 0 0">Separá <span class="marcador num">${plata(p.porMes, c.moneda)}</span> por mes para tenerlo en ${fechaCorta(p.objetivo)}.</p>` : '<p class="chico" style="margin:12px 0 0">Cargale el precio para calcular cuánto separar.</p>'}
    </section>
    <form class="fila" data-form="sumarAhorro" data-id="${c.id}"><input class="input" name="monto" inputmode="decimal" placeholder="Sumar ahorro (${c.moneda === 'USD' ? 'US$' : '$'})"><button class="btn btn--secundario btn--chico">Sumar</button></form>
    <div class="acciones"><button class="btn btn--suave" data-a="editarCompra" data-id="${c.id}">Editar</button><button class="btn btn--primario" data-a="comprado" data-id="${c.id}">Ya lo compré</button></div>
    <p class="micro" style="margin-top:8px">"Ya lo compré" lo pasa a tu inventario y carga el gasto.</p>`);
}
function formFijo(f) {
  const nuevo = !f;
  f = f || { descripcion: '', categoria: 'Software y suscripciones', monto: 0, moneda: 'ARS', dia: 10, medio: A().medioGasto, activo: true };
  abrirHoja(nuevo ? 'Nuevo gasto fijo' : 'Editar gasto fijo', `
  <form data-form="fijo" data-id="${f.id || ''}">
    <label class="campo"><span>Nombre</span><input class="input" name="descripcion" value="${h(f.descripcion)}" required></label>
    ${campoMonto('monto', f.monto, f.moneda)}
    <label class="campo"><span>Día del mes en que vence</span><input class="input" name="dia" inputmode="numeric" value="${f.dia}"></label>
    <div class="campo"><span>Categoría</span>${chips('categoria', D.listas.gasto, f.categoria)}</div>
    <div class="campo"><span>¿De dónde sale la plata?</span>${chips('medio', mediosFara(), f.medio)}</div>
    ${interruptor('activo', 'Activo', f.activo, 'Pausalo si no lo pagás por un tiempo')}
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarFijo" data-id="' + f.id + '">Borrar</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function formCliente(c) {
  const nuevo = !c;
  c = c || { codigo: '', nombre: '' };
  abrirHoja(nuevo ? 'Nuevo cliente' : 'Editar cliente', `
  <form data-form="cliente" data-id="${h(c.codigo)}">
    <label class="campo"><span>Código (3 letras)</span><input class="input" name="codigo" value="${h(c.codigo)}" maxlength="3" required style="text-transform:uppercase;font-weight:700;letter-spacing:.08em"></label>
    <label class="campo"><span>Nombre</span><input class="input" name="nombre" value="${h(c.nombre)}"></label>
    <div class="acciones">${nuevo ? '' : '<button type="button" class="btn btn--peligro" data-a="borrarCliente" data-id="' + h(c.codigo) + '">Borrar</button>'}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}

/* ================= manejo de formularios ================= */
function leerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.name.startsWith('c_')) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked; else o[el.name] = el.value;
  }
  return o;
}
const FORMS = {
  gasto: guardarGasto,
  trabajo: guardarTrabajo,
  marcar(form, d) { const cb = formMarcar.cb; formMarcar.cb = null; cerrarHoja(); cb && cb(d); },
  equipo(form, d) {
    const id = form.dataset.id;
    const v = leerMonto(d.valor);
    const usd = d.moneda === 'USD' ? v : +(v / mep()).toFixed(2);
    const e = id ? D.equipo.find(x => x.id === id) : { id: uid() };
    Object.assign(e, { item: d.item.trim(), categoria: d.categoria, usd, fechaCompra: d.fechaCompra, serie: d.serie.trim(), nota: d.nota.trim() });
    if (!id) D.equipo.push(e);
    guardar(); cerrarHoja(); toast('Equipo guardado'); pintar();
  },
  compra(form, d) {
    const id = form.dataset.id;
    const c = id ? D.compras.find(x => x.id === id) : { id: uid(), creado: hoyISO() };
    Object.assign(c, { item: d.item.trim(), precio: leerMonto(d.precio), moneda: d.moneda, meses: Math.max(1, parseInt(d.meses) || 1), ahorrado: leerMonto(d.ahorrado) });
    if (!id) D.compras.push(c);
    guardar(); cerrarHoja(); toast('Compra guardada'); pintar();
  },
  sumarAhorro(form, d) {
    const c = D.compras.find(x => x.id === form.dataset.id); const n = leerMonto(d.monto); if (!n) return;
    c.ahorrado = (c.ahorrado || 0) + n; guardar(); toast('Ahorro sumado'); pintar(); verCompra(c);
  },
  fijo(form, d) {
    const id = form.dataset.id;
    const f = id ? D.fijos.find(x => x.id === id) : { id: uid(), desde: mesActual() };
    Object.assign(f, { descripcion: d.descripcion.trim(), monto: leerMonto(d.monto), moneda: d.moneda, dia: Math.min(28, Math.max(1, parseInt(d.dia) || 1)), categoria: d.categoria, medio: d.medio, activo: !!d.activo });
    if (!id) D.fijos.push(f);
    // actualizar el pendiente de este mes si todavía no se pagó
    const g = D.gastos.find(x => x.fijoId === f.id && mesDe(x.fecha) === mesActual() && !x.pagado);
    if (g) { if (!f.activo) D.gastos = D.gastos.filter(x => x !== g); else Object.assign(g, { descripcion: f.descripcion, monto: f.monto, moneda: f.moneda, categoria: f.categoria, medio: f.medio }); }
    generarFijos(); guardar(); cerrarHoja(); toast('Gasto fijo guardado'); pintar();
  },
  cliente(form, d) {
    const viejo = form.dataset.id; const cod = d.codigo.toUpperCase().replace(/[^A-ZÑ0-9]/g, '').slice(0, 3);
    if (cod.length < 2) return toast('El código lleva 3 letras');
    if (cod !== viejo && D.clientes.some(c => c.codigo === cod)) return toast('Ese código ya existe');
    let c = D.clientes.find(x => x.codigo === viejo);
    if (!c) { c = { codigo: cod, nombre: '' }; D.clientes.push(c); }
    if (viejo && cod !== viejo) D.trabajos.forEach(t => { if (t.cliente === viejo) t.cliente = cod; });
    c.codigo = cod; c.nombre = d.nombre.trim();
    guardar(); cerrarHoja(); toast('Cliente guardado'); pintar();
  },
  agregarALista(form, d) {
    const l = D.listas[form.dataset.lista]; const v = d.valor.trim();
    if (!v || l.includes(v)) return toast(v ? 'Ya está en la lista' : 'Escribí un nombre');
    l.push(v); guardar(); pintar(); abrirDetalle(form.dataset.lista);
  },
  sheet(form, d) { conectarSheet(d.url.trim(), d.clave.trim()); },
  mepManual(form, d) { A().mepManual = leerMonto(d.valor); guardar({ respaldo: false }); pintar(); toast(A().mepManual ? 'MEP fijado a mano' : 'MEP automático'); if (!A().mepManual) actualizarMep(true); },
  numero(form, d) { A()[form.dataset.k] = leerMonto(d.valor); guardar(); pintar(); toast('Guardado'); },
  equilibrio(form, d) {
    A().metaSueldo = leerMonto(d.sueldo); A().ticket = leerMonto(d.ticket); A().vidaUtil = Math.max(1, parseInt(d.vida) || 4);
    guardar(); pintar(); toast('Guardado');
  }
};
function abrirDetalle(lista) {
  const el = $(`[data-lista="${lista}"]`)?.closest('details'); if (el) { el.open = true; const i = $('form input', el); i && i.focus(); }
}

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]'); if (!form) return;
  ev.preventDefault();
  FORMS[form.dataset.form]?.(form, leerForm(form));
});

/* ================= acciones (clicks) ================= */
const ACC = {
  cerrar: cerrarHoja,
  ir(el) { UI.tab = el.dataset.v; if (el.dataset.f) { if (UI.tab === 'trabajos') UI.filtroT = el.dataset.f; else UI.filtroG = el.dataset.f; } pintar(); scrollTo(0, 0); },
  mes(el) { UI.mes = sumarMes(UI.mes, +el.dataset.v); UI.sel = null; pintar(); },
  per(el) { UI.per = el.dataset.v; UI.sel = null; pintar(); },
  anio(el) { UI.anio += +el.dataset.v; UI.sel = null; pintar(); },
  grafSel(el) { UI.sel = +el.dataset.i; pintar(); },
  filtroT(el) { UI.filtroT = el.dataset.v; pintar(); },
  filtroG(el) { UI.filtroG = el.dataset.v; pintar(); },
  moneda(el) {
    const g = el.closest('[data-grupo="moneda"]'); $('input', g).value = el.dataset.v;
    $$('button', g).forEach(b => b.classList.toggle('is-on', b === el)); recalcCobros();
  },
  chip(el) {
    const g = el.closest('[data-chips]'); const multi = g.dataset.multi === '1';
    if (multi) el.classList.toggle('is-on'); else $$('.chip', g).forEach(b => b.classList.toggle('is-on', b === el));
    $('input', g).value = $$('.chip.is-on', g).map(b => b.dataset.v).join('|');
  },
  // gastos
  editarGasto(el) { formGasto(D.gastos.find(g => g.id === el.dataset.id)); },
  borrarGasto(el) {
    const g = D.gastos.find(x => x.id === el.dataset.id);
    const aBorrar = g.grupo && g.cuotas > 1 ? D.gastos.filter(x => x.grupo === g.grupo) : [g];
    const enPersonal = aBorrar.some(x => P().movs.some(m => m.deFara === x.id));
    if (!confirm((aBorrar.length > 1 ? `¿Borrar las ${g.cuotas} cuotas de "${g.descripcion || g.categoria}"?` : '¿Borrar este gasto?') + (enPersonal ? ' También se borra de Personal.' : ''))) return;
    D.gastos = D.gastos.filter(x => !aBorrar.includes(x));
    P().movs = P().movs.filter(m => !aBorrar.some(x => x.id === m.deFara));
    guardar(); cerrarHoja(); pintar(); toast('Borrado');
  },
  // trabajos
  verTrabajo(el) { verTrabajo(D.trabajos.find(t => t.id === el.dataset.id)); },
  editarTrabajo(el) { formTrabajo(D.trabajos.find(t => t.id === el.dataset.id)); },
  borrarTrabajo(el) { if (!confirm('¿Borrar este trabajo y sus cobros?')) return; D.trabajos = D.trabajos.filter(t => t.id !== el.dataset.id); guardar(); cerrarHoja(); pintar(); toast('Trabajo borrado'); },
  marcarCobro(el) {
    const t = D.trabajos.find(x => x.id === el.dataset.id); const c = t.cobros.find(x => x.id === el.dataset.c);
    formMarcar(`Cobro de ${plata(c.monto, t.moneda)}`, t.medio || A().medioCobro, (d) => {
      Object.assign(c, { pagado: true, fechaPago: d.fecha || hoyISO(), medio: d.medio, mep: mep() });
      A().medioCobro = d.medio; guardar(); pintar(); toast('Cobro registrado'); verTrabajo(t);
    });
  },
  agregarCobro() { const cont = $('[data-cobros]'); cont.insertAdjacentHTML('beforeend', filaCobro({ concepto: 'Saldo', monto: 0, pagado: false }, cont.children.length)); marcarTocados(); recalcCobros(); },
  quitarCobro(el) { el.closest('[data-cobro]').remove(); recalcCobros(); },
  senaSaldo() {
    const f = $('form[data-form="trabajo"]'); const total = leerMonto(f.total.value);
    if (!total) return toast('Primero poné el precio total');
    const mitad = Math.round(total / 2);
    $('[data-cobros]').innerHTML = filaCobro({ concepto: 'Seña', monto: mitad, pagado: true, fechaPago: hoyISO() }, 0) + filaCobro({ concepto: 'Saldo', monto: total - mitad, pagado: false, vence: '' }, 1);
    marcarTocados(); recalcCobros();
  },
  // equipo y compras
  nuevoEquipo() { formEquipo(); },
  editarEquipo(el) { formEquipo(D.equipo.find(e => e.id === el.dataset.id)); },
  borrarEquipo(el) { if (!confirm('¿Borrar este equipo del inventario?')) return; D.equipo = D.equipo.filter(e => e.id !== el.dataset.id); guardar(); cerrarHoja(); pintar(); },
  nuevaCompra() { formCompra(); },
  verCompra(el) { verCompra(D.compras.find(c => c.id === el.dataset.id)); },
  editarCompra(el) { formCompra(D.compras.find(c => c.id === el.dataset.id)); },
  borrarCompra(el) { if (!confirm('¿Borrar esta compra planeada?')) return; D.compras = D.compras.filter(c => c.id !== el.dataset.id); guardar(); cerrarHoja(); pintar(); },
  comprado(el) {
    const c = D.compras.find(x => x.id === el.dataset.id);
    if (!c.precio) return toast('Primero cargale el precio');
    if (!confirm(`¿Pasar "${c.item}" al inventario y cargar el gasto de ${plata(c.precio, c.moneda)}?`)) return;
    D.equipo.push({ id: uid(), categoria: D.listas.equipo[0], item: c.item, usd: c.moneda === 'USD' ? c.precio : +(c.precio / mep()).toFixed(2), fechaCompra: hoyISO(), serie: '', nota: '' });
    D.gastos.push({ id: uid(), fecha: hoyISO(), fechaPago: hoyISO(), descripcion: c.item, categoria: D.listas.gasto.includes('Equipo') ? 'Equipo' : D.listas.gasto[0], monto: c.precio, moneda: c.moneda, medio: A().medioGasto, pagado: true, vence: '', mep: mep(), nota: 'Compra planeada' });
    sincPersonal(D.gastos.at(-1));
    D.compras = D.compras.filter(x => x !== c);
    guardar(); cerrarHoja(); pintar(); toast('Listo: ya está en tu inventario');
  },
  // ajustes
  nuevoFijo() { formFijo(); },
  editarFijo(el) { formFijo(D.fijos.find(f => f.id === el.dataset.id)); },
  borrarFijo(el) {
    if (!confirm('¿Borrar este gasto fijo? Los gastos ya cargados quedan.')) return;
    const id = el.dataset.id; D.fijos = D.fijos.filter(f => f.id !== id);
    D.gastos = D.gastos.filter(g => !(g.fijoId === id && !g.pagado));
    guardar(); cerrarHoja(); pintar();
  },
  nuevoCliente() { formCliente(); },
  editarCliente(el) { formCliente(D.clientes.find(c => c.codigo === el.dataset.id)); },
  borrarCliente(el) {
    const cod = el.dataset.id;
    if (D.trabajos.some(t => t.cliente === cod)) return toast('Tiene trabajos cargados, no se puede borrar');
    D.clientes = D.clientes.filter(c => c.codigo !== cod); guardar(); cerrarHoja(); pintar();
  },
  quitarDeLista(el) {
    const l = D.listas[el.dataset.lista]; const v = l[+el.dataset.i];
    if (l.length <= 1) return toast('Tiene que quedar al menos una');
    if (!confirm(`¿Quitar "${v}"? Lo ya cargado conserva el nombre.`)) return;
    l.splice(+el.dataset.i, 1); guardar(); pintar(); abrirDetalle(el.dataset.lista);
  },
  actualizarMep() { actualizarMep(true); },
  tema(el) { elegirTema(el.dataset.v); },
  temaRapido() { elegirTema(esOscuro() ? 'claro' : 'oscuro'); },
  async actualizarApp() {
    if (!navigator.onLine) return toast('Necesitás internet para actualizar');
    toast('Buscando la última versión…');
    try {
      if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    } catch (e) { }
    location.replace(location.pathname + '?v=' + Date.now());
  },
  restaurar() { restaurar(); },
  exportarJSON() { descargar(`fara-finanzas-${hoyISO()}.json`, JSON.stringify(D, null, 1), 'application/json'); },
  exportarCSV() {
    const t = tablas(); let out = '';
    for (const [n, tb] of Object.entries(t)) { if (n.startsWith('_')) continue; out += `${n}\n` + [tb.cols, ...tb.rows].map(r => r.map(csv).join(';')).join('\n') + '\n\n'; }
    descargar(`fara-finanzas-${hoyISO()}.csv`, '﻿' + out, 'text/csv');
  },
  borrarTodo() {
    if (!confirm('Esto borra todos los datos de este teléfono. El Sheet de respaldo no se toca. ¿Seguro?')) return;
    if (!confirm('Última confirmación: ¿borrar todo?')) return;
    const keep = { sheetUrl: A().sheetUrl, sheetClave: A().sheetClave };
    D = asegurarPersonal(datosIniciales()); Object.assign(D.ajustes, keep); D.ajustes.pendiente = false;
    guardar({ respaldo: false }); pintar(); toast('Listo, empezás de cero');
  }
};
function marcarTocados() { $$('[name="c_monto"]').forEach(i => i.dataset.tocado = '1'); }

document.addEventListener('click', (ev) => {
  const tab = ev.target.closest('#nav button');
  if (tab) { UI.tab = tab.dataset.tab; pintar(); scrollTo(0, 0); return; }
  if (ev.target.closest('#fab')) return menuNuevo();
  if (ev.target.id === 'velo') return cerrarHoja();
  const el = ev.target.closest('[data-a]');
  if (!el || el.tagName === 'INPUT') return;
  const f = ACC[el.dataset.a]; if (f) { ev.preventDefault(); f(el); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.name === 'total') recalcCobros();
  if (el.name === 'c_monto') { el.dataset.tocado = '1'; recalcCobros(); }
  if (el.dataset.a === 'cliente') {
    el.value = el.value.toUpperCase();
    const n = $('[data-nombre-cliente]'); const existe = clienteNombre(el.value);
    if (n) n.hidden = !!existe || el.value.length < 3;
  }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.a === 'interr') {
    const form = el.form;
    $$(`[data-si="${el.name}"]`, form).forEach(x => x.hidden = !el.checked);
    $$(`[data-no="${el.name}"]`, form).forEach(x => x.hidden = el.checked);
  }
  if (el.dataset.a === 'toggle') { A()[el.dataset.k] = el.checked; guardar(); pintar(); }
  if (el.dataset.a === 'renombrar') renombrar(el.dataset.lista, +el.dataset.i, el.value.trim());
  if (el.dataset.a === 'importar' && el.files[0]) importar(el.files[0]);
  if (el.name === 'c_pagado') { const lab = el.closest('[data-cobro]').querySelector('[name="c_fecha"]'); lab.previousElementSibling.textContent = el.value === '1' ? 'Cobrado el' : 'Vence el'; if (el.value === '1' && !lab.value) lab.value = hoyISO(); }
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#hoja').hidden) cerrarHoja(); });

function renombrar(lista, i, nuevo) {
  const l = D.listas[lista]; const viejo = l[i];
  if (!nuevo || nuevo === viejo) return pintar();
  if (l.includes(nuevo)) { toast('Ya existe ese nombre'); return pintar(); }
  l[i] = nuevo;
  const cambiar = (arr, k) => arr.forEach(x => { if (x[k] === viejo) x[k] = nuevo; });
  if (lista === 'gasto') { cambiar(D.gastos, 'categoria'); cambiar(D.fijos, 'categoria'); }
  if (lista === 'equipo') cambiar(D.equipo, 'categoria');
  if (lista === 'medio') { cambiar(D.gastos, 'medio'); cambiar(D.fijos, 'medio'); cambiar(D.trabajos, 'medio'); D.trabajos.forEach(t => cambiar(t.cobros, 'medio')); if (A().medioGasto === viejo) A().medioGasto = nuevo; if (A().medioCobro === viejo) A().medioCobro = nuevo; }
  if (lista === 'servicio') D.trabajos.forEach(t => { t.servicios = t.servicios.map(s => s === viejo ? nuevo : s); });
  guardar(); toast('Renombrado'); pintar(); abrirDetalle(lista);
}

function menuNuevo() {
  if (UI.modo === 'personal') return pFormMov();
  if (UI.tab === 'gastos') return formGasto();
  if (UI.tab === 'trabajos') return formTrabajo();
  if (UI.tab === 'equipo') return formEquipo();
  abrirHoja('Cargar', `<div class="menu-nuevo">
    <button class="btn btn--primario" data-a="nuevo" data-v="gasto">${ICO.gasto} Gasto</button>
    <button class="btn btn--secundario" data-a="nuevo" data-v="trabajo">${ICO.trabajo} Trabajo</button>
    <button class="btn btn--suave" data-a="nuevo" data-v="equipo">${ICO.equipo} Equipo</button></div>`);
}
ACC.nuevo = (el) => { cerrarHoja(); ({ gasto: formGasto, trabajo: formTrabajo, equipo: formEquipo })[el.dataset.v](); };

/* ================= archivos ================= */
const csv = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo })); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function importar(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result); if (d.v !== 1 || !d.ajustes) throw 0;
      if (!confirm('Esto reemplaza los datos de este teléfono por los de la copia. ¿Seguir?')) return;
      D = asegurarPersonal(d); guardar(); pintar(); toast('Copia cargada');
    } catch (e) { toast('Ese archivo no es una copia de FÁRA Finanzas'); }
  };
  r.readAsText(file);
}

/* ================= dólar MEP ================= */
async function actualizarMep(avisar = false) {
  if (!navigator.onLine) { if (avisar) toast('Sin conexión: uso el último MEP guardado'); return; }
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/bolsa', { cache: 'no-store' });
    const j = await r.json();
    const v = j.venta || j.compra; if (!v) throw 0;
    A().mep = v; A().mepFecha = new Date().toISOString();
    guardar({ respaldo: false }); pintar(); if (avisar) toast(`MEP actualizado: ${plata(v)}`);
  } catch (e) { if (avisar) toast('No pude traer el MEP. Probá más tarde o cargalo a mano'); }
}

/* ================= respaldo en Google Sheets ================= */
function tablas() {
  const T = (cols, rows) => ({ cols, rows });
  const cobros = [];
  for (const t of D.trabajos) for (const c of t.cobros) cobros.push([t.id, t.cliente, t.descripcion, c.concepto, c.monto, t.moneda, c.pagado ? 'Cobrado' : 'Por cobrar', c.vence, c.fechaPago, c.medio, c.mep || '', Math.round(aARS(c.monto, t.moneda, c.mep || t.mep))]);
  return {
    Trabajos: T(['id', 'Fecha', 'Cliente', 'Nombre cliente', 'Descripción', 'Servicios', 'Total', 'Moneda', 'Cobrado', 'Saldo', 'Facturado', 'N.º factura', 'Medio', 'Nota'],
      D.trabajos.map(t => { const x = totalesTrabajo(t); return [t.id, t.fecha, t.cliente, clienteNombre(t.cliente), t.descripcion, t.servicios.join(', '), t.total, t.moneda, x.cobrado, x.saldo, t.facturado ? 'Sí' : 'No', t.factura, t.medio, t.nota]; })),
    Cobros: T(['id trabajo', 'Cliente', 'Trabajo', 'Concepto', 'Monto', 'Moneda', 'Estado', 'Vence', 'Fecha de cobro', 'Medio', 'MEP del día', 'Monto en $'], cobros),
    Gastos: T(['id', 'Fecha', 'Descripción', 'Categoría', 'Monto', 'Moneda', 'Medio', 'Estado', 'Vence', 'Fecha de pago', 'MEP del día', 'Monto en $', 'Fijo', 'Cuota', 'Nota'],
      D.gastos.map(g => [g.id, g.fecha, g.descripcion, g.categoria, g.monto, g.moneda, g.medio, g.pagado ? 'Pagado' : 'Por pagar', g.vence, g.fechaPago, g.mep || '', Math.round(aARS(g.monto, g.moneda, g.mep)), g.fijoId ? 'Sí' : 'No', g.cuotas > 1 ? `${g.cuotaN}/${g.cuotas}` : '', g.nota])),
    Equipo: T(['id', 'Categoría', 'Ítem', 'Valor US$', 'Valor $ (MEP hoy)', 'Fecha de compra', 'N.º de serie', 'Nota'],
      D.equipo.map(e => [e.id, e.categoria, e.item, e.usd, Math.round(e.usd * mep()), e.fechaCompra, e.serie, e.nota])),
    'Gastos fijos': T(['id', 'Nombre', 'Categoría', 'Monto', 'Moneda', 'Día', 'Medio', 'Activo'],
      D.fijos.map(f => [f.id, f.descripcion, f.categoria, f.monto, f.moneda, f.dia, f.medio, f.activo ? 'Sí' : 'No'])),
    Compras: T(['id', 'Ítem', 'Precio', 'Moneda', 'Meses', 'Ahorrado', 'Por mes'],
      D.compras.map(c => [c.id, c.item, c.precio, c.moneda, c.meses, c.ahorrado, Math.round(planCompra(c).porMes * 100) / 100])),
    Clientes: T(['Código', 'Nombre'], D.clientes.map(c => [c.codigo, c.nombre])),
    Reservas: T(['Tipo', 'Fecha', 'Monto', 'Movimiento', 'Nota'], (D.reservas ? D.reservas.movs : []).map(m => [TIPOS_RES[m.tipo].nombre, m.fecha, m.monto, m.monto < 0 ? 'Usado' : 'Apartado', m.nota])),
    'P · Movimientos': T(['id', 'Tipo', 'Fecha', 'Descripción', 'Categoría', 'Va a', 'Monto', 'Moneda', 'Compartido', 'Tu parte %', 'Tu parte $', 'Medio', 'Estado', 'Vence', 'Cuota', 'Fijo', 'Nota'],
      D.personal.movs.map(m => [m.id, m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', fechaMov(m), m.descripcion, m.categoria, destinoTexto(m), m.monto, m.moneda, m.compartido ? 'Sí' : 'No', m.compartido ? m.parte : 100,
        Math.round(miARS(m, m.mep || mep())), m.medio, m.pagado ? (m.tipo === 'ingreso' ? 'Cobrado' : 'Pagado') : (m.tipo === 'ingreso' ? 'Por cobrar' : 'Por pagar'), m.vence, m.cuotas > 1 ? `${m.cuotaN}/${m.cuotas}` : '', m.fijoId ? 'Sí' : 'No', m.nota])),
    'P · Fijos': T(['id', 'Tipo', 'Nombre', 'Categoría', 'Monto', 'Moneda', 'Día', 'Medio', 'Compartido', 'Tu parte %', 'Activo'],
      D.personal.fijos.map(f => [f.id, f.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', f.descripcion, f.categoria, f.monto, f.moneda, f.dia, f.medio, f.compartido ? 'Sí' : 'No', f.compartido ? f.parte : 100, f.activo ? 'Sí' : 'No'])),
    'P · Ahorro': T(['Meta', 'Objetivo', 'Moneda', 'Ahorrado', 'Para cuándo', 'Fondo'],
      D.personal.metas.map(m => [m.nombre, m.objetivo, m.moneda, pAhorrado(m), m.fecha, (D.personal.fondos.find(f => f.id === m.fondo) || {}).nombre || ''])),
    'P · Aportes': T(['Meta', 'Fecha', 'Monto', 'Moneda', 'Origen'],
      D.personal.metas.flatMap(m => [...(m.aportes || []).map(ap => [m.nombre, ap.fecha, ap.monto, m.moneda, 'Directo en la meta']),
        ...movsDeMeta(m).map(x => [m.nombre, fechaMov(x), x.monto * parteDe(x), x.moneda, 'Desde movimientos'])]))
  };
}
let timerResp, respaldando = false, conectando = false;
function programarRespaldo() { clearTimeout(timerResp); timerResp = setTimeout(() => respaldar(false), 2500); }
async function respaldar(avisar) {
  const a = A();
  if (conectando || !a.sheetUrl || !a.pendiente && !avisar) return;
  if (!navigator.onLine) { if (avisar) toast('Sin conexión: se sube cuando vuelva internet'); return; }
  if (respaldando) return; respaldando = true;
  try {
    const cuerpo = JSON.stringify({ clave: a.sheetClave, tablas: tablas(), respaldo: JSON.stringify(D), version: VERSION });
    const r = await fetch(a.sheetUrl, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error');
    a.pendiente = false; a.ultimoRespaldo = new Date().toISOString();
    localStorage.setItem(CLAVE_LS, JSON.stringify(D));
    if (avisar) toast('Respaldado en tu Sheet');
  } catch (e) {
    if (avisar) toast(e.message === 'Clave incorrecta' ? 'La clave no coincide con la del script' : 'No se pudo respaldar. Revisá el enlace');
  } finally { respaldando = false; pintarEstado(); if (UI.tab === 'ajustes') pintar(); }
}
async function restaurar(sinPreguntar = false) {
  const a = A();
  if (!navigator.onLine) return toast('Necesitás internet para traer los datos');
  if (!sinPreguntar && !confirm('Esto reemplaza lo que hay en este teléfono por lo último respaldado en el Sheet. ¿Seguir?')) return;
  try {
    const r = await fetch(`${a.sheetUrl}?clave=${encodeURIComponent(a.sheetClave)}`);
    const j = await r.json();
    if (!j.ok || !j.respaldo) throw new Error(j.error || 'vacío');
    const d = JSON.parse(j.respaldo);
    d.ajustes.sheetUrl = a.sheetUrl; d.ajustes.sheetClave = a.sheetClave; d.ajustes.pendiente = false;
    D = asegurarPersonal(d); guardar({ respaldo: false }); pintar(); toast('Datos recuperados');
  } catch (e) { toast('No encontré un respaldo en el Sheet'); }
}

/* Al conectar un dispositivo: si el Sheet ya tiene datos, primero pregunta, así no pisa lo cargado en otro lado. */
async function conectarSheet(url, clave) {
  clearTimeout(timerResp); conectando = true;
  A().sheetUrl = url; A().sheetClave = clave;
  guardar({ respaldo: false }); pintar();
  if (!url) { conectando = false; return; }
  if (!navigator.onLine) { conectando = false; return toast('Guardado. Conectate a internet para terminar de vincular'); }
  let remoto = null;
  try {
    const r = await fetch(`${url}?clave=${encodeURIComponent(clave)}`);
    const j = await r.json();
    if (!j.ok && j.error === 'Clave incorrecta') { conectando = false; return toast('La clave no coincide con la del script'); }
    if (j.ok && j.respaldo) remoto = j.respaldo;
  } catch (e) { conectando = false; return toast('No pude conectar. Revisá el enlace'); }
  conectando = false;
  if (remoto) {
    if (confirm('Este Sheet ya tiene datos cargados desde otro dispositivo.\n\nAceptar: traerlos a este dispositivo (recomendado).\nCancelar: reemplazarlos por los de acá.')) return restaurar(true);
    if (!confirm('¿Seguro? Se borran del Sheet los datos del otro dispositivo y quedan los de acá.')) return toast('No se cambió nada');
  }
  A().pendiente = true; respaldar(true);
}

/* ================= arranque ================= */
window.addEventListener('online', () => { pintarEstado(); respaldar(false); actualizarMep(); });
window.addEventListener('offline', pintarEstado);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { generarFijos(); respaldar(false); } });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (recargado) return; recargado = true; location.reload(); });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

function arrancar() {
  generarFijos();
  guardar({ respaldo: !!A().pendiente });
  pintar();
  const horasMep = A().mepFecha ? (Date.now() - new Date(A().mepFecha)) / 36e5 : 99;
  if (horasMep > 3) actualizarMep();
  if (A().pendiente) respaldar(false);
}
