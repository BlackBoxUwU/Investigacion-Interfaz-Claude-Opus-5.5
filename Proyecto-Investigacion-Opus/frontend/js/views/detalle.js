import { obtenerEquipo, eliminarEquipo } from '../api.js';
import { navegar } from '../router.js';
import { htmlCargando, htmlError, htmlEncabezado, confirmar, notificar } from '../ui.js';
import {
  escaparHtml,
  etiquetaTipo,
  formatearFecha,
  formatearFechaHora,
  insigniaEstado,
  mostrar,
  tieneValor,
  REGEX_UUID,
  ICONOS,
} from '../utils.js';

function dato(etiqueta, valorHtml, clase = '') {
  return `
    <div class="dato ${clase}">
      <dt>${escaparHtml(etiqueta)}</dt>
      <dd>${valorHtml}</dd>
    </div>
  `;
}

export async function vistaDetalle(contenedor, params, _consulta, ctx) {
  const id = params.id;
  document.title = 'Detalle del equipo | Inventario de Equipos';

  const migasBase = [
    { texto: 'Panel general', href: '/' },
    { texto: 'Equipos', href: '/equipos' },
  ];

  if (!REGEX_UUID.test(id)) {
    contenedor.innerHTML =
      htmlEncabezado({ titulo: 'Equipo no encontrado', migas: [...migasBase, { texto: 'No encontrado' }] }) +
      htmlError('Equipo no encontrado', 'La dirección no corresponde a un equipo válido del inventario.', {
        reintentar: false,
        enlace: { href: '/equipos', texto: 'Volver al listado' },
      });
    return;
  }

  const cargar = async () => {
    contenedor.innerHTML =
      htmlEncabezado({ titulo: 'Detalle del equipo', migas: [...migasBase, { texto: 'Detalle' }] }) +
      htmlCargando('Cargando información del equipo…');

    let equipo;
    try {
      equipo = await obtenerEquipo(id);
    } catch (error) {
      if (!ctx.esVigente()) return;
      const noExiste = error.estado === 404 || error.estado === 422;
      contenedor.innerHTML =
        htmlEncabezado({
          titulo: noExiste ? 'Equipo no encontrado' : 'Detalle del equipo',
          migas: [...migasBase, { texto: noExiste ? 'No encontrado' : 'Detalle' }],
        }) +
        htmlError(
          noExiste ? 'Equipo no encontrado' : 'No se pudo cargar el equipo',
          noExiste
            ? 'El equipo que buscas no existe o fue eliminado del inventario.'
            : error.message,
          { reintentar: !noExiste, enlace: { href: '/equipos', texto: 'Volver al listado' } }
        );
      contenedor.querySelector('[data-reintentar]')?.addEventListener('click', cargar);
      return;
    }
    if (!ctx.esVigente()) return;

    pintar(equipo);
  };

  function pintar(e) {
    document.title = `${e.numero_inventario} | Inventario de Equipos`;
    const hrefEditar = `/equipos/${encodeURIComponent(e.id)}/editar`;

    const ram = e.ram_gb !== null && e.ram_gb !== undefined ? `${escaparHtml(e.ram_gb)} GB` : mostrar(null);
    const fechaAdq = formatearFecha(e.fecha_adquisicion);
    const fechaRev = formatearFecha(e.fecha_ultima_revision);

    contenedor.innerHTML = `
      ${htmlEncabezado({
        titulo: e.numero_inventario,
        subtitulo: `${escaparHtml(etiquetaTipo(e.tipo_equipo))} · ${escaparHtml(e.marca)} ${escaparHtml(e.modelo)} &nbsp;${insigniaEstado(e.estado)}`,
        migas: [...migasBase, { texto: e.numero_inventario }],
        acciones: `
          <a class="boton boton-secundario" href="/equipos" data-enlace>${ICONOS.volver} Volver al listado</a>
          <a class="boton boton-primario" href="${escaparHtml(hrefEditar)}" data-enlace>${ICONOS.editar} Editar</a>
          <button type="button" class="boton boton-peligro-suave" data-eliminar>${ICONOS.eliminar} Eliminar</button>
        `,
      })}

      <div class="detalle-rejilla">
        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>Identificación</h2></div>
          <dl class="datos">
            ${dato('Número de inventario', escaparHtml(e.numero_inventario), 'dato-destacado')}
            ${dato('Número de serie', `<span class="monoespaciado">${escaparHtml(e.numero_serie)}</span>`, 'dato-destacado')}
            ${dato('Tipo de equipo', escaparHtml(etiquetaTipo(e.tipo_equipo)))}
            ${dato('Estado', insigniaEstado(e.estado))}
            ${dato('Marca', escaparHtml(e.marca))}
            ${dato('Modelo', escaparHtml(e.modelo))}
          </dl>
        </section>

        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>Especificaciones técnicas</h2></div>
          <dl class="datos">
            ${dato('Procesador', mostrar(e.procesador), 'dato-ancho')}
            ${dato('Memoria RAM', ram)}
            ${dato('Almacenamiento', mostrar(e.almacenamiento))}
            ${dato('Sistema operativo', mostrar(e.sistema_operativo), 'dato-ancho')}
          </dl>
        </section>

        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>Ubicación y resguardo</h2></div>
          <dl class="datos">
            ${dato('Laboratorio', escaparHtml(e.laboratorio))}
            ${dato('Ubicación', mostrar(e.ubicacion))}
            ${dato('Responsable', mostrar(e.responsable), 'dato-ancho')}
          </dl>
        </section>

        <section class="tarjeta">
          <div class="tarjeta-encabezado"><h2>Fechas</h2></div>
          <dl class="datos">
            ${dato('Fecha de adquisición', mostrar(fechaAdq, 'Sin registrar'))}
            ${dato('Última revisión', mostrar(fechaRev, 'Sin registrar'))}
          </dl>
        </section>

        <section class="tarjeta detalle-completo">
          <div class="tarjeta-encabezado"><h2>Observaciones</h2></div>
          ${
            tieneValor(e.observaciones)
              ? `<p class="observaciones">${escaparHtml(e.observaciones)}</p>`
              : '<p class="texto-vacio">Sin observaciones registradas.</p>'
          }
        </section>
      </div>

      <footer class="registro-meta">
        <span>Registrado el ${escaparHtml(formatearFechaHora(e.created_at) || '—')}</span>
        <span>Última modificación: ${escaparHtml(formatearFechaHora(e.updated_at) || '—')}</span>
        <span class="monoespaciado" title="Identificador interno">ID: ${escaparHtml(e.id)}</span>
      </footer>
    `;

    contenedor.querySelector('[data-eliminar]').addEventListener('click', async () => {
      const confirmado = await confirmar({
        titulo: 'Eliminar equipo',
        mensaje: `
          <p>¿Seguro que deseas eliminar el equipo <strong>${escaparHtml(e.numero_inventario)}</strong> (${escaparHtml(`${e.marca} ${e.modelo}`)})?</p>
          <p class="texto-tenue">Esta acción es permanente y no se puede deshacer. Si el equipo solo dejó de usarse, considera cambiar su estado a <em>Baja</em>.</p>
        `,
        textoConfirmar: 'Sí, eliminar',
        peligro: true,
        accion: async () => {
          try {
            await eliminarEquipo(e.id);
          } catch (error) {
            if (error.estado !== 404) throw error;
          }
        },
      });
      if (!confirmado || !ctx.esVigente()) return;
      notificar(`El equipo ${e.numero_inventario} se eliminó correctamente.`);
      navegar('/equipos', { reemplazar: true });
    });
  }

  await cargar();
}
