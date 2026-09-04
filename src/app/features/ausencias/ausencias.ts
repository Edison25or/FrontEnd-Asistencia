import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FechaPePipe } from '../../shared/fecha-pe.pipe';
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
 *   Permiso           — planificado, se espera de una a dos semanas de
 *                       anticipación. Fuera de ese plazo se acepta igual,
 *                       marcado como excepción visible (RN-30).
 *   Falta justificada — no planificada, sin límite de plazo (RN-32).
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
  tiposAusencia: CatalogoSimple[] = [];

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
  ultimoResultado: { titulo: string; neutralizados: number; fueraDePlazo: boolean } | null = null;

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
      comentario:     ['',   [Validators.required, Validators.maxLength(500)]]
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
    return d.toISOString().substring(0, 10);
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
                      fechaInicio: '', fechaFin: '', comentario: '' });
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

    const obs: Observable<any> = this.tabActual === 'permisos'
      ? this.svc.registrarPermiso(v)
      : this.svc.registrarFalta(v);

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
          fueraDePlazo:  r.fueraDePlazo === true
        };

        if (this.consultaTrabajador === v.idTrabajador) this.consultar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.modalError = err.error?.message || 'Error al registrar.';
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
          fueraDePlazo: false
        };
        this.revertidos = revertidos;
        this.consultar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorEliminar = err.error?.message || 'Error al eliminar.';
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
}
