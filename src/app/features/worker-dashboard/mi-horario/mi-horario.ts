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
  semanaSiguiente: { label: string; esquema: any; prog: any } | null = null;
  cargando = true;
  error = '';

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    const inicioActual   = this.getSabado(0);
    const inicioSiguiente = this.getSabado(1);

    // Cargar semana actual
    this.progService.getBySemana(inicioActual).subscribe({
      next: (progs) => {
        // Backend ya filtra solo las del trabajador autenticado
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
      error: () => { this.error = 'Error al cargar horario.'; this.cdr.detectChanges(); }
    });

    // Cargar semana siguiente
    this.progService.getBySemana(inicioSiguiente).subscribe({
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

  /** Calcula el sábado de la semana actual (offset=0) o siguiente (offset=1) */
  private getSabado(offset: number): string {
    const hoy = new Date();
    const dow = hoy.getDay(); // 0=Dom..6=Sáb
    const diasHastaSabado = (6 - dow + 7) % 7;
    const sabado = new Date(hoy);
    // Si hoy es sábado, offset=0 → mismo sábado
    if (dow === 6) {
      sabado.setDate(hoy.getDate() + (offset * 7));
    } else {
      // Retroceder al sábado pasado
      sabado.setDate(hoy.getDate() - ((dow + 1) % 7) + (offset * 7));
    }
    return sabado.toISOString().substring(0, 10);
  }
}
