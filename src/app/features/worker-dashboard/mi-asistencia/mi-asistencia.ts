import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReporteService } from '../../../core/services/reporte.service';
import { AuthService } from '../../../core/services/auth';

type Rango = 'SEMANA' | 'QUINCENA' | 'MES' | 'MES_ANT' | 'DOS_MESES';

@Component({
  selector: 'app-mi-asistencia',
  standalone: true,
  imports: [CommonModule],
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
      // No envía idTrabajador — el backend lo fuerza al usuario autenticado
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

  getEstadoClass(estado: string): string {
    switch ((estado || '').toUpperCase()) {
      case 'A_TIEMPO':    return 'estado-ok';
      case 'TARDE':       return 'estado-tarde';
      case 'FALTA':       return 'estado-falta';
      case 'JUSTIFICADO': return 'estado-justificado';
      case 'PENDIENTE':   return 'estado-pendiente';
      default:            return '';
    }
  }

  getEstadoLabel(estado: string): string {
    switch ((estado || '').toUpperCase()) {
      case 'A_TIEMPO':    return 'A tiempo';
      case 'TARDE':       return 'Tardanza';
      case 'FALTA':       return 'Falta';
      case 'JUSTIFICADO': return 'Justificado';
      case 'PENDIENTE':   return 'Programado';
      default:            return estado;
    }
  }
}
