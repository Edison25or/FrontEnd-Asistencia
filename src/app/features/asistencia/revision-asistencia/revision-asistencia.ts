import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RevisionAsistenciaService } from '../../../core/services/revision-asistencia.service';

@Component({
  selector: 'app-revision-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './revision-asistencia.html',
  styleUrl:    './revision-asistencia.css'
})
export class RevisionAsistenciaComponent implements OnInit {

  private svc = inject(RevisionAsistenciaService);
  private cdr = inject(ChangeDetectorRef);

  // ── Estado general ────────────────────────────────────────
  quincenas:         any[]  = [];
  quincenaActual:    any    = null;
  asistencias:       any[]  = [];
  isLoadingQ         = false;
  isLoadingA         = false;
  errorGlobal        = '';
  isProcesando       = false;

  // ── Filtros de la tabla ───────────────────────────────────
  filtroNombre     = '';
  filtroEstado     = '';
  filtroTipo       = '';

  // ── Modal: crear quincena ─────────────────────────────────
  mostrarModalQ    = false;
  nuevoAnio        = new Date().getFullYear();
  nuevoMes         = new Date().getMonth() + 1;
  nuevoNumero      = 1;
  errorQ           = '';

  // ── Modal: validar tiempos ────────────────────────────────
  mostrarModalVal    = false;
  asistenciaVal: any = null;
  valPrev            = 0;
  valPost            = 0;
  valObservacion     = '';
  valTipo            = '';
  errorVal           = '';

  // ── Modal: asistencia no programada ──────────────────────
  mostrarModalNP     = false;
  npIdTrabajador     = '';
  npFecha            = '';
  npIngreso          = '';
  npSalida           = '';
  npObservacion      = '';
  errorNP            = '';

  readonly MESES = ['', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  readonly TIPOS_ESTADO = ['', 'PENDIENTE','MARCADO','CALCULADO','REVISADO','CONSOLIDADO'];
  readonly TIPOS_ASIST  = ['', 'PROGRAMADA','NO_PROGRAMADA','FALTA','PERMISO'];

  ngOnInit() { this.cargarQuincenas(); }

  // ── Quincenas ─────────────────────────────────────────────
  cargarQuincenas() {
    this.isLoadingQ = true;
    this.svc.getQuincenas().subscribe({
      next: q => { this.quincenas = q; this.isLoadingQ = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  seleccionarQuincena(q: any) {
    this.quincenaActual = q;
    this.filtroNombre = this.filtroEstado = this.filtroTipo = '';
    this.cargarAsistencias();
  }

  cargarAsistencias() {
    if (!this.quincenaActual) return;
    this.isLoadingA = true;
    this.svc.getParaRevision(this.quincenaActual.idQuincena).subscribe({
      next: a => { this.asistencias = a; this.isLoadingA = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingA = false; this.cdr.detectChanges(); }
    });
  }

  crearQuincena() {
    this.errorQ = '';
    this.isProcesando = true;
    this.svc.crearQuincena(this.nuevoAnio, this.nuevoMes, this.nuevoNumero).subscribe({
      next: () => {
        this.isProcesando = false;
        this.mostrarModalQ = false;
        this.cargarQuincenas();
      },
      error: (e: any) => {
        this.errorQ = e.error?.message || 'Error al crear quincena.';
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Filtros ───────────────────────────────────────────────
  get asistenciasFiltradas(): any[] {
    return this.asistencias.filter(a => {
      const nombre = a.nombreCompleto?.toLowerCase() || '';
      const ok1 = !this.filtroNombre || nombre.includes(this.filtroNombre.toLowerCase());
      const ok2 = !this.filtroEstado || a.estado === this.filtroEstado;
      const ok3 = !this.filtroTipo  || a.tipo   === this.filtroTipo;
      return ok1 && ok2 && ok3;
    });
  }

  // ── Validar tiempos ───────────────────────────────────────
  abrirModalVal(a: any) {
    this.asistenciaVal  = a;
    this.valPrev        = a.valMinPrevIng ?? 0;
    this.valPost        = a.valMinPostSal ?? 0;
    this.valObservacion = a.observacion   ?? '';
    this.valTipo        = a.tipo;
    this.errorVal       = '';
    this.mostrarModalVal = true;
  }

  guardarValidacion() {
    if (!this.asistenciaVal) return;
    this.isProcesando = true; this.errorVal = '';
    this.svc.validarTiempos({
      idAsistencia:  this.asistenciaVal.idAsistencia,
      valMinPrevIng: this.valPrev,
      valMinPostSal: this.valPost,
      observacion:   this.valObservacion,
      tipo:          this.valTipo
    }).subscribe({
      next: (actualizada: any) => {
        const idx = this.asistencias.findIndex(
          x => x.idAsistencia === actualizada.idAsistencia);
        if (idx >= 0) this.asistencias[idx] = actualizada;
        this.isProcesando = false;
        this.mostrarModalVal = false;
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorVal = e.error?.message || 'Error al guardar.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Asistencia no programada ──────────────────────────────
  abrirModalNP() {
    this.npIdTrabajador = ''; this.npFecha = '';
    this.npIngreso = ''; this.npSalida = '';
    this.npObservacion = ''; this.errorNP = '';
    this.mostrarModalNP = true;
  }

  guardarNoProgramada() {
    if (!this.npIdTrabajador || !this.npFecha || !this.npIngreso) {
      this.errorNP = 'Trabajador, fecha e ingreso son obligatorios.'; return;
    }
    this.isProcesando = true; this.errorNP = '';
    this.svc.registrarNoProgramada({
      idTrabajador: Number(this.npIdTrabajador),
      fecha:        this.npFecha,
      ingresoReal:  this.npIngreso,
      salidaReal:   this.npSalida  || undefined,
      observacion:  this.npObservacion || undefined
    }).subscribe({
      next: (nueva: any) => {
        // Si la quincena seleccionada coincide, agregar a la lista
        if (this.quincenaActual) this.cargarAsistencias();
        this.isProcesando = false;
        this.mostrarModalNP = false;
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorNP = e.error?.message || 'Error al registrar.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  formatMin(min: number | null): string {
    if (min == null || min === 0) return '—';
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  colorPill(color: string | null): string {
    const mapa: Record<string, string> = {
      'gris':           'pill-gris',
      'amarillo-palido':'pill-amarillo-palido',
      'amarillo':       'pill-amarillo',
      'naranja':        'pill-naranja'
    };
    return mapa[color ?? ''] ?? 'pill-gris';
  }

  estadoBadge(estado: string): string {
    const mapa: Record<string, string> = {
      PENDIENTE:   'badge-gris',
      MARCADO:     'badge-azul',
      CALCULADO:   'badge-celeste',
      REVISADO:    'badge-verde',
      CONSOLIDADO: 'badge-morado'
    };
    return mapa[estado] ?? 'badge-gris';
  }

  tipoBadge(tipo: string): string {
    const mapa: Record<string, string> = {
      PROGRAMADA:    'tipo-prog',
      NO_PROGRAMADA: 'tipo-noprog',
      FALTA:         'tipo-falta',
      PERMISO:       'tipo-permiso'
    };
    return mapa[tipo] ?? '';
  }

  puedeValidar(a: any): boolean {
    return !['CONSOLIDADO'].includes(a.estado);
  }

  // Resumen de la quincena seleccionada
  get totalRevisados(): number {
    return this.asistencias.filter(a => a.estado === 'REVISADO').length;
  }
  get totalPendientes(): number {
    return this.asistencias.filter(
      a => ['CALCULADO','MARCADO','PENDIENTE'].includes(a.estado)).length;
  }
}