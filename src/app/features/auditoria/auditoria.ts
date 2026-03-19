import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditoriaService } from '../../core/services/auditoria.service';

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auditoria.html',
  styleUrl:    './auditoria.css'
})
export class AuditoriaComponent implements OnInit {
  private svc = inject(AuditoriaService);
  private cdr = inject(ChangeDetectorRef);

  registros:   any[]  = [];
  isLoading           = false;
  totalElements       = 0;
  totalPages          = 0;

  // Filtros
  filtroTabla  = '';
  filtroAccion = '';
  filtroDesde  = '';
  filtroHasta  = '';
  pageActual   = 0;
  pageSize     = 30;

  readonly TABLAS  = ['trabajadores', 'grupos_trabajo', 'usuarios', 'esquemas_horario'];
  readonly ACCIONES = ['CREAR', 'MODIFICAR', 'ELIMINAR', 'CESAR', 'REINGRESAR',
                       'RESET_PASSWORD', 'CAMBIAR_ROL', 'DESHABILITAR', 'HABILITAR'];

  // Mapa de colores por acción
  readonly COLORES: Record<string, string> = {
    CREAR:          'badge-verde',
    MODIFICAR:      'badge-azul',
    ELIMINAR:       'badge-rojo',
    CESAR:          'badge-naranja',
    REINGRESAR:     'badge-verde',
    RESET_PASSWORD: 'badge-amarillo',
    CAMBIAR_ROL:    'badge-morado',
    DESHABILITAR:   'badge-naranja',
    HABILITAR:      'badge-verde',
  };

  ngOnInit() { this.buscar(); }

  buscar(resetPage = true) {
    if (resetPage) this.pageActual = 0;
    this.isLoading = true;
    this.svc.buscar({
      tabla:  this.filtroTabla  || undefined,
      accion: this.filtroAccion || undefined,
      desde:  this.filtroDesde  || undefined,
      hasta:  this.filtroHasta  || undefined,
      page:   this.pageActual,
      size:   this.pageSize
    }).subscribe({
      next: (res) => {
        this.registros     = res.content;
        this.totalElements = res.totalElements;
        this.totalPages    = res.totalPages;
        this.isLoading     = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  limpiarFiltros() {
    this.filtroTabla  = '';
    this.filtroAccion = '';
    this.filtroDesde  = '';
    this.filtroHasta  = '';
    this.buscar();
  }

  paginaAnterior() { if (this.pageActual > 0) { this.pageActual--; this.buscar(false); } }
  paginaSiguiente() { if (this.pageActual < this.totalPages - 1) { this.pageActual++; this.buscar(false); } }

  badgeClass(accion: string): string { return this.COLORES[accion] || 'badge-gris'; }

  formatFecha(f: string): string {
    if (!f) return '—';
    const d = new Date(f);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }
}