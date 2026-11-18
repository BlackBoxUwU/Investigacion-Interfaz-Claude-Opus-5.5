/**
 * Punto de entrada de la aplicación.
 */
import { ruta, rutaPorDefecto, iniciar } from './router.js';
import { vistaPanel } from './views/panel.js';
import { vistaLista } from './views/lista.js';
import { vistaDetalle } from './views/detalle.js';
import { vistaFormulario } from './views/formulario.js';
import { vistaNoEncontrada } from './views/no-encontrada.js';

// Restaurar la ruta original si se llegó aquí desde 404.html.
try {
  const pendiente = sessionStorage.getItem('rutaPendiente');
  if (pendiente) {
    sessionStorage.removeItem('rutaPendiente');
    if (pendiente.startsWith('/') && !pendiente.startsWith('//')) {
      history.replaceState(null, '', pendiente);
    }
  }
} catch {
  /* sin almacenamiento disponible */
}

ruta('/', { vista: vistaPanel, seccion: 'panel' });
ruta('/index.html', { vista: vistaPanel, seccion: 'panel' });
ruta('/equipos', { vista: vistaLista, seccion: 'equipos' });
ruta('/equipos/nuevo', { vista: (c, p, q, ctx) => vistaFormulario(c, {}, q, ctx), seccion: 'nuevo' });
ruta('/equipos/:id/editar', {
  vista: (c, p, q, ctx) => vistaFormulario(c, p, q, ctx),
  seccion: 'equipos',
});
ruta('/equipos/:id', { vista: vistaDetalle, seccion: 'equipos' });
rutaPorDefecto({ vista: vistaNoEncontrada });

iniciar(document.getElementById('contenido'));
