import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgramacionService } from '../../../core/services/programacion.service';
import { EsquemaHorarioService } from '../../../core/services/esquema-horario.service';

@Component({
  selector: 'app-mi-horario',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mi-horario.html',
  styleUrl: './mi-horario.css'
})
export class MiHorarioComponent implements OnInit {

  private progService    = inject(ProgramacionService);
  private esquemaService = inject(EsquemaHorarioService);
  private cdr            = inject(ChangeDetectorRef);

  semanaActual:    { label: string; esquema: any; prog: any } | null = null;

  /**
   * Día de hoy en numeración ISO (1 = lunes … 7 = domingo), que es la que
   * usa HorarioDia.diaSemana en el servidor. getDay() del navegador cuenta
   * 0 = domingo, de ahí la conversión.
   *
   * Se calcula una vez al construir el componente: la pantalla no vive
   * abierta el tiempo suficiente para que cambie el día.
   */
  readonly diaHoyIso = new Date().getDay() === 0 ? 7 : new Date().getDay();
  semanaSiguiente: { label: string; esquema: any; prog: any } | null = null;
  cargando = true;
  error = '';

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    const inicioActual   = this.getSabado(0);
    const inicioSiguiente = this.getSabado(1);

    // Cargar semana actual
    // getMiSemana y no getBySemana: este último devuelve el área completa
    // cuando quien consulta es Jefe.
    this.progService.getMiSemana(inicioActual).subscribe({
      next: (progs) => {
        // El backend devuelve solo las del trabajador autenticado
        const prog = progs[0];
        if (prog) {
          this.esquemaService.getById(prog.idEsquema).subscribe({
            next: (esq) => {
              this.semanaActual = { label: prog.semanaLabel, esquema: esq, prog };
              this.cdr.detectChanges();
            },
            error: () => {
              this.semanaActual = { label: prog.semanaLabel, esquema: null, prog };
              this.cdr.detectChanges();
            }
          });
        } else {
          this.semanaActual = null;
        }
        this.cdr.detectChanges();
      },
      // Cada llamada apaga su propio indicador: antes solo lo hacía la
      // segunda, de modo que un fallo suyo dejaba la pantalla cargando
      // para siempre aunque la primera hubiera respondido bien.
      error: () => {
        this.error = 'No se pudo cargar tu horario.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });

    // Cargar semana siguiente
    this.progService.getMiSemana(inicioSiguiente).subscribe({
      next: (progs) => {
        const prog = progs[0];
        if (prog) {
          this.esquemaService.getById(prog.idEsquema).subscribe({
            next: (esq) => {
              this.semanaSiguiente = { label: prog.semanaLabel, esquema: esq, prog };
              this.cargando = false;
              this.cdr.detectChanges();
            },
            error: () => {
              this.semanaSiguiente = { label: prog.semanaLabel, esquema: null, prog };
              this.cargando = false;
              this.cdr.detectChanges();
            }
          });
        } else {
          this.semanaSiguiente = null;
          this.cargando = false;
        }
        this.cdr.detectChanges();
      },
      error: () => { this.cargando = false; this.cdr.detectChanges(); }
    });
  }

  /**
   * Sábado que inicia la semana: la actual con offset 0, la siguiente
   * con offset 1.
   *
   * ============================================================
   * POR QUÉ NO SE USA toISOString()
   * ============================================================
   * toISOString() convierte a UTC. En Lima, que va cinco horas por
   * detrás, cualquier consulta hecha a partir de las 19:00 devolvía el
   * día siguiente: el sistema pedía la semana del domingo, que no
   * existe, y el horario aparecía vacío sin ningún error.
   *
   * La fecha se arma con los componentes locales, de modo que el día que
   * se envía es el que la persona tiene en su reloj.
   */
  /**
   * Marca el día en curso dentro de la semana actual.
   *
   * Solo se usa en la semana actual: en la próxima no hay un "hoy" que
   * señalar, y resaltar un día ahí induciría a error.
   */
  esHoy(dia: any): boolean {
    return dia?.diaSemana === this.diaHoyIso;
  }

  /**
   * Total del esquema: las horas netas y, si el esquema las programa, las
   * extra. Mostrar solo las netas dejaba fuera tiempo que el trabajador sí
   * tiene programado, y el total no cuadraba con la suma de sus días.
   */
  totalEsquema(esquema: any): string {
    const netas = esquema?.totalHorasNetas ?? '00:00';
    const extra = esquema?.totalHorasExtra;
    return (!extra || extra === '00:00')
      ? `${netas} hrs netas`
      : `${netas} netas + ${extra} extra`;
  }

  private getSabado(offset: number): string {
    const hoy = new Date();

    // getDay(): 0 = domingo .. 6 = sábado. Se retrocede al sábado de la
    // semana en curso; si hoy ES sábado, se queda donde está.
    const diasDesdeSabado = (hoy.getDay() + 1) % 7;

    const sabado = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate() - diasDesdeSabado + offset * 7
    );

    const mm = String(sabado.getMonth() + 1).padStart(2, '0');
    const dd = String(sabado.getDate()).padStart(2, '0');
    return `${sabado.getFullYear()}-${mm}-${dd}`;
  }
}
