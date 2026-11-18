/**
 * Componentes de interfaz reutilizables: notificaciones, diálogos y estados.
 */
import { escaparHtml, ICONOS } from './utils.js';

/**
 * Muestra una notificación temporal.
 * @param {string} mensaje
 * @param {'exito'|'error'|'info'} tipo
 */
export function notificar(mensaje, tipo = 'exito', duracion = 4500) {
  const contenedor = document.getElementById('notificaciones');
  if (!contenedor) return;

  const aviso = document.createElement('div');
  aviso.className = `notificacion notificacion-${tipo}`;
  aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  aviso.innerHTML = `
    <span class="notificacion-texto">${escaparHtml(mensaje)}</span>
    <button type="button" class="notificacion-cerrar" aria-label="Cerrar notificación">${ICONOS.limpiar}</button>
  `;

  const cerrar = () => {
    aviso.classList.add('saliendo');
    setTimeout(() => aviso.remove(), 200);
  };
  aviso.querySelector('button').addEventListener('click', cerrar);
  contenedor.appendChild(aviso);
  if (duracion > 0) setTimeout(cerrar, duracion);
}

/**
 * Diálogo de confirmación modal. Resuelve true si el usuario confirma.
 * @param {{titulo:string, mensaje:string, textoConfirmar?:string, textoCancelar?:string, peligro?:boolean, accion?:()=>Promise<void>}} opciones
 * Si se indica `accion`, el diálogo permanece abierto mostrando el progreso
 * hasta que la acción termina; si falla, se muestra el error dentro del diálogo.
 */
export function confirmar({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = false,
  accion,
}) {
  return new Promise((resolver) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo';
    dialogo.setAttribute('aria-labelledby', 'dialogo-titulo');
    dialogo.innerHTML = `
      <form method="dialog" class="dialogo-contenido">
        <div class="dialogo-encabezado">
          ${peligro ? `<span class="dialogo-icono">${ICONOS.alerta}</span>` : ''}
          <h2 id="dialogo-titulo">${escaparHtml(titulo)}</h2>
        </div>
        <div class="dialogo-cuerpo">${mensaje}</div>
        <p class="dialogo-error" role="alert" hidden></p>
        <div class="dialogo-acciones">
          <button type="button" class="boton boton-secundario" data-accion="cancelar">${escaparHtml(textoCancelar)}</button>
          <button type="button" class="boton ${peligro ? 'boton-peligro' : 'boton-primario'}" data-accion="confirmar">${escaparHtml(textoConfirmar)}</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialogo);

    const botonConfirmar = dialogo.querySelector('[data-accion="confirmar"]');
    const botonCancelar = dialogo.querySelector('[data-accion="cancelar"]');
    const cajaError = dialogo.querySelector('.dialogo-error');
    let ocupado = false;
    let resultado = false;

    const cerrar = (valor) => {
      resultado = valor;
      dialogo.close();
    };

    dialogo.addEventListener('close', () => {
      dialogo.remove();
      resolver(resultado);
    });

    dialogo.addEventListener('cancel', (e) => {
      if (ocupado) e.preventDefault();
    });

    botonCancelar.addEventListener('click', () => {
      if (!ocupado) cerrar(false);
    });

    botonConfirmar.addEventListener('click', async () => {
      if (!accion) return cerrar(true);
      ocupado = true;
      cajaError.hidden = true;
      botonConfirmar.disabled = true;
      botonCancelar.disabled = true;
      const textoOriginal = botonConfirmar.innerHTML;
      botonConfirmar.innerHTML = '<span class="spinner spinner-pequeno" aria-hidden="true"></span> Procesando…';
      try {
        await accion();
        ocupado = false;
        cerrar(true);
      } catch (error) {
        ocupado = false;
        botonConfirmar.disabled = false;
        botonCancelar.disabled = false;
        botonConfirmar.innerHTML = textoOriginal;
        cajaError.textContent = error.message || 'No fue posible completar la operación.';
        cajaError.hidden = false;
      }
    });

    dialogo.showModal();
    botonCancelar.focus();
  });
}

/** HTML de un estado de carga. */
export function htmlCargando(texto = 'Cargando información…') {
  return `
    <div class="estado estado-cargando" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p>${escaparHtml(texto)}</p>
    </div>
  `;
}

/** HTML de un estado de error con botón de reintento opcional. */
export function htmlError(titulo, mensaje, { reintentar = true, enlace } = {}) {
  return `
    <div class="estado estado-error" role="alert">
      <span class="estado-icono">${ICONOS.alerta}</span>
      <h2>${escaparHtml(titulo)}</h2>
      <p>${escaparHtml(mensaje)}</p>
      <div class="estado-acciones">
        ${reintentar ? `<button type="button" class="boton boton-primario" data-reintentar>${ICONOS.recargar} Reintentar</button>` : ''}
        ${enlace ? `<a class="boton boton-secundario" href="${escaparHtml(enlace.href)}" data-enlace>${escaparHtml(enlace.texto)}</a>` : ''}
      </div>
    </div>
  `;
}

/** HTML de un estado vacío. */
export function htmlVacio(titulo, mensaje, accionHtml = '') {
  return `
    <div class="estado estado-vacio">
      <span class="estado-icono">${ICONOS.equipo}</span>
      <h2>${escaparHtml(titulo)}</h2>
      <p>${escaparHtml(mensaje)}</p>
      ${accionHtml ? `<div class="estado-acciones">${accionHtml}</div>` : ''}
    </div>
  `;
}

/** Encabezado de página con migas de pan. */
export function htmlEncabezado({ titulo, subtitulo = '', migas = [], acciones = '' }) {
  const htmlMigas = migas.length
    ? `<nav class="migas" aria-label="Ruta de navegación"><ol>${migas
        .map((m, i) =>
          i === migas.length - 1 || !m.href
            ? `<li aria-current="page">${escaparHtml(m.texto)}</li>`
            : `<li><a href="${escaparHtml(m.href)}" data-enlace>${escaparHtml(m.texto)}</a></li>`
        )
        .join('')}</ol></nav>`
    : '';
  return `
    <header class="encabezado-pagina">
      <div>
        ${htmlMigas}
        <h1>${escaparHtml(titulo)}</h1>
        ${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ''}
      </div>
      ${acciones ? `<div class="encabezado-acciones">${acciones}</div>` : ''}
    </header>
  `;
}
