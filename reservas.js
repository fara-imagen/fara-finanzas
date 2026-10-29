/* FÁRA Finanzas · Reservas del negocio y "Pagarme a mí". Se carga después de personal.js. */
'use strict';

/* ================= datos ================= */
function reservasInicial() {
  return { renuncia: { activo: true, meses: 6 }, impuestos: { activo: false, pct: 0 }, reposicion: { activo: true }, colchon: { activo: false, meses: 3 }, movs: [], aportes: [] };
}
function asegurarReservas(d) {
  if (!d.reservas) d.reservas = reservasInicial();
  if (!d.reservas.renuncia) d.reservas.renuncia = { activo: true, meses: 6 };
  if (!d.reservas.aportes) d.reservas.aportes = [];
  if (d.personal && !d.personal.listas.gasto.includes('FÁRA')) d.personal.listas.gasto.push('FÁRA');
  return d;
}
{
  const previo = asegurarPersonal;
  asegurarPersonal = function (d) { return asegurarReservas(previo(d)); };
}
asegurarReservas(D);


const R = () => D.reservas;
const TIPOS_RES = {
  renuncia: { nombre: 'Fondo de renuncia', corto: 'Renuncia' },
  reposicion: { nombre: 'Reposición de equipo', corto: 'Reposición' },
  impuestos: { nombre: 'Impuestos', corto: 'Impuestos' },
  colchon: { nombre: 'Colchón del negocio', corto: 'Colchón' }
};
const saldoRes = (t) => R().movs.filter(m => m.tipo === t).reduce((s, m) => s + m.monto, 0);
const apartadoMes = (ym, t) => R().movs.filter(m => m.tipo === t && m.monto > 0 && mesDe(m.fecha) === ym).reduce((s, m) => s + m.monto, 0);
// el equipo pierde su valor en línea recta a lo largo de su vida útil: eso es lo que hay que apartar por mes
const sugeridoRepos = () => D.equipo.reduce((s, e) => s + e.usd * mep(), 0) / ((A().vidaUtil || 4) * 12);
const sugeridoImp = (ym) => cobrosDelMes(ym).reduce((s, x) => s + x.ars, 0) * (R().impuestos.pct || 0) / 100;
const objetivoColchon = () => fijosMensualesARS() * (R().colchon.meses || 3);
const aportesDelMes = (ym) => R().aportes.filter(a => mesDe(a.fecha) === ym).reduce((s, a) => s + aARS(a.monto, a.moneda, a.mep), 0);
const aportesTotal = () => R().aportes.reduce((s, a) => s + aARS(a.monto, a.moneda, a.mep), 0);
const gananciaMes = (ym) => cobrosDelMes(ym).reduce((s, x) => s + x.ars, 0) - gastosPagadosDelMes(ym).reduce((s, x) => s + x.ars, 0);
/* lo que gastás por mes en Personal (tu parte), sin contar ahorro, inversión ni lo que ponés en FÁRA:
   promedio de los últimos 3 meses cerrados; si no hay datos, tus fijos personales */
function gastoPersonalMensual() {
  const ms = [1, 2, 3].map(i => sumarMes(mesActual(), -i));
  const tot = ms.map(m => pDelMes(m, 'gasto').filter(x => !x.m.meta && !x.m.fondo && x.m.categoria !== 'FÁRA').reduce((s, x) => s + x.ars, 0));
  const conDatos = tot.filter(v => v > 0);
  if (conDatos.length) return conDatos.reduce((s, v) => s + v, 0) / conDatos.length;
  return P().fijos.filter(f => f.activo && f.tipo === 'gasto').reduce((s, f) => s + aARS(f.monto * parteDe(f), f.moneda), 0);
}
const objetivoRenuncia = () => gastoPersonalMensual() * (R().renuncia.meses || 6);
const retirosDelMes = (ym) => D.gastos.filter(g => g.retiro && mesDe(g.fechaPago || g.fecha) === ym).reduce((s, g) => s + aARS(g.monto, g.moneda, g.mep), 0);
function totalReservado() {
  let t = 0;
  for (const k of Object.keys(TIPOS_RES)) if (R()[k].activo) t += saldoRes(k);
  if (A().comprasActivo) t += D.compras.reduce((s, c) => s + aARS(c.ahorrado || 0, c.moneda), 0);
  return t;
}

/* ================= FÁRA pagado con plata personal ================= */
function sincPersonal(g) {
  if (!g) return;
  const debe = g.medio === 'Personal' && g.pagado;
  const m = P().movs.find(x => x.deFara === g.id);
  if (!debe) { if (m) P().movs = P().movs.filter(x => x !== m); return; }
  const f = g.fechaPago || g.fecha;
  const datos = { monto: g.monto, moneda: g.moneda, fecha: f, fechaPago: f, pagado: true, vence: '', mep: g.mep || mep(), categoria: 'FÁRA',
    descripcion: g.descripcion || g.categoria, nota: g.cuotas > 1 ? `Cuota ${g.cuotaN} de ${g.cuotas}` : '' };
  if (m) Object.assign(m, datos);
  else P().movs.push({ id: uid(), deFara: g.id, tipo: 'gasto', cuotas: 1, medio: P().medioGasto || P().listas.medio[0], compartido: false, meta: '', fondo: '', ...datos });
}
function formMedioPersonal(m) {
  abrirHoja(h(m.descripcion || 'Gasto de FÁRA'), `
  <form data-form="medioPersonal" data-id="${m.id}">
    <p class="chico" style="margin:0"><strong class="num">${plata(m.monto, m.moneda)}</strong> · ${fechaCorta(m.fechaPago || m.fecha)}</p>
    <p class="ayuda" style="margin-top:6px">Viene de FÁRA. El monto y la fecha se cambian allá; acá elegís con qué lo pagaste.</p>
    <div class="campo"><span>Medio de pago</span>${chips('medio', P().listas.medio, m.medio)}</div>
    <div class="acciones"><button type="button" class="btn btn--suave" data-a="irAFara" data-id="${m.deFara || ''}">Ver en FÁRA</button><button class="btn btn--primario">Guardar</button></div>
  </form>`);
}

/* ================= vista ================= */
function vistaReservas() {
  const ym = mesActual();
  const card = (tipo, cuerpo) => `<section class="bloque">
    <div class="fila"><p class="etiqueta">${TIPOS_RES[tipo].nombre}</p><span class="subtitulo num">${plata(saldoRes(tipo))}</span></div>
    ${cuerpo}
    <div class="acciones"><button class="btn btn--suave btn--chico" data-a="resUsar" data-v="${tipo}">Usar</button><button class="btn btn--primario btn--chico" data-a="resApartar" data-v="${tipo}">Apartar</button></div>
  </section>`;
  const barraMes = (hecho, meta) => {
    const p = meta ? Math.min(100, hecho / meta * 100) : 0;
    return `<div class="barra" style="margin-top:10px"><i style="width:${p}%"></i></div>`;
  };

  let html = `
  <h1 class="titulo">Reservas</h1>
  <p class="chico sec" style="margin:0 0 4px">Plata que sigue en tu cuenta pero ya tiene destino. Apartarla no cambia tu ganancia; te muestra cuánto podés usar de verdad.</p>
  <section class="bloque bloque--oscuro">
    <p class="etiqueta">Total reservado</p>
    <p class="grande num" style="margin:10px 0 2px">${plata(totalReservado())}</p>
  </section>
`;

  if (R().renuncia.activo) {
    const obj = objetivoRenuncia(), s = saldoRes('renuncia'), gm = gastoPersonalMensual();
    const meses = gm ? s / gm : 0;
    html += card('renuncia', `
      <p class="chico" style="margin:10px 0 0">${gm ? `Para cubrir <strong>${R().renuncia.meses} meses</strong> de tus gastos personales (${plata(gm)} por mes) necesitás <strong class="num">${plata(obj)}</strong>.` : 'Cargá tus gastos fijos en Personal para calcular el objetivo.'}</p>
      ${barraMes(s, obj)}
      <p class="micro" style="margin-top:6px">${gm ? `Hoy te cubre <strong>${fmtUSD.format(Math.floor(meses * 10) / 10)} meses</strong>. ${s < obj ? `Faltan ${plata(obj - s)}.` : 'Llegaste al objetivo.'}` : ''}</p>`);
  }

  if (R().reposicion.activo) {
    const sug = sugeridoRepos(), hecho = apartadoMes(ym, 'reposicion');
    html += card('reposicion', `
      <p class="chico" style="margin:10px 0 0">Tu equipo pierde unos <strong class="num">${plata(sug)}</strong> de valor por mes (vida útil de ${A().vidaUtil || 4} años).</p>
      ${barraMes(hecho, sug)}
      <p class="micro" style="margin-top:6px">Este mes apartaste ${plata(hecho)} de ${plata(sug)}.</p>`);
  }
  if (R().impuestos.activo) {
    const sug = sugeridoImp(ym), hecho = apartadoMes(ym, 'impuestos');
    html += card('impuestos', `
      <p class="chico" style="margin:10px 0 0">${R().impuestos.pct ? `Apartás el <strong>${R().impuestos.pct} %</strong> de cada cobro. Este mes corresponden <strong class="num">${plata(sug)}</strong>.` : 'Poné abajo qué porcentaje de cada cobro querés apartar.'}</p>
      ${barraMes(hecho, sug)}
      <p class="micro" style="margin-top:6px">Este mes apartaste ${plata(hecho)}.</p>`);
  }
  if (R().colchon.activo) {
    const obj = objetivoColchon(), s = saldoRes('colchon');
    html += card('colchon', `
      <p class="chico" style="margin:10px 0 0">Objetivo: <strong class="num">${plata(obj)}</strong>, que son ${R().colchon.meses} meses de gastos fijos.</p>
      ${barraMes(s, obj)}
      <p class="micro" style="margin-top:6px">${obj ? `Tenés el ${Math.round(Math.min(100, s / obj * 100))} % del colchón.` : 'Cargá tus gastos fijos para calcular el objetivo.'}</p>`);
  }

  if (A().comprasActivo) {
    html += `<div class="fila" style="margin-top:18px"><h2 class="subtitulo">Próximas compras</h2><button class="btn btn--suave btn--chico" data-a="nuevaCompra">+ Agregar</button></div>
    <div class="lista">${D.compras.length ? D.compras.map(c => {
      const p = planCompra(c); const pct = c.precio ? Math.min(100, (c.ahorrado || 0) / c.precio * 100) : 0;
      return `<button class="item" data-a="verCompra" data-id="${c.id}" style="flex-direction:column;align-items:stretch">
        <span class="fila"><span class="item__titulo">${h(c.item)}</span><span class="num chico">${c.precio ? plata(c.precio, c.moneda) : '<span class="estado estado--pend">Poné el precio</span>'}</span></span>
        <span class="barra"><i style="width:${pct}%"></i></span>
        <span class="fila micro"><span>Ahorrado ${plata(c.ahorrado || 0, c.moneda)}</span><span>${c.precio ? `${plata(p.porMes, c.moneda)} por mes · ${p.restantes} mes${p.restantes > 1 ? 'es' : ''}` : ''}</span></span>
      </button>`;
    }).join('') : '<p class="micro">Nada planeado.</p>'}</div>`;
  }

  const ult = [...R().movs].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10);
  if (ult.length) html += `<section class="bloque"><p class="etiqueta">Últimos movimientos</p><div class="lista">${ult.map(m => `
    <div class="item item--plano"><span class="item__cuerpo"><span class="item__titulo">${m.monto < 0 ? 'Usado' : 'Apartado'} · ${TIPOS_RES[m.tipo].corto}</span><span class="micro">${fechaCorta(m.fecha)}${m.nota ? ' · ' + h(m.nota) : ''}</span></span>
    <span class="item__monto num ${m.monto < 0 ? 'mal' : 'ok'}">${plata(m.monto)}</span>
    <button class="quitar" data-a="resBorrar" data-id="${m.id}" aria-label="Borrar">×</button></div>`).join('')}</div></section>`;

  html += `<details class="bloque">
    <summary><span class="subtitulo">Configurar reservas</span><p class="micro" style="margin:4px 0 0">Activá las que necesites.</p></summary>
    <label class="interruptor"><span><strong>Fondo de renuncia</strong><br><span class="micro">Meses de tus gastos personales cubiertos</span></span><input type="checkbox" data-a="resToggle" data-k="renuncia" ${R().renuncia.activo ? 'checked' : ''}></label>
    ${R().renuncia.activo ? `<form class="fila" data-form="resNum" data-k="renuncia" data-c="meses"><input class="input" name="valor" inputmode="numeric" value="${R().renuncia.meses}" placeholder="Meses"><button class="btn btn--secundario btn--chico">Guardar</button></form>` : ''}
    <label class="interruptor"><span><strong>Reposición de equipo</strong><br><span class="micro">Según el valor del equipo y su vida útil</span></span><input type="checkbox" data-a="resToggle" data-k="reposicion" ${R().reposicion.activo ? 'checked' : ''}></label>
    <label class="interruptor"><span><strong>Impuestos</strong><br><span class="micro">Un porcentaje de cada cobro</span></span><input type="checkbox" data-a="resToggle" data-k="impuestos" ${R().impuestos.activo ? 'checked' : ''}></label>
    ${R().impuestos.activo ? `<form class="fila" data-form="resNum" data-k="impuestos" data-c="pct"><input class="input" name="valor" inputmode="decimal" value="${R().impuestos.pct || ''}" placeholder="Porcentaje de cada cobro"><button class="btn btn--secundario btn--chico">Guardar</button></form>` : ''}
    <label class="interruptor"><span><strong>Colchón del negocio</strong><br><span class="micro">Meses de gastos fijos guardados</span></span><input type="checkbox" data-a="resToggle" data-k="colchon" ${R().colchon.activo ? 'checked' : ''}></label>
    ${R().colchon.activo ? `<form class="fila" data-form="resNum" data-k="colchon" data-c="meses"><input class="input" name="valor" inputmode="numeric" value="${R().colchon.meses}" placeholder="Meses"><button class="btn btn--secundario btn--chico">Guardar</button></form>` : ''}
    <label class="interruptor"><span><strong>Próximas compras</strong><br><span class="micro">Planear equipo y cuánto separar por mes</span></span><input type="checkbox" data-a="toggle" data-k="comprasActivo" ${A().comprasActivo ? 'checked' : ''}></label>
  </details>`;
  return html;
}

/* ================= formularios ================= */
function formReserva(tipo, signo) {
  const usar = signo < 0;
  const sug = tipo === 'reposicion' ? sugeridoRepos() - apartadoMes(mesActual(), 'reposicion') : tipo === 'impuestos' ? sugeridoImp(mesActual()) - apartadoMes(mesActual(), 'impuestos') : 0;
  abrirHoja(`${usar ? 'Usar de' : 'Apartar en'} ${TIPOS_RES[tipo].nombre}`, `
  <form data-form="reserva" data-t="${tipo}" data-s="${signo}">
    <label class="campo"><span>Monto en pesos</span><input class="input" name="monto" inputmode="decimal" value="${!usar && sug > 0 ? montoInput(Math.round(sug)) : ''}" autofocus required style="font-size:24px;font-weight:600"></label>
    ${!usar && sug > 0 ? '<p class="ayuda">Te propongo lo que falta para este mes. Cambialo si querés.</p>' : ''}
    ${usar ? `<p class="ayuda">Tenés ${plata(saldoRes(tipo))} reservados acá.</p>` : ''}
    ${usar ? '' : `<div class="campo"><span>¿De dónde sale la plata?</span>${chips('origen', ['Plata de FÁRA', 'Personal'], tipo === 'renuncia' ? 'Personal' : 'Plata de FÁRA')}</div>
    <p class="ayuda" style="margin-top:-6px">Si elegís Personal, aparece también como gasto en Personal con categoría FÁRA.</p>`}
    <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${hoyISO()}"></label>
    <label class="campo"><span>Nota (opcional)</span><input class="input" name="nota" placeholder="${usar ? 'Ej.: Arreglo del flash' : ''}"></label>
    <div class="acciones"><button class="btn btn--primario">${usar ? 'Registrar uso' : 'Apartar'}</button></div>
  </form>`);
}
function formRetiro(g) {
  const nuevo = !g;
  g = g || { monto: 0, moneda: 'ARS', fechaPago: hoyISO(), medio: A().medioGasto, nota: '' };
  abrirHoja(nuevo ? 'Pagarme a mí' : 'Editar pago a mí', `
  <form data-form="retiro" data-id="${g.retiro || ''}">
    ${campoMonto('monto', g.monto, g.moneda)}
    <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${g.fechaPago || g.fecha}"></label>
    <div class="campo"><span>Desde</span>${chips('medio', D.listas.medio, g.medio)}</div>
    <label class="campo"><span>Nota (opcional)</span><input class="input" name="nota" value="${h(g.nota || '')}"></label>
    <p class="ayuda">Se registra como salida en FÁRA y como ingreso en Personal. No cuenta como gasto del negocio: tu ganancia sigue igual.</p>
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="retiroBorrar" data-id="${g.retiro}">Borrar</button>`}<button class="btn btn--primario">${nuevo ? 'Pagarme' : 'Guardar'}</button></div>
  </form>`);
}

function formAporte(a) {
  const nuevo = !a;
  a = a || { monto: 0, moneda: 'ARS', fecha: hoyISO(), medio: P().medioGasto, nota: '' };
  abrirHoja(nuevo ? 'Poner plata en FÁRA' : 'Editar aporte', `
  <form data-form="aporte" data-id="${a.id || ''}">
    ${campoMonto('monto', a.monto, a.moneda)}
    <label class="campo"><span>Fecha</span><input class="input" type="date" name="fecha" value="${a.fecha}"></label>
    <div class="campo"><span>Desde</span>${chips('medio', P().listas.medio, a.medio)}</div>
    <label class="campo"><span>Para qué (opcional)</span><input class="input" name="nota" value="${h(a.nota)}" placeholder="Ej.: Pagar el dominio"></label>
    <p class="ayuda">Sale de Personal como gasto "FÁRA" y entra en FÁRA como aporte tuyo. No cuenta como ingreso del negocio, así la ganancia de FÁRA muestra lo que genera solo.</p>
    <div class="acciones">${nuevo ? '' : `<button type="button" class="btn btn--peligro" data-a="aporteBorrar" data-id="${a.id}">Borrar</button>`}<button class="btn btn--primario">${nuevo ? 'Poner plata' : 'Guardar'}</button></div>
  </form>`);
}

Object.assign(FORMS, {
  medioPersonal(form, d) {
    const m = P().movs.find(x => x.id === form.dataset.id); m.medio = d.medio; P().medioGasto = d.medio;
    guardar(); cerrarHoja(); toast('Medio actualizado'); pintar();
  },
  aporte(form, d) {
    const monto = leerMonto(d.monto); if (!monto) return toast('Poné un monto');
    const id = form.dataset.id || uid();
    let a = R().aportes.find(x => x.id === id);
    if (!a) { a = { id }; R().aportes.push(a); }
    Object.assign(a, { monto, moneda: d.moneda, fecha: d.fecha || hoyISO(), medio: d.medio, nota: d.nota.trim(), mep: a.mep || mep() });
    let m = P().movs.find(x => x.aporte === id);
    if (!m) { m = { id: uid(), aporte: id, tipo: 'gasto', cuotas: 1 }; P().movs.push(m); }
    Object.assign(m, { monto, moneda: d.moneda, fecha: a.fecha, fechaPago: a.fecha, pagado: true, vence: '', medio: d.medio, mep: a.mep,
      descripcion: 'Aporte a FÁRA' + (a.nota ? ' · ' + a.nota : ''), categoria: 'FÁRA', compartido: false, meta: '', fondo: '', nota: '' });
    if (d.medio) P().medioGasto = d.medio;
    guardar(); cerrarHoja(); toast(form.dataset.id ? 'Actualizado en los dos lados' : 'Listo: salió de Personal y entró en FÁRA'); pintar();
  },
  reserva(form, d) {
    const n = leerMonto(d.monto); if (!n) return toast('Poné un monto');
    const mov = { id: uid(), tipo: form.dataset.t, fecha: d.fecha || hoyISO(), monto: n * (+form.dataset.s), nota: d.nota.trim() };
    R().movs.push(mov);
    if (+form.dataset.s > 0 && d.origen === 'Personal') {
      P().movs.push({ id: uid(), deRes: mov.id, tipo: 'gasto', cuotas: 1, monto: n, moneda: 'ARS', fecha: mov.fecha, fechaPago: mov.fecha, pagado: true, vence: '', mep: mep(),
        medio: P().medioGasto || P().listas.medio[0], categoria: 'FÁRA', descripcion: TIPOS_RES[mov.tipo].nombre, compartido: false, meta: '', fondo: '', nota: mov.nota });
    }
    guardar(); cerrarHoja(); toast(+form.dataset.s < 0 ? 'Uso registrado' : 'Apartado'); pintar();
  },
  resNum(form, d) { R()[form.dataset.k][form.dataset.c] = leerMonto(d.valor); guardar(); pintar(); toast('Guardado'); },
  retiro(form, d) {
    const monto = leerMonto(d.monto); if (!monto) return toast('Poné un monto');
    const rid = form.dataset.id || uid(), f = d.fecha || hoyISO();
    const datos = { monto, moneda: d.moneda, fecha: f, fechaPago: f, pagado: true, vence: '', medio: d.medio, nota: d.nota.trim(), mep: mep() };
    let g = D.gastos.find(x => x.retiro === rid);
    if (!g) { g = { id: uid(), retiro: rid }; D.gastos.push(g); }
    Object.assign(g, datos, { descripcion: 'Pago a mí', categoria: 'Retiro del dueño' });
    let m = P().movs.find(x => x.retiro === rid);
    if (!m) { m = { id: uid(), retiro: rid, tipo: 'ingreso', cuotas: 1 }; P().movs.push(m); }
    const cat = P().listas.ingreso.includes('FÁRA') ? 'FÁRA' : P().listas.ingreso[0];
    Object.assign(m, datos, { descripcion: 'Pago desde FÁRA', categoria: cat, medio: P().listas.medio.includes(d.medio) ? d.medio : P().listas.medio[0], compartido: false });
    guardar(); cerrarHoja(); toast(form.dataset.id ? 'Actualizado en FÁRA y Personal' : 'Listo: salió de FÁRA y entró en Personal'); pintar();
  }
});

/* editar un pago a mí desde cualquiera de los dos lados abre el mismo formulario */
const _editarGasto = ACC.editarGasto, _pEditar = ACC.pEditar;
Object.assign(ACC, {
  resApartar(el) { formReserva(el.dataset.v, 1); },
  resUsar(el) { formReserva(el.dataset.v, -1); },
  resBorrar(el) {
    const id = el.dataset.id, enP = P().movs.some(m => m.deRes === id);
    if (!confirm('¿Borrar este movimiento de reserva?' + (enP ? ' También se borra de Personal.' : ''))) return;
    R().movs = R().movs.filter(m => m.id !== id); P().movs = P().movs.filter(m => m.deRes !== id); guardar(); pintar();
  },
  retiro() { formRetiro(); },
  irAFara(el) {
    cerrarHoja(); const g = D.gastos.find(x => x.id === el.dataset.id);
    cambiarModo('fara', g ? 'gastos' : 'reservas'); if (g) formGasto(g);
  },
  aporte() { formAporte(); },
  aporteEditar(el) { formAporte(R().aportes.find(a => a.id === el.dataset.id)); },
  aporteBorrar(el) {
    if (!confirm('¿Borrar este aporte? Se borra en FÁRA y en Personal.')) return;
    const id = el.dataset.id; R().aportes = R().aportes.filter(a => a.id !== id); P().movs = P().movs.filter(m => m.aporte !== id);
    guardar(); cerrarHoja(); pintar(); toast('Borrado de los dos lados');
  },
  retiroBorrar(el) {
    if (!confirm('¿Borrar este pago? Se borra en FÁRA y en Personal.')) return;
    const rid = el.dataset.id;
    D.gastos = D.gastos.filter(g => g.retiro !== rid); P().movs = P().movs.filter(m => m.retiro !== rid);
    guardar(); cerrarHoja(); pintar(); toast('Borrado de los dos lados');
  },
  editarGasto(el) { const g = D.gastos.find(x => x.id === el.dataset.id); if (g && g.retiro) return formRetiro(g); _editarGasto(el); },
  pEditar(el) {
    const m = P().movs.find(x => x.id === el.dataset.id);
    if (m && m.retiro) { const g = D.gastos.find(x => x.retiro === m.retiro); if (g) return formRetiro(g); }
    if (m && m.aporte) { const a = R().aportes.find(x => x.id === m.aporte); if (a) return formAporte(a); }
    if (m && (m.deFara || m.deRes)) return formMedioPersonal(m);
    _pEditar(el);
  }
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.a === 'resToggle') { R()[el.dataset.k].activo = el.checked; guardar(); pintar(); const d = $('details.bloque'); if (d) d.open = true; }
});

/* pestaña nueva en FÁRA */
NAV.fara.splice(5, 0, ['reservas', 'Reservas', ICO.reservas]);
VISTAS.fara.reservas = vistaReservas;

arrancar();
