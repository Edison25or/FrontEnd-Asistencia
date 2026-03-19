import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RevisionAsistenciaService {
  private http   = inject(HttpClient);
  private base   = 'http://localhost:8080/api/asistencia';

  // ── Quincenas ──────────────────────────────────────────────
  getQuincenas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/quincenas`);
  }

  crearQuincena(anio: number, mes: number, numero: number): Observable<any> {
    return this.http.post<any>(`${this.base}/quincenas`, { anio, mes, numero });
  }

  // ── Revisión de asistencias ────────────────────────────────
  getParaRevision(idQuincena: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/revision/${idQuincena}`);
  }

  validarTiempos(payload: {
    idAsistencia:  number;
    valMinPrevIng: number;
    valMinPostSal: number;
    observacion?:  string;
    tipo?:         string;
  }): Observable<any> {
    return this.http.patch<any>(`${this.base}/validar-tiempos`, payload);
  }

  registrarNoProgramada(payload: {
    idTrabajador: number;
    fecha:        string;
    ingresoReal:  string;
    salidaReal?:  string;
    observacion?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.base}/no-programada`, payload);
  }
}