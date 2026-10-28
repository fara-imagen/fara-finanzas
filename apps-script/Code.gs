/**
 * FÁRA Finanzas · puente entre la app y este Google Sheet.
 * La app manda todos los datos; este script los escribe en las pestañas.
 *
 * 1. Cambiá la clave de abajo por una tuya (letras y números, sin espacios).
 * 2. Usá esa misma clave en la app, en Ajustes > Respaldo en Google Sheets.
 */
const CLAVE = 'CAMBIA-ESTA-CLAVE';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.clave !== CLAVE) return responder({ ok: false, error: 'Clave incorrecta' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tablas = data.tablas || {};
    Object.keys(tablas).forEach(function (nombre) {
      const t = tablas[nombre];
      const hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
      hoja.clearContents();
      const filas = [t.cols].concat(t.rows);
      hoja.getRange(1, 1, filas.length, t.cols.length).setValues(filas);
      hoja.setFrozenRows(1);
      hoja.getRange(1, 1, 1, t.cols.length).setFontWeight('bold');
    });

    // copia completa para poder restaurar en otro teléfono (partida en pedazos por el límite de cada celda)
    const resp = ss.getSheetByName('_respaldo') || ss.insertSheet('_respaldo');
    resp.clearContents();
    const texto = data.respaldo || '';
    const partes = [];
    for (let i = 0; i < texto.length; i += 40000) partes.push([texto.slice(i, i + 40000)]);
    if (partes.length) resp.getRange(1, 1, partes.length, 1).setValues(partes);
    resp.getRange(1, 2).setValue(new Date());
    resp.hideSheet();

    return responder({ ok: true, at: new Date().toISOString() });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  if (!e.parameter || e.parameter.clave !== CLAVE) return responder({ ok: false, error: 'Clave incorrecta' });
  const resp = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_respaldo');
  if (!resp || resp.getLastRow() === 0) return responder({ ok: false, error: 'Sin respaldo' });
  const partes = resp.getRange(1, 1, resp.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
  return responder({ ok: true, respaldo: partes.join('') });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
