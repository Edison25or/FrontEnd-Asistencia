import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProgramacionService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/programaciones';

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  getBySemana(fecha: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/semana/${fecha}`);
  }

  // Asignación individual
  crear(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  // Asignación masiva desde grupo → devuelve ProgramacionBulkResponse
  crearDesdeGrupo(idGrupo: number, semanaInicio: string, idEsquema: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/desde-grupo`, { idGrupo, semanaInicio, idEsquema });
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Confirma la programación de una semana y genera los pre-registros
   * de asistencia para todos los trabajadores programados.
   */
  confirmarSemana(semanaInicio: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/confirmar-semana`, { semanaInicio });
  }
}