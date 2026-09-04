import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Turno {
  idTurno:         number;
  nombre:          string;
  horaInicio:      string | null;
  horaFin:         string | null;
  /** true si el turno cruza la medianoche. Informativo. */
  cruzaMedianoche: boolean;
  activo:          boolean;
}

/**
 * Catalogo de turnos (RN-18).
 *
 * CAMBIO: la ruta pasa de /api/turnos a /api/catalogos/turnos. Los
 * catalogos incorporados en esta version (Turno, Tipos de Ausencia y
 * Motivos de Cese) viven bajo /api/catalogos; /api/maestros sigue
 * atendiendo Genero, Area y Puesto sin cambios.
 *
 * El backend no expone actualizacion de turnos: cambiar el nombre o el
 * horario de un turno en uso alteraria la interpretacion de jornadas ya
 * consolidadas. Se crea uno nuevo y se desactiva el anterior.
 */
@Injectable({ providedIn: 'root' })
export class TurnoService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/catalogos/turnos';

  getAll(): Observable<Turno[]> {
    return this.http.get<Turno[]>(this.apiUrl);
  }

  crear(data: { nombre: string; horaInicio?: string; horaFin?: string }): Observable<Turno> {
    return this.http.post<Turno>(this.apiUrl, data);
  }

  /**
   * Desactiva el turno. El backend lo rechaza si algun esquema de horario
   * vigente lo usa, porque dejaria jornadas sin clasificar (RN-25).
   */
  desactivar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
