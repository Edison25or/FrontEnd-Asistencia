import { HttpErrorResponse } from '@angular/common/http';

/**
 * Convierte cualquier fallo de una petición en un mensaje para el usuario.
 *
 * ============================================================
 * POR QUÉ NO BASTA CON error.error?.message
 * ============================================================
 * Ese patrón, repetido en cada componente, falla en cuatro situaciones y
 * en todas ellas el usuario termina viendo un texto genérico que no le
 * dice qué hacer, o directamente un mensaje técnico:
 *
 *   1. Sin conexión con el servidor, el estado llega en 0 y el cuerpo
 *      vacío. El usuario ve "Error al guardar" cuando el problema es que
 *      el backend no está levantado.
 *
 *   2. Cuando el servidor devuelve una página de error en lugar de JSON,
 *      el cuerpo es una cadena con HTML.
 *
 *   3. Ante un error no controlado, la traza de Java llegaba al usuario.
 *
 *   4. En los errores de validación, el detalle viaja por campo y el
 *      texto resumido puede quedar demasiado escueto.
 *
 * Centralizarlo aquí evita repetir esa lógica en los veintisiete puntos
 * donde el frontend muestra un error.
 */
export function mensajeError(err: unknown, respaldo = 'No se pudo completar la operación.'): string {

  // Fallo que no proviene de una petición
  if (!(err instanceof HttpErrorResponse)) {
    return respaldo;
  }

  // ── Sin respuesta del servidor ──
  // Estado 0 significa que la petición no llegó: el backend está
  // detenido, o la red no responde. Decirlo evita que el usuario intente
  // corregir sus datos cuando el problema está en otro lado.
  if (err.status === 0) {
    return 'No hay conexión con el servidor. Verifica que el sistema esté '
         + 'disponible e inténtalo de nuevo.';
  }

  const cuerpo: any = err.error;

  // ── Respuesta con la estructura de error del sistema ──
  if (cuerpo && typeof cuerpo === 'object') {

    // Detalle por campo de los errores de validación
    if (cuerpo.errores && typeof cuerpo.errores === 'object') {
      const detalles = Object.values(cuerpo.errores) as string[];
      if (detalles.length) return detalles.join(' ');
    }

    if (typeof cuerpo.message === 'string' && cuerpo.message.trim()) {
      return limpiar(cuerpo.message);
    }

    // Formato antiguo: mapa de campo a mensaje, sin propiedad message
    const valores = Object.values(cuerpo).filter(v => typeof v === 'string') as string[];
    if (valores.length) return valores.join(' ');
  }

  // ── Cuerpo en texto plano ──
  if (typeof cuerpo === 'string' && cuerpo.trim()) {
    // Una página de error del servidor llega como HTML: no se muestra.
    if (cuerpo.trimStart().startsWith('<')) return porEstado(err.status, respaldo);
    return limpiar(cuerpo);
  }

  return porEstado(err.status, respaldo);
}

/** Mensaje según el código, cuando el cuerpo no aporta nada utilizable. */
function porEstado(status: number, respaldo: string): string {
  switch (status) {
    case 400: return 'Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.';
    case 401: return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 403: return 'No tienes permisos para realizar esta acción.';
    case 404: return 'No se encontró el registro solicitado.';
    case 409: return 'La operación entra en conflicto con datos existentes.';
    case 500: return 'Ocurrió un error en el servidor. Si persiste, comunícalo al administrador.';
    case 503: return 'El servicio no está disponible en este momento.';
    default:  return respaldo;
  }
}

/**
 * Descarta un mensaje que delate detalle técnico.
 *
 * El manejador del backend traduce los errores conocidos, pero si alguno
 * se escapa conviene no mostrarlo: un usuario no puede hacer nada con el
 * nombre de una clase de Java o de una clave foránea.
 */
function limpiar(mensaje: string): string {
  const tecnico = /(Exception|java\.|org\.springframework|SQLException|Hibernate|constraint|foreign key|at com\.idat)/i;
  if (tecnico.test(mensaje)) {
    return 'Ocurrió un error al procesar la solicitud. Si persiste, '
         + 'comunícalo al administrador del sistema.';
  }
  return mensaje.trim();
}
