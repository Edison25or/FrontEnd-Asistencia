import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fechaPe, fechaLocal } from '../../../shared/fecha-pe.pipe';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../core/services/asistencia.service';

@Component({
  selector: 'app-asistencia-dia',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './asistencia-dia.html',
  styleUrl: './asistencia-dia.css'
})
export class AsistenciaDiaComponent implements OnInit {

  private asistenciaService = inject(AsistenciaService);
  private cdr = inject(ChangeDetectorRef);

  asistencias:          any[] = [];
  asistenciasFiltradas: any[] = [];
  enPlanta:             any[] = [];
  isLoading = true;

  terminoBusqueda = '';
  filtroEstado    = '';   // filtra por tipo de registro

  totalPresente  = 0;
  totalATiempo   = 0;
  totalTarde     = 0;
  totalEnPlanta  = 0;

  ngOnInit() { this.cargarDatos(); }

  cargarDatos() {
    this.isLoading = true;

    this.asistenciaService.getAsistenciasDia().subscribe({
      next: (data) => {
        this.asistencias = data;
        this.aplicarFiltros();
        this.calcularResumen();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });

    this.asistenciaService.getEnPlanta().subscribe({
      next: (data) => {
        this.enPlanta     = data;
        this.totalEnPlanta = data.length;
        this.cdr.detectChanges();
      }
    });
  }

  aplicarFiltros() {
    let resultado = [...this.asistencias];

    if (this.terminoBusqueda.trim()) {
      const t = this.terminoBusqueda.toLowerCase();
      resultado = resultado.filter(a =>
        a.nombreCompleto?.toLowerCase().includes(t) ||
        // El documento puede llegar vacío según el rol (RN-05); el
        // encadenamiento opcional evita que el filtro falle por eso.
        a.nroDocumento?.includes(t)                 ||
        a.areaNombre?.toLowerCase().includes(t)     ||
        a.puestoNombre?.toLowerCase().includes(t)
      );
    }

    if (this.filtroEstado) {
      resultado = resultado.filter(a =>
        this.getEstadoDiario(a) === this.filtroEstado
      );
    }

    // ── Ventana de 24 horas ──
    // Se acota por FECHA DE JORNADA, no por un deslizante exacto de 24
    // horas. Con un deslizante, una jornada de ayer sin marcar (que solo
    // tiene fecha, sin hora real) quedaba fuera o dentro según la hora a
    // la que se mirara la pantalla, lo que hacía que la lista cambiara
    // sola durante el día.
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const limiteFecha = fechaLocal(ayer);
    resultado = resultado.filter(a => !a.fecha || a.fecha >= limiteFecha);

    // ── Orden descendente, sin excepciones ──
    // Antes las jornadas sin marcar se mandaban al final en bloque, así
    // que las faltas de anteayer aparecían por encima de los pendientes
    // de hoy. Ahora TODAS se ordenan por el mismo criterio temporal:
    // las marcadas por su hora real, las no marcadas por su fecha.
    resultado.sort((a, b) => this.instanteDe(b) - this.instanteDe(a));

    this.asistenciasFiltradas = resultado;
    this.cdr.detectChanges();
  }

  /**
   * Instante de referencia de una jornada, en milisegundos.
   *
   * Nunca devuelve null: una jornada sin marcar se ancla a su fecha a
   * medianoche. Así todas las filas comparten criterio de orden y las de
   * un mismo día quedan juntas, en vez de partirse entre marcadas y no
   * marcadas.
   *
   * La fecha se combina con la hora porque el DTO las trae en campos
   * separados, y una jornada nocturna termina en un día calendario
   * distinto al que empezó.
   */
  private instanteDe(a: any): number {
    if (!a.fecha) return 0;

    const hora = a.horaSalida || a.horaEntrada;
    if (!hora) {
      // Sin marcación: solo la fecha. Se sitúa al inicio del día, de modo
      // que queda por debajo de las jornadas del mismo día ya marcadas.
      const base = new Date(`${a.fecha}T00:00:00`).getTime();
      return isNaN(base) ? 0 : base;
    }

    const ts = new Date(`${a.fecha}T${hora}:00`).getTime();
    if (isNaN(ts)) return 0;

    // Si la salida es anterior a la entrada, la jornada cruzó la
    // medianoche y su salida cae al día siguiente.
    if (a.horaSalida && a.horaEntrada && a.horaSalida < a.horaEntrada) {
      return ts + 24 * 60 * 60 * 1000;
    }
    return ts;
  }

  /**
   * Fecha corta con día de la semana. Delega en el pipe para que el
   * formato sea el mismo en toda la aplicación.
   */
  fechaCorta(iso: string): string {
    return fechaPe(iso, 'larga');
  }

  /** true si la jornada no es del día de hoy. */
  esDeOtroDia(iso: string): boolean {
    if (!iso) return false;
    return iso !== fechaLocal();
  }

  calcularResumen() {
    // "Registros hoy" cuenta jornadas con marcación real, no pre-registros.
    // La vista lista todas las jornadas cuya ventana toca el día, incluidas
    // las que aún no empiezan; contarlas como registros daba un número que
    // no correspondía a nadie presente.
    const marcadas = this.asistencias.filter(a => a.horaEntrada || a.ingresoReal);

    this.totalPresente = marcadas.length;
    this.totalATiempo  = marcadas.filter(a => this.getEstadoDiario(a) === 'A_TIEMPO').length;
    this.totalTarde    = marcadas.filter(a => this.getEstadoDiario(a) === 'TARDE').length;
  }

  /** Jornadas programadas del día que todavía no tienen marcación. */
  get totalPendientes(): number {
    return this.asistencias.filter(a => !a.horaEntrada && !a.ingresoReal).length;
  }

  /**
   * Clasificación de la jornada.
   *
   * El antiguo campo de estado diario desaparece del DTO; la
   * clasificación la lleva 'tipo', sobre el enum único TipoRegistro. Se
   * conserva el nombre del método para no tocar las plantillas que ya lo
   * invocan.
   */
  getEstadoDiario(a: any): string {
    // Un pre-registro sin marcación NO es "a tiempo": es una jornada que
    // todavía no ocurrió. Confundirlos inflaba el contador de puntuales
    // con gente que aún no había llegado.
    if (!a.horaEntrada && !a.ingresoReal) {
      return a.estado === 'PENDIENTE' ? 'PENDIENTE' : (a.tipo || '');
    }
    if (a.tipo === 'PROGRAMADA') {
      return (a.minTardanza ?? 0) > 0 ? 'TARDE' : 'A_TIEMPO';
    }
    return a.tipo || '';
  }

  buscar()                       { this.aplicarFiltros(); }
  filtrarPorEstado(e: string)    { this.filtroEstado = this.filtroEstado === e ? '' : e; this.aplicarFiltros(); }
  refrescar()                    { this.terminoBusqueda = ''; this.filtroEstado = ''; this.cargarDatos(); }

  getClaseEstado(a: any): string {
    switch (this.getEstadoDiario(a)) {
      case 'A_TIEMPO':                 return 'badge-a-tiempo';
      case 'TARDE':                    return 'badge-tarde';
      case 'FALTA_INJUSTIFICADA':      return 'badge-falta';
      case 'MARCACION_INCOMPLETA':     return 'badge-tarde';
      case 'HORA_EXTRA_NO_PROGRAMADA': return 'badge-justificado';
      default:                         return 'badge-sin-estado';
    }
  }

  getEtiquetaEstado(a: any): string {
    switch (this.getEstadoDiario(a)) {
      case 'A_TIEMPO':                 return 'A Tiempo';
      case 'TARDE':                    return 'Tarde';
      case 'PENDIENTE':                return 'Pendiente';
      case 'FALTA_INJUSTIFICADA':      return 'Falta';
      case 'MARCACION_INCOMPLETA':     return 'Incompleta';
      case 'HORA_EXTRA_NO_PROGRAMADA': return 'Hora extra';
      case 'NO_PROGRAMADA':            return 'No programada';
      case 'CONTINGENCIA':             return 'Contingencia';
      default:                         return this.getEstadoDiario(a) || '-';
    }
  }

  // Versión del filtro que solo recibe el string (para el label del botón "quitar filtro")
  getEtiquetaFiltro(): string {
    switch (this.filtroEstado) {
      case 'A_TIEMPO':                 return 'A Tiempo';
      case 'TARDE':                    return 'Tarde';
      case 'PENDIENTE':                return 'Pendiente';
      case 'FALTA_INJUSTIFICADA':      return 'Falta';
      case 'MARCACION_INCOMPLETA':     return 'Incompleta';
      default:                         return this.filtroEstado;
    }
  }

  getTipoBadge(tipo: string): string {
    const mapa: Record<string, string> = {
      PROGRAMADA:    'tipo-prog',
      NO_PROGRAMADA: 'tipo-noprog',
      FALTA:         'tipo-falta',
      PERMISO:       'tipo-permiso'
    };
    return mapa[tipo] ?? 'tipo-prog';
  }

  getTipoLabel(tipo: string): string {
    const mapa: Record<string, string> = {
      PROGRAMADA:    'Prog.',
      NO_PROGRAMADA: 'No prog.',
      FALTA:         'Falta',
      PERMISO:       'Permiso'
    };
    return mapa[tipo] ?? tipo ?? '-';
  }

  getFechaHoy(): string {
    return new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
}