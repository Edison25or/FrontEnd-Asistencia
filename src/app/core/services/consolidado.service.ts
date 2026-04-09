import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConsolidadoService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/consolidado';

  getQuincenas(): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}/quincenas`);
  }

  generar(idQuincena: number): Observable<any[]> {
    return this.http.post<any[]>(`${this.api}/generar/${idQuincena}`, {});
  }

  listar(idQuincena: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}/${idQuincena}`);
  }

  getConsolidadoTrabajador(idQuincena: number, idTrabajador: number): Observable<any> {
    return this.http.get<any>(`${this.api}/${idQuincena}/trabajador/${idTrabajador}`);
  }

  editar(idConsolidado: number, payload: {
    otroBono?: number; detalleOtroBono?: string; observaciones?: string;
  }): Observable<any> {
    return this.http.patch<any>(`${this.api}/${idConsolidado}`, payload);
  }

  cerrar(payload: {
    idQuincena: number;
    decisiones: { idTrabajador: number; minExtraPagados: number;
                  minExtraABolsa: number; bolsaConsumida: number; }[];
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/cerrar`, payload);
  }

  solicitarReapertura(idQuincena: number, motivo: string): Observable<void> {
    return this.http.post<void>(`${this.api}/solicitar-reaper`, { idQuincena, motivo });
  }

  aprobarReapertura(idQuincena: number): Observable<void> {
    return this.http.post<void>(`${this.api}/${idQuincena}/aprobar-reaper`, {});
  }

  getReporte(idQuincena: number): Observable<any> {
    return this.http.get<any>(`${this.api}/reporte/${idQuincena}`);
  }

  getHistorialBolsa(idTrabajador: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}/bolsa/${idTrabajador}`);
  }
}