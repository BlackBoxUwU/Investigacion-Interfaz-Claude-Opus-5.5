import { obtenerEquipo, crearEquipo, actualizarEquipo, obtenerEstadisticas } from '../api.js';
import { navegar, establecerGuardiaSalida, recargarVista } from '../router.js';
import { htmlCargando, htmlError, htmlEncabezado, confirmar, notificar } from '../ui.js';
import { TIPOS_EQUIPO, ESTADOS_EQUIPO, escaparHtml, hoyIso, formatearFechaHora, REGEX_UUID, ICONOS } from '../utils.js';

/**
 * Definición de los campos del formulario, alineada con EquipoCreate / EquipoUpdate.
 */
const SECCIONES = [
  {
    titulo: 'Identificación',
    descripcion: 'Datos que identifican de forma única al equipo.',
    campos: [
      { nombre: 'numero_inventario', etiqueta: 'Número de inventario', tipo: 'text', requerido: true, max: 100, placeholder: 'Ej. INV-2024-001', ayuda: 'Debe ser único en el inventario.' },
      { nombre: 'numero_serie', etiqueta: 'Número de serie', tipo: 'text', requerido: true, max: 200, placeholder: 'Ej. SN-ABC123456', ayuda: 'Debe ser único; aparece en la etiqueta del fabricante.' },
      { nombre: 'tipo_equipo', etiqueta: 'Tipo de equipo', tipo: 'select', opciones: TIPOS_EQUIPO, predeterminado: 'desktop' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', opciones: ESTADOS_EQUIPO, predeterminado: 'activo' },
      { nombre: 'marca', etiqueta: 'Marca', tipo: 'text', requerido: true, max: 100, placeholder: 'Ej. Dell' },
      { nombre: 'modelo', etiqueta: 'Modelo', tipo: 'text', requerido: true, max: 150, placeholder: 'Ej. OptiPlex 7090' },
    ],
  },
  {
    titulo: 'Especificaciones técnicas',
    descripcion: 'Características del hardware y software instalado.',
    campos: [
      { nombre: 'procesador', etiqueta: 'Procesador', tipo: 'text', max: 200, placeholder: 'Ej. Intel Core i7-11700' },
      { nombre: 'ram_gb', etiqueta: 'Memoria RAM (GB)', tipo: 'number', min: 1, maxNum: 1024, placeholder: 'Ej. 16', ayuda: 'Número entero entre 1 y 1024.' },
      { nombre: 'almacenamiento', etiqueta: 'Almacenamiento', tipo: 'text', max: 200, placeholder: 'Ej. 512GB SSD' },
      { nombre: 'sistema_operativo', etiqueta: 'Sistema operativo', tipo: 'text', max: 150, placeholder: 'Ej. Windows 11 Pro' },
    ],
  },
  {
    titulo: 'Ubicación y resguardo',
    descripcion: 'Dónde se encuentra el equipo y quién es responsable de él.',
    campos: [
      { nombre: 'laboratorio', etiqueta: 'Laboratorio', tipo: 'text', requerido: true, max: 150, placeholder: 'Ej. Laboratorio A', lista: 'lista-laboratorios', ayuda: 'Elige uno existente o escribe uno nuevo.' },
      { nombre: 'ubicacion', etiqueta: 'Ubicación', tipo: 'text', max: 200, placeholder: 'Ej. Mesa 5, Fila 2' },
      { nombre: 'responsable', etiqueta: 'Responsable', tipo: 'text', max: 200, placeholder: 'Ej. Ing. Juan Pérez', ancho: true },
    ],
  },
  {
    titulo: 'Fechas y observaciones',
    descripcion: 'Historial básico del equipo.',
    campos: [
      { nombre: 'fecha_adquisicion', etiqueta: 'Fecha de adquisición', tipo: 'date' },
      { nombre: 'fecha_ultima_revision', etiqueta: 'Fecha de última revisión', tipo: 'date' },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', placeholder: 'Notas adicionales: accesorios, fallas conocidas, historial de mantenimiento…', ancho: true },
    ],
  },
];

const CAMPOS = SECCIONES.flatMap((s) => s.campos);
const CAMPOS_NO_BORRABLES = ['ram_gb', 'fecha_adquisicion', 'fecha_ultima_revision'];
/** Campos que se conservan al usar "Guardar y registrar otro". */
const CAMPOS_CONSERVADOS = ['tipo_equipo', 'estado', 'marca', 'modelo', 'procesador', 'ram_gb', 'almacenamiento', 'sistema_operativo', 'laboratorio', 'responsable', 'fecha_adquisicion'];

function htmlCampo(c, valor) {
  const id = `campo-${c.nombre}`;
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [c.ayuda ? idAyuda : '', idError].filter(Boolean).join(' ');
  const comunes = `id="${id}" name="${c.nombre}" aria-describedby="${describe}" ${c.requerido ? 'required aria-required="true"' : ''}`;
  const v = valor ?? '';
  let control;

  switch (c.tipo) {
    case 'select':
      control = `<select ${comunes}>${c.opciones
        .map((o) => `<option value="${o.valor}" ${String(v) === o.valor ? 'selected' : ''}>${escaparHtml(o.etiqueta)}</option>`)
        .join('')}</select>`;
      break;
    case 'textarea':
      control = `<textarea ${comunes} rows="4" placeholder="${escaparHtml(c.placeholder || '')}">${escaparHtml(v)}</textarea>`;
      break;
    case 'number':
      control = `<input ${comunes} type="number" inputmode="numeric" step="1" min="${c.min}" max="${c.maxNum}" placeholder="${escaparHtml(c.placeholder || '')}" value="${escaparHtml(v)}">`;
      break;
    case 'date':
      control = `<input ${comunes} type="date" max="${hoyIso()}" value="${escaparHtml(v)}">`;
      break;
    default:
      control = `<input ${comunes} type="text" maxlength="${c.max}" autocomplete="off" placeholder="${escaparHtml(c.placeholder || '')}" value="${escaparHtml(v)}" ${c.lista ? `list="${c.lista}"` : ''}>`;
  }

  return `
    <div class="campo ${c.ancho ? 'campo-ancho' : ''}" data-campo="${c.nombre}">
      <label for="${id}">${escaparHtml(c.etiqueta)}${c.requerido ? ' <span class="obligatorio" aria-hidden="true">*</span>' : ''}</label>
      ${control}
      ${c.ayuda ? `<small id="${idAyuda}" class="campo-ayuda">${escaparHtml(c.ayuda)}</small>` : ''}
      <small id="${idError}" class="campo-error" aria-live="polite"></small>
    </div>
  `;
}

/** Normaliza el valor de un campo tal como se compararía/enviaría. */
function normalizar(c, valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return c.tipo === 'textarea' ? texto.trim() : texto.trim();
}

export async function vistaFormulario(contenedor, params, _consulta, ctx) {
  const esEdicion = Boolean(params.id);
  const id = params.id;
  let original = null;

  const migas = [
    { texto: 'Panel general', href: '/' },
    { texto: 'Equipos', href: '/equipos' },
  ];

  document.title = `${esEdicion ? 'Editar equipo' : 'Registrar equipo'} | Inventario de Equipos`;

  if (esEdicion) {
    if (!REGEX_UUID.test(id)) {
      contenedor.innerHTML =
        htmlEncabezado({ titulo: 'Equipo no encontrado', migas: [...migas, { texto: 'No encontrado' }] }) +
        htmlError('Equipo no encontrado', 'La dirección no corresponde a un equipo válido del inventario.', {
          reintentar: false,
          enlace: { href: '/equipos', texto: 'Volver al listado' },
        });
      return;
    }

    contenedor.innerHTML =
      htmlEncabezado({ titulo: 'Editar equipo', migas: [...migas, { texto: 'Editar' }] }) +
      htmlCargando('Cargando información del equipo…');

    try {
      original = await obtenerEquipo(id);
    } catch (error) {
      if (!ctx.esVigente()) return;
      const noExiste = error.estado === 404 || error.estado === 422;
      contenedor.innerHTML =
        htmlEncabezado({ titulo: 'Editar equipo', migas: [...migas, { texto: 'Editar' }] }) +
        htmlError(
          noExiste ? 'Equipo no encontrado' : 'No se pudo cargar el equipo',
          noExiste ? 'El equipo que intentas editar no existe o fue eliminado.' : error.message,
          { reintentar: !noExiste, enlace: { href: '/equipos', texto: 'Volver al listado' } }
        );
      contenedor.querySelector('[data-reintentar]')?.addEventListener('click', recargarVista);
      return;
    }
    if (!ctx.esVigente()) return;
    document.title = `Editar ${original.numero_inventario} | Inventario de Equipos`;
  }

  const valoresIniciales = {};
  for (const c of CAMPOS) {
    valoresIniciales[c.nombre] = esEdicion ? original[c.nombre] ?? '' : c.predeterminado ?? '';
  }

  const hrefDetalle = esEdicion ? `/equipos/${encodeURIComponent(id)}` : null;

  contenedor.innerHTML = `
    ${htmlEncabezado({
      titulo: esEdicion ? `Editar equipo ${original.numero_inventario}` : 'Registrar equipo',
      subtitulo: esEdicion
        ? 'Modifica la información del equipo y guarda los cambios.'
        : 'Captura la información del nuevo equipo. Los campos marcados con <span class="obligatorio">*</span> son obligatorios.',
      migas: esEdicion
        ? [...migas, { texto: original.numero_inventario, href: hrefDetalle }, { texto: 'Editar' }]
        : [...migas, { texto: 'Registrar equipo' }],
    })}

    <form class="formulario" novalidate>
      <div class="resumen-errores" role="alert" tabindex="-1" hidden></div>

      ${SECCIONES.map(
        (s) => `
        <section class="tarjeta seccion-formulario">
          <div class="seccion-formulario-intro">
            <h2>${escaparHtml(s.titulo)}</h2>
            <p>${escaparHtml(s.descripcion)}</p>
          </div>
          <div class="rejilla-campos">
            ${s.campos.map((c) => htmlCampo(c, valoresIniciales[c.nombre])).join('')}
          </div>
        </section>`
      ).join('')}

      <datalist id="lista-laboratorios"></datalist>

      <div class="barra-formulario">
        <p class="texto-tenue">${
          esEdicion
            ? `Última modificación: ${escaparHtml(formatearFechaHora(original.updated_at) || '—')}`
            : '<span class="obligatorio">*</span> Campos obligatorios'
        }</p>
        <div class="barra-formulario-acciones">
          <a class="boton boton-secundario" href="${esEdicion ? escaparHtml(hrefDetalle) : '/equipos'}" data-enlace>Cancelar</a>
          ${esEdicion ? '' : `<button type="submit" class="boton boton-secundario" data-otro>${ICONOS.agregar} Guardar y registrar otro</button>`}
          <button type="submit" class="boton boton-primario" data-guardar>${ICONOS.guardar} ${esEdicion ? 'Guardar cambios' : 'Registrar equipo'}</button>
        </div>
      </div>
    </form>
  `;

  const form = contenedor.querySelector('.formulario');
  const resumen = form.querySelector('.resumen-errores');
  const botones = form.querySelectorAll('button[type="submit"]');

  // Sugerencias de laboratorios existentes.
  obtenerEstadisticas()
    .then((stats) => {
      if (!ctx.esVigente()) return;
      const lista = form.querySelector('#lista-laboratorios');
      lista.innerHTML = Object.keys(stats.por_laboratorio || {})
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((l) => `<option value="${escaparHtml(l)}"></option>`)
        .join('');
    })
    .catch(() => {});

  const control = (nombre) => form.elements.namedItem(nombre);

  function leerValores() {
    const v = {};
    for (const c of CAMPOS) v[c.nombre] = normalizar(c, control(c.nombre).value);
    return v;
  }

  let instantanea = JSON.stringify(leerValores());
  const hayCambios = () => JSON.stringify(leerValores()) !== instantanea;
  let guardando = false;

  // --- Errores por campo -------------------------------------------------
  function marcarError(nombre, mensaje) {
    const campo = form.querySelector(`[data-campo="${nombre}"]`);
    if (!campo) return false;
    campo.classList.toggle('con-error', Boolean(mensaje));
    campo.querySelector('.campo-error').textContent = mensaje || '';
    const ctrl = control(nombre);
    if (mensaje) ctrl.setAttribute('aria-invalid', 'true');
    else ctrl.removeAttribute('aria-invalid');
    return true;
  }

  function limpiarErrores() {
    CAMPOS.forEach((c) => marcarError(c.nombre, ''));
    resumen.hidden = true;
    resumen.innerHTML = '';
  }

  function mostrarResumen(titulo, errores, mensajeGeneral) {
    const items = Object.entries(errores)
      .map(([nombre, msg]) => {
        const c = CAMPOS.find((x) => x.nombre === nombre);
        return c
          ? `<li><a href="#campo-${nombre}" data-ir="${nombre}">${escaparHtml(c.etiqueta)}</a>: ${escaparHtml(msg)}</li>`
          : `<li>${escaparHtml(msg)}</li>`;
      })
      .join('');
    resumen.innerHTML = `
      <strong>${escaparHtml(titulo)}</strong>
      ${mensajeGeneral ? `<p>${escaparHtml(mensajeGeneral)}</p>` : ''}
      ${items ? `<ul>${items}</ul>` : ''}
    `;
    resumen.hidden = false;
    resumen.querySelectorAll('[data-ir]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        control(a.dataset.ir).focus();
      })
    );
  }

  function validarCampo(c, valores) {
    const valor = valores[c.nombre];
    const vacio = valor === '';
    const tenia = esEdicion && original[c.nombre] !== null && original[c.nombre] !== undefined && original[c.nombre] !== '';

    if (c.requerido && vacio) return 'Este campo es obligatorio.';
    if (vacio) {
      if (esEdicion && tenia && CAMPOS_NO_BORRABLES.includes(c.nombre)) {
        return 'Este dato ya estaba registrado y no puede quedar vacío; solo puede modificarse.';
      }
      return '';
    }
    if (c.max && valor.length > c.max) return `Debe tener como máximo ${c.max} caracteres.`;

    if (c.tipo === 'number') {
      const ctrl = control(c.nombre);
      if (ctrl.validity.badInput || !/^\d+$/.test(valor)) return 'Debe ser un número entero.';
      const n = Number(valor);
      if (n < c.min || n > c.maxNum) return `Debe estar entre ${c.min} y ${c.maxNum}.`;
    }

    if (c.tipo === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return 'La fecha no es válida.';
      const cambio = !esEdicion || valor !== (original[c.nombre] || '');
      if (cambio && valor > hoyIso()) return 'La fecha no puede ser posterior a hoy.';
      if (c.nombre === 'fecha_ultima_revision' && valores.fecha_adquisicion && valor < valores.fecha_adquisicion) {
        const cambioAlguna =
          !esEdicion ||
          valor !== (original.fecha_ultima_revision || '') ||
          valores.fecha_adquisicion !== (original.fecha_adquisicion || '');
        if (cambioAlguna) return 'No puede ser anterior a la fecha de adquisición.';
      }
    }
    return '';
  }

  function validar(valores) {
    const errores = {};
    for (const c of CAMPOS) {
      // Un campo con entrada inválida en el navegador (p. ej. letras en número) se lee como vacío.
      if (c.tipo === 'number' && control(c.nombre).validity.badInput) {
        errores[c.nombre] = 'Debe ser un número entero.';
        continue;
      }
      const msg = validarCampo(c, valores);
      if (msg) errores[c.nombre] = msg;
    }
    return errores;
  }

  // Validación al salir de cada campo y limpieza del error al corregir.
  CAMPOS.forEach((c) => {
    const ctrl = control(c.nombre);
    ctrl.addEventListener('blur', () => {
      if (!ctrl.closest('.campo').classList.contains('con-error') && ctrl.value === '' && !c.requerido) return;
      marcarError(c.nombre, validarCampo(c, leerValores()));
    });
    ctrl.addEventListener('input', () => {
      if (ctrl.closest('.campo').classList.contains('con-error')) {
        marcarError(c.nombre, validarCampo(c, leerValores()));
      }
    });
  });

  // --- Construcción del cuerpo de la petición ------------------------------
  function convertir(c, valor) {
    if (c.tipo === 'number') return valor === '' ? null : parseInt(valor, 10);
    return valor;
  }

  function cuerpoCreacion(valores) {
    const cuerpo = {};
    for (const c of CAMPOS) {
      const valor = valores[c.nombre];
      if (valor === '') continue; // Se omite para que el servidor use nulo/predeterminado.
      cuerpo[c.nombre] = convertir(c, valor);
    }
    return cuerpo;
  }

  function cuerpoEdicion(valores) {
    const cuerpo = {};
    for (const c of CAMPOS) {
      const actual = valores[c.nombre];
      const previo = normalizar(c, original[c.nombre]);
      if (actual === previo) continue;
      // Los textos opcionales vaciados se envían como cadena vacía para borrarlos
      // (el servidor ignora los valores nulos al actualizar).
      cuerpo[c.nombre] = actual === '' ? '' : convertir(c, actual);
    }
    return cuerpo;
  }

  function bloquear(estado, botonActivo) {
    guardando = estado;
    botones.forEach((b) => {
      b.disabled = estado;
      if (estado && b === botonActivo) {
        b.dataset.texto = b.innerHTML;
        b.innerHTML = '<span class="spinner spinner-pequeno" aria-hidden="true"></span> Guardando…';
      } else if (!estado && b.dataset.texto) {
        b.innerHTML = b.dataset.texto;
        delete b.dataset.texto;
      }
    });
  }

  function reiniciarParaOtro(valores) {
    for (const c of CAMPOS) {
      if (!CAMPOS_CONSERVADOS.includes(c.nombre)) {
        control(c.nombre).value = c.predeterminado ?? '';
      } else {
        control(c.nombre).value = valores[c.nombre];
      }
    }
    limpiarErrores();
    instantanea = JSON.stringify(leerValores());
    window.scrollTo({ top: 0, behavior: 'smooth' });
    control('numero_inventario').focus({ preventScroll: true });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guardando) return;
    const boton = e.submitter || form.querySelector('[data-guardar]');
    const registrarOtro = boton?.hasAttribute('data-otro');

    limpiarErrores();
    const valores = leerValores();
    // Reflejar en pantalla los valores sin espacios sobrantes.
    CAMPOS.forEach((c) => {
      if (c.tipo === 'text' || c.tipo === 'textarea') control(c.nombre).value = valores[c.nombre];
    });

    const errores = validar(valores);
    if (Object.keys(errores).length) {
      Object.entries(errores).forEach(([n, m]) => marcarError(n, m));
      mostrarResumen(
        Object.keys(errores).length === 1 ? 'Hay 1 campo por corregir:' : `Hay ${Object.keys(errores).length} campos por corregir:`,
        errores
      );
      control(Object.keys(errores)[0]).focus();
      return;
    }

    let cuerpo;
    if (esEdicion) {
      cuerpo = cuerpoEdicion(valores);
      if (Object.keys(cuerpo).length === 0) {
        notificar('No hay cambios por guardar.', 'info');
        return;
      }
    } else {
      cuerpo = cuerpoCreacion(valores);
    }

    bloquear(true, boton);
    try {
      const guardado = esEdicion ? await actualizarEquipo(id, cuerpo) : await crearEquipo(cuerpo);
      if (!ctx.esVigente()) return;
      bloquear(false);

      if (esEdicion) {
        instantanea = JSON.stringify(leerValores());
        notificar(`Los cambios del equipo ${guardado.numero_inventario} se guardaron correctamente.`);
        navegar(`/equipos/${encodeURIComponent(guardado.id)}`, { forzar: true });
      } else if (registrarOtro) {
        notificar(`El equipo ${guardado.numero_inventario} se registró correctamente. Puedes capturar el siguiente.`);
        reiniciarParaOtro(valores);
      } else {
        instantanea = JSON.stringify(leerValores());
        notificar(`El equipo ${guardado.numero_inventario} se registró correctamente.`);
        navegar(`/equipos/${encodeURIComponent(guardado.id)}`, { forzar: true });
      }
    } catch (error) {
      if (!ctx.esVigente()) return;
      bloquear(false);

      if (esEdicion && error.estado === 404) {
        mostrarResumen('El equipo ya no existe.', {}, 'Es posible que otra persona lo haya eliminado del inventario.');
        resumen.focus();
        return;
      }

      const erroresServidor = error.errores || {};
      const conocidos = Object.entries(erroresServidor).filter(([n]) => marcarError(n, erroresServidor[n]));
      if (conocidos.length) {
        mostrarResumen('No se pudo guardar el equipo. Corrige lo siguiente:', Object.fromEntries(conocidos));
        control(conocidos[0][0]).focus();
      } else {
        mostrarResumen('No se pudo guardar el equipo.', {}, error.message);
        resumen.focus();
      }
    }
  });

  // --- Protección contra pérdida de cambios ---------------------------------
  const alSalirDePagina = (e) => {
    if (hayCambios() && !guardando) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', alSalirDePagina);

  establecerGuardiaSalida(async () => {
    if (!hayCambios()) return true;
    return confirmar({
      titulo: 'Descartar cambios',
      mensaje: '<p>Tienes cambios sin guardar en el formulario. Si sales ahora, se perderán.</p>',
      textoConfirmar: 'Salir sin guardar',
      textoCancelar: 'Seguir editando',
      peligro: true,
    });
  });

  control('numero_inventario').focus({ preventScroll: true });

  return () => {
    window.removeEventListener('beforeunload', alSalirDePagina);
  };
}
