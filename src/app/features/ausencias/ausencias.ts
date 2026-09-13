import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FechaPePipe, fechaLocal } from '../../shared/fecha-pe.pipe';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, Observable } from 'rxjs';
import { AusenciaService, PermisoResponse, FaltaJustificadaResponse }
  from '../../core/services/ausencia.service';
import { CatalogoService, CatalogoSimple } from '../../core/services/catalogo.service';
import { TrabajadorService } from '../../core/services/trabajador.service';
import { AuthService } from '../../core/services/auth';

type Tab = 'permisos' | 'faltas';

/**
 * Registro de permisos y faltas justificadas (CU16, CU17).
 *
 * ============================================================
 * POR QUÉ SON DOS FLUJOS Y NO UNO
 * ============================================================
 * Comparten catálogo de tipos y ambos neutralizan pre-registros, pero
 * tienen reglas de plazo distintas:
 *
 *   Permiso           - planificado, se espera de una a dos semanas de
 *                       anticipación. Fuera de ese plazo se acepta igual,
 *                       marcado como excepción visible (RN-30).
 *   Falta justificada - no planificada, sin límite de plazo (RN-32).
 *
 * ============================================================
 * EL TRABAJADOR NO SOLICITA
 * ============================================================
 * Las registra el Jefe a nombre del trabajador (RN-29). El acuerdo ocurre
 * de palabra y el sistema solo lo formaliza; no hay bandeja de solicitudes
 * ni flujo de aprobación.
 */
@Component({
  selector: 'app-ausencias',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FechaPePipe],
  templateUrl: './ausencias.html',
  styleUrl:    './ausencias.css'
})
export class AusenciasComponent implements OnInit {
  private svc         = inject(AusenciaService);
  private catSvc      = inject(CatalogoService);
  private trabSvc     = inject(TrabajadorService);
  private auth        = inject(AuthService);
  private fb          = inject(FormBuilder);
  private cdr         = inject(ChangeDetectorRef);

  tabActual: Tab = 'permisos';

  // ── Datos ─────────────────────────────────────────────────
  trabajadores:  any[]            = [];

  /**
   * Trabajadores sobre los que el usuario puede registrar una ausencia.
   *
   * El Jefe solo alcanza a los de su propia área (RN-01). Ofrecerle la
   * plantilla completa lo invitaba a elegir a alguien que el servidor va
   * a rechazar, y el rechazo llegaría después de haber completado el
   * formulario entero.
   *
   * El área propia se deduce del primer registro que coincide con el
   * usuario autenticado, ya que el listado la trae por trabajador.
   */
  get trabajadoresDisponibles(): any[] {
    if (this.rolUsuario !== 'ROLE_JEFE') return this.trabajadores;
    if (!this.areaPropia) return this.trabajadores;
    return this.trabajadores.filter(t => t.areaNombre === this.areaPropia);
  }

  areaPropia = '';
  tiposAusencia: CatalogoSimple[] = [];

  /**
   * Muestra todos los tipos, sin filtrar por la pestaña activa.
   *
   * Existe porque la clasificación orienta pero no debería obstruir. Una
   * operación programada con antelación es un permiso por descanso
   * médico, aunque ese tipo se asocie normalmente a lo imprevisto. Sin
   * esta salida, un caso legítimo no podría registrarse.
   */
  mostrarTodosLosTipos = false;

  /**
   * Tipos que corresponden a la pestaña activa.
   *
   * Ambos formularios compartían la lista completa, de modo que ofrecían
   * "Vacaciones" como falta justificada y "Descanso médico" como permiso.
   * Ninguna de las dos describe algo que ocurra: nadie deja de venir por
   * vacaciones y lo justifica después, ni programa enfermarse con dos
   * semanas de anticipación.
   */
  get tiposDisponibles(): CatalogoSimple[] {
    if (this.mostrarTodosLosTipos) return this.tiposAusencia;
    return this.tiposAusencia.filter(t =>
      this.tabActual === 'permisos'
        ? t.aplicaPermiso !== false
        : t.aplicaFaltaJustificada !== false);
  }

  /** Cuántos quedan fuera con el filtro puesto, para poder ofrecerlos. */
  get tiposOcultos(): number {
    return this.tiposAusencia.length - this.tiposDisponibles.length;
  }

  permisos: PermisoResponse[]          = [];
  faltas:   FaltaJustificadaResponse[] = [];

  isLoading    = false;
  isConsultando = false;
  errorGlobal  = '';
  rolUsuario   = '';

  // ── Consulta ──────────────────────────────────────────────
  consultaTrabajador: number | null = null;
  consultaDesde = '';
  consultaHasta = '';
  consultado    = false;

  // ── Modal ─────────────────────────────────────────────────
  mostrarModal = false;
  guardando    = false;
  modalError   = '';
  form!: FormGroup;

  /** Resultado del último registro, para mostrar el efecto. */
  ultimoResultado: {
    titulo: string;
    neutralizados: number;
    fueraDePlazo: boolean;
    yaCerradas: number;
    retroactivo: boolean;
  } | null = null;

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.initForm();
    this.initFechasConsulta();
    this.cargar();
  }

  private initForm() {
    this.form = this.fb.group({
      idTrabajador:   [null, Validators.required],
      idTipoAusencia: [null, Validators.required],
      fechaInicio:    ['',   Validators.required],
      fechaFin:       ['',   Validators.required],
      // Motivo obligatorio (RN-02). Toda acción sensible se justifica.
      comentario:     ['',   [Validators.required, Validators.maxLength(500)]],

      // Sustento documental. No es obligatorio: una ausencia puede
      // registrarse antes de que el documento llegue, y marcarse después.
      // Exigirlo bloquearía el registro de casos legítimos.
      sustentoRecibido:   [false],
      referenciaSustento: ['',  Validators.maxLength(200)]
    });
  }

  /** Por defecto, el mes en curso. */
  private initFechasConsulta() {
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    this.consultaDesde = this.iso(ini);
    this.consultaHasta = this.iso(fin);
  }

  private iso(d: Date): string {
    return fechaLocal(d);
  }

  // ════════════════════════════════════════════════════════════
  // CARGA
  // ════════════════════════════════════════════════════════════

  cargar() {
    this.isLoading = true;
    forkJoin({
      trabajadores: this.trabSvc.getTrabajadores(0, 500),
      tipos:        this.catSvc.getTiposAusencia()
    }).subscribe({
      next: (res: any) => {
        this.trabajadores  = res.trabajadores.content || res.trabajadores;

        // El área del usuario se toma de su propia ficha dentro del
        // listado, que ya viene cargado.
        const idPropio = this.auth.getIdTrabajador();
        const yo = this.trabajadores.find((t: any) =>
          String(t.idTrabajador) === String(idPropio));
        this.areaPropia = yo?.areaNombre ?? '';
        this.tiposAusencia = res.tipos;
        this.isLoading     = false;

        // Sin tipos de ausencia no puede registrarse nada. Decirlo aquí
        // evita que el usuario descubra el vacío al enviar el formulario.
        if (this.tiposAusencia.length === 0) {
          this.errorGlobal =
            'No hay tipos de ausencia registrados. Créalos en Tablas Maestras '
            + 'antes de registrar permisos o faltas justificadas.';
        }
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  setTab(tab: Tab) {
    this.tabActual = tab;
    this.consultado = false;
    this.permisos = [];
    this.faltas = [];
  }

  consultar() {
    if (!this.consultaTrabajador) return;
    this.isConsultando = true;
    this.consultado    = true;

    // Observable<any> a propósito: TypeScript no puede llamar .subscribe()
    // sobre una unión de dos Observable con genéricos distintos, porque
    // cada uno aporta su propia firma y no las reconcilia. La alternativa
    // sería duplicar el bloque de suscripción por cada pestaña.
    const obs: Observable<any> = this.tabActual === 'permisos'
      ? this.svc.listarPermisos(this.consultaTrabajador, this.consultaDesde, this.consultaHasta)
      : this.svc.listarFaltas(this.consultaTrabajador, this.consultaDesde, this.consultaHasta);

    obs.subscribe({
      next: (r: any) => {
        if (this.tabActual === 'permisos') this.permisos = r;
        else                               this.faltas   = r;
        this.isConsultando = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isConsultando = false; this.cdr.detectChanges(); }
    });
  }

  // ════════════════════════════════════════════════════════════
  // REGISTRO
  // ════════════════════════════════════════════════════════════

  abrirModal() {
    if (this.tiposAusencia.length === 0) return;
    this.modalError      = '';
    this.guardando       = false;
    this.ultimoResultado = null;
    this.form.reset({ idTrabajador: null, idTipoAusencia: null,
                      fechaInicio: '', fechaFin: '', comentario: '',
                      sustentoRecibido: false, referenciaSustento: '' });
    this.mostrarModal = true;
  }

  cerrarModal() { this.mostrarModal = false; this.modalError = ''; }

  guardar() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const v = this.form.value;
    if (v.fechaFin < v.fechaInicio) {
      this.modalError = 'La fecha de fin no puede ser anterior a la de inicio.';
      return;
    }

    this.guardando  = true;
    this.modalError = '';

    // Sustento normalizado antes de enviar. Sin casilla no viaja referencia:
    // el campo se oculta al desmarcar, pero conservaba lo escrito y llegaba
    // al servidor como "pendiente con referencia". Y solo la administración
    // lo marca (D5); el servidor aplica la misma regla.
    const recibido = this.puedeRegistrarSustento() && v.sustentoRecibido === true;
    const referencia = recibido ? (v.referenciaSustento || '').trim() : '';
    const payload = {
      ...v,
      sustentoRecibido:   recibido,
      referenciaSustento: referencia || null
    };

    const obs: Observable<any> = this.tabActual === 'permisos'
      ? this.svc.registrarPermiso(payload)
      : this.svc.registrarFalta(payload);

    obs.subscribe({
      next: (r: any) => {
        this.guardando = false;
        this.mostrarModal = false;

        // Mostrar cuántos pre-registros dejaron de contar como falta es
        // la confirmación de que la ausencia surtió efecto (RN-44). Sin
        // esto, el Jefe no tiene forma de saber si sirvió de algo.
        this.ultimoResultado = {
          titulo: `${r.tipoAusencia} de ${r.trabajadorNombre}, `
                + `del ${r.fechaInicio} al ${r.fechaFin}`,
          neutralizados: r.preRegistrosNeutralizados,
          fueraDePlazo:  r.fueraDePlazo === true,
          yaCerradas:    r.jornadasYaCerradas ?? 0,
          // Una ausencia cuyo rango ya terminó no es "poca anticipación":
          // es una ausencia consumada. El aviso cambia en consecuencia.
          retroactivo:   this.tabActual === 'permisos'
                         && !!r.fechaFin && r.fechaFin < fechaLocal()
        };

        if (this.consultaTrabajador === v.idTrabajador) this.consultar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.modalError = mensajeError(err, 'Error al registrar.');
        this.guardando  = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrarResultado() { this.ultimoResultado = null; }

  // ════════════════════════════════════════════════════════════
  // ELIMINACIÓN
  // ════════════════════════════════════════════════════════════

  itemParaEliminar: any = null;
  mostrarModalEliminar = false;
  errorEliminar = '';

  confirmarEliminar(item: any) {
    this.itemParaEliminar     = item;
    this.errorEliminar        = '';
    this.mostrarModalEliminar = true;
  }

  cerrarModalEliminar() {
    this.mostrarModalEliminar = false;
    this.itemParaEliminar     = null;
  }

  /**
   * Elimina la ausencia. El backend revierte la neutralización: los
   * pre-registros que nadie marcó vuelven a pendiente y el cierre diario
   * los reevaluará.
   *
   * Se rechaza si alguna jornada del rango ya fue consolidada.
   */
  eliminar() {
    if (!this.itemParaEliminar) return;
    this.guardando = true;
    this.errorEliminar = '';

    const id  = this.tabActual === 'permisos'
      ? this.itemParaEliminar.idPermiso
      : this.itemParaEliminar.idFaltaJustificada;

    const obs: Observable<any> = this.tabActual === 'permisos'
      ? this.svc.eliminarPermiso(id)
      : this.svc.eliminarFalta(id);

    obs.subscribe({
      next: (revertidos: number) => {
        this.guardando = false;
        this.cerrarModalEliminar();
        this.ultimoResultado = {
          titulo: 'Ausencia eliminada',
          neutralizados: -1,
          fueraDePlazo: false,
          yaCerradas:   0,
          retroactivo:  false
        };
        this.revertidos = revertidos;
        this.consultar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorEliminar = mensajeError(err, 'Error al eliminar.');
        this.guardando     = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Pre-registros que volvieron a pendiente tras la última eliminación. */
  revertidos = 0;

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  get itemsActuales(): any[] {
    return this.tabActual === 'permisos' ? this.permisos : this.faltas;
  }

  get labelSingular(): string {
    return this.tabActual === 'permisos' ? 'Permiso' : 'Falta Justificada';
  }

  nombreTrabajador(id: number | null): string {
    if (!id) return '';
    const t = this.trabajadores.find(x => x.idTrabajador === id);
    return t ? `${t.pNombre} ${t.aPaterno} ${t.aMaterno}` : '';
  }

  /** Días que abarca el rango, ambos inclusive. */
  diasDe(item: any): number {
    const a = new Date(item.fechaInicio);
    const b = new Date(item.fechaFin);
    return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  }

  esJefeOSuperior(): boolean {
    return ['ROLE_JEFE', 'ROLE_ADMIN', 'ROLE_SUPERADMIN'].includes(this.rolUsuario);
  }

  /**
   * Quien registra la ausencia registra también su sustento (RN-29).
   *
   * El Jefe es quien recibe el certificado o la citación, de modo que
   * separar ambas cosas obligaba a que dos personas tocaran el mismo caso.
   * La segregación sigue vigente por otra vía: el servidor impide
   * registrar la propia ausencia o la de un par, y limita al Jefe a su
   * área.
   */
  puedeRegistrarSustento(): boolean {
    return this.esJefeOSuperior();
  }

  /** Columnas de la tabla, para que el mensaje vacío ocupe toda la fila. */
  get totalColumnas(): number {
    return this.esJefeOSuperior() ? 8 : 7;
  }

  /** Texto del chip de sustento: quién lo confirmó y dónde encontrarlo. */
  tooltipSustento(item: any): string {
    const partes: string[] = [];
    if (item.referenciaSustento) partes.push(item.referenciaSustento);
    if (item.sustentoConfirmadoPor) partes.push(`Confirmado por ${item.sustentoConfirmadoPor}`);
    return partes.length ? partes.join(' — ') : 'Documentación recibida';
  }

  // ════════════════════════════════════════════════════════════
  // SUSTENTO POSTERIOR
  // ════════════════════════════════════════════════════════════
  //
  // El caso frecuente es registrar la ausencia y recibir el certificado
  // días después. Antes solo podía marcarse al crear, y la única salida
  // era eliminar y volver a registrar, lo que la marcaba fuera de plazo.

  itemSustento: any = null;
  sustentoRecibidoEdit = false;
  referenciaSustentoEdit = '';
  errorSustento = '';

  abrirSustento(item: any) {
    this.itemSustento           = item;
    this.sustentoRecibidoEdit   = item.sustentoRecibido === true;
    this.referenciaSustentoEdit = item.referenciaSustento || '';
    this.errorSustento          = '';
  }

  cerrarSustento() {
    this.itemSustento = null;
  }

  guardarSustento() {
    if (!this.itemSustento) return;
    this.guardando     = true;
    this.errorSustento = '';

    const req = {
      sustentoRecibido:   this.sustentoRecibidoEdit,
      referenciaSustento: this.sustentoRecibidoEdit
        ? (this.referenciaSustentoEdit.trim() || null)
        : null
    };

    const obs: Observable<any> = this.tabActual === 'permisos'
      ? this.svc.actualizarSustentoPermiso(this.itemSustento.idPermiso, req)
      : this.svc.actualizarSustentoFalta(this.itemSustento.idFaltaJustificada, req);

    obs.subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarSustento();
        this.consultar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorSustento = mensajeError(err, 'Error al guardar el sustento.');
        this.guardando     = false;
        this.cdr.detectChanges();
      }
    });
  }
}
