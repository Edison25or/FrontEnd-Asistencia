import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReporteService } from '../../../core/services/reporte.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { FechaPePipe, fechaPe, fechaLocal } from '../../../shared/fecha-pe.pipe';
import { AuthService } from '../../../core/services/auth';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Paleta del archivo, igual a la del reporte consolidado. */
const COLOR = {
  cabecera:   '4472C4',
  filaPar:    'D9E1F2',
  borde:      'B4C6E7',
  titulo:     '1F3864',
  textoTenue: '595959',
};

const BORDE_FINO = {
  top:    { style: 'thin', color: { rgb: COLOR.borde } },
  bottom: { style: 'thin', color: { rgb: COLOR.borde } },
  left:   { style: 'thin', color: { rgb: COLOR.borde } },
  right:  { style: 'thin', color: { rgb: COLOR.borde } },
};

@Component({
  selector: 'app-reporte-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule, FechaPePipe],
  templateUrl: './reporte-asistencia.html',
  styleUrl:    './reporte-asistencia.css'
})
export class ReporteAsistenciaComponent implements OnInit {

  private reporteService    = inject(ReporteService);
  private trabajadorService = inject(TrabajadorService);
  private cdr               = inject(ChangeDetectorRef);
  private authService = inject(AuthService);

  // ── Filtros ──
  fechaInicio   = this.primerDiaMes();
  fechaFin      = this.hoy();
  idTrabajador: number | null = null;
  idArea:       number | null = null;

  areas:        any[] = [];

  rolUsuario = '';
  areaPropia = '';

  /**
   * true si el rol queda acotado a su propia área.
   *
   * El Jefe ve solo su ámbito (RN-01), de modo que ofrecerle el selector
   * de área lo invitaría a elegir una que el servidor va a descartar, y
   * el buscador de trabajador le mostraría personal que no puede
   * consultar.
   */
  restringidoASuArea(): boolean {
    return this.rolUsuario === 'ROLE_JEFE';
  }
  trabajadores: any[] = [];
  trabajadoresFiltrados: any[] = [];
  terminoBusquedaTrab = '';

  registros:   any[] = [];
  isLoading    = false;
  isExportando = false;
  buscado      = false;

  // ════════════════════════════════════════════════════════════
  // ESTADO DE UNA JORNADA
  // ════════════════════════════════════════════════════════════

  /**
   * Clasifica la jornada para mostrarla y contarla.
   *
   * Los contadores comparaban el campo `estado` contra 'A_TIEMPO',
   * 'TARDE' y 'FALTA'. Ese campo ya no contiene esos valores: hoy lleva
   * el ciclo de vida del registro (PENDIENTE, MARCADO, CALCULADO,
   * REVISADO, CONSOLIDADO), y la clasificación se deriva del tipo y de
   * los minutos de tardanza. Por eso las tres tarjetas mostraban cero.
   *
   * Es el mismo criterio que aplica Asistencias del Día, para que ambas
   * pantallas no puedan contradecirse.
   */
  estadoJornada(r: any): string {
    if (r.tipo === 'FALTA_INJUSTIFICADA')   return 'FALTA';
    if (r.permisoAsociado)                  return 'PERMISO';
    if (r.faltaJustificadaAsociada)         return 'JUSTIFICADA';

    // Sin marcación no es "a tiempo": es una jornada que aún no ocurrió.
    if (!r.horaEntrada) {
      // Una jornada sin marcar puede estar en tres situaciones, y las
      // tres deben decir algo. Devolver el tipo tal cual dejaba
      // 'PROGRAMADA' sin etiqueta, que es como salir en blanco: el
      // trabajador veía la fila vacía sin saber si le contaba como falta.
      if (r.estado === 'PENDIENTE') return 'PENDIENTE';
      if (r.tipo === 'PROGRAMADA')  return 'SIN_MARCAR';
      return r.tipo || 'SIN_MARCAR';
    }
    if (r.tipo === 'MARCACION_INCOMPLETA')     return 'INCOMPLETA';
    if (r.tipo === 'HORA_EXTRA_NO_PROGRAMADA') return 'HORA_EXTRA';
    if (r.tipo === 'NO_PROGRAMADA')            return 'NO_PROGRAMADA';
    if (r.tipo === 'CONTINGENCIA')             return 'CONTINGENCIA';

    return (r.minTardanza ?? 0) > 0 ? 'TARDE' : 'A_TIEMPO';
  }

  etiquetaEstado(r: any): string {
    return {
      A_TIEMPO:      'A tiempo',
      TARDE:         'Tardanza',
      FALTA:         'Falta',
      PERMISO:       'Permiso',
      JUSTIFICADA:   'Justificada',
      INCOMPLETA:    'Incompleta',
      HORA_EXTRA:    'Hora extra',
      NO_PROGRAMADA: 'No programada',
      CONTINGENCIA:  'Contingencia',
      PENDIENTE:     'Pendiente',
      SIN_MARCAR:    'Sin marcar',
    }[this.estadoJornada(r)] ?? this.estadoJornada(r);
  }

  estadoClass(r: any): string {
    return {
      A_TIEMPO:      'badge-ok',
      TARDE:         'badge-tarde',
      FALTA:         'badge-falta',
      PERMISO:       'badge-permiso',
      JUSTIFICADA:   'badge-just',
      INCOMPLETA:    'badge-tarde',
      HORA_EXTRA:    'badge-extra',
      NO_PROGRAMADA: 'badge-extra',
      CONTINGENCIA:  'badge-just',
    }[this.estadoJornada(r)] ?? 'badge-neutro';
  }

  // ── Contadores ──
  private cuenta(e: string) { return this.registros.filter(r => this.estadoJornada(r) === e).length; }

  get totalRegistros() { return this.registros.length; }
  get totalATiempo()   { return this.cuenta('A_TIEMPO'); }
  get totalTarde()     { return this.cuenta('TARDE'); }
  get totalFaltas()    { return this.cuenta('FALTA'); }
  get totalPermisos()  { return this.cuenta('PERMISO') + this.cuenta('JUSTIFICADA'); }

  /** Minutos de tardanza acumulados, que matizan el conteo de tardanzas. */
  get minutosTardanza() {
    return this.registros.reduce((a, r) => a + (r.minTardanza ?? 0), 0);
  }

  get horasTrabajadas() {
    return this.registros.reduce((a, r) => a + (r.minHorasTotales ?? 0), 0);
  }

  // ════════════════════════════════════════════════════════════
  // CARGA
  // ════════════════════════════════════════════════════════════

  ngOnInit() {
    this.trabajadorService.getAreas().subscribe(d => {
      this.areas = d;
      this.rolUsuario = this.authService.getRolUsuario() || '';
      this.cdr.detectChanges();
    });

    this.trabajadorService.getTrabajadores(0, 500).subscribe(res => {
      this.trabajadores          = res.content || res;

      // El área propia se toma de la ficha del usuario dentro del
      // listado, que ya viene cargado.
      const idPropio = this.authService.getIdTrabajador();
      const yo = this.trabajadores.find((t: any) =>
        String(t.idTrabajador) === String(idPropio));
      this.areaPropia = yo?.areaNombre ?? '';

      this.trabajadoresFiltrados = [...this.trabajadoresPermitidos];
      this.cdr.detectChanges();
    });
  }

  /** Trabajadores que el rol puede consultar. */
  get trabajadoresPermitidos(): any[] {
    if (!this.restringidoASuArea() || !this.areaPropia) return this.trabajadores;
    return this.trabajadores.filter(t => t.areaNombre === this.areaPropia);
  }

  filtrarTrabajadores() {
    const t = this.terminoBusquedaTrab.toLowerCase();
    this.trabajadoresFiltrados = this.trabajadoresPermitidos.filter(tr =>
      tr.nombreCompleto?.toLowerCase().includes(t) ||
      tr.nroDocumento?.includes(t)
    );
    this.cdr.detectChanges();
  }

  seleccionarTrabajador(t: any) {
    this.avisoTrabajador       = '';
    this.idTrabajador          = t.idTrabajador;
    this.terminoBusquedaTrab   = t.nombreCompleto;
    this.trabajadoresFiltrados = [];
    this.cdr.detectChanges();
  }

  limpiarTrabajador() {
    this.avisoTrabajador       = '';
    this.idTrabajador          = null;
    this.terminoBusquedaTrab   = '';
    this.trabajadoresFiltrados = [...this.trabajadoresPermitidos];
    this.cdr.detectChanges();
  }

  /** Aviso cuando lo escrito en el buscador no identifica a nadie. */
  avisoTrabajador = '';

  buscar() {
    if (!this.fechaInicio || !this.fechaFin) return;

    // ============================================================
    // EL TEXTO ESCRITO DEBE RESOLVERSE A UN TRABAJADOR
    // ============================================================
    // Al escribir un documento sin elegirlo de la lista, idTrabajador
    // quedaba vacío y la consulta se hacía sobre TODO el personal. El
    // usuario creía estar filtrando por esa persona y recibía el listado
    // completo, sin que nada se lo advirtiera.
    this.avisoTrabajador = '';
    const texto = this.terminoBusquedaTrab.trim();

    if (texto && !this.idTrabajador) {
      const coincidencias = this.trabajadoresPermitidos.filter((t: any) =>
        t.nroDocumento === texto ||
        t.nombreCompleto?.toLowerCase() === texto.toLowerCase());

      if (coincidencias.length === 1) {
        // Coincidencia exacta: se resuelve sola, sin obligar a elegir.
        this.seleccionarTrabajador(coincidencias[0]);
      } else {
        this.avisoTrabajador = coincidencias.length === 0
          ? 'Ningún trabajador de tu alcance coincide con ese dato. '
            + 'Elige uno de la lista o limpia el campo para ver a todos.'
          : 'Hay más de una coincidencia. Elige una de la lista.';
        this.cdr.detectChanges();
        return;
      }
    }

    this.isLoading = true;
    this.buscado   = false;

    this.reporteService.getReporte({
      fechaInicio:  this.fechaInicio,
      fechaFin:     this.fechaFin,
      idTrabajador: this.idTrabajador,
      idArea:       this.idArea,
    }).subscribe({
      next: (data) => {
        this.registros = data;
        this.isLoading = false;
        this.buscado   = true;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // ESTRUCTURA COMÚN DE LAS EXPORTACIONES
  // ════════════════════════════════════════════════════════════

  private encabezados(): string[] {
    return ['Fecha', 'Día', 'Trabajador', 'Documento', 'Área', 'Puesto',
            'Turno', 'Entrada', 'Salida', 'Tardanza', 'Laborado',
            'Feriado', 'Estado', 'Observación'];
  }

  private filas(): (string | number)[][] {
    return this.registros.map(r => [
      fechaPe(r.fecha),
      this.diaSemana(r.fecha),
      r.nombreCompleto ?? '',
      r.nroDocumento   ?? '',
      r.areaNombre     ?? '',
      r.puestoNombre   ?? '',
      r.turnoNombre    ?? '',
      r.horaEntrada    ?? '',
      r.horaSalida     ?? '',
      this.formatMin(r.minTardanza ?? 0),
      this.formatMin(r.minHorasTotales ?? 0),
      (r.minutosFeriado ?? 0) > 0 ? this.formatMin(r.minutosFeriado) : '',
      this.etiquetaEstado(r),
      r.permisoAsociado || r.faltaJustificadaAsociada || '',
    ]);
  }

  private periodo(): string {
    return `${fechaPe(this.fechaInicio)} al ${fechaPe(this.fechaFin)}`;
  }

  private nombreArchivo(ext: string): string {
    const a = this.fechaInicio.replace(/-/g, '');
    const b = this.fechaFin.replace(/-/g, '');
    return `reporte_asistencia_${a}_${b}.${ext}`;
  }

  /** Descripción del filtro aplicado, para el encabezado del archivo. */
  private filtroAplicado(): string {
    const partes: string[] = [];
    if (this.idTrabajador) partes.push(`Trabajador: ${this.terminoBusquedaTrab}`);
    if (this.idArea) {
      const a = this.areas.find(x => x.idArea === Number(this.idArea));
      if (a) partes.push(`Área: ${a.area}`);
    }
    return partes.length ? partes.join('   ·   ') : 'Todas las áreas y trabajadores';
  }

  // ════════════════════════════════════════════════════════════
  // EXCEL
  // ════════════════════════════════════════════════════════════

  exportar() {
    if (this.registros.length === 0) return;
    this.isExportando = true;

    try {
      const cab   = this.encabezados();
      const filas = this.filas();
      const libro = XLSX.utils.book_new();

      libro.Props = {
        Title:   'Reporte de asistencias',
        Subject: `Período ${this.periodo()}`,
        Author:  'Sistema de Control de Asistencia',
      };

      const titulo = [
        ['Reporte de Asistencias'],
        [`Período: ${this.periodo()}`],
        [this.filtroAplicado()],
        [`Registros: ${this.totalRegistros}   ·   A tiempo: ${this.totalATiempo}`
         + `   ·   Tardanzas: ${this.totalTarde}   ·   Faltas: ${this.totalFaltas}`
         + `   ·   Permisos: ${this.totalPermisos}`],
        [],
      ];

      const hoja = XLSX.utils.aoa_to_sheet([...titulo, cab, ...filas]);

      const filaCab = titulo.length;
      const ultima  = filaCab + filas.length;
      const ultCol  = cab.length - 1;

      this.estilo(hoja, 0, 0, { font: { bold: true, sz: 13, color: { rgb: COLOR.titulo } } });
      for (const r of [1, 2, 3]) {
        this.estilo(hoja, r, 0,
          { font: { sz: 9, italic: true, color: { rgb: COLOR.textoTenue } } });
      }

      for (let c = 0; c <= ultCol; c++) {
        this.estilo(hoja, filaCab, c, {
          font:      { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
          fill:      { patternType: 'solid', fgColor: { rgb: COLOR.cabecera } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border:    BORDE_FINO,
        });
      }

      // Columnas de hora y tiempo, centradas
      const centradas = new Set([0, 1, 6, 7, 8, 9, 10, 11, 12]);
      for (let r = filaCab + 1; r <= ultima; r++) {
        const banda = (r - filaCab) % 2 === 0;
        for (let c = 0; c <= ultCol; c++) {
          const est: any = {
            font:      { sz: 9 },
            alignment: { horizontal: centradas.has(c) ? 'center' : 'left', vertical: 'center' },
            border:    BORDE_FINO,
          };
          if (banda) est.fill = { patternType: 'solid', fgColor: { rgb: COLOR.filaPar } };
          this.estilo(hoja, r, c, est);
        }
      }

      hoja['!autofilter'] = {
        ref: XLSX.utils.encode_range({ r: filaCab, c: 0 }, { r: ultima, c: ultCol }),
      };
      (hoja as any)['!freeze'] = { xSplit: 3, ySplit: filaCab + 1 };
      hoja['!rows'] = [];
      hoja['!rows'][filaCab] = { hpt: 26 };
      hoja['!cols'] = cab.map((c, i) => {
        const largos = [c.length, ...filas.map(f => String(f[i] ?? '').length)];
        return { wch: Math.min(34, Math.max(9, Math.max(...largos) + 2)) };
      });

      XLSX.utils.book_append_sheet(libro, hoja, 'Asistencias');
      XLSX.writeFile(libro, this.nombreArchivo('xlsx'));
    } finally {
      this.isExportando = false;
      this.cdr.detectChanges();
    }
  }

  private estilo(hoja: XLSX.WorkSheet, fila: number, col: number, s: any) {
    const ref = XLSX.utils.encode_cell({ r: fila, c: col });
    if (!hoja[ref]) hoja[ref] = { t: 's', v: '' };
    hoja[ref].s = { ...(hoja[ref].s || {}), ...s };
  }

  // ════════════════════════════════════════════════════════════
  // PDF
  // ════════════════════════════════════════════════════════════

  exportarPDF() {
    if (this.registros.length === 0) return;
    this.isExportando = true;

    try {
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const ancho = doc.internal.pageSize.getWidth();
      const alto  = doc.internal.pageSize.getHeight();
      const cab   = this.encabezados();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Reporte de Asistencias', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Período: ${this.periodo()}`, 14, 20);
      doc.text(this.filtroAplicado(), 14, 25);

      doc.setFontSize(8);
      doc.text(
        `Registros: ${this.totalRegistros}    A tiempo: ${this.totalATiempo}`
        + `    Tardanzas: ${this.totalTarde}    Faltas: ${this.totalFaltas}`
        + `    Permisos: ${this.totalPermisos}`, 14, 31);

      doc.setTextColor(110);
      doc.text(`Emitido el ${fechaPe(fechaLocal())}`,
               ancho - 14, 14, { align: 'right' });
      doc.setTextColor(0);

      autoTable(doc, {
        head: [cab],
        body: this.filas() as any,
        startY: 36,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
        headStyles: {
          fillColor: [68, 114, 196], textColor: 255,
          fontSize: 7, halign: 'center', valign: 'middle',
        },
        alternateRowStyles: { fillColor: [217, 225, 242] },
        columnStyles: {
          0: { cellWidth: 18, halign: 'center' },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 42 },
          3: { cellWidth: 20, halign: 'center' },
          7: { halign: 'center' }, 8: { halign: 'center' },
          9: { halign: 'center' }, 10: { halign: 'center' },
          11: { halign: 'center' }, 12: { halign: 'center' },
        },
        didDrawPage: () => {
          doc.setFontSize(7);
          doc.setTextColor(130);
          doc.text('Sistema de Control de Asistencia - Avendaño Trading Company S.A.C.',
                   14, alto - 8);
          doc.text(`Página ${doc.getNumberOfPages()}`,
                   ancho - 14, alto - 8, { align: 'right' });
          doc.setTextColor(0);
        },
      });

      doc.save(this.nombreArchivo('pdf'));
    } finally {
      this.isExportando = false;
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  /** Día de la semana, calculado al mediodía para que no dependa de la zona. */
  diaSemana(iso: string): string {
    if (!iso) return '';
    const d = new Date(`${iso.substring(0, 10)}T12:00:00`);
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles',
            'Jueves', 'Viernes', 'Sábado'][d.getDay()];
  }

  formatMin(min: number | null | undefined): string {
    if (min == null || min === 0) return '00:00';
    const abs = Math.abs(min);
    return String(Math.floor(abs / 60)).padStart(2, '0') + ':'
         + String(abs % 60).padStart(2, '0');
  }

  minutosAHoras(min: number | null): string {
    if (min == null) return '-';
    return `${Math.floor(min / 60)}h ${(min % 60).toString().padStart(2, '0')}m`;
  }

  private hoy(): string { return fechaLocal(); }

  private primerDiaMes(): string {
    const d = new Date(); d.setDate(1);
    return fechaLocal(d);
  }
}
