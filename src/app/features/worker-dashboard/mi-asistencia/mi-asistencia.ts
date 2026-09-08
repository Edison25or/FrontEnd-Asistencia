import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FechaPePipe } from '../../../shared/fecha-pe.pipe';
import { ReporteService } from '../../../core/services/reporte.service';
import { AuthService } from '../../../core/services/auth';

type Rango = 'SEMANA' | 'QUINCENA' | 'MES' | 'MES_ANT' | 'DOS_MESES';

@Component({
  selector: 'app-mi-asistencia',
  standalone: true,
  imports: [CommonModule, FechaPePipe],
  templateUrl: './mi-asistencia.html',
  styleUrl: './mi-asistencia.css'
})
export class MiAsistenciaComponent implements OnInit {

  private reporteService = inject(ReporteService);
  private authService    = inject(AuthService);
  private cdr            = inject(ChangeDetectorRef);

  registros: any[] = [];
  cargando  = false;
  rangoActual: Rango = 'SEMANA';
  error = '';

  rangos: { key: Rango; label: string }[] = [
    { key: 'SEMANA',     label: 'Semana actual' },
    { key: 'QUINCENA',   label: 'Quincena' },
    { key: 'MES',        label: 'Mes actual' },
    { key: 'MES_ANT',    label: 'Mes anterior' },
    { key: 'DOS_MESES',  label: '2 meses atrás' },
  ];

  ngOnInit() {
    this.cargar('SEMANA');
  }

  cargar(rango: Rango) {
    this.rangoActual = rango;
    this.cargando = true;
    this.error = '';

    const { inicio, fin } = this.calcularFechas(rango);

    this.reporteService.getReporte({
      fechaInicio: inicio,
      fechaFin: fin
      // No envía idTrabajador - el backend lo fuerza al usuario autenticado
    }).subscribe({
      next: (data) => {
        this.registros = this.filtrarRegistros(data);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Error al cargar asistencias.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Filtra igual que la app móvil: días pasados con registro + próximo programado */
  private filtrarRegistros(lista: any[]): any[] {
    const hoy = new Date().toISOString().substring(0, 10);
    const conRegistro = lista.filter(r => {
      const estado = (r.estado || '').toUpperCase();
      return r.fecha <= hoy && !['PENDIENTE', 'PROGRAMADO', ''].includes(estado);
    });
    const proximo = lista
      .filter(r => {
        const estado = (r.estado || '').toUpperCase();
        return r.fecha >= hoy && ['PENDIENTE', 'PROGRAMADO', 'MARCADO'].includes(estado);
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];

    return proximo ? [...conRegistro, proximo] : conRegistro;
  }

  private calcularFechas(rango: Rango): { inicio: string; fin: string } {
    const hoy = new Date();
    const fmt = (d: Date) => d.toISOString().substring(0, 10);

    switch (rango) {
      case 'SEMANA': {
        const dow = hoy.getDay();
        const sabado = new Date(hoy);
        sabado.setDate(hoy.getDate() - ((dow + 1) % 7));
        const viernes = new Date(sabado);
        viernes.setDate(sabado.getDate() + 6);
        return { inicio: fmt(sabado), fin: fmt(viernes) };
      }
      case 'QUINCENA': {
        const dia = hoy.getDate();
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), dia <= 15 ? 1 : 16);
        const fin = dia <= 15
          ? new Date(hoy.getFullYear(), hoy.getMonth(), 15)
          : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        return { inicio: fmt(inicio), fin: fmt(fin) };
      }
      case 'MES': {
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        return { inicio: fmt(inicio), fin: fmt(fin) };
      }
      case 'MES_ANT': {
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
        return { inicio: fmt(inicio), fin: fmt(fin) };
      }
      case 'DOS_MESES': {
        const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
        const fin = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 0);
        return { inicio: fmt(inicio), fin: fmt(fin) };
      }
    }
  }

  /**
   * Clasifica la jornada a partir del tipo y los minutos de tardanza.
   *
   * Antes se leía el campo `estado`, comparándolo contra 'A_TIEMPO',
   * 'TARDE' y 'FALTA'. Ese campo ya no contiene esos valores: hoy lleva
   * el ciclo de vida del registro (PENDIENTE, MARCADO, CALCULADO,
   * REVISADO, CONSOLIDADO), de modo que ninguna comparación acertaba y
   * el trabajador veía su historial sin estado.
   *
   * Es el mismo criterio que aplican Asistencias del Día y el Reporte,
   * para que las tres pantallas no puedan contradecirse.
   */
  private estadoJornada(r: any): string {
    if (r.tipo === 'FALTA_INJUSTIFICADA')   return 'FALTA';
    if (r.permisoAsociado)                  return 'PERMISO';
    if (r.faltaJustificadaAsociada)         return 'JUSTIFICADA';

    // Sin marcación no es "a tiempo": es una jornada que aún no ocurrió.
    if (!r.horaEntrada) {
      // Una jornada sin marcar puede estar en tres situaciones, y las
      // tres deben decir algo. Devolver el tipo tal cual dejaba
      // 'PROGRAMADA' sin etiqueta, que es como salir en blanco: el
      // trabajador veía la fila vacía sin saber si le contaba como falta.
      if (r.estado === 'PENDIENTE') return 'PENDIENTE';
      if (r.tipo === 'PROGRAMADA')  return 'SIN_MARCAR';
      return r.tipo || 'SIN_MARCAR';
    }
    if (r.tipo === 'MARCACION_INCOMPLETA')     return 'INCOMPLETA';
    if (r.tipo === 'HORA_EXTRA_NO_PROGRAMADA') return 'HORA_EXTRA';
    if (r.tipo === 'NO_PROGRAMADA')            return 'NO_PROGRAMADA';
    if (r.tipo === 'CONTINGENCIA')             return 'CONTINGENCIA';

    return (r.minTardanza ?? 0) > 0 ? 'TARDE' : 'A_TIEMPO';
  }

  getEstadoClass(r: any): string {
    return {
      A_TIEMPO:      'estado-ok',
      TARDE:         'estado-tarde',
      FALTA:         'estado-falta',
      PERMISO:       'estado-justificado',
      JUSTIFICADA:   'estado-justificado',
      CONTINGENCIA:  'estado-justificado',
      INCOMPLETA:    'estado-tarde',
      HORA_EXTRA:    'estado-tarde',
      NO_PROGRAMADA: 'estado-tarde',
      PENDIENTE:     'estado-pendiente',
    }[this.estadoJornada(r)] ?? '';
  }

  getEstadoLabel(r: any): string {
    return {
      A_TIEMPO:      'A tiempo',
      TARDE:         'Tardanza',
      FALTA:         'Falta',
      PERMISO:       'Permiso',
      JUSTIFICADA:   'Justificada',
      INCOMPLETA:    'Sin salida',
      HORA_EXTRA:    'Hora extra',
      NO_PROGRAMADA: 'No programada',
      CONTINGENCIA:  'Registro manual',
      PENDIENTE:     'Programado',
      SIN_MARCAR:    'Sin marcar',
    }[this.estadoJornada(r)] ?? this.estadoJornada(r);
  }

  /** Día de la semana, al mediodía para que la zona no lo desplace. */
  diaSemana(iso: string): string {
    if (!iso) return '';
    const d = new Date(`${String(iso).substring(0, 10)}T12:00:00`);
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles',
            'Jueves', 'Viernes', 'Sábado'][d.getDay()];
  }

}
