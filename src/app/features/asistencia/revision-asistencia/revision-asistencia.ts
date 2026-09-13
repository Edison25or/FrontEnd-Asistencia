import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FechaPePipe, fechaLocal } from '../../../shared/fecha-pe.pipe';
import { FormsModule } from '@angular/forms';
import { RevisionAsistenciaService } from '../../../core/services/revision-asistencia.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';

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
  private trabSvc = inject(TrabajadorService);

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
   *
   * Empieza ACTIVADO. Quien entra a esta pantalla viene a resolver lo que
   * impide cerrar la quincena; el listado completo, con varios cientos de
   * jornadas ya resueltas, obliga a buscar esos registros entre todo lo
   * demás.
   *
   * ============================================================
   * QUE INCLUYE "REQUIERE ATENCIÓN"
   * ============================================================
   * No basta con requiereRevision. Ese indicador marca lo que BLOQUEA el
   * cierre de la quincena, y una falta injustificada no lo hace a
   * propósito: si lo hiciera, la falta de un solo trabajador impediría
   * consolidar a los demás (RN-42).
   *
   * Pero esa falta la decidió el proceso automático, no una persona, y
   * el Jefe debería confirmarla o reclasificarla mientras la quincena
   * siga abierta. Filtrando solo por requiereRevision quedaba invisible.
   *
   * Se reconocen por revisadoPor vacío: el cierre diario no lo completa,
   * justamente para distinguir lo que resolvió el sistema de lo que
   * decidió alguien.
   */
  soloPendientesRevision = true;

  /** true si la jornada la resolvió el proceso y nadie la confirmó. */
  private resueltaPorSistema(a: any): boolean {
    return a.tipo === 'FALTA_INJUSTIFICADA' && !a.revisadoPor;
  }

  /**
   * Jornada de hoy o de un día que todavía no llegó.
   *
   * No es un pendiente: nadie puede resolverla porque aún no ha ocurrido.
   * El turno en curso se marcará al terminar, y el cierre diario resolverá
   * el resto cuando venza su ventana.
   */
  esPorVenir(a: any): boolean {
    return !!a?.fecha && a.fecha >= fechaLocal();
  }

  /**
   * Jornadas que impiden generar el consolidado (RN-37).
   *
   * Criterio del servidor (countBloqueantes): estado PENDIENTE o MARCADO,
   * o CALCULADO con revisión pendiente. Se excluyen las que aún no han
   * ocurrido.
   *
   * Esa exclusión no contradice al servidor: generarConsolidado() rechaza
   * la quincena que no ha terminado antes de contar nada, de modo que
   * cuando el conteo importa ya no quedan jornadas futuras. Mostrarlas
   * como bloqueantes durante la quincena en curso señalaba un problema
   * que nadie podía resolver.
   */
  bloqueaCierre(a: any): boolean {
    if (this.esPorVenir(a)) return false;
    if (a?.estado === 'PENDIENTE' || a?.estado === 'MARCADO') return true;
    return a?.estado === 'CALCULADO' && a?.requiereRevision === true;
  }

  /**
   * Jornadas que piden una decisión del Jefe, bloqueen o no el cierre.
   *
   * Mismo criterio que el contador, más las faltas que resolvió el proceso
   * automático y nadie confirmó. Si el filtro y el contador usan criterios
   * distintos, la pantalla muestra un número que no corresponde a las
   * filas que enseña.
   */
  requiereAtencion(a: any): boolean {
    return this.bloqueaCierre(a) || this.resueltaPorSistema(a);
  }

  get totalBloqueantes(): number {
    return this.asistencias.filter(a => this.bloqueaCierre(a)).length;
  }

  /** Jornadas de hoy o posteriores que todavía no se pueden resolver. */
  get totalPorVenir(): number {
    return this.asistencias.filter(
      a => this.esPorVenir(a) && ['PENDIENTE', 'MARCADO'].includes(a.estado)).length;
  }

  get totalFaltasSinConfirmar(): number {
    return this.asistencias.filter(a => this.resueltaPorSistema(a)).length;
  }

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

  /**
   * Búsqueda de trabajador por nombre o documento.
   *
   * El formulario pedía el identificador numérico interno, que nadie
   * conoce de memoria: había que salir a la pantalla de trabajadores,
   * buscarlo, anotarlo y volver.
   */
  npBusqueda         = '';
  npSugerencias: any[] = [];
  npTrabajadorSel: any = null;
  private npTodos: any[] = [];
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
      next: q => {
        this.quincenas  = q;
        this.isLoadingQ = false;
        // Se abre en la quincena vigente. Antes la pantalla arrancaba
        // vacía y había que elegir una, cuando en la práctica quien entra
        // aquí viene a resolver los pendientes del período en curso.
        if (!this.quincenaActual) {
          const vigente = this.quincenaVigente();
          if (vigente) this.seleccionarQuincena(vigente);
        }
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  /**
   * Quincena que contiene el día de hoy.
   *
   * Si hoy cae fuera de todo período (porque aún no se programó la semana
   * en curso), se toma la más reciente que ya empezó. Devolver null
   * dejaría la pantalla vacía sin explicación.
   */
  private quincenaVigente(): any {
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
  seleccionarPorId(id: number) {
    const q = this.quincenas.find(x => x.idQuincena === Number(id));
    if (q) this.seleccionarQuincena(q);
  }

  seleccionarQuincena(q: any) {
    this.quincenaActual = q;
    this.filtroNombre = this.filtroEstado = this.filtroTipo = '';
    // El filtro de pendientes NO se reinicia al cambiar de quincena: si
    // alguien está revisando pendientes, lo natural es seguir viéndolos
    // en el período siguiente.
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
        this.errorQ = mensajeError(e, 'Error al ejecutar el cierre diario.');
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
      const ok4 = !this.soloPendientesRevision || this.requiereAtencion(a);
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
    this.prepararCorreccion(a);
    this.mostrarModalVal = true;
  }

  // ── Completar marcación incompleta (CU15) ─────────────────
  //
  // Una jornada con un solo extremo marcado no se resuelve validando
  // tiempos: no hay jornada de la que derivar minutos fuera de programación.
  // Lo que falta es registrar la marcación que no se tomó.
  corrIngreso = '';
  corrSalida  = '';

  /**
   * true si la jornada tiene un solo extremo marcado.
   *
   * Se deduce de los datos y no del tipo, porque una jornada puede quedar
   * incompleta por vías distintas al cierre diario: un registro por
   * contingencia con un solo dato conocido, por ejemplo.
   */
  esIncompleta(a: any): boolean {
    if (!a) return false;
    return !!a.ingresoReal !== !!a.salidaReal;
  }

  /** Qué extremo falta, para redactar la pantalla sin repetir condiciones. */
  extremoFaltante(a: any): 'entrada' | 'salida' | null {
    if (!this.esIncompleta(a)) return null;
    return a.ingresoReal ? 'salida' : 'entrada';
  }

  /**
   * Construye el valor de un campo datetime-local a partir de la fecha de
   * la jornada y una hora "HH:mm".
   *
   * El día importa: en el turno noche la salida cae en el día calendario
   * siguiente. Cuando la hora indicada es anterior a la de referencia, se
   * asume que cruzó la medianoche.
   */
  private aDateTimeLocal(fechaJornada: string, hora?: string | null,
                         horaReferencia?: string | null): string {
    if (!fechaJornada || !hora) return '';
    let fecha = fechaJornada;
    if (horaReferencia && hora < horaReferencia) {
      const d = new Date(`${fechaJornada}T00:00:00`);
      d.setDate(d.getDate() + 1);
      fecha = d.toISOString().slice(0, 10);
    }
    return `${fecha}T${hora}`;
  }

  /**
   * Prellena el formulario con lo que ya hay y sugiere lo que falta a
   * partir del horario programado.
   *
   * Es una sugerencia, no un valor impuesto: quien revisa debe contrastarla
   * con el cuaderno de contingencias o con el supervisor de turno. El
   * sistema nunca deduce una hora que nadie registró.
   */
  private prepararCorreccion(a: any) {
    this.corrIngreso = a.ingresoReal
      ? this.aDateTimeLocal(a.fecha, a.ingresoReal)
      : this.aDateTimeLocal(a.fecha, a.ingresoProg);

    this.corrSalida = a.salidaReal
      ? this.aDateTimeLocal(a.fecha, a.salidaReal, a.ingresoReal ?? a.ingresoProg)
      : this.aDateTimeLocal(a.fecha, a.salidaProg, a.ingresoProg);
  }

  guardarCorreccion() {
    if (!this.asistenciaVal) return;

    if (!this.corrIngreso || !this.corrSalida) {
      this.errorVal = 'Indica la entrada y la salida de la jornada.';
      return;
    }
    if (this.corrSalida <= this.corrIngreso) {
      this.errorVal = 'La salida debe ser posterior a la entrada.';
      return;
    }
    if (!this.valObservacion.trim()) {
      this.errorVal = 'El motivo es obligatorio: indica de dónde sale la hora registrada.';
      return;
    }

    this.isProcesando = true;
    this.errorVal     = '';

    this.svc.corregirMarcacion({
      idAsistencia: this.asistenciaVal.idAsistencia,
      ingresoReal:  `${this.corrIngreso}:00`,
      salidaReal:   `${this.corrSalida}:00`,
      motivo:       this.valObservacion.trim()
    }).subscribe({
      next: () => {
        this.isProcesando    = false;
        this.mostrarModalVal = false;
        this.cargarAsistencias();
      },
      error: (e: any) => {
        this.errorVal     = mensajeError(e, 'Error al completar la marcación.');
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * true si el registro es una falta injustificada.
   *
   * El modal se comporta distinto: una falta no admite validación de
   * horas extra, porque no hubo marcación de la que derivar minutos.
   */
  esFalta(a: any): boolean {
    return a?.tipo === 'FALTA_INJUSTIFICADA';
  }

  /**
   * Acuse de revisión sobre una jornada que resolvió el proceso.
   *
   * No altera ningún valor calculado ni el indicador de bloqueo: solo
   * deja constancia de quién la miró. La falta ya era correcta; si no lo
   * fuera, lo que corresponde es registrar la ausencia o la marcación por
   * contingencia, y en ambos casos el sistema la corrige por su cuenta.
   */
  confirmarRevision() {
    if (!this.asistenciaVal) return;
    this.isProcesando = true;
    this.errorVal = '';

    this.svc.confirmarRevision(this.asistenciaVal.idAsistencia, this.valObservacion)
      .subscribe({
        next: () => {
          this.isProcesando   = false;
          this.mostrarModalVal = false;
          this.valObservacion = '';
          this.cargarAsistencias();
          this.cdr.detectChanges();
        },
        error: (e: any) => {
          this.errorVal     = mensajeError(e, 'No se pudo confirmar la revisión.');
          this.isProcesando = false;
          this.cdr.detectChanges();
        }
      });
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
        this.errorVal = mensajeError(e, 'Error al guardar.');
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Asistencia no programada ──────────────────────────────
  /** Carga la lista de trabajadores activos, una sola vez. */
  private cargarTrabajadoresNP() {
    if (this.npTodos.length) return;
    this.trabSvc.getTrabajadores(0, 500).subscribe({
      next: (r: any) => {
        this.npTodos = (r.content ?? r ?? [])
          .filter((t: any) => t.estado === 'ACTIVO');
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  buscarTrabajadorNP() {
    const q = this.npBusqueda.trim().toLowerCase();
    if (q.length < 2) { this.npSugerencias = []; return; }
    this.npSugerencias = this.npTodos.filter((t: any) =>
      t.nombreCompleto?.toLowerCase().includes(q) ||
      t.nroDocumento?.includes(q)
    ).slice(0, 8);
  }

  seleccionarTrabajadorNP(t: any) {
    this.npTrabajadorSel = t;
    this.npIdTrabajador  = String(t.idTrabajador);
    this.npBusqueda      = '';
    this.npSugerencias   = [];
  }

  limpiarTrabajadorNP() {
    this.npTrabajadorSel = null;
    this.npIdTrabajador  = '';
    this.npBusqueda      = '';
    this.npSugerencias   = [];
  }

  abrirModalNP() {
    this.cargarTrabajadoresNP();
    this.limpiarTrabajadorNP();
    this.npFecha = '';
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
        this.errorNP = mensajeError(e, 'Error al registrar.');
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  formatMin(min: number | null): string {
    if (min == null || min === 0) return '-';
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
    return this.totalBloqueantes;
  }
}