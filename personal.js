/* FÁRA Finanzas · sección Personal. Usa las utilidades de app.js (se carga después). */
'use strict';

/* ================= datos ================= */
function personalInicial() {
  const fid = () => uid();
  return {
    listas: {
      gasto: ['Vivienda', 'Servicios', 'Alimentación', 'Transporte', 'Salud', 'Suscripciones', 'Salidas', 'Deporte', 'Ropa', 'Inversiones', 'Otros'],
      ingreso: ['Sueldo', 'FÁRA', 'Otros'],
      medio: ['Efectivo', 'Transferencia', 'Mercado Pago', 'Tarjeta de débito', 'Tarjeta de crédito']
    },
    movs: [], fijos: [], metas: [],
    fondos: [
      { id: fid(), nombre: 'Gastos esenciales', ideal: 50, cats: ['Vivienda', 'Servicios', 'Alimentación', 'Transporte', 'Salud'] },
      { id: fid(), nombre: 'Gustos', ideal: 10, cats: ['Suscripciones', 'Salidas', 'Deporte', 'Ropa'] },
      { id: fid(), nombre: 'Ahorro', ideal: 20, cats: [] },
      { id: fid(), nombre: 'Emergencia', ideal: 10, cats: [] },
      { id: fid(), nombre: 'Inversión', ideal: 10, cats: ['Inversiones'] }
    ],
    medioGasto: 'Tarjeta de débito'
  };
}
function asegurarPersonal(d) { if (!d.personal) d.personal = personalInicial(); return d; }
asegurarPersonal(D);
const P = () => D.personal;

/* mi parte de un movimiento, en pesos */
const parteDe = (m) => (m.tipo === 'gasto' && m.compartido ? (m.parte ?? 50) / 100 : 1);
const miARS = (m, cot) => aARS(m.monto * parteDe(m), m.moneda, cot ?? m.mep);
const fechaMov = (m) => m.pagado ? (m.fechaPago || m.fecha) : m.fecha;

function pDelMes(ym, tipo) {
  return P().movs.filter(m => m.tipo === tipo && m.pagado && mesDe(fechaMov(m)) === ym).map(m => ({ m, ars: miARS(m) }));
}
function pPendientes(tipo) {
  const hoy = hoyISO();
  return P().movs.filter(m => m.tipo === tipo && !m.pagado).map(m => ({ m, ars: miARS(m, mep()), atrasado: !!(m.vence && m.vence < hoy) }))
    .sort((a, b) => (a.m.vence || '9').localeCompare(b.m.vence || '9'));
}
function pAportesDelMes(ym) {
  const out = [];
  for (const meta of P().metas) for (const ap of meta.aportes || []) if (mesDe(ap.fecha) === ym) out.push({ meta, ap, ars: aARS(ap.monto, meta.moneda, ap.mep) });
  return out;
}
const pAhorrado = (meta) => (meta.aportes || []).reduce((s, a) => s + a.monto, 0);

function pGenerarFijos() {
  const ym = mesActual(); let cambio = false;
  for (const f of P().fijos) {
    if (!f.activo || (f.desde && f.desde > ym)) continue;
    if (P().movs.some(m => m.fijoId === f.id && mesDe(m.fecha) === ym)) continue;
    const dia = String(Math.min(28, Math.max(1, f.dia || 1))).padStart(2, '0');
    P().movs.push({
      id: uid(), fijoId: f.id, tipo: f.tipo, fecha: `${ym}-${dia}`, vence: `${ym}-${dia}`, descripcion: f.descripcion, categoria: f.categoria,
      monto: f.monto, moneda: f.moneda, medio: f.medio, compartido: !!f.compartido, parte: f.parte ?? 50,
      pagado: false, fechaPago: '', mep: 0, nota: f.tipo === 'ingreso' ? 'Ingreso fijo' : 'Gasto fijo'
    });
    cambio = true;
  }
  if (cambio) guardar();
}

/* ================= vista: MES ================= */
function pVistaMes() {
  const ym = UI.mes;
  const ing = pDelMes(ym, 'ingreso'), gas = pDelMes(ym, 'gasto');
  const entro = ing.reduce((s, x) => s + x.ars, 0), salio = gas.reduce((s, x) => s + x.ars, 0);
  const queda = entro - salio;
  const pc = pPendientes('ingreso'), pp = pPendientes('gasto');
  const porCobrar = pc.reduce((s, x) => s + x.ars, 0), porPagar = pp.reduce((s, x) => s + x.ars, 0);
  const atrP = pp.filter(x => x.atrasado).length;
  const cuotasMes = P().movs.filter(m => m.cuotas > 1 && mesDe(m.fecha) === ym);
  const futuras = P().movs.filter(m => m.cuotas > 1 && mesDe(m.fecha) > ym);
  const mesesFut = new Set(futuras.map(m => mesDe(m.fecha))).size;
  const aportes = pAportesDelMes(ym).reduce((s, x) => s + x.ars, 0);
  const vence = pp.filter(x => x.atrasado || mesDe(x.m.vence) === ym).slice(0, 8);

  return `
  <div class="mesbar">
    <button class="flecha" data-a="mes" data-v="-1" aria-label="Mes anterior">${ICO.izq}</button>
    <h1 class="titulo">${nombreMes(ym)}</h1>
    <button class="flecha" data-a="mes" data-v="1" aria-label="Mes siguiente">${ICO.der}</button>
  </div>

  <section class="bloque bloque--oscuro">
    <p class="etiqueta">Te queda este mes</p>
    <p class="grande num" style="margin:10px 0 2px">${plata(queda)}</p>
    <p class="micro num">US$ ${fmtUSD.format(Math.round(aUSD(queda)))} al dólar MEP de hoy</p>
    <hr class="sep" style="background:rgba(242,235,221,.14)">
    <div class="grilla2">
      <div class="pila"><span class="micro">Entró</span><span class="subtitulo num">${plata(entro)}</span></div>
      <div class="pila"><span class="micro">Salió (tu parte)</span><span class="subtitulo num">${plata(salio)}</span></div>
    </div>
  </section>

  <div class="grilla2">
    <button class="bloque item" style="margin:0;flex-direction:column;align-items:flex-start" data-a="pIrMovs" data-f="pend">
      <span class="micro">Por pagar</span><span class="subtitulo num">${plata(porPagar)}</span>
      ${atrP ? `<span class="estado estado--mal">${atrP} vencido${atrP > 1 ? 's' : ''}</span>` : `<span class="micro">${pp.length} pago${pp.length === 1 ? '' : 's'}</span>`}
    </button>
    <button class="bloque item" style="margin:0;flex-direction:column;align-items:flex-start" data-a="pIrMovs" data-f="ingreso">
      <span class="micro">Por cobrar</span><span class="subtitulo num">${plata(porCobrar)}</span>
      <span class="micro">${pc.length} ingreso${pc.length === 1 ? '' : 's'}</span>
    </button>
  </div>

  ${vence.length ? `<section class="bloque"><p class="etiqueta">Vencimientos</p><div class="lista">${vence.map(x => `
    <button class="item item--plano" data-a="pEditar" data-id="${x.m.id}">
      <span class="item__cuerpo"><span class="item__titulo">${h(x.m.descripcion || x.m.categoria)}</span>
      <span class="micro ${x.atrasado ? 'mal' : ''}">${x.atrasado ? 'Venció el ' : 'Vence el '}${fechaCorta(x.m.vence)}${x.m.compartido ? ` · tu parte ${x.m.parte}%` : ''}</span></span>
      <span class="item__monto num">${plata(x.m.monto * parteDe(x.m), x.m.moneda)}</span></button>`).join('')}</div></section>` : ''}

  <section class="bloque">
    <p class="etiqueta">Cuotas</p>
    ${cuotasMes.length ? `<div class="lista">${cuotasMes.map(m => `
      <button class="item item--plano" data-a="pEditar" data-id="${m.id}">
        <span class="item__cuerpo"><span class="item__titulo">${h(m.descripcion || m.categoria)}</span><span class="micro">Cuota ${m.cuotaN} de ${m.cuotas}</span></span>
        <span class="item__monto num">${plata(m.monto * parteDe(m), m.moneda)}</span></button>`).join('')}</div>` : '<p class="micro" style="margin-top:8px">No tenés cuotas este mes.</p>'}
    ${futuras.length ? `<p class="chico" style="margin-top:12px">Ya tenés comprometidos <strong class="num">${plata(futuras.reduce((s, m) => s + miARS(m, mep()), 0))}</strong> en cuotas para los próximos ${mesesFut} mes${mesesFut > 1 ? 'es' : ''}.</p>` : ''}
  </section>

  <button class="item" data-a="ir" data-v="ahorro">
    <span class="codigo codigo--gasto">${ICO.ahorro}</span>
    <span class="item__cuerpo"><span class="item__titulo">Ahorro</span><span class="micro">${aportes ? `Separaste ${plata(aportes)} este mes` : 'Todavía no separaste nada este mes'}</span></span>
    <span class="item__monto num">${P().metas.length} meta${P().metas.length === 1 ? '' : 's'}</span></button>
  <button class="item" data-a="ir" data-v="analisis" style="margin-top:8px">
    <span class="codigo codigo--gasto">${ICO.analisis}</span>
    <span class="item__cuerpo"><span class="item__titulo">Ver gráficos y análisis</span><span class="micro">Evolución y gastos por categoría</span></span></button>`;
}

/* ================= vista: MOVIMIENTOS ================= */
function pVistaMovs() {
  const f = UI.pFiltro || 'mes';
  let lista = [...P().movs];
  if (f === 'mes') lista = lista.filter(m => mesDe(fechaMov(m)) === UI.mes || (!m.pagado && mesDe(m.fecha) === UI.mes));
  if (f === 'ingreso') lista = lista.filter(m => m.tipo === 'ingreso');
  if (f === 'gasto') lista = lista.filter(m => m.tipo === 'gasto' && !(m.cuotas > 1));
  if (f === 'pend') lista = lista.filter(m => !m.pagado);
  if (f === 'cuotas') lista = lista.filter(m => m.cuotas > 1);
  lista.sort((a, b) => fechaMov(b).localeCompare(fechaMov(a)));
  const agrupMes = f !== 'mes';
  const grupos = new Map();
  for (const m of lista) { const k = agrupMes ? mesDe(fechaMov(m)) : fechaMov(m); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); }
  const chip = (v, txt) => `<button class="chip ${f === v ? 'is-on' : ''}" data-a="pFiltro" data-v="${v}">${txt}</button>`;
  return `
  <h1 class="titulo">Movimientos</h1>
  <p class="chico sec" style="margin:0 0 12px">${f === 'mes' ? nombreMes(UI.mes) : 'Todos los meses'}</p>
  <div class="chips chips--scroll">${chip('mes', 'Este mes')}${chip('gasto', 'Gastos')}${chip('ingreso', 'Ingresos')}${chip('pend', 'Por pagar')}${chip('cuotas', 'Cuotas')}</div>
  ${lista.length ? [...grupos.entries()].map(([k, ms]) => `
    <p class="etiqueta grupo">${agrupMes ? nombreMes(k) : fechaLarga(k)}</p>
    <div class="lista">${ms.map(pItem).join('')}</div>`).join('')
    : `<div class="lista">${vacio('No hay movimientos acá.', 'Tocá + para cargar uno.')}</div>`}`;
}
function pItem(m) {
  const ing = m.tipo === 'ingreso';
  const atr = !m.pagado && m.vence && m.vence < hoyISO();
  const extra = [m.cuotas > 1 ? `Cuota ${m.cuotaN}/${m.cuotas}` : '', m.compartido ? `Compartido · ${m.parte}%` : ''].filter(Boolean).join(' · ');
  const est = m.pagado ? `<span class="micro">${h(m.categoria)}${extra ? ' · ' + extra : ''}</span>`
    : `<span class="estado ${atr ? 'estado--mal' : 'estado--pend'}">${ing ? 'Por cobrar' : atr ? 'Vencido' : 'Por pagar'}${m.vence ? ' · ' + fechaCorta(m.vence) : ''}</span>`;
  return `<button class="item" data-a="pEditar" data-id="${m.id}">
    <span class="codigo ${ing ? '' : 'codigo--gasto'}">${ing ? ICO.ingreso : m.fijoId ? ICO.fijo : m.cuotas > 1 ? ICO.cuotas : ICO.gasto}</span>
    <span class="item__cuerpo"><span class="item__titulo">${h(m.descripcion || m.categoria)}</span>${est}</span>
    <span class="item__monto num ${ing ? 'ok' : ''}">${ing ? '+ ' : ''}${plata(m.monto * parteDe(m), m.moneda)}</span></button>`;
}

/* ================= vista: AHORRO ================= */
function pVistaAhorro() {
  const ym = UI.mes;
  const ingresos = pDelMes(ym, 'ingreso').reduce((s, x) => s + x.ars, 0);
  const gas = pDelMes(ym, 'gasto'), aps = pAportesDelMes(ym);
  const totalIdeal = P().fondos.reduce((s, f) => s + (f.ideal || 0), 0);
  return `
  <h1 class="titulo">Ahorro</h1>
  <div class="fila" style="margin-top:14px"><h2 class="subtitulo">Metas</h2><button class="btn btn--suave btn--chico" data-a="pNuevaMeta">+ Nueva meta</button></div>
  <div class="lista">${P().metas.length ? P().metas.map(meta => {
    const ah = pAhorrado(meta), pct = meta.objetivo ? Math.min(100, ah / meta.objetivo * 100) : 0;
    let porMes = '';
    if (meta.objetivo && meta.fecha && ah < meta.objetivo) {
      const r = Math.max(1, mesesEntre(hoyISO(), meta.fecha));
      porMes = `${plata((meta.objetivo - ah) / r, meta.moneda)} por mes`;
    }
    return `<button class="item" data-a="pVerMeta" data-id="${meta.id}" style="flex-direction:column;align-items:stretch">
      <span class="fila"><span class="item__titulo">${h(meta.nombre)}</span><span class="num chico">${meta.objetivo ? plata(meta.objetivo, meta.moneda) : 'Sin objetivo'}</span></span>
      <span class="barra"><i style="width:${pct}%"></i></span>
      <span class="fila micro"><span>Ahorrado ${plata(ah, meta.moneda)}${meta.objetivo ? ` · ${Math.round(pct)} %` : ''}</span><span>${porMes}${meta.fecha ? ` · ${fechaCorta(meta.fecha)}` : ''}</span></span></button>`;
  }).join('') : vacio('Todavía no hay metas.', 'Creá una, por ejemplo “Vacaciones”.')}</div>

  <section class="bloque">
    <div class="fila"><p class="etiqueta">Fondos · ${nombreMes(ym)}</p><button class="link" data-a="ir" data-v="ajustes">Editar</button></div>
    <p class="micro" style="margin:6px 0 4px">Cómo repartiste lo que entró este mes (${plata(ingresos)}) contra tu reparto ideal.${totalIdeal !== 100 ? ` <span class="mal">Tus ideales suman ${totalIdeal} %.</span>` : ''}</p>
    ${P().fondos.map(f => {
      const enGastos = gas.filter(x => f.cats.includes(x.m.categoria)).reduce((s, x) => s + x.ars, 0);
      const enMetas = aps.filter(x => x.meta.fondo === f.id).reduce((s, x) => s + x.ars, 0);
      const real = enGastos + enMetas, pctReal = ingresos ? real / ingresos * 100 : 0;
      const ideal = f.ideal || 0;
      return `<div class="cat">
        <div class="fila chico"><span><strong>${h(f.nombre)}</strong></span><span class="num">${Math.round(pctReal)} % <span class="sec">de ${ideal} %</span></span></div>
        <div class="barra barra--fondo"><i style="width:${Math.min(100, pctReal)}%"></i><b style="left:${Math.min(100, ideal)}%"></b></div>
        <p class="micro num" style="margin:4px 0 0">${plata(real)}${ingresos ? ` · ideal ${plata(ingresos * ideal / 100)}` : ''}</p></div>`;
    }).join('')}
    <p class="micro" style="margin-top:8px">La rayita marca tu ideal. Los gastos cuentan por categoría y el ahorro por la meta a la que lo sumás.</p>
  </section>`;
}

/* ================= vista: ANÁLISIS ================= */
function pVistaAnalisis() {
  const meses = mesesPeriodo();
  const hoyM = mesActual();
  const d = meses.map(m => {
    const e = pDelMes(m, 'ingreso').reduce((s, x) => s + x.ars, 0), s = pDelMes(m, 'gasto').reduce((s2, x) => s2 + x.ars, 0);
    return { m, entro: e, salio: s, queda: e - s };
  });
  const pasados = meses.filter(m => m <= hoyM);
  const gas = pasados.flatMap(m => pDelMes(m, 'gasto')), ing = pasados.flatMap(m => pDelMes(m, 'ingreso'));
  const cats = agrupar(gas, x => x.m.categoria || 'Otros');
  const catsIng = agrupar(ing, x => x.m.categoria || 'Otros');
  const comp = gas.filter(x => x.m.compartido).reduce((s, x) => s + x.ars, 0);
  const chip = (v, txt) => `<button class="chip chip--chico ${UI.per === v ? 'is-on' : ''}" data-a="per" data-v="${v}">${txt}</button>`;
  const rango = pasados.length ? (pasados.length === 1 ? nombreMes(pasados[0]) : `${nombreMes(pasados[0])} a ${nombreMes(pasados[pasados.length - 1])}`) : '';
  return `
  <h1 class="titulo">Análisis</h1>
  <div class="chips chips--scroll" style="margin:12px -16px 4px">${chip('3', '3 meses')}${chip('6', '6 meses')}${chip('12', '12 meses')}${chip('Y', 'Año')}</div>
  ${UI.per === 'Y' ? `<div class="fila" style="justify-content:center;gap:16px;margin:8px 0 0">
    <button class="flecha flecha--chica" data-a="anio" data-v="-1" aria-label="Año anterior">${ICO.izq}</button><strong class="num">${UI.anio}</strong>
    <button class="flecha flecha--chica" data-a="anio" data-v="1" aria-label="Año siguiente">${ICO.der}</button></div>` : ''}
  <p class="micro" style="margin:8px 0 0">${rango}</p>
  ${pGraficos(d)}
  <section class="bloque">
    <p class="etiqueta">Gastos por categoría (tu parte)</p>
    ${barrasHTML(cats, 'barra--gasto')}
    ${comp ? `<p class="micro" style="margin-top:8px">De eso, ${plata(comp)} fueron gastos compartidos.</p>` : ''}
  </section>
  <section class="bloque">
    <p class="etiqueta">Ingresos por origen</p>
    ${barrasHTML(catsIng)}
  </section>`;
}
function pGraficos(d) {
  const n = d.length, hoyM = mesActual();
  const pasados = d.filter(x => x.m <= hoyM).length;
  const sel = UI.sel != null && UI.sel < pasados ? UI.sel : Math.max(0, pasados - 1);
  const W = 340, H = 150, izq = 34, arriba = 8, abajo = 20, alto = H - arriba - abajo;
  const gw = (W - izq) / n, cx = (i) => izq + gw * i + gw / 2;
  const toque = (x, i) => x.m <= hoyM ? `<rect x="${izq + gw * i}" y="0" width="${gw}" height="${H}" fill="transparent" data-a="grafSel" data-i="${i}" style="cursor:pointer"/>` : '';
  const eti = (x, i) => `<text x="${cx(i)}" y="${H - 4}" class="g-eje ${i === sel ? 'is-sel' : ''}" text-anchor="middle" ${x.m > hoyM ? 'opacity=".45"' : ''}>${n === 12 ? mesCorto(x.m).slice(0, 1).toUpperCase() : mesCorto(x.m)}</text>`;

  // barras
  const e1 = escala(Math.max(...d.map(x => Math.max(x.entro, x.salio))));
  const base = arriba + alto, y1 = (v) => base - (v / e1.tope) * alto;
  const bw = Math.min(14, (gw - 6) / 2);
  const barras = `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Entró y salió por mes">
    ${e1.marcas.map(v => `<line x1="${izq}" x2="${W}" y1="${y1(v)}" y2="${y1(v)}" class="g-grilla"/><text x="${izq - 6}" y="${y1(v) + 3}" class="g-eje" text-anchor="end">${fmtCorto(v)}</text>`).join('')}
    ${d.map((x, i) => `${i === sel ? `<rect x="${izq + gw * i + 1}" y="${arriba}" width="${gw - 2}" height="${alto}" rx="6" class="g-sel"/>` : ''}
      <g class="g-entro">${barraRedonda(cx(i) - bw - 1, y1(x.entro), bw, base - y1(x.entro))}</g>
      <g class="g-salio">${barraRedonda(cx(i) + 1, y1(x.salio), bw, base - y1(x.salio))}</g>${eti(x, i)}${toque(x, i)}`).join('')}
  </svg>`;

  // línea: lo que te quedó (puede ser negativo)
  const vals = d.slice(0, Math.max(1, pasados)).map(x => x.queda);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const e2 = escala(Math.max(1, hi - lo), 3);
  const paso = e2.marcas[1] || 1;
  const min2 = Math.floor(lo / paso) * paso, max2 = Math.max(min2 + paso, Math.ceil(hi / paso) * paso);
  const y2 = (v) => arriba + alto - ((v - min2) / (max2 - min2)) * alto;
  const marcas2 = []; for (let v = min2; v <= max2 + 1e-9; v += paso) marcas2.push(v);
  const pts = vals.map((v, i) => [cx(i), y2(v)]);
  const linea = `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Lo que te quedó por mes">
    ${marcas2.map(v => `<line x1="${izq}" x2="${W}" y1="${y2(v)}" y2="${y2(v)}" class="g-grilla ${v === 0 ? 'g-cero' : ''}"/><text x="${izq - 6}" y="${y2(v) + 3}" class="g-eje" text-anchor="end">${fmtCorto(v)}</text>`).join('')}
    ${pts[sel] ? `<line x1="${pts[sel][0]}" x2="${pts[sel][0]}" y1="${arriba}" y2="${arriba + alto}" class="g-cruz"/>` : ''}
    <polyline points="${pts.map(p => p.join(',')).join(' ')}" class="g-linea"/>
    ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === sel ? 5.5 : 4}" class="g-punto"/>`).join('')}
    ${d.map((x, i) => eti(x, i) + toque(x, i)).join('')}
  </svg>`;

  const s = d[sel];
  return `<section class="bloque">
    <p class="etiqueta">Evolución</p>
    <div class="fila" style="margin:14px 0 6px"><h3 class="subtitulo" style="font-size:16px">Entró y salió</h3>
      <span class="leyenda"><i class="l-entro"></i>Entró <i class="l-salio"></i>Salió</span></div>
    ${barras}
    <p class="lectura"><strong>${nombreMes(s.m)}</strong><br>Entró <strong class="num">${plata(s.entro)}</strong> · salió <strong class="num">${plata(s.salio)}</strong></p>
    <hr class="sep">
    <h3 class="subtitulo" style="font-size:16px;margin:4px 0 6px">Lo que te quedó</h3>
    ${linea}
    <p class="lectura"><strong>${nombreMes(s.m)}</strong><br>Te quedó <strong class="num ${s.queda < 0 ? 'mal' : ''}">${plata(s.queda)}</strong></p>
    <p class="micro" style="margin-top:8px">Tocá un mes para ver el detalle.</p>
  </section>`;
}

/* ================= vista: AJUSTES ================= */
function pVistaAjustes() {
  const a = A();
  const editor = (clave, titulo, ayuda) => `
  <details class="bloque">
    <summary><span class="subtitulo">${titulo}</span><p class="micro" style="margin:4px 0 0">${ayuda}</p></summary>
    <div style="margin-top:10px">
      ${P().listas[clave].map((v, i) => `<div class="editable">
        <input class="input" value="${h(v)}" data-a="pRenombrar" data-lista="${clave}" data-i="${i}" aria-label="Nombre">
        <button class="quitar" data-a="pQuitar" data-lista="${clave}" data-i="${i}" aria-label="Quitar ${h(v)}">×</button></div>`).join('')}
      <form class="fila" style="margin-top:10px" data-form="pAgregar" data-lista="${clave}">
        <input class="input" name="valor" placeholder="Agregar…" required><button class="btn btn--secundario btn--chico">Agregar</button></form>
    </div>
  </details>`;
  const totFijos = P().fijos.filter(f => f.activo && f.tipo === 'gasto').reduce((s, f) => s + aARS(f.monto * parteDe(f), f.moneda), 0);
  return `
  <h1 class="titulo">Ajustes</h1>

  <section class="bloque">
    <div class="fila"><h2 class="subtitulo">Fijos del mes</h2><button class="btn btn--suave btn--chico" data-a="pNuevoFijo">+ Agregar</button></div>
    <p class="micro" style="margin:4px 0 8px">Se cargan solos cada mes como "por pagar" o "por cobrar". Gastos fijos, tu parte: <strong class="num">${plata(totFijos)}</strong></p>
    <div class="lista">${P().fijos.map(f => `<button class="item item--plano" data-a="pEditarFijo" data-id="${f.id}">
      <span class="item__cuerpo"><span class="item__titulo">${h(f.descripcion)}</span><span class="micro">${f.tipo === 'ingreso' ? 'Ingreso' : h(f.categoria)} · día ${f.dia}${f.compartido ? ` · tu parte ${f.parte}%` : ''}${f.activo ? '' : ' · pausado'}</span></span>
      <span class="item__monto num ${f.tipo === 'ingreso' ? 'ok' : ''}">${plata(f.monto * parteDe(f), f.moneda)}</span></button>`).join('') || '<p class="micro">Por ejemplo: tu parte del depto, suscripciones o el sueldo.</p>'}</div>
  </section>

  <section class="bloque">
    <div class="fila"><h2 class="subtitulo">Fondos</h2><button class="btn btn--suave btn--chico" data-a="pNuevoFondo">+ Agregar</button></div>
    <p class="micro" style="margin:4px 0 8px">Tu reparto ideal de lo que entra. Suman ${P().fondos.reduce((s, f) => s + (f.ideal || 0), 0)} %.</p>
    <div class="lista">${P().fondos.map(f => `<button class="item item--plano" data-a="pEditarFondo" data-id="${f.id}">
      <span class="item__cuerpo"><span class="item__titulo">${h(f.nombre)}</span><span class="micro">${f.cats.length ? f.cats.map(h).join(', ') : 'Se llena con metas de ahorro'}</span></span>
      <span class="item__monto num">${f.ideal} %</span></button>`).join('')}</div>
  </section>

  ${editor('gasto', 'Categorías de gasto', 'Si renombrás una, se actualizan los movimientos que la usan.')}
  ${editor('ingreso', 'Categorías de ingreso', 'De dónde entra la plata.')}
  ${editor('medio', 'Medios de pago', 'Cuentas, billeteras y tarjetas.')}

  <section class="bloque">
    <h2 class="subtitulo">Respaldo y dólar</h2>
    <p class="micro" style="margin:4px 0 10px">Son los mismos que FÁRA: un solo Sheet guarda las dos partes, cada una en sus pestañas. ${a.sheetUrl ? (a.pendiente ? 'Hay cambios sin subir.' : 'Todo respaldado.') : 'Todavía sin conectar.'}</p>
    <button class="btn btn--suave btn--chico" data-a="modo" data-v="fara" data-tab="ajustes">Ir a Ajustes de FÁRA</button>
  </section>`;
}

/* ================= formularios ================= */
function pFormMov(m, tipoInicial = 'gasto') {
  const nuevo = !m;
  m = m || { tipo: tipoInicial, fecha: hoyISO(), monto: 0, moneda: 'ARS', categoria: '', medio: P().medioGasto, pagado: true, vence: '', descripcion: '', nota: '', compartido: false, parte: 50, cuotas: 1 };
  const ing = m.tipo === 'ingreso';
  const esCuota = m.cuotas > 1;
  const cats = P().listas[m.tipo];
  abrirHoja(nuevo ? 'Nuevo movimiento' : esCuota ? `Cuota ${m.cuotaN} de ${m.cuotas}` : ing ? 'Editar ingreso' : 'Editar gasto', `
  <form data-form="pMov" data-id="${m.id || ''}">
    ${nuevo ? `<div class="segmento" data-grupo="tipo"><input type="hidden" name="tipo" value="${m.tipo}">
      <button type="button" class="${!ing ? 'is-on' : ''}" data-a="pTipo" data-v="gasto">Gasto</button>
      <button type="button" class="${ing ? 'is-on' : ''}" data-a="pTipo" data-v="ingreso">Ingreso</button></div>` : `<input type="hidden" name="tipo" value="${m.tipo}">`}
    ${campoMonto('monto', nuevo ? m.monto : m.monto, m.moneda, esCuota ? 'Monto de esta cuota' : ing ? 'Monto' : 'Monto total')}
    <label class="campo"><span>${ing ? 'De dónde' : 'Qué fue'}</span><input class="input" name="descripcion" value="${h(m.descripcion)}" placeholder="${ing ? 'Ej.: Sueldo de octubre' : 'Ej.: Supermercado'}"></label>
    <div class="campo"><span>Categoría</span><div data-cats>${chips('categoria', cats, m.categoria || cats[0])}</div></div>
    <div class="campo"><span>${ing ? 'Dónde entró' : 'Medio de pago'}</span>${chips('medio', P().listas.medio, m.medio)}</div>
    <div data-solo-gasto ${ing ? 'hidden' : ''}>
      ${interruptor('compartido', 'Compartido', m.compartido, 'Cuenta solo tu parte')}
      <div data-si="compartido" ${m.compartido ? '' : 'hidden'}><label class="campo"><span>Tu parte (%)</span><input class="input" name="parte" inputmode="numeric" value="${m.parte ?? 50}"></label></div>
      ${nuevo ? `${interruptor('enCuotas', 'En cuotas', false, 'Se carga una cuota por mes')}
      <div data-si="enCuotas" hidden><div class="grilla2">
        <label class="campo"><span>Cantidad de cuotas</span><input class="input" name="cuotas" inputmode="numeric" value="3"></label>
        <label class="campo"><span>Primera cuota</span><input class="input" type="month" name="primera" value="${mesActual()}"></label></div>
        <p class="ayuda">Poné arriba el total de la compra; la app lo divide.</p></div>` : ''}
    </div>
    <div data-no="enCuotas">
      ${interruptor('pagado', ing ? 'Ya lo cobré' : 'Ya está pagado', m.pagado)}
      <div data-si="pagado" ${m.pagado ? '' : 'hidden'}><label class="campo"><span>Fecha</span><input class="input" type="date" name="fechaPago" value="${m.fechaPago || m.fecha}"></label></div>
      <div data-no="pagado" ${m.pagado ? 'hidden' : ''}><label class="campo"><span>${ing ? 'Lo cobrás el' : 'Vence el'}</span><input class="input" type="date" name="vence" value="${m.vence || ''}"></label></div>
    </div>
    <label class="campo"><span>Nota (opcional)</span><input class="input" name="nota" value="${h(m.nota)}"></label>
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="pBorrar" data-id="${m.id}">${esCuota ? 'Borrar cuotas' : 'Borrar'}</button>`}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function pGuardarMov(form, d) {
  const id = form.dataset.id;
  const monto = leerMonto(d.monto);
  if (!monto) return toast('Poné un monto');
  const tipo = d.tipo;
  const comun = {
    tipo, descripcion: d.descripcion.trim(), categoria: d.categoria, medio: d.medio, moneda: d.moneda, nota: d.nota.trim(),
    compartido: tipo === 'gasto' && !!d.compartido, parte: Math.min(100, Math.max(1, parseInt(d.parte) || 50))
  };
  if (!id && tipo === 'gasto' && d.enCuotas) {
    const n = Math.min(60, Math.max(2, parseInt(d.cuotas) || 2));
    const grupo = uid(), dia = hoyISO().slice(8, 10);
    const primera = d.primera || mesActual();
    for (let i = 0; i < n; i++) {
      const ym = sumarMes(primera, i);
      const f = `${ym}-${String(Math.min(28, +dia)).padStart(2, '0')}`;
      P().movs.push({ id: uid(), ...comun, monto: Math.round(monto / n * 100) / 100, fecha: f, fechaPago: f, pagado: true, vence: '', mep: mep(), grupo, cuotas: n, cuotaN: i + 1 });
    }
    if (d.medio) P().medioGasto = d.medio;
    guardar(); cerrarHoja(); toast(`${n} cuotas cargadas`); pintar(); return;
  }
  const pagado = !!d.pagado;
  const m = id ? P().movs.find(x => x.id === id) : { id: uid(), mep: mep(), cuotas: 1 };
  Object.assign(m, comun, {
    monto, pagado,
    fechaPago: pagado ? (d.fechaPago || hoyISO()) : '', vence: pagado ? '' : d.vence,
    fecha: id && m.fecha ? (m.cuotas > 1 ? (d.fechaPago || m.fecha) : m.fecha) : (pagado ? d.fechaPago || hoyISO() : d.vence || hoyISO())
  });
  if (pagado && !m.mep) m.mep = mep();
  if (!id) P().movs.push(m);
  if (tipo === 'gasto' && d.medio) P().medioGasto = d.medio;
  guardar(); cerrarHoja(); toast(id ? 'Guardado' : tipo === 'ingreso' ? 'Ingreso cargado' : 'Gasto cargado'); pintar();
}
function pFormFijo(f) {
  const nuevo = !f;
  f = f || { tipo: 'gasto', descripcion: '', categoria: P().listas.gasto[0], monto: 0, moneda: 'ARS', dia: 10, medio: P().medioGasto, activo: true, compartido: false, parte: 50 };
  const ing = f.tipo === 'ingreso';
  abrirHoja(nuevo ? 'Nuevo fijo' : 'Editar fijo', `
  <form data-form="pFijo" data-id="${f.id || ''}">
    <div class="segmento" data-grupo="tipo"><input type="hidden" name="tipo" value="${f.tipo}">
      <button type="button" class="${!ing ? 'is-on' : ''}" data-a="pTipo" data-v="gasto">Gasto</button>
      <button type="button" class="${ing ? 'is-on' : ''}" data-a="pTipo" data-v="ingreso">Ingreso</button></div>
    <label class="campo"><span>Nombre</span><input class="input" name="descripcion" value="${h(f.descripcion)}" placeholder="Ej.: Depto (mi parte)" required></label>
    ${campoMonto('monto', f.monto, f.moneda)}
    <label class="campo"><span>Día del mes</span><input class="input" name="dia" inputmode="numeric" value="${f.dia}"></label>
    <div class="campo"><span>Categoría</span><div data-cats>${chips('categoria', P().listas[f.tipo], f.categoria)}</div></div>
    <div class="campo"><span>Medio</span>${chips('medio', P().listas.medio, f.medio)}</div>
    <div data-solo-gasto ${ing ? 'hidden' : ''}>
      ${interruptor('compartido', 'Compartido', f.compartido, 'Si cargás el total, la app cuenta tu parte')}
      <div data-si="compartido" ${f.compartido ? '' : 'hidden'}><label class="campo"><span>Tu parte (%)</span><input class="input" name="parte" inputmode="numeric" value="${f.parte ?? 50}"></label></div>
    </div>
    ${interruptor('activo', 'Activo', f.activo, 'Pausalo si deja de repetirse')}
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="pBorrarFijo" data-id="${f.id}">Borrar</button>`}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function pFormMeta(meta) {
  const nuevo = !meta;
  meta = meta || { nombre: '', objetivo: 0, moneda: 'ARS', fecha: '', fondo: (P().fondos.find(f => /ahorro/i.test(f.nombre)) || P().fondos[0] || {}).id, aportes: [] };
  abrirHoja(nuevo ? 'Nueva meta' : 'Editar meta', `
  <form data-form="pMeta" data-id="${meta.id || ''}">
    <label class="campo"><span>Nombre</span><input class="input" name="nombre" value="${h(meta.nombre)}" placeholder="Ej.: Vacaciones de diciembre" required ${nuevo ? 'autofocus' : ''}></label>
    ${campoMonto('objetivo', meta.objetivo, meta.moneda, 'Objetivo (opcional)').replace(' required', '')}
    <label class="campo"><span>Para cuándo (opcional)</span><input class="input" type="date" name="fecha" value="${meta.fecha}"></label>
    <div class="campo"><span>Cuenta para el fondo</span>
      <select class="input" name="fondo">${P().fondos.map(f => `<option value="${f.id}" ${f.id === meta.fondo ? 'selected' : ''}>${h(f.nombre)}</option>`).join('')}</select></div>
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="pBorrarMeta" data-id="${meta.id}">Borrar</button>`}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}
function pVerMeta(meta) {
  const ah = pAhorrado(meta);
  abrirHoja(h(meta.nombre), `
    <section class="bloque bloque--suave">
      <div class="grilla2"><div class="pila"><span class="micro">Ahorrado</span><span class="subtitulo num">${plata(ah, meta.moneda)}</span></div>
      <div class="pila"><span class="micro">Objetivo</span><span class="subtitulo num">${meta.objetivo ? plata(meta.objetivo, meta.moneda) : '—'}</span></div></div>
    </section>
    <form data-form="pAporte" data-id="${meta.id}">
      <div class="segmento" data-grupo="signo"><input type="hidden" name="signo" value="1">
        <button type="button" class="is-on" data-a="pSigno" data-v="1">Sumar</button><button type="button" data-a="pSigno" data-v="-1">Retirar</button></div>
      <div class="fila" style="margin-top:10px"><input class="input" name="monto" inputmode="decimal" placeholder="Monto (${meta.moneda === 'USD' ? 'US$' : '$'})" required><input class="input" type="date" name="fecha" value="${hoyISO()}" style="max-width:160px"></div>
      <div class="acciones"><button class="btn btn--primario">Guardar</button></div>
    </form>
    <p class="etiqueta" style="margin-top:16px">Movimientos</p>
    <div class="lista">${[...(meta.aportes || [])].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 12).map(ap => `
      <div class="item item--plano"><span class="item__cuerpo"><span class="item__titulo">${ap.monto < 0 ? 'Retiro' : 'Aporte'}</span><span class="micro">${fechaCorta(ap.fecha)}</span></span>
      <span class="item__monto num ${ap.monto < 0 ? 'mal' : 'ok'}">${plata(ap.monto, meta.moneda)}</span>
      <button class="quitar" data-a="pBorrarAporte" data-id="${meta.id}" data-ap="${ap.id}" aria-label="Borrar">×</button></div>`).join('') || '<p class="micro">Todavía sin aportes.</p>'}</div>
    <div class="acciones"><button class="btn btn--suave" data-a="pEditarMeta" data-id="${meta.id}">Editar meta</button></div>`);
}
function pFormFondo(f) {
  const nuevo = !f;
  f = f || { nombre: '', ideal: 0, cats: [] };
  abrirHoja(nuevo ? 'Nuevo fondo' : 'Editar fondo', `
  <form data-form="pFondo" data-id="${f.id || ''}">
    <label class="campo"><span>Nombre</span><input class="input" name="nombre" value="${h(f.nombre)}" required></label>
    <label class="campo"><span>Porcentaje ideal de lo que entra</span><input class="input" name="ideal" inputmode="numeric" value="${f.ideal}"></label>
    <div class="campo"><span>Categorías de gasto que cuentan acá</span>${chips('cats', P().listas.gasto, f.cats, true)}</div>
    <p class="ayuda">Las metas de ahorro se asignan a un fondo desde cada meta.</p>
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="pBorrarFondo" data-id="${f.id}">Borrar</button>`}<button class="btn btn--primario">Guardar</button></div>
  </form>`);
}

Object.assign(FORMS, {
  pMov: pGuardarMov,
  pFijo(form, d) {
    const id = form.dataset.id;
    const f = id ? P().fijos.find(x => x.id === id) : { id: uid(), desde: mesActual() };
    Object.assign(f, {
      tipo: d.tipo, descripcion: d.descripcion.trim(), monto: leerMonto(d.monto), moneda: d.moneda, dia: Math.min(28, Math.max(1, parseInt(d.dia) || 1)),
      categoria: d.categoria, medio: d.medio, activo: !!d.activo, compartido: d.tipo === 'gasto' && !!d.compartido, parte: Math.min(100, Math.max(1, parseInt(d.parte) || 50))
    });
    if (!f.monto) return toast('Poné un monto');
    if (!id) P().fijos.push(f);
    const m = P().movs.find(x => x.fijoId === f.id && mesDe(x.fecha) === mesActual() && !x.pagado);
    if (m) { if (!f.activo) P().movs = P().movs.filter(x => x !== m); else Object.assign(m, { tipo: f.tipo, descripcion: f.descripcion, monto: f.monto, moneda: f.moneda, categoria: f.categoria, medio: f.medio, compartido: f.compartido, parte: f.parte }); }
    pGenerarFijos(); guardar(); cerrarHoja(); toast('Fijo guardado'); pintar();
  },
  pMeta(form, d) {
    const id = form.dataset.id;
    const meta = id ? P().metas.find(x => x.id === id) : { id: uid(), aportes: [] };
    Object.assign(meta, { nombre: d.nombre.trim(), objetivo: leerMonto(d.objetivo), moneda: d.moneda, fecha: d.fecha, fondo: d.fondo });
    if (!id) P().metas.push(meta);
    guardar(); cerrarHoja(); toast('Meta guardada'); pintar();
  },
  pAporte(form, d) {
    const meta = P().metas.find(x => x.id === form.dataset.id); const n = leerMonto(d.monto); if (!n) return toast('Poné un monto');
    meta.aportes = meta.aportes || [];
    meta.aportes.push({ id: uid(), fecha: d.fecha || hoyISO(), monto: n * (+d.signo || 1), mep: mep() });
    guardar(); toast(+d.signo < 0 ? 'Retiro registrado' : 'Ahorro sumado'); pintar(); pVerMeta(meta);
  },
  pFondo(form, d) {
    const id = form.dataset.id;
    const f = id ? P().fondos.find(x => x.id === id) : { id: uid() };
    Object.assign(f, { nombre: d.nombre.trim(), ideal: Math.max(0, Math.min(100, parseInt(d.ideal) || 0)), cats: d.cats ? d.cats.split('|').filter(Boolean) : [] });
    if (!id) P().fondos.push(f);
    guardar(); cerrarHoja(); toast('Fondo guardado'); pintar();
  },
  pAgregar(form, d) {
    const l = P().listas[form.dataset.lista]; const v = d.valor.trim();
    if (!v || l.includes(v)) return toast(v ? 'Ya está en la lista' : 'Escribí un nombre');
    l.push(v); guardar(); pintar(); abrirDetalle(form.dataset.lista);
  }
});

Object.assign(ACC, {
  pIrMovs(el) { UI.tab = 'movs'; UI.pFiltro = el.dataset.f; pintar(); scrollTo(0, 0); },
  pFiltro(el) { UI.pFiltro = el.dataset.v; pintar(); },
  pEditar(el) { pFormMov(P().movs.find(m => m.id === el.dataset.id)); },
  pBorrar(el) {
    const m = P().movs.find(x => x.id === el.dataset.id);
    if (m.grupo && m.cuotas > 1) {
      if (!confirm(`¿Borrar las ${m.cuotas} cuotas de "${m.descripcion || m.categoria}"?`)) return;
      P().movs = P().movs.filter(x => x.grupo !== m.grupo);
    } else { if (!confirm('¿Borrar este movimiento?')) return; P().movs = P().movs.filter(x => x !== m); }
    guardar(); cerrarHoja(); pintar(); toast('Borrado');
  },
  pTipo(el) {
    const g = el.closest('[data-grupo="tipo"]'); const tipo = el.dataset.v; $('input', g).value = tipo;
    $$('button', g).forEach(b => b.classList.toggle('is-on', b === el));
    const form = el.closest('form');
    $('[data-cats]', form).innerHTML = chips('categoria', P().listas[tipo], P().listas[tipo][0]);
    const sg = $('[data-solo-gasto]', form); if (sg) sg.hidden = tipo !== 'gasto';
    if (tipo !== 'gasto') { const c = form.enCuotas; if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); } }
  },
  pSigno(el) { const g = el.closest('[data-grupo="signo"]'); $('input', g).value = el.dataset.v; $$('button', g).forEach(b => b.classList.toggle('is-on', b === el)); },
  pNuevoFijo() { pFormFijo(); },
  pEditarFijo(el) { pFormFijo(P().fijos.find(f => f.id === el.dataset.id)); },
  pBorrarFijo(el) {
    if (!confirm('¿Borrar este fijo? Lo ya cargado queda.')) return;
    const id = el.dataset.id; P().fijos = P().fijos.filter(f => f.id !== id);
    P().movs = P().movs.filter(m => !(m.fijoId === id && !m.pagado)); guardar(); cerrarHoja(); pintar();
  },
  pNuevaMeta() { pFormMeta(); },
  pVerMeta(el) { pVerMeta(P().metas.find(m => m.id === el.dataset.id)); },
  pEditarMeta(el) { pFormMeta(P().metas.find(m => m.id === el.dataset.id)); },
  pBorrarMeta(el) { if (!confirm('¿Borrar esta meta y su historial?')) return; P().metas = P().metas.filter(m => m.id !== el.dataset.id); guardar(); cerrarHoja(); pintar(); },
  pBorrarAporte(el) {
    const meta = P().metas.find(m => m.id === el.dataset.id); if (!confirm('¿Borrar este movimiento de la meta?')) return;
    meta.aportes = meta.aportes.filter(a => a.id !== el.dataset.ap); guardar(); pintar(); pVerMeta(meta);
  },
  pNuevoFondo() { pFormFondo(); },
  pEditarFondo(el) { pFormFondo(P().fondos.find(f => f.id === el.dataset.id)); },
  pBorrarFondo(el) { if (!confirm('¿Borrar este fondo?')) return; P().fondos = P().fondos.filter(f => f.id !== el.dataset.id); guardar(); cerrarHoja(); pintar(); },
  pQuitar(el) {
    const l = P().listas[el.dataset.lista]; const v = l[+el.dataset.i];
    if (l.length <= 1) return toast('Tiene que quedar al menos una');
    if (!confirm(`¿Quitar "${v}"? Lo ya cargado conserva el nombre.`)) return;
    l.splice(+el.dataset.i, 1); guardar(); pintar(); abrirDetalle(el.dataset.lista);
  },
  modo(el) { cambiarModo(el.dataset.v, el.dataset.tab); }
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.a !== 'pRenombrar') return;
  const lista = el.dataset.lista, i = +el.dataset.i, nuevo = el.value.trim();
  const l = P().listas[lista], viejo = l[i];
  if (!nuevo || nuevo === viejo) return pintar();
  if (l.includes(nuevo)) { toast('Ya existe ese nombre'); return pintar(); }
  l[i] = nuevo;
  const cambiar = (arr, k) => arr.forEach(x => { if (x[k] === viejo) x[k] = nuevo; });
  if (lista === 'medio') { cambiar(P().movs, 'medio'); cambiar(P().fijos, 'medio'); }
  else { cambiar(P().movs.filter(m => m.tipo === lista), 'categoria'); cambiar(P().fijos.filter(f => f.tipo === lista), 'categoria'); }
  if (lista === 'gasto') P().fondos.forEach(f => { f.cats = f.cats.map(c => c === viejo ? nuevo : c); });
  guardar(); toast('Renombrado'); pintar(); abrirDetalle(lista);
});

/* ================= modo ================= */
const NAV = {
  fara: [['mes', 'Mes', ICO.mes], ['analisis', 'Análisis', ICO.analisis], ['trabajos', 'Trabajos', ICO.trabajo], ['gastos', 'Gastos', ICO.gasto], ['equipo', 'Equipo', ICO.equipo], ['ajustes', 'Ajustes', ICO.ajustes]],
  personal: [['mes', 'Mes', ICO.mes], ['analisis', 'Análisis', ICO.analisis], ['movs', 'Movimientos', ICO.movs], ['ahorro', 'Ahorro', ICO.ahorro], ['ajustes', 'Ajustes', ICO.ajustes]]
};
const VISTAS = {
  fara: { mes: vistaMes, analisis: vistaAnalisis, trabajos: vistaTrabajos, gastos: vistaGastos, equipo: vistaEquipo, ajustes: vistaAjustes },
  personal: { mes: pVistaMes, analisis: pVistaAnalisis, movs: pVistaMovs, ahorro: pVistaAhorro, ajustes: pVistaAjustes }
};
function cambiarModo(modo, tab) {
  if (modo !== 'fara' && modo !== 'personal') return;
  UI.modo = modo; UI.tab = tab || 'mes'; UI.sel = null;
  try { localStorage.setItem('fara-finanzas-modo', modo); } catch (e) { }
  pintar(); scrollTo(0, 0);
}
function pintarNav() {
  const modo = UI.modo;
  const nav = $('#nav');
  const firma = modo + UI.tab;
  if (nav.dataset.firma !== firma) {
    nav.dataset.firma = firma;
    nav.style.setProperty('--cols', NAV[modo].length);
    nav.innerHTML = NAV[modo].map(([t, txt, ico]) => `<button data-tab="${t}" class="${t === UI.tab ? 'is-on' : ''}">${ico}<span>${txt}</span></button>`).join('');
  }
  $$('#modo button').forEach(b => b.classList.toggle('is-on', b.dataset.v === modo));
  document.body.dataset.modo = modo;
  const tc = $('meta[name="theme-color"]:not([media*="dark"])'); if (tc) tc.content = modo === 'personal' ? '#E7EBE5' : '#F2EBDD';
  const tcd = $('meta[name="theme-color"][media*="dark"]'); if (tcd) tcd.content = modo === 'personal' ? '#0F1D1F' : '#1A1410';
}

arrancar();
