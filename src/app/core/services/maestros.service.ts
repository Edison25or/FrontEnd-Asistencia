import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GeneroItem   { idGenero: number; genero: string; activo: boolean; }
export interface AreaItem     { idArea: number;   area: string;   activo: boolean; }
export interface PuestoItem   { idPuesto: number; puesto: string; descripcionPuesto?: string;
                                idArea: number;   areaNombre: string; activo: boolean; }

@Injectable({ providedIn: 'root' })
export class MaestrosService {
  private http   = inject(HttpClient);
  private base   = 'http://localhost:8080/api/maestros/admin';
  private pubUrl = 'http://localhost:8080/api/maestros';

  // ── Géneros ─────────────────────────────────────────────
  getGeneros():                                 Observable<GeneroItem[]>{ return this.http.get<GeneroItem[]>(`${this.base}/generos`); }
  crearGenero(body: {genero:string}):           Observable<GeneroItem>{ return this.http.post<GeneroItem>(`${this.base}/generos`, body); }
  editarGenero(id:number, b:{genero:string}):   Observable<GeneroItem>{ return this.http.put<GeneroItem>(`${this.base}/generos/${id}`, b); }
  toggleGenero(id:number):                      Observable<GeneroItem>{ return this.http.patch<GeneroItem>(`${this.base}/generos/${id}/toggle`, {}); }

  // ── Áreas ────────────────────────────────────────────────
  getAreas():                          Observable<AreaItem[]>  { return this.http.get<AreaItem[]>(`${this.base}/areas`); }
  crearArea(body:{area:string}):       Observable<AreaItem>    { return this.http.post<AreaItem>(`${this.base}/areas`, body); }
  editarArea(id:number, b:{area:string}): Observable<AreaItem>{ return this.http.put<AreaItem>(`${this.base}/areas/${id}`, b); }
  toggleArea(id:number):               Observable<AreaItem>    { return this.http.patch<AreaItem>(`${this.base}/areas/${id}/toggle`, {}); }

  // ── Puestos ──────────────────────────────────────────────
  getPuestos():                          Observable<PuestoItem[]>  { return this.http.get<PuestoItem[]>(`${this.base}/puestos`); }
  crearPuesto(body:any):                 Observable<PuestoItem>    { return this.http.post<PuestoItem>(`${this.base}/puestos`, body); }
  editarPuesto(id:number, body:any):     Observable<PuestoItem>    { return this.http.put<PuestoItem>(`${this.base}/puestos/${id}`, body); }
  togglePuesto(id:number):               Observable<PuestoItem>    { return this.http.patch<PuestoItem>(`${this.base}/puestos/${id}/toggle`, {}); }

  // ── Para dropdown de áreas activas en form de puestos ───
  getAreasActivas(): Observable<AreaItem[]> { return this.http.get<AreaItem[]>(`${this.pubUrl}/areas`); }
}