import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ════════════════════════════════════════════════════════════
// MODELOS
// ════════════════════════════════════════════════════════════

/**
 * Totales de una combinacion de turno y condicion de feriado.
 *
 * Reemplaza a las columnas fijas del consolidado anterior
 * (minNormalesDia, minExtraDiaA, tasaA...). Con dos turnos y un feriado
 * en el periodo, un trabajador puede tener hasta cuatro filas.
 *
 * Los buckets son EXCLUYENTES: los minutos trabajados dentro de un dia
 * feriado se restan de la fila no feriado del mismo turno, de modo que
 * sumar todas las filas da el total real sin duplicar horas.
 */
export interface TotalTurno {
  turno:       string;
  esFeriado:   boolean;
  minNormales: number;
  minExtra:    number;
  hNormales:   string;
  hExtra:      string;
}

export interface Consolidado {
  id:                  number;
  idQuincena:          number;
  quincenaDescripcion: string;
  idTrabajador:        number;
  trabajadorNombre:    string;
  puestoNombre:        string;
  areaNombre:          string;

  totalesPorTurno:     TotalTurno[];

  hTotalNormales:      string;
  hTotalExtra:         string;
  hTotalFeriado:       string;
  hTotalGeneral:       string;

  diasFalta:              number;
  diasPermiso:            number;
  diasFaltaJustificada:   number;

  minTotalTardanza:       number;
  minTotalSalTemprana:    number;
  minAcumuladoVsEsperado: number;
  hAcumuladoVsEsperado:   string;

  observaciones: string | null;
  version:       number;
  estado:        'BORRADOR' | 'CERRADO' | 'REEMPLAZADO';
  generadoEn:    string;
  cerradoEn:     string | null;
}

export interface QuincenaResumen {
  idQuincena:        number;
  descripcion:       string;
  inicio:            string;
  fin:               string;
  estado:            'ABIERTA' | 'CERRADA';
  totalConsolidados: number;
  /** Registros que impiden generar el consolidado (RN-37). */
  bloqueantes:       number;
  puedeGenerarse:    boolean;
}

export interface ConsolidadoReporte {
  idQuincena:   number;
  descripcion:  string;
  inicio:       string;
  fin:          string;
  estado:       string;
  trabajadores: Consolidado[];

  totalTrabajadores:         number;
  totalHNormales:            string;
  totalHExtra:               string;
  totalHFeriado:             string;
  totalDiasFalta:            number;
  totalDiasPermiso:          number;
  totalDiasFaltaJustificada: number;
}

// ════════════════════════════════════════════════════════════
// SERVICIO
// ════════════════════════════════════════════════════════════

/**
 * CAMBIOS RESPECTO DE LA VERSION ANTERIOR
 *
 * 1. Desaparece getHistorialBolsa(). El subsistema de bolsa de horas se
 *    retiro del backend por contradecir el alcance (AL-01, AL-04): el
 *    sistema no calcula montos ni acumula saldos. Contabilidad hace ese
 *    calculo fuera, con el consolidado exportado.
 *
 * 2. Desaparece cerrar(). Generar el consolidado YA cierra la quincena
 *    (RN-36), de modo que no existe un segundo paso con decisiones de
 *    bolsa.
 *
 * 3. solicitarReapertura() y aprobarReapertura() se unifican en
 *    reabrir(): la reapertura es directa, en un solo paso, y solo la
 *    ejecuta el Superadministrador (RN-38).
 *
 * 4. editar() solo admite observaciones. Los campos de bono en soles se
 *    retiraron.
 */
@Injectable({ providedIn: 'root' })
export class ConsolidadoService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/consolidado';

  getQuincenas(): Observable<QuincenaResumen[]> {
    return this.http.get<QuincenaResumen[]>(`${this.api}/quincenas`);
  }

  /**
   * Vista previa: calcula el consolidado sin persistirlo ni cerrar la
   * quincena. Permite revisar el resultado antes de una operación que
   * cierra el período de forma irreversible salvo reapertura.
   */
  previsualizar(idQuincena: number): Observable<Consolidado[]> {
    return this.http.get<Consolidado[]>(`${this.api}/previsualizar/${idQuincena}`);
  }

  /** Genera el consolidado y cierra la quincena (CU21, RN-36). */
  generar(idQuincena: number): Observable<Consolidado[]> {
    return this.http.post<Consolidado[]>(`${this.api}/generar/${idQuincena}`, {});
  }

  listar(idQuincena: number): Observable<Consolidado[]> {
    return this.http.get<Consolidado[]>(`${this.api}/${idQuincena}`);
  }

  getConsolidadoTrabajador(idQuincena: number, idTrabajador: number): Observable<Consolidado> {
    return this.http.get<Consolidado>(`${this.api}/${idQuincena}/trabajador/${idTrabajador}`);
  }

  editar(idConsolidado: number, payload: { observaciones?: string }): Observable<Consolidado> {
    return this.http.patch<Consolidado>(`${this.api}/${idConsolidado}`, payload);
  }

  /** Reapertura directa. Solo Superadministrador (RN-38). */
  reabrir(idQuincena: number, motivo: string): Observable<void> {
    return this.http.post<void>(`${this.api}/reabrir`, { idQuincena, motivo });
  }

  getReporte(idQuincena: number): Observable<ConsolidadoReporte> {
    return this.http.get<ConsolidadoReporte>(`${this.api}/reporte/${idQuincena}`);
  }
}
