import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../core/services/asistencia.service';

@Component({
  selector: 'app-asistencia-dia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asistencia-dia.html',
  styleUrl: './asistencia-dia.css'
})
export class AsistenciaDiaComponent implements OnInit {

  private asistenciaService = inject(AsistenciaService);
  private cdr = inject(ChangeDetectorRef);

  asistencias:          any[] = [];
  asistenciasFiltradas: any[] = [];
  enPlanta:             any[] = [];
  isLoading = true;

  terminoBusqueda = '';
  filtroEstado    = '';   // filtra por estadoDiario

  totalPresente  = 0;
  totalATiempo   = 0;
  totalTarde     = 0;
  totalEnPlanta  = 0;

  ngOnInit() { this.cargarDatos(); }

  cargarDatos() {
    this.isLoading = true;

    this.asistenciaService.getAsistenciasDia().subscribe({
      next: (data) => {
        this.asistencias = data;
        this.aplicarFiltros();
        this.calcularResumen();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });

    this.asistenciaService.getEnPlanta().subscribe({
      next: (data) => {
        this.enPlanta     = data;
        this.totalEnPlanta = data.length;
        this.cdr.detectChanges();
      }
    });
  }

  aplicarFiltros() {
    let resultado = [...this.asistencias];

    if (this.terminoBusqueda.trim()) {
      const t = this.terminoBusqueda.toLowerCase();
      resultado = resultado.filter(a =>
        a.nombreCompleto?.toLowerCase().includes(t) ||
        a.nroDocumento?.includes(t)                 ||
        a.areaNombre?.toLowerCase().includes(t)     ||
        a.puestoNombre?.toLowerCase().includes(t)
      );
    }

    // ── Filtro por estado diario (A_TIEMPO / TARDE / FALTA / JUSTIFICADO)
    if (this.filtroEstado) {
      resultado = resultado.filter(a =>
        this.getEstadoDiario(a) === this.filtroEstado
      );
    }

    this.asistenciasFiltradas = resultado;
    this.cdr.detectChanges();
  }

  calcularResumen() {
    this.totalPresente = this.asistencias.length;
    this.totalATiempo  = this.asistencias.filter(a => this.getEstadoDiario(a) === 'A_TIEMPO').length;
    this.totalTarde    = this.asistencias.filter(a => this.getEstadoDiario(a) === 'TARDE').length;
  }

  /**
   * Devuelve el estado de resultado del día para una asistencia.
   * El nuevo DTO expone 'estadoDiario' (A_TIEMPO, TARDE, FALTA, JUSTIFICADO).
   * Para registros migrados sin ese campo, se mantiene compatibilidad
   * leyendo 'estado' como fallback (registros históricos pre-migración).
   */
  getEstadoDiario(a: any): string {
    return a.estadoDiario || a.estado || '';
  }

  buscar()                       { this.aplicarFiltros(); }
  filtrarPorEstado(e: string)    { this.filtroEstado = this.filtroEstado === e ? '' : e; this.aplicarFiltros(); }
  refrescar()                    { this.terminoBusqueda = ''; this.filtroEstado = ''; this.cargarDatos(); }

  getClaseEstado(a: any): string {
    switch (this.getEstadoDiario(a)) {
      case 'A_TIEMPO':    return 'badge-a-tiempo';
      case 'TARDE':       return 'badge-tarde';
      case 'FALTA':       return 'badge-falta';
      case 'JUSTIFICADO': return 'badge-justificado';
      default:            return 'badge-sin-estado';
    }
  }

  getEtiquetaEstado(a: any): string {
    switch (this.getEstadoDiario(a)) {
      case 'A_TIEMPO':    return 'A Tiempo';
      case 'TARDE':       return 'Tarde';
      case 'FALTA':       return 'Falta';
      case 'JUSTIFICADO': return 'Justificado';
      default:            return this.getEstadoDiario(a) || '—';
    }
  }

  // Versión del filtro que solo recibe el string (para el label del botón "quitar filtro")
  getEtiquetaFiltro(): string {
    switch (this.filtroEstado) {
      case 'A_TIEMPO':    return 'A Tiempo';
      case 'TARDE':       return 'Tarde';
      case 'FALTA':       return 'Falta';
      case 'JUSTIFICADO': return 'Justificado';
      default:            return this.filtroEstado;
    }
  }

  getTipoBadge(tipo: string): string {
    const mapa: Record<string, string> = {
      PROGRAMADA:    'tipo-prog',
      NO_PROGRAMADA: 'tipo-noprog',
      FALTA:         'tipo-falta',
      PERMISO:       'tipo-permiso'
    };
    return mapa[tipo] ?? 'tipo-prog';
  }

  getTipoLabel(tipo: string): string {
    const mapa: Record<string, string> = {
      PROGRAMADA:    'Prog.',
      NO_PROGRAMADA: 'No prog.',
      FALTA:         'Falta',
      PERMISO:       'Permiso'
    };
    return mapa[tipo] ?? tipo ?? '—';
  }

  getFechaHoy(): string {
    return new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
}