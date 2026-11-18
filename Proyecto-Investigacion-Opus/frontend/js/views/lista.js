import { listarEquipos, obtenerEstadisticas, eliminarEquipo } from '../api.js';
import { htmlCargando, htmlError, htmlEncabezado, htmlVacio, confirmar, notificar } from '../ui.js';
import {
  TIPOS_EQUIPO,
  ESTADOS_EQUIPO,
  escaparHtml,
  etiquetaTipo,
  esTipoValido,
  esEstadoValido,
  formatearNumero,
  insigniaEstado,
  mostrar,
  rebote,
  ICONOS,
} from '../utils.js';

const TAMANOS_PAGINA = [10, 20, 50, 100];
const TAMANO_PREDETERMINADO = 20;

/** Lee y normaliza los filtros desde la URL. */
function leerFiltros(consulta) {
  const page = parseInt(consulta.get('page'), 10);
  const pageSize = parseInt(consulta.get('page_size'), 10);
  const estado = consulta.get('estado') || '';
  const tipo = consulta.get('tipo_equipo') || '';
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    page_size:
      Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? pageSize : TAMANO_PREDETERMINADO,
    estado: esEstadoValido(estado) ? estado : '',
    tipo_equipo: esTipoValido(tipo) ? tipo : '',
    laboratorio: (consulta.get('laboratorio') || '').trim(),
    busqueda: (consulta.get('busqueda') || '').trim(),
  };
}

/** Construye la URL de la vista a partir de los filtros (omite valores por defecto). */
function urlDeFiltros(f) {
  const p = new URLSearchParams();
  if (f.busqueda) p.set('busqueda', f.busqueda);
  if (f.estado) p.set('estado', f.estado);
  if (f.tipo_equipo) p.set('tipo_equipo', f.tipo_equipo);
  if (f.laboratorio) p.set('laboratorio', f.laboratorio);
  if (f.page_size !== TAMANO_PREDETERMINADO) p.set('page_size', String(f.page_size));
  if (f.page > 1) p.set('page', String(f.page));
  const q = p.toString();
  return q ? `/equipos?${q}` : '/equipos';
}

function hayFiltros(f) {
  return Boolean(f.busqueda || f.estado || f.tipo_equipo || f.laboratorio);
}

/** Números de página a mostrar, con elipsis. */
function paginasVisibles(actual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const paginas = new Set([1, total, actual, actual - 1, actual + 1]);
  if (actual <= 3) [2, 3, 4].forEach((n) => paginas.add(n));
  if (actual >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => paginas.add(n));
  const ordenadas = [...paginas].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const resultado = [];
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1] > 1) resultado.push('…');
    resultado.push(n);
  });
  return resultado;
}

export async function vistaLista(contenedor, _params, consulta, ctx) {
  document.title = 'Equipos | Inventario de Equipos';
  let filtros = leerFiltros(consulta);
  let controlador = null;
  let laboratorios = [];

  contenedor.innerHTML = `
    ${htmlEncabezado({
      titulo: 'Equipos',
      subtitulo: 'Consulta, busca y administra los equipos registrados en el inventario.',
      migas: [{ texto: 'Panel general', href: '/' }, { texto: 'Equipos' }],
      acciones: `<a class="boton boton-primario" href="/equipos/nuevo" data-enlace>${ICONOS.agregar} Registrar equipo</a>`,
    })}

    <section class="tarjeta filtros" aria-label="Filtros de búsqueda">
      <form class="filtros-form" role="search" novalidate>
        <div class="campo campo-busqueda">
          <label for="f-busqueda">Buscar</label>
          <div class="entrada-icono">
            ${ICONOS.buscar}
            <input id="f-busqueda" name="busqueda" type="search" autocomplete="off"
                   placeholder="Inventario, marca, modelo, serie o responsable"
                   value="${escaparHtml(filtros.busqueda)}">
          </div>
        </div>
        <div class="campo">
          <label for="f-estado">Estado</label>
          <select id="f-estado" name="estado">
            <option value="">Todos los estados</option>
            ${ESTADOS_EQUIPO.map(
              (e) => `<option value="${e.valor}" ${filtros.estado === e.valor ? 'selected' : ''}>${escaparHtml(e.etiqueta)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="f-tipo">Tipo de equipo</label>
          <select id="f-tipo" name="tipo_equipo">
            <option value="">Todos los tipos</option>
            ${TIPOS_EQUIPO.map(
              (t) => `<option value="${t.valor}" ${filtros.tipo_equipo === t.valor ? 'selected' : ''}>${escaparHtml(t.etiqueta)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="f-laboratorio">Laboratorio</label>
          <select id="f-laboratorio" name="laboratorio"></select>
        </div>
        <div class="filtros-acciones">
          <button type="button" class="boton boton-texto" data-limpiar>${ICONOS.limpiar} Limpiar filtros</button>
        </div>
      </form>
    </section>

    <section class="tarjeta tarjeta-tabla" aria-live="polite" aria-busy="true">
      <div data-resultados>${htmlCargando('Cargando equipos…')}</div>
    </section>
  `;

  const form = contenedor.querySelector('.filtros-form');
  const inputBusqueda = form.querySelector('#f-busqueda');
  const selectEstado = form.querySelector('#f-estado');
  const selectTipo = form.querySelector('#f-tipo');
  const selectLab = form.querySelector('#f-laboratorio');
  const botonLimpiar = form.querySelector('[data-limpiar]');
  const seccionResultados = contenedor.querySelector('.tarjeta-tabla');
  const resultados = contenedor.querySelector('[data-resultados]');

  function pintarLaboratorios() {
    const opciones = [...laboratorios];
    if (filtros.laboratorio && !opciones.includes(filtros.laboratorio)) opciones.unshift(filtros.laboratorio);
    selectLab.innerHTML =
      '<option value="">Todos los laboratorios</option>' +
      opciones
        .map(
          (l) =>
            `<option value="${escaparHtml(l)}" ${l === filtros.laboratorio ? 'selected' : ''}>${escaparHtml(l)}</option>`
        )
        .join('');
  }
  pintarLaboratorios();

  function actualizarBotonLimpiar() {
    botonLimpiar.hidden = !hayFiltros(filtros);
  }
  actualizarBotonLimpiar();

  // Obtener la lista de laboratorios existentes para el filtro.
  obtenerEstadisticas()
    .then((stats) => {
      if (!ctx.esVigente()) return;
      laboratorios = Object.keys(stats.por_laboratorio || {}).sort((a, b) => a.localeCompare(b, 'es'));
      pintarLaboratorios();
    })
    .catch(() => {
      /* El filtro seguirá disponible solo con el valor actual. */
    });

  /** Cambia filtros, actualiza la URL y recarga resultados. */
  function aplicar(cambios, { agregarHistorial = false } = {}) {
    filtros = { ...filtros, ...cambios };
    const url = urlDeFiltros(filtros);
    if (agregarHistorial) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    actualizarBotonLimpiar();
    cargar();
  }

  const buscarConRebote = rebote(() => {
    const valor = inputBusqueda.value.trim();
    if (valor !== filtros.busqueda) aplicar({ busqueda: valor, page: 1 });
  }, 400);

  inputBusqueda.addEventListener('input', buscarConRebote);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    buscarConRebote.cancelar();
    aplicar({ busqueda: inputBusqueda.value.trim(), page: 1 });
  });
  selectEstado.addEventListener('change', () => aplicar({ estado: selectEstado.value, page: 1 }));
  selectTipo.addEventListener('change', () => aplicar({ tipo_equipo: selectTipo.value, page: 1 }));
  selectLab.addEventListener('change', () => aplicar({ laboratorio: selectLab.value, page: 1 }));
  botonLimpiar.addEventListener('click', () => {
    buscarConRebote.cancelar();
    inputBusqueda.value = '';
    selectEstado.value = '';
    selectTipo.value = '';
    selectLab.value = '';
    aplicar({ busqueda: '', estado: '', tipo_equipo: '', laboratorio: '', page: 1 });
    inputBusqueda.focus();
  });

  async function cargar() {
    if (controlador) controlador.abort();
    controlador = new AbortController();
    const propio = controlador;

    seccionResultados.setAttribute('aria-busy', 'true');
    if (resultados.querySelector('table')) resultados.classList.add('actualizando');
    else resultados.innerHTML = htmlCargando('Cargando equipos…');

    let datos;
    try {
      datos = await listarEquipos(filtros, { signal: propio.signal });
    } catch (error) {
      if (error.name === 'AbortError' || !ctx.esVigente()) return;
      resultados.classList.remove('actualizando');
      seccionResultados.setAttribute('aria-busy', 'false');
      resultados.innerHTML = htmlError('No se pudo cargar el listado', error.message);
      resultados.querySelector('[data-reintentar]')?.addEventListener('click', cargar);
      return;
    }
    if (propio !== controlador || !ctx.esVigente()) return;

    resultados.classList.remove('actualizando');
    seccionResultados.setAttribute('aria-busy', 'false');

    const totalPaginas = Math.max(1, Math.ceil(datos.total / datos.page_size));

    // Si la página solicitada quedó fuera de rango, ir a la última disponible.
    if (datos.equipos.length === 0 && datos.total > 0 && filtros.page > totalPaginas) {
      aplicar({ page: totalPaginas });
      return;
    }

    pintarResultados(datos, totalPaginas);
  }

  function pintarResultados(datos, totalPaginas) {
    if (datos.total === 0) {
      resultados.innerHTML = hayFiltros(filtros)
        ? htmlVacio(
            'Sin resultados',
            'Ningún equipo coincide con los filtros aplicados. Prueba con otros criterios.',
            `<button type="button" class="boton boton-secundario" data-limpiar-vacio>${ICONOS.limpiar} Limpiar filtros</button>`
          )
        : htmlVacio(
            'Aún no hay equipos registrados',
            'Registra el primer equipo para comenzar a llevar el control del inventario.',
            `<a class="boton boton-primario" href="/equipos/nuevo" data-enlace>${ICONOS.agregar} Registrar equipo</a>`
          );
      resultados.querySelector('[data-limpiar-vacio]')?.addEventListener('click', () => botonLimpiar.click());
      return;
    }

    const desde = (datos.page - 1) * datos.page_size + 1;
    const hasta = desde + datos.equipos.length - 1;

    resultados.innerHTML = `
      <div class="tabla-barra">
        <p class="tabla-resumen">
          Mostrando <strong>${formatearNumero(desde)}–${formatearNumero(hasta)}</strong>
          de <strong>${formatearNumero(datos.total)}</strong> ${datos.total === 1 ? 'equipo' : 'equipos'}
          <span class="texto-tenue">· más recientes primero</span>
        </p>
        <label class="tamano-pagina">
          Mostrar
          <select data-tamano>
            ${[...new Set([...TAMANOS_PAGINA, filtros.page_size])]
              .sort((a, b) => a - b)
              .map((n) => `<option value="${n}" ${n === filtros.page_size ? 'selected' : ''}>${n}</option>`)
              .join('')}
          </select>
          por página
        </label>
      </div>

      <div class="tabla-contenedor">
        <table class="tabla">
          <thead>
            <tr>
              <th scope="col">N.º de inventario</th>
              <th scope="col">Tipo</th>
              <th scope="col">Marca y modelo</th>
              <th scope="col">N.º de serie</th>
              <th scope="col">Laboratorio</th>
              <th scope="col">Responsable</th>
              <th scope="col">Estado</th>
              <th scope="col" class="columna-acciones"><span class="solo-lector">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            ${datos.equipos
              .map((e) => {
                const href = `/equipos/${encodeURIComponent(e.id)}`;
                return `
              <tr data-href="${escaparHtml(href)}">
                <td><a class="enlace-fila" href="${escaparHtml(href)}" data-enlace>${escaparHtml(e.numero_inventario)}</a></td>
                <td>${escaparHtml(etiquetaTipo(e.tipo_equipo))}</td>
                <td><span class="celda-principal">${escaparHtml(e.marca)}</span><span class="celda-secundaria">${escaparHtml(e.modelo)}</span></td>
                <td class="monoespaciado">${escaparHtml(e.numero_serie)}</td>
                <td>${escaparHtml(e.laboratorio)}${
                  e.ubicacion ? `<span class="celda-secundaria">${escaparHtml(e.ubicacion)}</span>` : ''
                }</td>
                <td>${mostrar(e.responsable)}</td>
                <td>${insigniaEstado(e.estado)}</td>
                <td class="columna-acciones">
                  <div class="acciones-fila">
                    <a class="boton-icono" href="${escaparHtml(href)}" data-enlace title="Ver detalle" aria-label="Ver detalle de ${escaparHtml(e.numero_inventario)}">${ICONOS.ver}</a>
                    <a class="boton-icono" href="${escaparHtml(href)}/editar" data-enlace title="Editar" aria-label="Editar ${escaparHtml(e.numero_inventario)}">${ICONOS.editar}</a>
                    <button type="button" class="boton-icono boton-icono-peligro" data-eliminar="${escaparHtml(e.id)}"
                            data-inventario="${escaparHtml(e.numero_inventario)}"
                            data-descripcion="${escaparHtml(`${e.marca} ${e.modelo}`)}"
                            title="Eliminar" aria-label="Eliminar ${escaparHtml(e.numero_inventario)}">${ICONOS.eliminar}</button>
                  </div>
                </td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>

      ${totalPaginas > 1 ? htmlPaginacion(datos.page, totalPaginas) : ''}
    `;

    resultados.querySelector('[data-tamano]').addEventListener('change', (e) => {
      aplicar({ page_size: parseInt(e.target.value, 10), page: 1 });
    });

    resultados.querySelectorAll('[data-pagina]').forEach((b) =>
      b.addEventListener('click', () => {
        aplicar({ page: parseInt(b.dataset.pagina, 10) }, { agregarHistorial: true });
        seccionResultados.scrollIntoView({ block: 'start', behavior: 'smooth' });
      })
    );

    resultados.querySelectorAll('[data-eliminar]').forEach((b) =>
      b.addEventListener('click', () => solicitarEliminacion(b.dataset))
    );

    // Clic en cualquier parte de la fila abre el detalle (excepto en controles).
    resultados.querySelectorAll('tbody tr').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a, button, input, select')) return;
        if (window.getSelection()?.toString()) return;
        tr.querySelector('.enlace-fila')?.click();
      })
    );
  }

  function htmlPaginacion(actual, total) {
    return `
      <nav class="paginacion" aria-label="Paginación">
        <button type="button" class="boton boton-secundario boton-pequeno" ${actual <= 1 ? 'disabled' : `data-pagina="${actual - 1}"`}>
          Anterior
        </button>
        <ul>
          ${paginasVisibles(actual, total)
            .map((n) =>
              n === '…'
                ? '<li><span class="paginacion-elipsis">…</span></li>'
                : `<li><button type="button" class="paginacion-numero" ${
                    n === actual ? 'aria-current="page" disabled' : `data-pagina="${n}"`
                  } aria-label="Página ${n}">${n}</button></li>`
            )
            .join('')}
        </ul>
        <button type="button" class="boton boton-secundario boton-pequeno" ${actual >= total ? 'disabled' : `data-pagina="${actual + 1}"`}>
          Siguiente
        </button>
      </nav>
    `;
  }

  async function solicitarEliminacion({ eliminar: id, inventario, descripcion }) {
    const confirmado = await confirmar({
      titulo: 'Eliminar equipo',
      mensaje: `
        <p>¿Seguro que deseas eliminar el equipo <strong>${escaparHtml(inventario)}</strong> (${escaparHtml(descripcion)})?</p>
        <p class="texto-tenue">Esta acción es permanente y no se puede deshacer. Si el equipo solo dejó de usarse, considera cambiar su estado a <em>Baja</em>.</p>
      `,
      textoConfirmar: 'Sí, eliminar',
      peligro: true,
      accion: async () => {
        try {
          await eliminarEquipo(id);
        } catch (error) {
          // Si ya no existe (eliminado por otra persona), el resultado es el mismo.
          if (error.estado !== 404) throw error;
        }
      },
    });
    if (!confirmado || !ctx.esVigente()) return;
    notificar(`El equipo ${inventario} se eliminó correctamente.`);
    cargar();
  }

  await cargar();

  return () => {
    buscarConRebote.cancelar();
    if (controlador) controlador.abort();
  };
}
