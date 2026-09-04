import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Resumen de una corrida del cierre diario (CU29). */
export interface ResultadoCierre {
  faltasInjustificadas:   number;
  marcacionesIncompletas: number;
  cubiertasPorAusencia:   number;
  total:                  number;
}

/**
 * Revisión de asistencias (CU15, CU18, CU19, CU20, CU29).
 *
 * ============================================================
 * QUE CAMBIA
 * ============================================================
 * 1. Desaparece crearQuincena(). Las quincenas se autogeneran al
 *    confirmar la programación semanal (RN-35): el endpoint que las
 *    creaba a mano ya no existe.
 *
 * 2. La ruta de registro manual pasa de /no-programada a /contingencia,
 *    y ambos extremos son opcionales por separado. El caso más frecuente
 *    de una falla del lector es conocer solo uno de los dos, y exigirlos
 *    juntos obligaba a inventar el que faltaba.
 *
 * 3. Se agrega corregirMarcacion() para completar jornadas incompletas
 *    (CU15), que antes no tenía forma de invocarse desde el frontend.
 *
 * 4. Se agrega ejecutarCierreDiario(): el proceso corre solo cada hora,
 *    pero poder dispararlo a mano sirve para regularizar y para probar.
 */
@Injectable({ providedIn: 'root' })
export class RevisionAsistenciaService {
  private http = inject(HttpClient);
  private base = 'http://localhost:8080/api/asistencia';

  // ── Quincenas ──────────────────────────────────────────────
  getQuincenas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/quincenas`);
  }

  // ── Revisión ───────────────────────────────────────────────
  getParaRevision(idQuincena: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/revision/${idQuincena}`);
  }

  /** Validación de hora extra excepcional (CU18). */
  validarTiempos(payload: {
    idAsistencia:  number;
    valMinPrevIng: number;
    valMinPostSal: number;
    /** Obligatorio: toda validación se justifica (RN-02). */
    observacion:   string;
    /** APROBADO o RECHAZADO. */
    resultado?:    string;
    /** Turno a asignar cuando la jornada no tiene esquema (RN-25). */
    idTurno?:      number;
  }): Observable<any> {
    return this.http.patch<any>(`${this.base}/validar-tiempos`, payload);
  }

  /**
   * Corrige o completa una marcación (CU15).
   * Las horas van en formato ISO completo, porque una jornada nocturna
   * termina en un día calendario distinto al que empezó.
   */
  corregirMarcacion(payload: {
    idAsistencia: number;
    ingresoReal?: string;
    salidaReal?:  string;
    motivo:       string;
  }): Observable<any> {
    return this.http.patch<any>(`${this.base}/corregir-marcacion`, payload);
  }

  /** Registro manual por contingencia (CU19). */
  registrarContingencia(payload: {
    idTrabajador: number;
    fecha:        string;
    ingresoReal?: string;
    salidaReal?:  string;
    idTurno?:     number;
    observacion:  string;
  }): Observable<any> {
    return this.http.post<any>(`${this.base}/contingencia`, payload);
  }

  /**
   * Ejecuta el cierre diario a mano (CU29).
   *
   * Es idempotente: resuelve solo las jornadas cuya ventana ya venció sin
   * completarse, así que puede lanzarse tantas veces como haga falta.
   */
  ejecutarCierreDiario(): Observable<ResultadoCierre> {
    return this.http.post<ResultadoCierre>(`${this.base}/cierre-diario`, {});
  }
}
