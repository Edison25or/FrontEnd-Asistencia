import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FechaPePipe, fechaLocal } from '../../shared/fecha-pe.pipe';
import { FormsModule } from '@angular/forms';
import { FeriadoService, Feriado, ImpactoFeriado } from '../../core/services/feriado.service';
import { AuthService } from '../../core/services/auth';

/**
 * Catálogo de feriados (CU24, RN-41).
 *
 * ============================================================
 * POR QUÉ HAY VISTA PREVIA
 * ============================================================
 * En Perú los feriados se declaran a veces con pocos días de
 * anticipación, cuando la programación ya está confirmada e incluso
 * trabajada. Registrar uno tiene dos efectos sobre datos existentes:
 * recalcula los minutos de las jornadas que solapan el día, y marca como
 * no laborables los pre-registros sin marcar para que el cierre diario no
 * genere falta.
 *
 * Con dos turnos en paralelo, a qué jornadas alcanza no es evidente: la
 * nocturna de la víspera aporta minutos aunque su fecha sea el día
 * anterior. Ver el conteo antes de confirmar evita que un error de fecha
 * pase inadvertido hasta que alguien reclame su pago.
 *
 * ============================================================
 * EL CÓMPUTO ES POR DÍA CALENDARIO
 * ============================================================
 * Se cuentan los minutos trabajados dentro de [fecha 00:00, fecha+1
 * 00:00), sin importar a qué jornada pertenezcan. Con un feriado el
 * sábado 28, turno día 06:00-14:00 y turno noche 22:00-06:00:
 *
 *   noche que entra el 27  ->  360 min
 *   día   que entra el 28  ->  480 min
 *   noche que entra el 28  ->  120 min
 *
 * Ninguna regla que atribuya la jornada completa a un solo día da el
 * resultado correcto para las tres a la vez.
 */
@Component({
  selector: 'app-feriados',
  standalone: true,
  imports: [CommonModule, FormsModule, FechaPePipe],
  templateUrl: './feriados.html',
  styleUrl:    './feriados.css'
})
export class FeriadosComponent implements OnInit {
  private svc  = inject(FeriadoService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);

  feriados: Feriado[] = [];
  isLoading   = false;
  errorGlobal = '';
  rolUsuario  = '';

  // ── Alta ──────────────────────────────────────────────────
  mostrarModal = false;
  nuevaFecha       = '';
  nuevaDescripcion = '';
  modalError       = '';
  guardando        = false;

  /** Vista previa del impacto. Null mientras no se haya consultado. */
  impacto: ImpactoFeriado | null = null;
  cargandoImpacto = false;

  /** Resultado tras confirmar, para mostrar lo que efectivamente cambió. */
  resultado: ImpactoFeriado | null = null;

  // ── Baja ──────────────────────────────────────────────────
  mostrarModalBaja = false;
  feriadoParaBaja: Feriado | null = null;

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.cargar();
  }

  cargar() {
    this.isLoading = true;
    this.svc.listar().subscribe({
      next: f => { this.feriados = f; this.isLoading = false; this.cdr.detectChanges(); },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  // ════════════════════════════════════════════════════════════
  // ALTA
  // ════════════════════════════════════════════════════════════

  abrirModal() {
    this.nuevaFecha       = '';
    this.nuevaDescripcion = '';
    this.modalError       = '';
    this.impacto          = null;
    this.guardando        = false;
    this.mostrarModal     = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.impacto      = null;
    this.modalError   = '';
  }

  /**
   * Consulta el impacto al cambiar la fecha. No confirma nada: solo
   * cuenta cuántos registros se verían afectados.
   */
  onFechaChange() {
    this.impacto    = null;
    this.modalError = '';
    if (!this.nuevaFecha) return;

    this.cargandoImpacto = true;
    this.svc.previsualizar(this.nuevaFecha).subscribe({
      next: i => {
        this.impacto = i;
        this.cargandoImpacto = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoImpacto = false; this.cdr.detectChanges(); }
    });
  }

  registrar() {
    if (!this.nuevaFecha) { this.modalError = 'La fecha es obligatoria.'; return; }
    if (!this.nuevaDescripcion.trim()) {
      this.modalError = 'La descripción es obligatoria.';
      return;
    }

    this.guardando  = true;
    this.modalError = '';

    this.svc.registrar(this.nuevaFecha, this.nuevaDescripcion.trim()).subscribe({
      next: r => {
        this.guardando    = false;
        this.mostrarModal = false;
        this.resultado    = r;
        this.cargar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.modalError = mensajeError(err, 'Error al registrar el feriado.');
        this.guardando  = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrarResultado() { this.resultado = null; }

  // ════════════════════════════════════════════════════════════
  // BAJA
  // ════════════════════════════════════════════════════════════

  confirmarBaja(f: Feriado) {
    this.feriadoParaBaja  = f;
    this.errorGlobal      = '';
    this.mostrarModalBaja = true;
  }

  cerrarModalBaja() {
    this.mostrarModalBaja = false;
    this.feriadoParaBaja  = null;
  }

  /**
   * Desactivar revierte el efecto: recalcula los minutos y quita la marca
   * de no laborable. Sin este camino, un error de fecha obligaría a
   * corregir a mano decenas de filas.
   */
  darDeBaja() {
    if (!this.feriadoParaBaja) return;
    this.guardando = true;

    this.svc.desactivar(this.feriadoParaBaja.idFeriado).subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModalBaja();
        this.cargar();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorGlobal = mensajeError(err, 'Error al dar de baja el feriado.');
        this.guardando   = false;
        this.cerrarModalBaja();
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  esSuperAdmin(): boolean { return this.rolUsuario === 'ROLE_SUPERADMIN'; }

  /** true si el impacto consultado ya afecta a datos existentes. */
  get hayImpacto(): boolean {
    if (!this.impacto) return false;
    return this.impacto.jornadasConMinutos > 0
        || this.impacto.preRegistrosSinMarcar > 0;
  }

  formatMin(min: number): string {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':'
         + String(min % 60).padStart(2, '0');
  }

  /** Día de la semana de una fecha ISO, para detectar errores de carga. */
  diaSemana(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00');
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles',
                  'Jueves', 'Viernes', 'Sábado'];
    return dias[d.getDay()];
  }

  esPasado(iso: string): boolean {
    return iso < fechaLocal();
  }
}
