import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FechaPePipe } from '../../../shared/fecha-pe.pipe';
import { FormsModule } from '@angular/forms';
import { RevisionAsistenciaService } from '../../../core/services/revision-asistencia.service';

@Component({
  selector: 'app-revision-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule, FechaPePipe],
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

  /**
   * Filtro por revisión pendiente.
   *
   * Es el que la especificación pide y el que de verdad importa:
   * requiereRevision es justo lo que bloquea el cierre de quincena
   * (RN-37). Filtrar por estado no sirve, porque una falta injustificada
   * y una jornada revisada a mano comparten estado REVISADO.
   */
  soloPendientesRevision = false;

  // ── Modal: crear quincena ─────────────────────────────────
  mostrarModalQ    = false;
  nuevoAnio        = new Date().getFullYear();
  nuevoMes         = new Date().getMonth() + 1;
  nuevoNumero      = 1;
  errorQ           = '';

  /** Resumen de la última corrida del cierre diario (CU29). */
  resultadoCierre: any = null;

  // ── Modal: validar tiempos ────────────────────────────────
  mostrarModalVal    = false;
  asistenciaVal: any = null;
  valPrev            = 0;
  valPost            = 0;
  valObservacion     = '';
  /**
   * Resultado de la validación de hora extra excepcional: APROBADO o
   * RECHAZADO (CU18, RN-33).
   *
   * Reemplaza al antiguo selector de "clasificación", que ofrecía FALTA y
   * PERMISO. Esos valores ya no existen: la falta la genera el cierre
   * diario y el permiso es una entidad propia con sus fechas. Cambiar el
   * tipo a mano desde aquí habría sido reescribir un hecho.
   */
  valResultado       = 'APROBADO';
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
    this.soloPendientesRevision = false;
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

  /**
   * Ejecuta el cierre diario a mano (CU29).
   *
   * Reemplaza a crearQuincena(), que desapareció: las quincenas se
   * autogeneran al confirmar la programación semanal (RN-35).
   *
   * El proceso corre solo cada hora, pero dispararlo a mano sirve para
   * regularizar sin esperar. Es idempotente: solo toca jornadas cuya
   * ventana ya venció sin completarse.
   */
  ejecutarCierreDiario() {
    this.errorQ = '';
    this.isProcesando = true;
    this.resultadoCierre = null;

    this.svc.ejecutarCierreDiario().subscribe({
      next: (r: any) => {
        this.isProcesando = false;
        this.mostrarModalQ = false;
        this.resultadoCierre = r;
        this.cargarQuincenas();
        if (this.quincenaActual) this.cargarAsistencias();
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorQ = e.error?.message || 'Error al ejecutar el cierre diario.';
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrarResultadoCierre() { this.resultadoCierre = null; }

  // ── Filtros ───────────────────────────────────────────────
  get asistenciasFiltradas(): any[] {
    return this.asistencias.filter(a => {
      const nombre = a.nombreCompleto?.toLowerCase() || '';
      const ok1 = !this.filtroNombre || nombre.includes(this.filtroNombre.toLowerCase());
      const ok2 = !this.filtroEstado || a.estado === this.filtroEstado;
      const ok3 = !this.filtroTipo  || a.tipo   === this.filtroTipo;
      const ok4 = !this.soloPendientesRevision || a.requiereRevision === true;
      return ok1 && ok2 && ok3 && ok4;
    });
  }

  /**
   * Quién resolvió el registro.
   *
   * Una falta injustificada que cerró el proceso automático y una jornada
   * que revisó una persona comparten estado REVISADO y se veían idénticas.
   * Cuando revisadoPor viene vacío, fue el cierre diario (CU29).
   */
  resueltoPor(a: any): string {
    return a.revisadoPor || 'resuelto por el sistema';
  }

  /** Detalle con fecha, para el tooltip. Alargaba demasiado la fila. */
  detalleRevision(a: any): string {
    if (!a.revisadoPor) return 'Resuelto automáticamente por el cierre diario';
    const cuando = a.revisadoEn
      ? ` el ${a.revisadoEn.substring(0, 16).replace('T', ' a las ')}`
      : '';
    return `Revisado por ${a.revisadoPor}${cuando}`;
  }

  // ── Validar tiempos ───────────────────────────────────────
  abrirModalVal(a: any) {
    this.asistenciaVal  = a;
    this.valPrev        = a.valMinPrevIng ?? 0;
    this.valPost        = a.valMinPostSal ?? 0;
    this.valObservacion = a.observacion   ?? '';
    this.valResultado   = a.resultadoValidacion || 'APROBADO';
    this.errorVal       = '';
    this.mostrarModalVal = true;
  }

  guardarValidacion() {
    if (!this.asistenciaVal) return;

    // El motivo es obligatorio (RN-02). El backend lo exige; validarlo
    // aquí evita el viaje y señala el campo.
    if (!this.valObservacion?.trim()) {
      this.errorVal = 'El motivo o comentario es obligatorio.';
      return;
    }

    this.isProcesando = true; this.errorVal = '';
    this.svc.validarTiempos({
      idAsistencia:  this.asistenciaVal.idAsistencia,
      valMinPrevIng: this.valPrev,
      valMinPostSal: this.valPost,
      observacion:   this.valObservacion,
      resultado:     this.valResultado
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
    // Ingreso y salida son opcionales POR SEPARADO, pero al menos uno
    // hace falta. La contingencia con dato parcial conocido es el caso
    // más frecuente cuando el lector falla a media jornada, y exigir
    // ambos obligaba a inventar el que faltaba.
    if (!this.npIdTrabajador || !this.npFecha) {
      this.errorNP = 'El trabajador y la fecha son obligatorios.'; return;
    }
    if (!this.npIngreso && !this.npSalida) {
      this.errorNP = 'Indica al menos la hora de ingreso o la de salida.'; return;
    }
    if (!this.npObservacion?.trim()) {
      this.errorNP = 'El motivo es obligatorio.'; return;
    }

    this.isProcesando = true; this.errorNP = '';
    this.svc.registrarContingencia({
      idTrabajador: Number(this.npIdTrabajador),
      fecha:        this.npFecha,
      ingresoReal:  this.npIngreso || undefined,
      salidaReal:   this.npSalida  || undefined,
      observacion:  this.npObservacion
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