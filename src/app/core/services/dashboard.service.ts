import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PuntoDiario {
  fecha:             string;
  diaSemana:         string;
  programadas:       number;
  trabajadas:        number;
  tardanzas:         number;
  faltas:            number;
  minutosTrabajados: number;
  esFeriado:         boolean;
}

export interface CorteArea {
  idArea:            number | null;
  area:              string;
  trabajadores:      number;
  jornadas:          number;
  tardanzas:         number;
  faltas:            number;
  minutosTrabajados: number;
  minutosExtra:      number;
  tasaPuntualidad:   number;
  horasTrabajadas:   string;
}

export interface CorteTurno {
  turno:            string;
  jornadas:         number;
  tardanzas:        number;
  minutosNormales:  number;
  minutosExtra:     number;
  minutosFeriado:   number;
  tasaPuntualidad:  number;
  horasNormales:    string;
  horasExtra:       string;
}

export interface FilaTrabajador {
  idTrabajador:      number;
  nombre:            string;
  area:              string;
  puesto:            string;
  jornadas:          number;
  minutosTrabajados: number;
  minutosEsperados:  number;
  saldoMinutos:      number;
  saldoHoras:        string;
  tardanzas:         number;
  minutosTardanza:   number;
  faltas:            number;
  horasTrabajadas:   string;
}

export interface Estadisticas {
  desde:       string;
  hasta:       string;
  areaNombre:  string | null;
  diasPeriodo: number;

  totalJornadas:      number;
  jornadasTrabajadas: number;
  tasaPuntualidad:    number;
  totalTardanzas:     number;
  minutosTardanza:    number;

  faltasInjustificadas: number;
  diasPermiso:          number;
  diasFaltaJustificada: number;

  asistenciasPerfectas:    number;
  trabajadoresConJornadas: number;

  minutosTrabajados:       number;
  minutosEsperados:        number;
  minutosExtraReconocidos: number;
  minutosExtraPendientes:  number;
  minutosFeriado:          number;
  horasTrabajadas:         string;
  horasExtra:              string;
  horasFeriado:            string;

  pendientesRevision:     number;
  marcacionesIncompletas: number;

  tendenciaDiaria:  PuntoDiario[];
  porArea:          CorteArea[];
  porTurno:         CorteTurno[];
  sobrecarga:       FilaTrabajador[];
  rankingTardanzas: FilaTrabajador[];
  rankingFaltas:    FilaTrabajador[];
}

/**
 * Estadísticas para la toma de decisiones.
 *
 * Un solo endpoint devuelve el conjunto completo. Partirlo obligaría a
 * seis peticiones para pintar una pantalla, y cada una recorrería las
 * mismas jornadas en el servidor.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/dashboard';

  getEstadisticas(desde: string, hasta: string, idArea?: number | null): Observable<Estadisticas> {
    let params = new HttpParams().set('desde', desde).set('hasta', hasta);
    if (idArea != null) params = params.set('idArea', String(idArea));
    return this.http.get<Estadisticas>(`${this.api}/estadisticas`, { params });
  }
}
