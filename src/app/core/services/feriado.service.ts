import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Feriado {
  idFeriado:     number;
  fecha:         string;
  descripcion:   string;
  activo:        boolean;
  registradoPor: string | null;
}

export interface DetalleImpacto {
  idAsistencia:     number;
  trabajador:       string;
  fechaJornada:     string;
  turno:            string;
  minutosEnFeriado: number;
}

/**
 * Impacto de un feriado sobre los registros existentes.
 *
 * Se consulta antes de confirmar y se devuelve también al registrar.
 * Con dos turnos en paralelo, a qué jornadas alcanza un feriado no es
 * evidente: la nocturna de la víspera aporta minutos aunque su fecha sea
 * el día anterior.
 */
export interface ImpactoFeriado {
  idFeriado?:            number;
  fecha:                 string;
  /** Jornadas con minutos dentro del día feriado. */
  jornadasConMinutos:    number;
  /** Pre-registros sin marcar que quedan como no laborables. */
  preRegistrosSinMarcar: number;
  detalle:               DetalleImpacto[];
}

/**
 * Catálogo de feriados y cómputo de horas en ellos (CU24, RN-41).
 *
 * El cómputo se hace por DÍA CALENDARIO, sobre los minutos efectivamente
 * trabajados dentro de [fecha 00:00, fecha+1 00:00), sin importar a qué
 * jornada pertenezcan. Con dos turnos en paralelo y el nocturno cruzando
 * la medianoche, ninguna regla que atribuya la jornada completa a un solo
 * día da el resultado correcto para todos los casos.
 */
@Injectable({ providedIn: 'root' })
export class FeriadoService {
  private http = inject(HttpClient);
  private api  = 'http://localhost:8080/api/feriados';

  listar(): Observable<Feriado[]> {
    return this.http.get<Feriado[]>(this.api);
  }

  /** Conteo de registros afectados ANTES de confirmar. */
  previsualizar(fecha: string): Observable<ImpactoFeriado> {
    const params = new HttpParams().set('fecha', fecha);
    return this.http.get<ImpactoFeriado>(`${this.api}/previsualizar`, { params });
  }

  registrar(fecha: string, descripcion: string): Observable<ImpactoFeriado> {
    return this.http.post<ImpactoFeriado>(this.api, { fecha, descripcion });
  }

  /** Revierte el cómputo y la marca de no laborable. */
  desactivar(idFeriado: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${idFeriado}`);
  }
}
