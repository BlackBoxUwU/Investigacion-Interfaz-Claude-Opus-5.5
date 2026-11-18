/**
 * Cliente de la API REST de equipos.
 * Todas las rutas son relativas al mismo origen que la interfaz.
 */

const BASE = '/api/equipos';

/** Nombres legibles de los campos, para mensajes de error. */
const NOMBRES_CAMPOS = {
  numero_inventario: 'Número de inventario',
  tipo_equipo: 'Tipo de equipo',
  marca: 'Marca',
  modelo: 'Modelo',
  numero_serie: 'Número de serie',
  procesador: 'Procesador',
  ram_gb: 'Memoria RAM',
  almacenamiento: 'Almacenamiento',
  sistema_operativo: 'Sistema operativo',
  estado: 'Estado',
  laboratorio: 'Laboratorio',
  ubicacion: 'Ubicación',
  responsable: 'Responsable',
  fecha_adquisicion: 'Fecha de adquisición',
  fecha_ultima_revision: 'Fecha de última revisión',
  observaciones: 'Observaciones',
  equipo_id: 'Identificador del equipo',
  page: 'Página',
  page_size: 'Elementos por página',
};

export class ErrorApi extends Error {
  /**
   * @param {string} mensaje Mensaje general en español.
   * @param {number} estado Código HTTP (0 si no hubo respuesta).
   * @param {Object<string,string>} errores Errores por campo.
   */
  constructor(mensaje, estado = 0, errores = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.errores = errores;
  }
}

/** Traduce un error de validación de FastAPI/Pydantic al español. */
function traducirValidacion(err) {
  const ctx = err.ctx || {};
  switch (err.type) {
    case 'missing':
      return 'Este campo es obligatorio.';
    case 'string_too_short':
      return ctx.min_length === 1
        ? 'Este campo no puede quedar vacío.'
        : `Debe tener al menos ${ctx.min_length} caracteres.`;
    case 'string_too_long':
      return `Debe tener como máximo ${ctx.max_length} caracteres.`;
    case 'int_parsing':
    case 'int_type':
    case 'int_from_float':
      return 'Debe ser un número entero.';
    case 'greater_than_equal':
      return `Debe ser mayor o igual a ${ctx.ge}.`;
    case 'less_than_equal':
      return `Debe ser menor o igual a ${ctx.le}.`;
    case 'date_parsing':
    case 'date_from_datetime_parsing':
    case 'date_type':
      return 'La fecha no es válida.';
    case 'enum':
      return 'El valor seleccionado no es válido.';
    case 'uuid_parsing':
    case 'uuid_type':
      return 'El identificador no es válido.';
    case 'json_invalid':
      return 'La información enviada no tiene un formato válido.';
    default:
      return 'El valor no es válido.';
  }
}

/** Convierte el cuerpo de una respuesta con error en un ErrorApi. */
function construirError(estado, cuerpo) {
  const detalle = cuerpo && cuerpo.detail;
  const errores = {};

  if (estado === 422 && Array.isArray(detalle)) {
    const lineas = [];
    for (const err of detalle) {
      const loc = Array.isArray(err.loc) ? err.loc : [];
      const campo = loc.length > 1 ? String(loc[loc.length - 1]) : null;
      const mensaje = traducirValidacion(err);
      if (campo && !errores[campo]) errores[campo] = mensaje;
      lineas.push(campo ? `${NOMBRES_CAMPOS[campo] || campo}: ${mensaje}` : mensaje);
    }
    return new ErrorApi(
      lineas.length ? `Revisa los datos: ${lineas.join(' ')}` : 'Los datos enviados no son válidos.',
      estado,
      errores
    );
  }

  if (typeof detalle === 'string') {
    // Conflictos por duplicado (409): se asocian al campo correspondiente.
    if (estado === 409) {
      if (/inventario/i.test(detalle)) errores.numero_inventario = detalle + '.';
      else if (/serie/i.test(detalle)) errores.numero_serie = detalle + '.';
    }
    return new ErrorApi(detalle.endsWith('.') ? detalle : detalle + '.', estado, errores);
  }

  const genericos = {
    400: 'La solicitud no es válida.',
    404: 'El recurso solicitado no existe.',
    409: 'Ya existe un registro con esos datos.',
    500: 'Ocurrió un error en el servidor. Intenta de nuevo más tarde.',
    502: 'El servidor no está disponible en este momento.',
    503: 'El servidor no está disponible en este momento.',
    504: 'El servidor tardó demasiado en responder.',
  };
  return new ErrorApi(
    genericos[estado] || `Error inesperado del servidor (código ${estado}).`,
    estado,
    errores
  );
}

async function solicitar(ruta, { metodo = 'GET', cuerpo, signal } = {}) {
  const opciones = { method: metodo, headers: { Accept: 'application/json' }, signal };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ErrorApi(
      'No fue posible conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
      0
    );
  }

  if (respuesta.status === 204) return null;

  let datos = null;
  const texto = await respuesta.text();
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = null;
    }
  }

  if (!respuesta.ok) throw construirError(respuesta.status, datos);
  return datos;
}

/** GET /api/equipos/stats */
export function obtenerEstadisticas(opciones = {}) {
  return solicitar(`${BASE}/stats`, opciones);
}

/**
 * GET /api/equipos
 * @param {{page?:number,page_size?:number,estado?:string,tipo_equipo?:string,laboratorio?:string,busqueda?:string}} filtros
 */
export function listarEquipos(filtros = {}, opciones = {}) {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      params.set(clave, String(valor).trim());
    }
  }
  const consulta = params.toString();
  return solicitar(consulta ? `${BASE}?${consulta}` : BASE, opciones);
}

/** GET /api/equipos/{id} */
export function obtenerEquipo(id, opciones = {}) {
  return solicitar(`${BASE}/${encodeURIComponent(id)}`, opciones);
}

/** POST /api/equipos */
export function crearEquipo(datos) {
  return solicitar(BASE, { metodo: 'POST', cuerpo: datos });
}

/** PUT /api/equipos/{id} */
export function actualizarEquipo(id, datos) {
  return solicitar(`${BASE}/${encodeURIComponent(id)}`, { metodo: 'PUT', cuerpo: datos });
}

/** DELETE /api/equipos/{id} */
export function eliminarEquipo(id) {
  return solicitar(`${BASE}/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
}
