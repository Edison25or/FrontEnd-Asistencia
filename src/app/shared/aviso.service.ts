import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

/**
 * Avisos de la aplicación, en reemplazo de alert() y confirm().
 *
 * ============================================================
 * POR QUÉ NO USAR LOS DIÁLOGOS DEL NAVEGADOR
 * ============================================================
 * alert() muestra una ventana del navegador encabezada por
 * "localhost:4200 dice", que delata la dirección del servidor y rompe la
 * apariencia de la aplicación. Con la dirección de producción diría el
 * nombre del servidor de la empresa, lo que resulta igual de extraño.
 *
 * Además bloquea el hilo: mientras el diálogo está abierto la pantalla no
 * responde, no se puede copiar el texto y el usuario debe cerrarlo antes
 * de seguir, aunque el aviso sea meramente informativo.
 *
 * Los avisos de éxito se retiran solos; los de error permanecen hasta que
 * la persona los cierra, porque suelen requerir una acción de su parte.
 */
@Injectable({ providedIn: 'root' })
export class AvisoService {

  /** Avisos visibles. El componente contenedor los dibuja. */
  readonly avisos = signal<Aviso[]>([]);

  private siguienteId = 1;

  exito(texto: string) { this.mostrar('exito', texto, 4000); }
  info(texto: string)  { this.mostrar('info',  texto, 5000); }

  /** Los errores no se retiran solos: requieren que se lean. */
  error(texto: string) { this.mostrar('error', texto, 0); }

  private mostrar(tipo: TipoAviso, texto: string, ms: number) {
    const id = this.siguienteId++;
    this.avisos.update(lista => [...lista, { id, tipo, texto }]);
    if (ms > 0) setTimeout(() => this.cerrar(id), ms);
  }

  cerrar(id: number) {
    this.avisos.update(lista => lista.filter(a => a.id !== id));
  }
}
