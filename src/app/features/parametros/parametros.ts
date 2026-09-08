import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ParametrosService, ParametrosGenerales, ParametrosQuincena }
  from '../../core/services/parametros.service';
import { AuthService } from '../../core/services/auth';

/**
 * Configuración global de asistencia y quincena (CU26, CU27).
 *
 * ============================================================
 * POR QUÉ ESTA PANTALLA EXISTE
 * ============================================================
 * P1, P2 y P3 estaban cableados en el código del prototipo. Cambiar la
 * tolerancia de entrada anticipada exigía un despliegue, lo que
 * contradice RNF014.
 *
 * ============================================================
 * LAS VALIDACIONES SE REPITEN AQUÍ Y EN EL BACKEND
 * ============================================================
 * No por desconfianza, sino porque el error se entiende mejor al lado del
 * campo que lo causa. El backend valida igual, y es el que manda: la
 * comprobación del cliente solo evita el viaje.
 */
@Component({
  selector: 'app-parametros',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parametros.html',
  styleUrl:    './parametros.css'
})
export class ParametrosComponent implements OnInit {
  private svc  = inject(ParametrosService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);

  generales: ParametrosGenerales = {
    maxAnticipacionEntrada:     120,
    maxExcesoSalida:            120,
    topeCombinado:              180,
    ventanaConfirmacionSeg:      25,
    intervaloAntirreboteSeg:     10,
    descontarRefrigerioFeriado: true
  };

  quincena: ParametrosQuincena = {
    diaCorteIntermedio: 15,
    horaCorte:          '18:00'
  };

  isLoading      = false;
  guardandoGen   = false;
  guardandoQui   = false;
  errorGen       = '';
  errorQui       = '';
  okGen          = '';
  okQui          = '';
  rolUsuario     = '';

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.cargar();
  }

  cargar() {
    this.isLoading = true;
    forkJoin({
      gen: this.svc.getGenerales(),
      qui: this.svc.getQuincena()
    }).subscribe({
      next: (r) => {
        this.generales = r.gen;
        this.quincena  = { ...r.qui, horaCorte: (r.qui.horaCorte || '18:00').substring(0, 5) };
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  // ════════════════════════════════════════════════════════════
  // VALIDACIÓN DE P1, P2 Y P3
  // ════════════════════════════════════════════════════════════

  /**
   * Devuelve el problema con la configuración actual, o null si es válida.
   *
   * P3 es un tope COMBINADO: acota la suma de lo que el trabajador se
   * adelantó y lo que se quedó de más. Por eso no puede ser menor que
   * cualquiera de los dos por separado, ni mayor que su suma; fuera de
   * ese rango, o vuelve inalcanzable a P1 y P2, o no restringe nada.
   */
  get errorP3(): string | null {
    const p1 = this.generales.maxAnticipacionEntrada;
    const p2 = this.generales.maxExcesoSalida;
    const p3 = this.generales.topeCombinado;

    if (p1 == null || p2 == null || p3 == null) return null;

    const mayor = Math.max(p1, p2);
    if (p3 < mayor) {
      return `El tope combinado (${p3}) no puede ser menor que el mayor entre `
           + `P1 y P2 (${mayor}): dejaría inalcanzable ese límite.`;
    }
    if (p3 > p1 + p2) {
      return `El tope combinado (${p3}) no puede exceder la suma de P1 y P2 `
           + `(${p1 + p2}): no restringiría nada.`;
    }
    return null;
  }

  /**
   * El intervalo anti-rebote debe ser MENOR que la ventana de
   * confirmación. Si no, el segundo escaneo de una entrada anticipada se
   * descartaría como rebote y la confirmación nunca podría completarse.
   */
  get errorTiemposLector(): string | null {
    const conf   = this.generales.ventanaConfirmacionSeg;
    const rebote = this.generales.intervaloAntirreboteSeg;
    if (conf == null || rebote == null) return null;

    if (rebote >= conf) {
      return `El intervalo anti-rebote (${rebote}s) debe ser menor que la ventana `
           + `de confirmación (${conf}s), o el segundo escaneo se descartaría `
           + `como rebote y nadie podría confirmar una entrada anticipada.`;
    }
    return null;
  }

  get generalesValidos(): boolean {
    return !this.errorP3 && !this.errorTiemposLector;
  }

  // ════════════════════════════════════════════════════════════
  // GUARDAR
  // ════════════════════════════════════════════════════════════

  guardarGenerales() {
    if (!this.generalesValidos) return;

    this.guardandoGen = true;
    this.errorGen = '';
    this.okGen    = '';

    this.svc.guardarGenerales(this.generales).subscribe({
      next: (r) => {
        this.generales    = r;
        this.guardandoGen = false;
        this.okGen        = 'Configuración guardada.';
        this.cdr.detectChanges();
        setTimeout(() => { this.okGen = ''; this.cdr.detectChanges(); }, 4000);
      },
      error: (err: any) => {
        this.errorGen     = mensajeError(err, 'Error al guardar.');
        this.guardandoGen = false;
        this.cdr.detectChanges();
      }
    });
  }

  guardarQuincena() {
    this.guardandoQui = true;
    this.errorQui = '';
    this.okQui    = '';

    this.svc.guardarQuincena(this.quincena).subscribe({
      next: (r) => {
        this.quincena     = { ...r, horaCorte: (r.horaCorte || '18:00').substring(0, 5) };
        this.guardandoQui = false;
        this.okQui        = 'Cortes guardados. Aplican a las quincenas que se generen a partir de ahora.';
        this.cdr.detectChanges();
        setTimeout(() => { this.okQui = ''; this.cdr.detectChanges(); }, 6000);
      },
      error: (err: any) => {
        this.errorQui     = mensajeError(err, 'Error al guardar.');
        this.guardandoQui = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  esSuperAdmin(): boolean { return this.rolUsuario === 'ROLE_SUPERADMIN'; }

  /** Minutos a formato legible, para explicar los valores. */
  enHoras(min: number): string {
    if (min == null) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }

  /** Ejemplo del rango de la primera quincena con la configuración actual. */
  get ejemploQuincena(): string {
    const d = this.quincena.diaCorteIntermedio;
    const h = this.quincena.horaCorte;
    return `Del último día del mes anterior a las ${h}, `
         + `hasta el día ${d} a las ${h}.`;
  }
}
