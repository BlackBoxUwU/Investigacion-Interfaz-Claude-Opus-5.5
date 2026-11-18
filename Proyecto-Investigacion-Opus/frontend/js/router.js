/**
 * Enrutador del lado del cliente basado en la History API.
 * Cada vista tiene su propia URL; la dirección del navegador cambia al navegar.
 */

const rutas = [];
let contenedor = null;
let limpiezaActual = null;
let guardiaSalida = null;
let urlActual = null;
let contadorNavegacion = 0;

/**
 * Registra una ruta.
 * @param {string} patron Ej.: '/equipos/:id/editar'
 * @param {{vista: Function, seccion?: string}} config
 */
export function ruta(patron, config) {
  const nombres = [];
  const regex = new RegExp(
    '^' +
      patron.replace(/\/:([a-zA-Z_]+)/g, (_, nombre) => {
        nombres.push(nombre);
        return '/([^/]+)';
      }) +
      '/?$'
  );
  rutas.push({ patron, regex, nombres, ...config });
}

/** Ruta usada cuando ninguna coincide. */
let rutaNoEncontrada = null;
export function rutaPorDefecto(config) {
  rutaNoEncontrada = config;
}

/**
 * Permite a la vista activa impedir la navegación (p. ej. cambios sin guardar).
 * La función debe devolver true (o una promesa con true) para permitir salir.
 */
export function establecerGuardiaSalida(fn) {
  guardiaSalida = fn;
}

function resolver(pathname) {
  for (const r of rutas) {
    const m = r.regex.exec(pathname);
    if (m) {
      const params = {};
      r.nombres.forEach((n, i) => {
        try {
          params[n] = decodeURIComponent(m[i + 1]);
        } catch {
          params[n] = m[i + 1];
        }
      });
      return { config: r, params };
    }
  }
  return { config: rutaNoEncontrada, params: {} };
}

function marcarMenu(seccion) {
  document.querySelectorAll('.menu a[data-seccion]').forEach((a) => {
    if (a.dataset.seccion === seccion) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function puedeSalir() {
  if (!guardiaSalida) return true;
  try {
    return Boolean(await guardiaSalida());
  } catch {
    return true;
  }
}

async function renderizar({ enfocar = true, conservarScroll = false } = {}) {
  const id = ++contadorNavegacion;
  const { pathname, search } = window.location;
  const { config, params } = resolver(pathname);

  if (typeof limpiezaActual === 'function') {
    try {
      limpiezaActual();
    } catch {
      /* ignorar */
    }
  }
  limpiezaActual = null;
  guardiaSalida = null;
  urlActual = pathname + search + window.location.hash;

  marcarMenu(config?.seccion);
  if (!conservarScroll) window.scrollTo(0, 0);

  const consulta = new URLSearchParams(search);
  const resultado = await config.vista(contenedor, params, consulta, {
    esVigente: () => id === contadorNavegacion,
  });
  if (id !== contadorNavegacion) {
    if (typeof resultado === 'function') resultado();
    return;
  }
  limpiezaActual = resultado;

  // Mover el foco al contenido (accesibilidad), salvo que la vista ya lo haya ubicado.
  if (enfocar && !contenedor.contains(document.activeElement)) {
    contenedor.focus({ preventScroll: true });
  }
}

/**
 * Navega a una URL interna.
 * @param {string} url
 * @param {{reemplazar?: boolean, forzar?: boolean, conservarScroll?: boolean, enfocar?: boolean}} opciones
 */
export async function navegar(url, opciones = {}) {
  const { reemplazar = false, forzar = false } = opciones;
  if (!forzar && !(await puedeSalir())) return false;
  if (reemplazar) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  await renderizar(opciones);
  return true;
}

/** Vuelve a mostrar la vista actual. */
export function recargarVista() {
  return renderizar({ enfocar: false, conservarScroll: true });
}

function esEnlaceInterno(a, evento) {
  if (!a || evento.defaultPrevented) return false;
  if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download') || a.getAttribute('rel') === 'external') return false;
  if (a.origin !== window.location.origin) return false;
  if (a.pathname.startsWith('/api/')) return false;
  return true;
}

export function iniciar(elemento) {
  contenedor = elemento;

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!esEnlaceInterno(a, e)) return;
    const destino = a.pathname + a.search + a.hash;
    // Enlace a la misma página solo con ancla: dejar el comportamiento nativo.
    if (a.pathname === window.location.pathname && a.search === window.location.search && a.hash) return;
    e.preventDefault();
    if (destino === urlActual) return;
    navegar(destino);
  });

  window.addEventListener('popstate', async () => {
    const destino = window.location.pathname + window.location.search + window.location.hash;
    if (guardiaSalida) {
      const anterior = urlActual;
      // Restaurar temporalmente la URL mientras el usuario decide.
      history.pushState(null, '', anterior);
      if (!(await puedeSalir())) return;
      history.replaceState(null, '', destino);
    }
    renderizar();
  });

  renderizar({ enfocar: false });
}
