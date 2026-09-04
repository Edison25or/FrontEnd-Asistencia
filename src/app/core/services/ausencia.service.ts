import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ════════════════════════════════════════════════════════════
// MODELOS
// ════════════════════════════════════════════════════════════

export interface PermisoRequest {
  idTrabajador:   number;
  idTipoAusencia: number;
  fechaInicio:    string;   // yyyy-MM-dd
  fechaFin:       string;
  comentario:     string;
}

export interface PermisoResponse {
  idPermiso:        number;
  idTrabajador:     number;
  trabajadorNombre: string;
  tipoAusencia:     string;
  fechaInicio:      string;
  fechaFin:         string;
  comentario:       string;
  /** true si se registró fuera del plazo estándar (RN-30). No bloquea. */
  fueraDePlazo:     boolean;
  registradoPor:    string | null;
  fechaRegistro:    string;
  /** Pre-registros que dejaron de contar como falta (RN-44). */
  preRegistrosNeutralizados: number;
}

export interface FaltaJustificadaRequest {
  idTrabajador:   number;
  idTipoAusencia: number;
  fechaInicio:    string;
  fechaFin:       string;
  comentario:     string;
}

export interface FaltaJustificadaResponse {
  idFaltaJustificada: number;
  idTrabajador:       number;
  trabajadorNombre:   string;
  tipoAusencia:       string;
  fechaInicio:        string;
  fechaFin:           string;
  comentario:         string;
  registradoPor:      string | null;
  fechaRegistro:      string;
  preRegistrosNeutralizados: number;
}

// ════════════════════════════════════════════════════════════
// SERVICIO
// ════════════════════════════════════════════════════════════

/**
 * Permisos y faltas justificadas (CU16, CU17).
 *
 * Son dos entidades distintas y no un solo registro con una bandera,
 * porque tienen reglas de plazo diferentes:
 *
 *   Permiso            — planificado, se espera de una a dos semanas de
 *                        anticipación; fuera de ese plazo se acepta con
 *                        advertencia (RN-30).
 *   Falta justificada  — no planificada, sin límite de plazo (RN-32).
 *
 * Ambas neutralizan los pre-registros del rango (RN-44): sin eso, el
 * cierre diario reportaría como falta injustificada a alguien con permiso
 * aprobado.
 */
@Injectable({ providedIn: 'root' })
export class AusenciaService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/ausencias';

  registrarPermiso(req: PermisoRequest): Observable<PermisoResponse> {
    return this.http.post<PermisoResponse>(`${this.api}/permisos`, req);
  }

  registrarFalta(req: FaltaJustificadaRequest): Observable<FaltaJustificadaResponse> {
    return this.http.post<FaltaJustificadaResponse>(`${this.api}/faltas-justificadas`, req);
  }

  /**
   * Elimina un permiso y revierte su efecto sobre los pre-registros.
   *
   * No hay método de edición: cambiar el rango obligaría a revertir y
   * volver a neutralizar en una sola operación, y un fallo intermedio
   * dejaría pre-registros a medio camino. Eliminar y recrear es
   * equivalente y no puede quedar a medias.
   *
   * @return número de pre-registros que volvieron a pendiente
   */
  eliminarPermiso(idPermiso: number): Observable<number> {
    return this.http.delete<number>(`${this.api}/permisos/${idPermiso}`);
  }

  eliminarFalta(idFalta: number): Observable<number> {
    return this.http.delete<number>(`${this.api}/faltas-justificadas/${idFalta}`);
  }

  listarPermisos(idTrabajador: number, desde: string, hasta: string): Observable<PermisoResponse[]> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<PermisoResponse[]>(`${this.api}/permisos/${idTrabajador}`, { params });
  }

  listarFaltas(idTrabajador: number, desde: string, hasta: string): Observable<FaltaJustificadaResponse[]> {
    const params = new HttpParams().set('desde', desde).set('hasta', hasta);
    return this.http.get<FaltaJustificadaResponse[]>(
      `${this.api}/faltas-justificadas/${idTrabajador}`, { params });
  }
}
