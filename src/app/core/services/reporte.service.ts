import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import * as XLSX from 'xlsx';

@Injectable({ providedIn: 'root' })
export class ReporteService {
  private http   = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/asistencias/reporte';

  getReporte(filtros: {
    fechaInicio:  string;
    fechaFin:     string;
    idTrabajador?: number | null;
    idArea?:       number | null;
  }): Observable<any[]> {
    let params = new HttpParams()
      .set('fechaInicio', filtros.fechaInicio)
      .set('fechaFin',    filtros.fechaFin);

    if (filtros.idTrabajador) params = params.set('idTrabajador', filtros.idTrabajador);
    if (filtros.idArea)       params = params.set('idArea',       filtros.idArea);

    return this.http.get<any[]>(this.apiUrl, { params });
  }

  exportarExcel(datos: any[], fechaInicio: string, fechaFin: string): void {
    // Transformar datos al formato de la hoja
    const filas = datos.map(r => ({
      'Fecha':            r.fecha,
      'Día':              r.diaSemana,
      'ID':               r.idTrabajador,
      'Trabajador':       r.nombreCompleto,
      'DNI':              r.nroDocumento,
      'Área':             r.areaNombre,
      'Puesto':           r.puestoNombre,
      'Hora Entrada':     r.horaEntrada  ?? '—',
      'Hora Salida':      r.horaSalida   ?? '—',
      'Estado':           r.estadoLabel,
      'Min. Laborados':   r.minutosLaborados ?? '—',
      'Observación':      r.observacion  ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(filas);

    // Anchos de columna
    ws['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 10 }, // Día
      { wch: 7  }, // ID
      { wch: 28 }, // Trabajador
      { wch: 11 }, // DNI
      { wch: 18 }, // Área
      { wch: 22 }, // Puesto
      { wch: 13 }, // Hora Entrada
      { wch: 12 }, // Hora Salida
      { wch: 13 }, // Estado
      { wch: 14 }, // Min. Laborados
      { wch: 25 }, // Observación
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencias');

    const nombreArchivo = `reporte_asistencias_${fechaInicio}_${fechaFin}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }
}
