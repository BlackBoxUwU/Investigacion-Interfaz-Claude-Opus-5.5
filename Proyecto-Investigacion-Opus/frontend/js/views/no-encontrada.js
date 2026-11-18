import { htmlError } from '../ui.js';

export function vistaNoEncontrada(contenedor) {
  document.title = 'Página no encontrada | Inventario de Equipos';
  contenedor.innerHTML = htmlError(
    'Página no encontrada',
    'La dirección que intentas abrir no existe en el sistema.',
    { reintentar: false, enlace: { href: '/', texto: 'Ir al panel general' } }
  );
}
