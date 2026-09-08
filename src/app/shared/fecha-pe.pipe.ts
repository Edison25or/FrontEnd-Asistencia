import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formatea una fecha del backend como dd/mm/aaaa.
 *
 * ============================================================
 * POR QUÉ UN PIPE PROPIO Y NO DatePipe
 * ============================================================
 * DatePipe de Angular convierte primero a Date, lo que interpreta la
 * cadena en la zona horaria del navegador. Con una fecha suelta como
 * '2026-09-03', el navegador la lee como medianoche UTC y en Lima la
 * muestra como el día anterior. En un sistema de asistencia ese
 * desplazamiento de un día altera a qué jornada pertenece un registro.
 *
 * Este pipe trabaja sobre la cadena, sin convertirla, de modo que la
 * fecha que envía el backend es exactamente la que se muestra.
 *
 * Acepta los tres formatos que devuelve la interfaz de programación:
 *   '2026-09-03'                fecha suelta
 *   '2026-09-03T22:45:00'       instante
 *   '2026-09-03 22:45:00'       instante con espacio
 *
 * Uso:
 *   {{ a.fecha | fechaPe }}              -> 03/09/2026
 *   {{ q.inicio | fechaPe:'corta' }}     -> 03/09
 *   {{ q.inicio | fechaPe:'hora' }}      -> 03/09/2026 18:00
 *   {{ a.fecha | fechaPe:'larga' }}      -> jue 03/09/2026
 */
@Pipe({ name: 'fechaPe', standalone: true })
export class FechaPePipe implements PipeTransform {

  private static readonly DIAS =
    ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  transform(valor: string | null | undefined,
            modo: 'normal' | 'corta' | 'hora' | 'larga' = 'normal'): string {
    if (!valor) return '-';

    const s = String(valor).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return s;   // formato inesperado: se devuelve tal cual

    const [, aa, mm, dd, hh, mi] = m;

    switch (modo) {
      case 'corta':
        return `${dd}/${mm}`;

      case 'hora':
        return hh ? `${dd}/${mm}/${aa} ${hh}:${mi}` : `${dd}/${mm}/${aa}`;

      case 'larga': {
        // Mediodía para que el día de la semana no dependa de la zona.
        const d = new Date(`${aa}-${mm}-${dd}T12:00:00`);
        return `${FechaPePipe.DIAS[d.getDay()]} ${dd}/${mm}/${aa}`;
      }

      default:
        return `${dd}/${mm}/${aa}`;
    }
  }
}

/** Versión utilizable desde código, para las exportaciones. */
export function fechaPe(valor: string | null | undefined,
                        modo: 'normal' | 'corta' | 'hora' | 'larga' = 'normal'): string {
  return new FechaPePipe().transform(valor, modo);
}
