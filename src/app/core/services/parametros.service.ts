import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Configuración general de asistencia (CU27, RN-28). */
export interface ParametrosGenerales {
  /** P1: máxima anticipación de entrada, en minutos. */
  maxAnticipacionEntrada: number;
  /** P2: máximo exceso de salida, en minutos. */
  maxExcesoSalida: number;
  /** P3: tope combinado, en minutos. Solo evaluable en la salida. */
  topeCombinado: number;
  /** Segundos que el lector espera el segundo escaneo (HU-22). */
  ventanaConfirmacionSeg: number;
  /** Segundos durante los que se ignora un reescaneo (HU-53). */
  intervaloAntirreboteSeg: number;
  /** Descontar el refrigerio proporcional del cómputo de feriado (PD-03). */
  descontarRefrigerioFeriado: boolean;
}

/** Cortes de quincena (CU26, RN-35). */
export interface ParametrosQuincena {
  /** Día del mes en que corta la primera quincena. */
  diaCorteIntermedio: number;
  /** Hora de corte, aplicada a ambos límites. Formato HH:mm. */
  horaCorte: string;
}

@Injectable({ providedIn: 'root' })
export class ParametrosService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/parametros';

  getGenerales(): Observable<ParametrosGenerales> {
    return this.http.get<ParametrosGenerales>(`${this.api}/generales`);
  }

  guardarGenerales(p: ParametrosGenerales): Observable<ParametrosGenerales> {
    return this.http.put<ParametrosGenerales>(`${this.api}/generales`, p);
  }

  getQuincena(): Observable<ParametrosQuincena> {
    return this.http.get<ParametrosQuincena>(`${this.api}/quincena`);
  }

  guardarQuincena(p: ParametrosQuincena): Observable<ParametrosQuincena> {
    return this.http.put<ParametrosQuincena>(`${this.api}/quincena`, p);
  }
}
