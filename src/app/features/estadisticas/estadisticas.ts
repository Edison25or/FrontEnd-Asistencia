import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService, Estadisticas, PuntoDiario }
  from '../../core/services/dashboard.service';
import { MaestrosService, AreaItem } from '../../core/services/maestros.service';
import { AuthService } from '../../core/services/auth';

type Rango = '7d' | '15d' | '30d' | 'mes' | 'custom';

/**
 * Estadísticas para la toma de decisiones.
 *
 * ============================================================
 * QUÉ SE MUESTRA Y POR QUÉ
 * ============================================================
 * Las cifras sueltas dicen qué pasó; lo que permite decidir es verlas
 * repartidas. Por eso además de los totales hay tres cortes:
 *
 *   Tendencia diaria — distingue un mal día de un problema sostenido.
 *   Área y turno     — es donde aparecen los desequilibrios.
 *   Sobrecarga       — quién acumula horas por encima de lo esperado,
 *                      que es lo que permite actuar antes de que se
 *                      convierta en un problema.
 *
 * ============================================================
 * SIN LIBRERÍA DE GRÁFICOS
 * ============================================================
 * Las barras se dibujan con CSS y el histograma con SVG en línea. Añadir
 * una dependencia de gráficos para cuatro visualizaciones simples traería
 * su propio ciclo de versiones y estilos que pelear.
 */
@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estadisticas.html',
  styleUrl:    './estadisticas.css'
})
export class EstadisticasComponent implements OnInit {
  private svc      = inject(DashboardService);
  private maestros = inject(MaestrosService);
  private auth     = inject(AuthService);
  private cdr      = inject(ChangeDetectorRef);

  datos: Estadisticas | null = null;
  areas: AreaItem[] = [];

  isLoading   = false;
  errorGlobal = '';
  rolUsuario  = '';

  // ── Filtros ───────────────────────────────────────────────
  rango: Rango = '30d';
  desde = '';
  hasta = '';
  idArea: number | null = null;

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.aplicarRango('30d');

    this.maestros.getAreas().subscribe({
      next: (a: AreaItem[]) => { this.areas = a; this.cdr.detectChanges(); }
    });

    this.cargar();
  }

  // ════════════════════════════════════════════════════════════
  // FILTROS
  // ════════════════════════════════════════════════════════════

  aplicarRango(r: Rango) {
    this.rango = r;
    const hoy = new Date();

    if (r === 'mes') {
      this.desde = this.iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      this.hasta = this.iso(hoy);
    } else if (r !== 'custom') {
      const dias = r === '7d' ? 7 : r === '15d' ? 15 : 30;
      const ini  = new Date(hoy);
      ini.setDate(ini.getDate() - (dias - 1));
      this.desde = this.iso(ini);
      this.hasta = this.iso(hoy);
    }

    if (r !== 'custom') this.cargar();
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
         + `-${String(d.getDate()).padStart(2, '0')}`;
  }

  cargar() {
    if (!this.desde || !this.hasta) return;
    if (this.hasta < this.desde) {
      this.errorGlobal = 'La fecha final no puede ser anterior a la inicial.';
      return;
    }

    this.isLoading   = true;
    this.errorGlobal = '';

    this.svc.getEstadisticas(this.desde, this.hasta, this.idArea).subscribe({
      next: d => { this.datos = d; this.isLoading = false; this.cdr.detectChanges(); },
      error: (e: any) => {
        this.errorGlobal = e.error?.message || 'No se pudieron cargar las estadísticas.';
        this.isLoading   = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // GRÁFICO DE TENDENCIA
  // ════════════════════════════════════════════════════════════

  /** Alto máximo del histograma, en píxeles. */
  private readonly ALTO_GRAFICO = 120;

  /**
   * Escala común para trabajadas y faltas.
   *
   * Escalar cada serie por separado haría que tres faltas se vieran tan
   * altas como ochenta jornadas trabajadas, que es exactamente la lectura
   * equivocada.
   */
  get maxDiario(): number {
    if (!this.datos?.tendenciaDiaria?.length) return 1;
    return Math.max(1, ...this.datos.tendenciaDiaria.map(p => p.programadas));
  }

  alturaBarra(valor: number): number {
    return Math.round((valor / this.maxDiario) * this.ALTO_GRAFICO);
  }

  /** Ancho de cada columna, para que el gráfico llene el ancho disponible. */
  get anchoBarra(): number {
    const n = this.datos?.tendenciaDiaria?.length || 1;
    return Math.max(6, Math.floor(760 / n) - 3);
  }

  /**
   * Etiqueta del eje. Con más de dos semanas se muestra una de cada
   * tres para que no se solapen.
   */
  mostrarEtiqueta(i: number): boolean {
    const n = this.datos?.tendenciaDiaria?.length || 0;
    if (n <= 10) return true;
    if (n <= 20) return i % 2 === 0;
    return i % 3 === 0;
  }

  tooltipDia(p: PuntoDiario): string {
    const partes = [
      `${p.diaSemana} ${p.fecha}`,
      `${p.trabajadas} de ${p.programadas} jornadas`,
    ];
    if (p.tardanzas > 0) partes.push(`${p.tardanzas} con tardanza`);
    if (p.faltas > 0)    partes.push(`${p.faltas} falta(s)`);
    if (p.esFeriado)     partes.push('Feriado');
    return partes.join(' · ');
  }

  // ════════════════════════════════════════════════════════════
  // BARRAS COMPARATIVAS
  // ════════════════════════════════════════════════════════════

  /** Porcentaje del máximo, para las barras de área y turno. */
  proporcion(valor: number, maximo: number): number {
    if (!maximo) return 0;
    return Math.round((valor / maximo) * 100);
  }

  get maxHorasArea(): number {
    return Math.max(1, ...(this.datos?.porArea ?? []).map(a => a.minutosTrabajados));
  }

  get maxHorasTurno(): number {
    return Math.max(1, ...(this.datos?.porTurno ?? [])
      .map(t => t.minutosNormales + t.minutosExtra));
  }

  get maxSaldo(): number {
    return Math.max(1, ...(this.datos?.sobrecarga ?? []).map(f => f.saldoMinutos));
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

  /**
   * Color del indicador de puntualidad.
   *
   * Los umbrales son una convención de la interfaz, no una regla de
   * negocio: el análisis no fija ninguna meta de puntualidad. Sirven para
   * orientar la mirada, no para evaluar a nadie.
   */
  colorTasa(tasa: number): string {
    if (tasa >= 95) return 'tasa-alta';
    if (tasa >= 85) return 'tasa-media';
    return 'tasa-baja';
  }

  /** Porcentaje de asistencias perfectas sobre el personal con jornadas. */
  get pctPerfectas(): number {
    if (!this.datos?.trabajadoresConJornadas) return 0;
    return Math.round(100 * this.datos.asistenciasPerfectas
                          / this.datos.trabajadoresConJornadas);
  }

  /** Saldo global del periodo: trabajado menos esperado. */
  get saldoGlobal(): number {
    if (!this.datos) return 0;
    return this.datos.minutosTrabajados - this.datos.minutosEsperados;
  }

  esJefe(): boolean { return this.rolUsuario === 'ROLE_JEFE'; }

  get hayDatos(): boolean {
    return !!this.datos && this.datos.totalJornadas > 0;
  }
}
