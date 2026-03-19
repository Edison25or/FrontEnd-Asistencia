import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GrupoService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/grupos';

  getAll(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  crear(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, data);
  }

  actualizar(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, data);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  removerTrabajador(idGrupo: number, idTrabajador: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${idGrupo}/trabajadores/${idTrabajador}`);
  }
}