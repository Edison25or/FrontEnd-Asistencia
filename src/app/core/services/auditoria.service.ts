import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/auditoria';

  buscar(filtros: {
    tabla?:     string;
    accion?:    string;
    idUsuario?: number;
    desde?:     string;
    hasta?:     string;
    page?:      number;
    size?:      number;
  }): Observable<any> {
    let params = new HttpParams();
    if (filtros.tabla)     params = params.set('tabla',     filtros.tabla);
    if (filtros.accion)    params = params.set('accion',    filtros.accion);
    if (filtros.idUsuario) params = params.set('idUsuario', filtros.idUsuario);
    if (filtros.desde)     params = params.set('desde',     filtros.desde);
    if (filtros.hasta)     params = params.set('hasta',     filtros.hasta);
    params = params.set('page', filtros.page ?? 0);
    params = params.set('size', filtros.size ?? 30);
    return this.http.get<any>(this.apiUrl, { params });
  }

  historial(tabla: string, idRegistro: number): Observable<any[]> {
    const params = new HttpParams()
      .set('tabla',      tabla)
      .set('idRegistro', idRegistro);
    return this.http.get<any[]>(`${this.apiUrl}/historial`, { params });
  }
}