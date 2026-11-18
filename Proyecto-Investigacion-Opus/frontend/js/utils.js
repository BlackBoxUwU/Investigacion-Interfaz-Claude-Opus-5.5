/**
 * Utilidades compartidas: catálogos, formato y seguridad.
 */

export const TIPOS_EQUIPO = [
  { valor: 'desktop', etiqueta: 'Computadora de escritorio' },
  { valor: 'laptop', etiqueta: 'Laptop' },
  { valor: 'monitor', etiqueta: 'Monitor' },
  { valor: 'impresora', etiqueta: 'Impresora' },
  { valor: 'servidor', etiqueta: 'Servidor' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export const ESTADOS_EQUIPO = [
  { valor: 'activo', etiqueta: 'Activo', descripcion: 'En uso dentro del laboratorio' },
  { valor: 'en_reparacion', etiqueta: 'En reparación', descripcion: 'Fuera de servicio temporalmente' },
  { valor: 'almacen', etiqueta: 'En almacén', descripcion: 'Resguardado, sin asignar a uso' },
  { valor: 'baja', etiqueta: 'Baja', descripcion: 'Retirado del inventario operativo' },
];

const MAPA_TIPOS = Object.fromEntries(TIPOS_EQUIPO.map((t) => [t.valor, t.etiqueta]));
const MAPA_ESTADOS = Object.fromEntries(ESTADOS_EQUIPO.map((e) => [e.valor, e.etiqueta]));

export const esTipoValido = (v) => v in MAPA_TIPOS;
export const esEstadoValido = (v) => v in MAPA_ESTADOS;

export function etiquetaTipo(valor) {
  return MAPA_TIPOS[valor] || valor || '—';
}

export function etiquetaEstado(valor) {
  return MAPA_ESTADOS[valor] || valor || '—';
}

/** Escapa texto para insertarlo de forma segura en HTML. */
export function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valor seguro para mostrar; muestra un guion si está vacío. */
export function mostrar(valor, vacio = '—') {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    return `<span class="texto-vacio">${vacio}</span>`;
  }
  return escaparHtml(valor);
}

export function tieneValor(valor) {
  return !(valor === null || valor === undefined || String(valor).trim() === '');
}

const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatoFechaHora = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatoNumero = new Intl.NumberFormat('es-MX');

/** Formatea una fecha "AAAA-MM-DD" sin desfases de zona horaria. */
export function formatearFecha(valor) {
  if (!valor) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return valor;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return formatoFecha.format(fecha);
}

/**
 * Formatea una marca de tiempo del servidor. El backend guarda la hora en UTC
 * sin indicar zona horaria, por lo que se interpreta explícitamente como UTC.
 */
export function formatearFechaHora(valor) {
  if (!valor) return null;
  const tieneZona = /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor);
  const fecha = new Date(tieneZona ? valor : `${valor}Z`);
  if (Number.isNaN(fecha.getTime())) return valor;
  return formatoFechaHora.format(fecha);
}

export function formatearNumero(n) {
  return formatoNumero.format(Number(n) || 0);
}

/** Pluraliza de forma sencilla: plural(3, 'equipo', 'equipos'). */
export function plural(n, singular, pluralTexto) {
  return `${formatearNumero(n)} ${Number(n) === 1 ? singular : pluralTexto}`;
}

export const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Retrasa la ejecución de una función hasta que dejen de llegar llamadas. */
export function rebote(fn, espera = 350) {
  let temporizador;
  const envuelta = (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), espera);
  };
  envuelta.cancelar = () => clearTimeout(temporizador);
  return envuelta;
}

/** Fecha de hoy en formato AAAA-MM-DD (hora local). */
export function hoyIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Insignia (badge) de estado. */
export function insigniaEstado(estado) {
  const clase = esEstadoValido(estado) ? estado : 'desconocido';
  return `<span class="insignia insignia-${clase}">${escaparHtml(etiquetaEstado(estado))}</span>`;
}

/** Iconos SVG en línea reutilizables. */
export const ICONOS = {
  ver: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/></svg>',
  editar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  eliminar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  agregar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  volver: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16a6.47 6.47 0 004.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  recargar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
  guardar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"/></svg>',
  limpiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  equipo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>',
};
