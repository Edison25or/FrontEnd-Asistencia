import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EsquemaHorarioService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/esquemas-horario';

  // Para dropdowns (solo versiones vigentes y activas)
  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // Para la pantalla de gestión (agrupados con historial)
  getAllAgrupados(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/agrupados`);
  }

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  // Crear nuevo esquema (versión 1)
  crear(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  // Crear nueva versión de un esquema existente
  crearNuevaVersion(grupoNombre: string, data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${encodeURIComponent(grupoNombre)}/nueva-version`, data);
  }

  // Toggle activo/inactivo
  toggleActivo(id: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/toggle`, {});
  }

  contarProgramaciones(id: number): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/${id}/programaciones-count`);
  }
}