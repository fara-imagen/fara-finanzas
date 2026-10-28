# Conectar el respaldo en Google Sheets

Se hace una sola vez y lleva unos 5 minutos. Desde la compu es más cómodo.

## 1. Crear el Sheet

1. Entrá a [sheets.new](https://sheets.new) con tu cuenta de Google.
2. Ponele de nombre `FAR Respaldo app finanzas fara`.

## 2. Pegar el script

1. En el Sheet, menú **Extensiones > Apps Script**.
2. Borrá todo lo que aparece y pegá el contenido del archivo `apps-script/Code.gs`.
3. En la línea `const CLAVE = 'CAMBIA-ESTA-CLAVE';` cambiá el texto por una clave tuya, por ejemplo `fara2026matias`. Sin espacios.
4. Tocá el ícono de guardar (el disquete).

## 3. Publicarlo

1. Arriba a la derecha: **Implementar > Nueva implementación**.
2. En el engranaje de "Seleccionar tipo", elegí **Aplicación web**.
3. Completá así:
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier persona.
4. Tocá **Implementar**. Google te pide permiso: elegí tu cuenta, después **Configuración avanzada > Ir a… (no seguro)** y **Permitir**. Aparece ese aviso porque el script lo escribiste vos y Google no lo revisó; solo puede tocar este Sheet.
5. Copiá la **URL de la aplicación web**. Termina en `/exec`.

"Cualquier persona" significa que cualquiera con la URL puede intentar mandarle datos. Por eso existe la clave: sin ella, el script rechaza todo.

## 4. Conectar la app

1. En la app: **Ajustes > Respaldo en Google Sheets**.
2. Pegá la URL y escribí la misma clave.
3. Tocá **Guardar y respaldar**. Si arriba aparece "Respaldado", listo.

Desde ahí, cada cambio se sube solo cuando hay internet. Sin conexión, arriba dice "Sin conexión" y se sube apenas vuelve.

## Si cambiás de teléfono

Instalá la app, pegá la misma URL y clave en Ajustes y tocá **Traer mis datos desde el Sheet**.

## Si modificás el script más adelante

**Implementar > Administrar implementaciones > lápiz > Versión: nueva versión > Implementar.** Así la URL queda igual.
