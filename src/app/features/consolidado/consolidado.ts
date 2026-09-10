import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FechaPePipe, fechaLocal } from '../../shared/fecha-pe.pipe';
import { FormsModule } from '@angular/forms';
import { ConsolidadoService, Consolidado, QuincenaResumen, TotalTurno }
  from '../../core/services/consolidado.service';
import { AuthService } from '../../core/services/auth';

/**
 * Consolidado de quincena (CU21, CU23).
 *
 * ============================================================
 * QUE CAMBIA RESPECTO DE LA VERSION ANTERIOR
 * ============================================================
 * 1. Desaparece todo el modal de cierre con decisiones de bolsa, sus
 *    validaciones de tope, y los helpers getMaxPagar / getMinPagar /
 *    getMaxConsumo / onPagadosChange / onConsumoChange. El backend ya no
 *    tiene bolsa de horas (AL-01, AL-04).
 *
 * 2. Generar el consolidado YA cierra la quincena (RN-36). El boton
 *    "Cerrar quincena" desaparece porque no habia un segundo paso que
 *    ejecutar.
 *
 * 3. La reapertura es directa, de un solo paso y solo del
 *    Superadministrador (RN-38). Desaparecen los dos modales de
 *    solicitar y aprobar.
 *
 * ============================================================
 * EL PROBLEMA DE LA TABLA
 * ============================================================
 * El consolidado ya no trae columnas fijas por turno, sino una lista de
 * filas (turno x feriado) que varia por trabajador y por periodo. Una
 * tabla HTML necesita columnas estables, asi que aqui se PIVOTEA: se
 * recorren todos los consolidados para averiguar que turnos aparecen en
 * el periodo, se arman las columnas a partir de eso, y cada trabajador
 * se proyecta sobre esa rejilla.
 *
 * Asi la tabla crece sola si manana la planta abre un tercer turno, sin
 * tocar la plantilla.
 */
@Component({
  selector: 'app-consolidado',
  standalone: true,
  imports: [CommonModule, FormsModule, FechaPePipe],
  templateUrl: './consolidado.html',
  styleUrl:    './consolidado.css'
})
export class ConsolidadoComponent implements OnInit {
  private svc  = inject(ConsolidadoService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);

  quincenas:      QuincenaResumen[] = [];
  quincenaActual: QuincenaResumen | null = null;
  consolidados:   Consolidado[] = [];

  isLoadingQ   = false;
  isLoadingC   = false;
  isProcesando = false;

  /** Advertencia previa a generar el consolidado. */
  mostrarConfirmGenerar = false;
  errorGlobal  = '';
  rolUsuario   = '';

  filtroNombre = '';

  /**
   * true cuando lo mostrado es un cálculo sin persistir.
   *
   * Importa distinguirlo: una vista previa no compromete nada, mientras
   * que un consolidado generado cerró la quincena.
   */
  esVistaPrevia = false;

  /** Columnas de turno detectadas en el periodo. Ver pivote mas abajo. */
  columnasTurno: { turno: string; esFeriado: boolean; etiqueta: string }[] = [];

  // ---------- Modal de observaciones ----------
  mostrarModalEditar = false;
  consolidadoEditar: Consolidado | null = null;
  editObservaciones  = '';
  errorEdit          = '';

  // ---------- Modal de reapertura ----------
  mostrarModalReaper = false;
  motivoReaper       = '';
  errorReaper        = '';

  // ---------- Modal de bloqueantes ----------
  mostrarModalBloqueo = false;

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.cargarQuincenas();
  }

  // ════════════════════════════════════════════════════════════
  // CARGA
  // ════════════════════════════════════════════════════════════

  cargarQuincenas() {
    this.isLoadingQ = true;
    this.svc.getQuincenas().subscribe({
      next: q => {
        this.quincenas  = q;
        this.isLoadingQ = false;
        // Se abre en la quincena vigente en lugar de dejar la pantalla en
        // blanco esperando una selección.
        if (!this.quincenaActual) {
          const v = this.quincenaVigente();
          if (v) this.seleccionar(v);
        }
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  /**
   * Quincena que contiene el día de hoy, o la más reciente ya iniciada.
   *
   * Sin esto la pantalla arrancaba vacía y había que elegir un período,
   * cuando quien entra aquí viene a trabajar sobre el actual.
   */
  private quincenaVigente(): QuincenaResumen | null {
    if (!this.quincenas.length) return null;
    const hoy = fechaLocal();

    const contiene = this.quincenas.find(q =>
      String(q.inicio).substring(0, 10) <= hoy &&
      hoy < String(q.fin).substring(0, 10));
    if (contiene) return contiene;

    const pasadas = this.quincenas
      .filter(q => String(q.inicio).substring(0, 10) <= hoy)
      .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    return pasadas[0] ?? this.quincenas[0];
  }

  /** Selección desde el desplegable, que entrega el identificador. */
  /**
   * true mientras la quincena seleccionada no haya terminado.
   *
   * Consolidar un período en curso no tiene sentido: sus últimas jornadas
   * aún no ocurrieron y figuran como pendientes, de modo que el sistema
   * las cuenta como bloqueantes y devuelve un mensaje que el usuario no
   * puede accionar.
   */
  get quincenaEnCurso(): boolean {
    if (!this.quincenaActual) return false;
    return new Date() < new Date(this.quincenaActual.fin);
  }

  seleccionarPorId(id: number) {
    const q = this.quincenas.find(x => x.idQuincena === Number(id));
    if (q) this.seleccionar(q);
  }

  seleccionar(q: QuincenaResumen) {
    this.quincenaActual = q;
    this.filtroNombre   = '';
    this.errorGlobal    = '';
    if (q.totalConsolidados > 0) this.cargarConsolidado();
    else this.cargarVistaPrevia();
    this.cdr.detectChanges();
  }

  /**
   * Calcula el consolidado sin persistirlo, para revisarlo antes de
   * generar. Antes, una quincena sin consolidar mostraba una pantalla
   * vacía y la única forma de ver el resultado era cerrarla.
   */
  cargarVistaPrevia() {
    if (!this.quincenaActual) return;
    this.isLoadingC = true;
    this.esVistaPrevia = true;

    this.svc.previsualizar(this.quincenaActual.idQuincena).subscribe({
      next: c => {
        this.consolidados = c;
        this.construirColumnas();
        this.isLoadingC = false;
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.consolidados = [];
        this.columnasTurno = [];
        this.errorGlobal = mensajeError(e, '');
        this.isLoadingC = false;
        this.cdr.detectChanges();
      }
    });
  }

  cargarConsolidado() {
    if (!this.quincenaActual) return;
    this.esVistaPrevia = false;
    this.isLoadingC = true;
    this.svc.listar(this.quincenaActual.idQuincena).subscribe({
      next: c => {
        this.consolidados = c;
        this.construirColumnas();
        this.isLoadingC = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingC = false; this.cdr.detectChanges(); }
    });
  }

  /**
   * Generar consolidado. Cierra la quincena en la misma operacion
   * (RN-36), asi que se avisa al usuario antes de ejecutarlo.
   */
  generarConsolidado() {
    if (!this.quincenaActual) return;

    // El backend rechaza la operacion si hay pendientes (RN-37), pero
    // avisar aqui evita el viaje y explica mejor que falta.
    if (this.quincenaActual.bloqueantes > 0) {
      this.mostrarModalBloqueo = true;
      return;
    }

    // La confirmación usa un modal propio y no confirm() del navegador.
    //
    // El diálogo nativo se encabeza con "localhost:4200 dice", no permite
    // dar formato al texto ni distinguir la gravedad de la acción, y
    // bloquea la pantalla mientras está abierto. Aquí la operación cierra
    // la quincena de forma irreversible salvo reapertura, así que merece
    // una advertencia que se lea con calma.
    this.mostrarConfirmGenerar = true;
  }

  /** Confirmada la advertencia, se genera el consolidado. */
  confirmarGenerar() {
    this.mostrarConfirmGenerar = false;
    if (!this.quincenaActual) return;

    this.isProcesando = true;
    this.errorGlobal  = '';

    this.svc.generar(this.quincenaActual.idQuincena).subscribe({
      next: c => {
        this.consolidados = c;
        this.esVistaPrevia = false;
        this.construirColumnas();
        this.isProcesando = false;
        this.cargarQuincenas();
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorGlobal  = mensajeError(e, 'Error al generar el consolidado.');
        this.isProcesando = false;
        this.cargarQuincenas();
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // PIVOTE DE TURNOS
  // ════════════════════════════════════════════════════════════

  /**
   * Averigua que combinaciones de turno y feriado aparecen en el periodo
   * y arma las columnas de la tabla.
   *
   * Las columnas de feriado solo se muestran si algun trabajador tiene
   * horas en feriado. En una quincena sin feriados la tabla queda igual
   * de simple que antes.
   */
  private construirColumnas() {
    const vistas = new Map<string, { turno: string; esFeriado: boolean; etiqueta: string }>();

    for (const c of this.consolidados) {
      for (const t of c.totalesPorTurno ?? []) {
        // Solo se muestra la columna si tiene contenido real
        if (t.minNormales === 0 && t.minExtra === 0) continue;
        const clave = `${t.turno}|${t.esFeriado}`;
        if (!vistas.has(clave)) {
          vistas.set(clave, {
            turno:     t.turno,
            esFeriado: t.esFeriado,
            etiqueta:  t.esFeriado ? `${t.turno} (feriado)` : t.turno
          });
        }
      }
    }

    // Primero los turnos normales, despues los de feriado, y dentro de
    // cada grupo por nombre de turno.
    this.columnasTurno = [...vistas.values()].sort((a, b) => {
      if (a.esFeriado !== b.esFeriado) return a.esFeriado ? 1 : -1;
      return a.turno.localeCompare(b.turno);
    });
  }

  /** Celda del trabajador para una columna dada. Null si no tiene esa fila. */
  celda(c: Consolidado, col: { turno: string; esFeriado: boolean }): TotalTurno | null {
    return (c.totalesPorTurno ?? []).find(
      t => t.turno === col.turno && t.esFeriado === col.esFeriado) ?? null;
  }

  /** true si el periodo tiene alguna hora trabajada en feriado. */
  get hayFeriados(): boolean {
    return this.columnasTurno.some(col => col.esFeriado);
  }

  // ════════════════════════════════════════════════════════════
  // FILTRO
  // ════════════════════════════════════════════════════════════

  get consolidadosFiltrados(): Consolidado[] {
    if (!this.filtroNombre) return this.consolidados;
    const q = this.filtroNombre.toLowerCase();
    return this.consolidados.filter(c =>
      c.trabajadorNombre?.toLowerCase().includes(q));
  }

  // ════════════════════════════════════════════════════════════
  // OBSERVACIONES
  // ════════════════════════════════════════════════════════════

  abrirEditar(c: Consolidado) {
    if (this.esVistaPrevia) return;   // no hay nada persistido que editar
    this.consolidadoEditar  = c;
    this.editObservaciones  = c.observaciones ?? '';
    this.errorEdit          = '';
    this.mostrarModalEditar = true;
  }

  guardarEdicion() {
    if (!this.consolidadoEditar) return;
    this.isProcesando = true;
    this.errorEdit    = '';

    this.svc.editar(this.consolidadoEditar.id, {
      observaciones: this.editObservaciones
    }).subscribe({
      next: act => {
        const idx = this.consolidados.findIndex(c => c.id === act.id);
        if (idx >= 0) this.consolidados[idx] = act;
        this.isProcesando = false;
        this.mostrarModalEditar = false;
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorEdit    = mensajeError(e, 'Error al guardar.');
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // REAPERTURA (RN-38)
  // ════════════════════════════════════════════════════════════

  abrirReaper() {
    this.motivoReaper       = '';
    this.errorReaper        = '';
    this.mostrarModalReaper = true;
  }

  reabrir() {
    if (!this.quincenaActual) return;

    // El backend exige entre 10 y 500 caracteres. Validarlo aqui evita
    // un viaje y un mensaje generico de validacion.
    const motivo = this.motivoReaper.trim();
    if (motivo.length < 10) {
      this.errorReaper = 'El motivo debe tener al menos 10 caracteres.';
      return;
    }
    if (motivo.length > 500) {
      this.errorReaper = 'El motivo no puede exceder 500 caracteres.';
      return;
    }

    this.isProcesando = true;
    this.svc.reabrir(this.quincenaActual.idQuincena, motivo).subscribe({
      next: () => {
        this.isProcesando = false;
        this.mostrarModalReaper = false;
        this.cargarQuincenas();
        this.cargarConsolidado();
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorReaper  = mensajeError(e, 'Error al reabrir la quincena.');
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  formatMin(min: number | null | undefined): string {
    if (min == null) return '00:00';
    const signo = min < 0 ? '-' : '';
    const abs   = Math.abs(min);
    return signo
      + String(Math.floor(abs / 60)).padStart(2, '0') + ':'
      + String(abs % 60).padStart(2, '0');
  }

  esSuperAdmin() { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  esAdmin()      { return this.rolUsuario === 'ROLE_ADMIN' || this.esSuperAdmin(); }

  /** true si la quincena admite generar consolidado. */
  puedeGenerar(): boolean {
    return !!this.quincenaActual
        && this.quincenaActual.estado === 'ABIERTA'
        && this.esAdmin();
  }

  /** true si la quincena esta cerrada y el usuario puede reabrirla. */
  puedeReabrir(): boolean {
    return !!this.quincenaActual
        && this.quincenaActual.estado === 'CERRADA'
        && this.esSuperAdmin();
  }

  estadoBadge(estado: string): string {
    return ({ ABIERTA: 'badge-verde', CERRADA: 'badge-gris' } as any)[estado] ?? 'badge-gris';
  }

  estadoConsBadge(estado: string): string {
    return ({ BORRADOR:    'badge-azul',
              CERRADO:     'badge-morado',
              REEMPLAZADO: 'badge-gris' } as any)[estado] ?? 'badge-gris';
  }

}
