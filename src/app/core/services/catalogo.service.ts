import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CatalogoSimple {
  /**
   * Clasificación de los tipos de ausencia: si el tipo corresponde a una
   * ausencia prevista, a una imprevista, o a ambas.
   *
   * Los demás catálogos los devuelven en true, ya que no aplica la
   * distinción.
   */
  aplicaPermiso?: boolean;
  aplicaFaltaJustificada?: boolean;
  id:          number;
  nombre:      string;
  descripcion?: string;
  activo:      boolean;
}

/**
 * Catalogos incorporados en esta version: Tipos de Ausencia (RN-16) y
 * Motivos de Cese (RN-11).
 *
 * Los tipos de ausencia son comunes a permisos (CU16) y faltas
 * justificadas (CU17): lo que distingue a uno de otro es donde se
 * registra, no el tipo.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/catalogos';

  getTiposAusencia(): Observable<CatalogoSimple[]> {
    return this.http.get<CatalogoSimple[]>(`${this.api}/tipos-ausencia`);
  }

  crearTipoAusencia(data: { nombre: string; descripcion?: string }): Observable<CatalogoSimple> {
    return this.http.post<CatalogoSimple>(`${this.api}/tipos-ausencia`, data);
  }

  desactivarTipoAusencia(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/tipos-ausencia/${id}`);
  }

  getMotivosCese(): Observable<CatalogoSimple[]> {
    return this.http.get<CatalogoSimple[]>(`${this.api}/motivos-cese`);
  }

  crearMotivoCese(data: { nombre: string }): Observable<CatalogoSimple> {
    return this.http.post<CatalogoSimple>(`${this.api}/motivos-cese`, data);
  }

  desactivarMotivoCese(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/motivos-cese/${id}`);
  }
}
