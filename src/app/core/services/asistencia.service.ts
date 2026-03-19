import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AsistenciaService {

  private http    = inject(HttpClient);
  private apiUrl  = 'http://localhost:8080/api/asistencia';

  // Público — lo usa la pantalla del lector
  marcar(codigo: string): Observable<any> {
    const params = new HttpParams().set('codigo', codigo);
    return this.http.post<any>(`${this.apiUrl}/marcar`, {}, { params });
  }

  // Trabajadores actualmente en planta
  getEnPlanta(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/en-planta`);
  }

  // Asistencias del día completo
  getAsistenciasDia(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/dia`);
  }
}
