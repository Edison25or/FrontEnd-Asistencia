import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReporteService } from '../../../core/services/reporte.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';


@Component({
  selector: 'app-reporte-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-asistencia.html',
  styleUrl:    './reporte-asistencia.css'
})
export class ReporteAsistenciaComponent implements OnInit {

  private reporteService    = inject(ReporteService);
  private trabajadorService = inject(TrabajadorService);
  private cdr               = inject(ChangeDetectorRef);

  // Filtros
  fechaInicio   = this.primerDiaMes();
  fechaFin      = this.hoy();
  idTrabajador: number | null = null;
  idArea:       number | null = null;

  // Datos auxiliares
  areas:        any[] = [];
  trabajadores: any[] = [];
  trabajadoresFiltrados: any[] = [];
  terminoBusquedaTrab = '';

  // Resultados
  registros:   any[] = [];
  isLoading    = false;
  isExportando = false;
  buscado      = false;

  // Resumen
  get totalRegistros() { return this.registros.length; }
  get totalATiempo()   { return this.registros.filter(r => r.estado === 'A_TIEMPO').length; }
  get totalTarde()     { return this.registros.filter(r => r.estado === 'TARDE').length; }
  get totalFaltas()    { return this.registros.filter(r => r.estado === 'FALTA').length; }

  ngOnInit() {
    this.trabajadorService.getAreas().subscribe(d => {
      this.areas = d;
      this.cdr.detectChanges();
    });
    
    this.trabajadorService.getTrabajadores(0, 500).subscribe(res => {
      this.trabajadores          = res.content || res;
      this.trabajadoresFiltrados = [...this.trabajadores];
      this.cdr.detectChanges();
    });
  }

  filtrarTrabajadores() {
    const t = this.terminoBusquedaTrab.toLowerCase();
    this.trabajadoresFiltrados = this.trabajadores.filter(tr =>
      tr.nombreCompleto?.toLowerCase().includes(t) ||
      tr.nroDocumento?.includes(t)
    );
    this.cdr.detectChanges();
  }

  seleccionarTrabajador(t: any) {
    this.idTrabajador        = t.idTrabajador;
    this.terminoBusquedaTrab = t.nombreCompleto;
    this.trabajadoresFiltrados = [];
    this.cdr.detectChanges();
  }

  limpiarTrabajador() {
    this.idTrabajador        = null;
    this.terminoBusquedaTrab = '';
    this.trabajadoresFiltrados = [...this.trabajadores];
    this.cdr.detectChanges();
  }

  buscar() {
    if (!this.fechaInicio || !this.fechaFin) return;
    this.isLoading = true;
    this.buscado   = false;

    this.reporteService.getReporte({
      fechaInicio:  this.fechaInicio,
      fechaFin:     this.fechaFin,
      idTrabajador: this.idTrabajador,
      idArea:       this.idArea,
    }).subscribe({
      next: (data) => {
        this.registros = data;
        this.isLoading = false;
        this.buscado   = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  exportar() {
    if (this.registros.length === 0) return;
    this.isExportando = true;
    this.cdr.detectChanges();
    this.reporteService.exportarExcel(this.registros, this.fechaInicio, this.fechaFin);
    setTimeout(() => { this.isExportando = false; this.cdr.detectChanges(); }, 800);
  }

  estadoClass(estado: string): string {
    return {
      'A_TIEMPO':    'badge-ok',
      'TARDE':       'badge-tarde',
      'FALTA':       'badge-falta',
      'JUSTIFICADO': 'badge-just',
    }[estado] ?? '';
  }

  minutosAHoras(min: number | null): string {
    if (min == null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m.toString().padStart(2,'0')}m`;
  }

  private hoy(): string {
    return new Date().toISOString().split('T')[0];
  }

  private primerDiaMes(): string {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  }
}
