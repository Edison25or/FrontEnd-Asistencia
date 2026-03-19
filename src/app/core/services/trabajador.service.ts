import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// Interfaz igual a tu DTO de Spring
export interface TrabajadorRequest {
  docIdentidad: string;
  nroDocumento: string;
  pNombre: string;
  sNombre?: string;
  aPaterno: string;
  aMaterno: string;
  fechaNac: string;
  email: string;
  direccion?: string;
  telefono?: string;
  contactoEmergencias?: string;
  nroContacto?: string;
  parentesco?: 'PADRE' | 'MADRE' | 'CONYUGE' | 'HIJO_A' | 'HERMANO_A' | 'OTRO';
  idPuesto: number;
  idGenero: number;
}

@Injectable({
  providedIn: 'root'
})
export class TrabajadorService {

  private http = inject(HttpClient);

  private apiUrl = 'http://localhost:8080/api/trabajadores';
  private maestrosUrl = 'http://localhost:8080/api/maestros';

  // =============================
  // TRABAJADORES
  // =============================

  // listado paginado por estado
  getTrabajadores(
    page: number = 0,
    size: number = 20,
    estado: string = 'ACTIVO'
  ): Observable<any> {

    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('estado', estado);

    return this.http.get<any>(this.apiUrl, { params });
  }

  // obtener por id
  getTrabajadorById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  // crear
  crearTrabajador(trabajador: TrabajadorRequest): Observable<any> {
    return this.http.post<any>(this.apiUrl, trabajador);
  }

  // actualizar
  updateTrabajador(id: number, trabajador: TrabajadorRequest): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, trabajador);
  }

  // =============================
  // CESAR TRABAJADOR
  // =============================

  cesarTrabajador(id: number, motivo: string = 'Cese de actividades'): Observable<any> {

    const params = new HttpParams()
      .set('motivo', motivo);

    return this.http.patch<any>(
      `${this.apiUrl}/${id}/cesar`,
      {},
      { params }
    );
  }

  // =============================
  // REINGRESO
  // =============================

  reingresarTrabajador(id: number, idPuesto: number): Observable<any> {

    const params = new HttpParams()
      .set('idPuesto', idPuesto.toString());

    return this.http.post<any>(
      `${this.apiUrl}/${id}/reingreso`,
      {},
      { params }
    );
  }

  // =============================
  // MAESTROS
  // =============================

  getGeneros(): Observable<any[]> {
    return this.http.get<any[]>(`${this.maestrosUrl}/generos`);
  }

  getAreas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.maestrosUrl}/areas`);
  }

  getPuestosByArea(idArea: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.maestrosUrl}/areas/${idArea}/puestos`);
  }

  buscarTrabajadores(q: string, estado: string = 'ACTIVO'): Observable<any> {
    const params = new HttpParams()
      .set('q', q)
      .set('estado', estado);
    return this.http.get<any>(`${this.apiUrl}/buscar`, { params });
  }

  // =============================
  // RESET PASSWORD (Admin)
  // =============================
  resetearPassword(id: number): Observable<string> {
    return this.http.post(
      `${this.apiUrl}/${id}/reset-password`,
      {},
      { responseType: 'text' }
    );
  }

}