import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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

  /**
   * Quita de una semana toda la programación de un grupo, en una sola
   * llamada. El servidor la resuelve como una transacción: o se quitan
   * todas o no se quita ninguna.
   *
   * No usar N llamadas a eliminar() en paralelo: si una falla, las demás
   * ya se ejecutaron y el grupo queda a medias.
   */
  eliminarPorGrupo(idGrupo: number | null, semanaInicio: string,
                   idEsquema?: number): Observable<number> {
    let params = new HttpParams().set('semanaInicio', semanaInicio);
    if (idGrupo != null)   params = params.set('idGrupo',   String(idGrupo));
    if (idEsquema != null) params = params.set('idEsquema', String(idEsquema));
    return this.http.delete<number>(`${this.apiUrl}/grupo`, { params });
  }

  /** "Mi horario" del portal personal: solo la programación propia. */
  getMiSemana(fecha: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/mi-semana/${fecha}`);
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