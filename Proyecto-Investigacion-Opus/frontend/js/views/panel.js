import { obtenerEstadisticas, listarEquipos } from '../api.js';
import { htmlCargando, htmlError, htmlEncabezado, htmlVacio } from '../ui.js';
import {
  TIPOS_EQUIPO,
  ESTADOS_EQUIPO,
  escaparHtml,
  etiquetaTipo,
  formatearNumero,
  formatearFechaHora,
  insigniaEstado,
  plural,
  ICONOS,
} from '../utils.js';

function porcentaje(valor, total) {
  if (!total) return 0;
  return Math.round((valor / total) * 1000) / 10;
}

function htmlBarras(filas, total, construirHref) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  return `
    <ul class="barras">
      ${filas
        .map(
          (f) => `
        <li>
          <a class="barra-fila" href="${escaparHtml(construirHref(f))}" data-enlace
             title="Ver ${escaparHtml(plural(f.valor, 'equipo', 'equipos'))} de ${escaparHtml(f.etiqueta)}">
            <span class="barra-etiqueta">${escaparHtml(f.etiqueta)}</span>
            <span class="barra-pista" aria-hidden="true">
              <span class="barra-relleno" style="width:${(f.valor / maximo) * 100}%"></span>
            </span>
            <span class="barra-valor">
              <strong>${formatearNumero(f.valor)}</strong>
              <small>${porcentaje(f.valor, total)}%</small>
            </span>
          </a>
        </li>`
        )
        .join('')}
    </ul>
  `;
}

function htmlRecientes(datos) {
  if (!datos || !datos.equipos || datos.equipos.length === 0) return '';
  return `
    <section class="tarjeta">
      <div class="tarjeta-encabezado">
        <h2>Registrados recientemente</h2>
        <a href="/equipos" data-enlace class="enlace-sutil">Ver todos</a>
      </div>
      <ul class="lista-recientes">
        ${datos.equipos
          .map(
            (e) => `
          <li>
            <a href="/equipos/${encodeURIComponent(e.id)}" data-enlace>
              <span class="reciente-principal">
                <strong>${escaparHtml(e.numero_inventario)}</strong>
                <span>${escaparHtml(`${e.marca} ${e.modelo}`)} · ${escaparHtml(etiquetaTipo(e.tipo_equipo))}</span>
              </span>
              <span class="reciente-secundario">
                ${insigniaEstado(e.estado)}
                <small>${escaparHtml(e.laboratorio)} · ${escaparHtml(formatearFechaHora(e.created_at) || '')}</small>
              </span>
            </a>
          </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
}

export async function vistaPanel(contenedor, _params, _consulta, ctx) {
  document.title = 'Panel general | Inventario de Equipos';

  const encabezado = htmlEncabezado({
    titulo: 'Panel general',
    subtitulo: 'Resumen del inventario de equipos de cómputo de los laboratorios.',
    acciones: `
      <button type="button" class="boton boton-secundario" data-actualizar>${ICONOS.recargar} Actualizar</button>
      <a class="boton boton-primario" href="/equipos/nuevo" data-enlace>${ICONOS.agregar} Registrar equipo</a>
    `,
  });

  const cargar = async () => {
    contenedor.innerHTML = encabezado + htmlCargando('Cargando estadísticas…');
    enlazarActualizar();

    let stats;
    let recientes = null;
    try {
      const [resStats, resRecientes] = await Promise.allSettled([
        obtenerEstadisticas(),
        listarEquipos({ page: 1, page_size: 5 }),
      ]);
      if (resStats.status === 'rejected') throw resStats.reason;
      stats = resStats.value;
      if (resRecientes.status === 'fulfilled') recientes = resRecientes.value;
    } catch (error) {
      if (!ctx.esVigente()) return;
      contenedor.innerHTML =
        encabezado + htmlError('No se pudieron cargar las estadísticas', error.message);
      enlazarActualizar();
      contenedor.querySelector('[data-reintentar]')?.addEventListener('click', cargar);
      return;
    }
    if (!ctx.esVigente()) return;

    const total = stats.total_equipos || 0;

    if (total === 0) {
      contenedor.innerHTML =
        encabezado +
        htmlVacio(
          'Aún no hay equipos registrados',
          'Comienza registrando el primer equipo de cómputo del inventario.',
          `<a class="boton boton-primario" href="/equipos/nuevo" data-enlace>${ICONOS.agregar} Registrar equipo</a>`
        );
      enlazarActualizar();
      return;
    }

    const porEstado = stats.por_estado || {};
    const porTipo = stats.por_tipo || {};
    const porLab = stats.por_laboratorio || {};

    // Estados conocidos + cualquier valor adicional que devuelva el servidor.
    const estados = ESTADOS_EQUIPO.map((e) => ({ ...e, valor_n: porEstado[e.valor] || 0 }));

    const filasTipo = TIPOS_EQUIPO.map((t) => ({
      clave: t.valor,
      etiqueta: t.etiqueta,
      valor: porTipo[t.valor] || 0,
    }));
    for (const [clave, valor] of Object.entries(porTipo)) {
      if (!filasTipo.some((f) => f.clave === clave)) {
        filasTipo.push({ clave, etiqueta: etiquetaTipo(clave), valor });
      }
    }
    filasTipo.sort((a, b) => b.valor - a.valor);

    const filasLab = Object.entries(porLab)
      .map(([clave, valor]) => ({ clave, etiqueta: clave, valor }))
      .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta, 'es'));

    const segmentos = estados
      .filter((e) => e.valor_n > 0)
      .map(
        (e) =>
          `<span class="segmento segmento-${e.valor}" style="flex-grow:${e.valor_n}" title="${escaparHtml(
            `${e.etiqueta}: ${e.valor_n} (${porcentaje(e.valor_n, total)}%)`
          )}"></span>`
      )
      .join('');

    contenedor.innerHTML = `
      ${encabezado}

      <section class="kpis" aria-label="Indicadores principales">
        <a class="kpi kpi-total" href="/equipos" data-enlace>
          <span class="kpi-etiqueta">Total de equipos</span>
          <strong class="kpi-valor">${formatearNumero(total)}</strong>
          <span class="kpi-detalle">${plural(filasLab.length, 'laboratorio', 'laboratorios')}</span>
        </a>
        ${estados
          .map(
            (e) => `
          <a class="kpi kpi-${e.valor}" href="/equipos?estado=${e.valor}" data-enlace title="${escaparHtml(e.descripcion)}">
            <span class="kpi-etiqueta"><span class="punto punto-${e.valor}" aria-hidden="true"></span>${escaparHtml(e.etiqueta)}</span>
            <strong class="kpi-valor">${formatearNumero(e.valor_n)}</strong>
            <span class="kpi-detalle">${porcentaje(e.valor_n, total)}% del total</span>
          </a>`
          )
          .join('')}
      </section>

      <section class="tarjeta">
        <div class="tarjeta-encabezado">
          <h2>Distribución por estado</h2>
        </div>
        <div class="barra-apilada" role="img" aria-label="${escaparHtml(
          estados.map((e) => `${e.etiqueta}: ${e.valor_n}`).join(', ')
        )}">${segmentos}</div>
        <ul class="leyenda">
          ${estados
            .map(
              (e) => `<li><span class="punto punto-${e.valor}" aria-hidden="true"></span>${escaparHtml(
                e.etiqueta
              )} <strong>${formatearNumero(e.valor_n)}</strong></li>`
            )
            .join('')}
        </ul>
      </section>

      <div class="rejilla-2">
        <section class="tarjeta">
          <div class="tarjeta-encabezado">
            <h2>Equipos por tipo</h2>
          </div>
          ${htmlBarras(filasTipo, total, (f) => `/equipos?tipo_equipo=${encodeURIComponent(f.clave)}`)}
        </section>

        <section class="tarjeta">
          <div class="tarjeta-encabezado">
            <h2>Equipos por laboratorio</h2>
          </div>
          ${htmlBarras(filasLab, total, (f) => `/equipos?laboratorio=${encodeURIComponent(f.clave)}`)}
        </section>
      </div>

      ${htmlRecientes(recientes)}
    `;
    enlazarActualizar();
  };

  function enlazarActualizar() {
    contenedor.querySelector('[data-actualizar]')?.addEventListener('click', cargar);
  }

  await cargar();
}
