import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsolidadoService, ConsolidadoReporte, Consolidado, TotalTurno }
  from '../../../core/services/consolidado.service';
import { FechaPePipe, fechaPe } from '../../../shared/fecha-pe.pipe';
// xlsx-js-style y no xlsx: la version comunitaria de SheetJS ignora los
// estilos de celda, de modo que el archivo salia sin formato. Este
// derivado mantiene la misma interfaz y si los aplica.
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Paleta del archivo, tomada del estilo de tabla que Excel aplica por
 * defecto. Se replica a mano porque generar un objeto de tabla real
 * (ListObject) requiere escribir el XML del libro, y el resultado visual
 * es el mismo.
 */
const COLOR = {
  cabecera:  '4472C4',   // azul del encabezado
  filaPar:   'D9E1F2',   // banda clara alterna
  borde:     'B4C6E7',
  titulo:    '1F3864',
  textoTenue:'595959',
};

const BORDE_FINO = {
  top:    { style: 'thin', color: { rgb: COLOR.borde } },
  bottom: { style: 'thin', color: { rgb: COLOR.borde } },
  left:   { style: 'thin', color: { rgb: COLOR.borde } },
  right:  { style: 'thin', color: { rgb: COLOR.borde } },
};

/** Una columna de la tabla, resuelta a partir de los datos del período. */
interface ColTurno {
  turno: string;
  esFeriado: boolean;
  etiqueta: string;
}

/**
 * Reporte de consolidado para Contabilidad (CU21).
 *
 * ============================================================
 * EL PIVOTE
 * ============================================================
 * El backend entrega una lista de filas por turno y condición de
 * feriado, que varía por trabajador y por período. Contabilidad necesita
 * una fila por trabajador con columnas estables, así que aquí se
 * pivotea. Las columnas se descubren de los datos, de modo que un tercer
 * turno aparece solo sin tocar código.
 *
 * El reporte NO calcula montos ni aplica tasas de recargo: eso queda
 * fuera del alcance del sistema (AL-01, AL-04).
 */
@Component({
  selector: 'app-reporte-consolidado',
  standalone: true,
  imports: [CommonModule, FormsModule, FechaPePipe],
  templateUrl: './reporte-consolidado.html',
  styleUrl:    './reporte-consolidado.css'
})
export class ReporteConsolidadoComponent implements OnInit {
  private svc = inject(ConsolidadoService);
  private cdr = inject(ChangeDetectorRef);

  quincenas:   any[] = [];
  quincenaSel: number | null = null;
  reporte:     ConsolidadoReporte | null = null;

  isLoadingQ   = false;
  isLoadingR   = false;
  isExportando = false;
  filtroNombre = '';
  buscado      = false;

  columnasTurno: ColTurno[] = [];

  ngOnInit() { this.cargarQuincenas(); }

  cargarQuincenas() {
    this.isLoadingQ = true;
    this.svc.getQuincenas().subscribe({
      next: q => {
        this.quincenas  = q.filter(x => x.totalConsolidados > 0);
        this.isLoadingQ = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  buscar() {
    if (!this.quincenaSel) return;
    this.isLoadingR = true;
    this.buscado    = true;

    this.svc.getReporte(this.quincenaSel).subscribe({
      next: r => {
        this.reporte = r;
        this.construirColumnas();
        this.isLoadingR = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingR = false; this.cdr.detectChanges(); }
    });
  }

  // ════════════════════════════════════════════════════════════
  // PIVOTE
  // ════════════════════════════════════════════════════════════

  private construirColumnas() {
    const vistas = new Map<string, ColTurno>();

    for (const t of this.reporte?.trabajadores ?? []) {
      for (const f of t.totalesPorTurno ?? []) {
        if (f.minNormales === 0 && f.minExtra === 0) continue;
        const clave = `${f.turno}|${f.esFeriado}`;
        if (!vistas.has(clave)) {
          vistas.set(clave, {
            turno:     f.turno,
            esFeriado: f.esFeriado,
            etiqueta:  f.esFeriado ? `${f.turno} feriado` : f.turno
          });
        }
      }
    }

    this.columnasTurno = [...vistas.values()].sort((a, b) => {
      if (a.esFeriado !== b.esFeriado) return a.esFeriado ? 1 : -1;
      return a.turno.localeCompare(b.turno);
    });
  }

  celda(c: Consolidado, col: ColTurno): TotalTurno | null {
    return (c.totalesPorTurno ?? []).find(
      t => t.turno === col.turno && t.esFeriado === col.esFeriado) ?? null;
  }

  get hayFeriados(): boolean {
    return this.columnasTurno.some(c => c.esFeriado);
  }

  get trabajadoresFiltrados(): Consolidado[] {
    if (!this.reporte?.trabajadores) return [];
    if (!this.filtroNombre) return this.reporte.trabajadores;
    const q = this.filtroNombre.toLowerCase();
    return this.reporte.trabajadores.filter(t =>
      t.trabajadorNombre?.toLowerCase().includes(q));
  }

  // ════════════════════════════════════════════════════════════
  // ESTRUCTURA COMÚN DE LAS EXPORTACIONES
  // ════════════════════════════════════════════════════════════

  /**
   * Encabezados de la tabla, comunes a Excel y PDF.
   *
   * Ambas exportaciones comparten origen para que no puedan divergir:
   * si alguien agrega una columna y solo la refleja en una, el archivo
   * que Contabilidad recibe deja de coincidir con el que imprime.
   */
  private encabezados(): string[] {
    const cab = ['Trabajador', 'Área', 'Puesto'];
    for (const col of this.columnasTurno) {
      cab.push(`${col.etiqueta}\nNormal`, `${col.etiqueta}\nExtra`);
    }
    cab.push('Total normal', 'Total extra', 'Total feriado',
             'Faltas', 'Permisos', 'Justif.', 'Tardanza', 'Observaciones');
    return cab;
  }

  /** Una fila por trabajador, con los valores en formato de horas. */
  private filasHoras(): (string | number)[][] {
    return this.trabajadoresFiltrados.map(t => {
      const fila: (string | number)[] = [
        t.trabajadorNombre,
        t.areaNombre   ?? '',
        t.puestoNombre ?? '',
      ];
      for (const col of this.columnasTurno) {
        const c = this.celda(t, col);
        fila.push(c?.hNormales ?? '00:00', c?.hExtra ?? '00:00');
      }
      fila.push(
        t.hTotalNormales, t.hTotalExtra, t.hTotalFeriado,
        t.diasFalta, t.diasPermiso, t.diasFaltaJustificada,
        this.formatMin(t.minTotalTardanza),
        t.observaciones ?? '',
      );
      return fila;
    });
  }

  /**
   * Las mismas filas con los valores en minutos.
   *
   * Una hoja de cálculo no puede operar sobre el texto "07:30" sin
   * convertirlo antes, y esa conversión manual es una fuente conocida de
   * error. Van en una hoja aparte y no como columnas adicionales, porque
   * duplicar cada columna dejaba la tabla demasiado ancha para revisarla.
   */
  private filasMinutos(): (string | number)[][] {
    return this.trabajadoresFiltrados.map(t => {
      const fila: (string | number)[] = [
        t.trabajadorNombre,
        t.areaNombre   ?? '',
        t.puestoNombre ?? '',
      ];
      let totNormal = 0, totExtra = 0, totFeriado = 0;
      for (const col of this.columnasTurno) {
        const c = this.celda(t, col);
        const n = c?.minNormales ?? 0;
        const e = c?.minExtra    ?? 0;
        fila.push(n, e);
        totNormal += n;
        totExtra  += e;
        if (col.esFeriado) totFeriado += n + e;
      }
      fila.push(
        totNormal, totExtra, totFeriado,
        t.diasFalta, t.diasPermiso, t.diasFaltaJustificada,
        t.minTotalTardanza ?? 0,
        t.observaciones ?? '',
      );
      return fila;
    });
  }

  private nombreArchivo(ext: string): string {
    const desc = (this.reporte?.descripcion ?? 'consolidado')
      .replace(/[^\wáéíóúñ ]/gi, '').replace(/\s+/g, '_');
    return `consolidado_${desc}.${ext}`;
  }

  private periodo(): string {
    if (!this.reporte) return '';
    return `${fechaPe(this.reporte.inicio)} al ${fechaPe(this.reporte.fin)}`;
  }

  // ════════════════════════════════════════════════════════════
  // EXCEL
  // ════════════════════════════════════════════════════════════

  exportarExcel() {
    if (!this.reporte) return;
    this.isExportando = true;

    try {
      const cab = this.encabezados();
      const libro = XLSX.utils.book_new();

      libro.Props = {
        Title:   `Consolidado ${this.reporte.descripcion}`,
        Subject: `Período ${this.periodo()}`,
        Author:  'Sistema de Control de Asistencia',
      };

      this.agregarHoja(libro, 'Horas',   cab, this.filasHoras(),   false);
      this.agregarHoja(libro, 'Minutos', cab, this.filasMinutos(), true);

      XLSX.writeFile(libro, this.nombreArchivo('xlsx'));
    } finally {
      this.isExportando = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Arma una hoja con su cabecera de período y le aplica el formato de
   * tabla: encabezado azul, bandas alternas, bordes, autofiltro y
   * encabezado congelado.
   */
  private agregarHoja(libro: XLSX.WorkBook, nombre: string,
                      cab: string[], filas: (string | number)[][],
                      numerico: boolean) {

    const titulo = [
      [`Consolidado quincenal — ${this.reporte!.descripcion}`],
      [`Período: ${this.periodo()}`],
      [numerico
        ? 'Valores en minutos, para cálculos.'
        : 'Valores en formato hh:mm, para lectura.'],
      [],
    ];

    // Los saltos de línea de la cabecera sirven en el PDF, no en Excel.
    const cabPlano = cab.map(c => c.replace(/\n/g, ' '));
    const hoja = XLSX.utils.aoa_to_sheet([...titulo, cabPlano, ...filas]);

    const filaCab = titulo.length;              // fila donde va la cabecera
    const ultima  = filaCab + filas.length;
    const ultCol  = cab.length - 1;

    // ── Título del reporte ──
    this.estilo(hoja, 0, 0, {
      font: { bold: true, sz: 13, color: { rgb: COLOR.titulo } },
    });
    for (const r of [1, 2]) {
      this.estilo(hoja, r, 0, {
        font: { sz: 9, italic: true, color: { rgb: COLOR.textoTenue } },
      });
    }

    // ── Encabezado de la tabla ──
    for (let c = 0; c <= ultCol; c++) {
      this.estilo(hoja, filaCab, c, {
        font:      { bold: true, sz: 9, color: { rgb: 'FFFFFF' } },
        fill:      { patternType: 'solid', fgColor: { rgb: COLOR.cabecera } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border:    BORDE_FINO,
      });
    }

    // ── Filas de datos ──
    for (let r = filaCab + 1; r <= ultima; r++) {
      const banda = (r - filaCab) % 2 === 0;
      for (let c = 0; c <= ultCol; c++) {
        // Texto a la izquierda en las tres primeras y en observaciones;
        // los valores de horas centrados.
        const esTexto = c <= 2 || c === ultCol;
        const estilo: any = {
          font:      { sz: 9 },
          alignment: {
            horizontal: esTexto ? 'left' : 'center',
            vertical: 'center',
            wrapText: c === ultCol,
          },
          border: BORDE_FINO,
        };
        if (banda) {
          estilo.fill = { patternType: 'solid', fgColor: { rgb: COLOR.filaPar } };
        }
        // Sin decimales en la hoja de minutos
        if (numerico && !esTexto) estilo.numFmt = '0';
        this.estilo(hoja, r, c, estilo);
      }
    }

    // ── Autofiltro sobre la cabecera y sus datos ──
    hoja['!autofilter'] = {
      ref: XLSX.utils.encode_range(
        { r: filaCab, c: 0 }, { r: ultima, c: ultCol }),
    };

    // ── Encabezado y primera columna congelados ──
    // Al desplazarse por la lista se mantiene visible de quién es cada fila.
    (hoja as any)['!freeze'] = { xSplit: 1, ySplit: filaCab + 1 };

    // ── Alto de la fila de encabezado, que lleva texto ajustado ──
    hoja['!rows'] = [];
    hoja['!rows'][filaCab] = { hpt: 30 };

    // ── Ancho por columna según el contenido más largo ──
    hoja['!cols'] = cab.map((c, i) => {
      const largos = [cabPlano[i].length,
        ...filas.map(f => String(f[i] ?? '').length)];
      return { wch: Math.min(38, Math.max(10, Math.max(...largos) + 2)) };
    });

    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }

  /**
   * Aplica un estilo a una celda, creándola si no existe.
   *
   * aoa_to_sheet omite las celdas cuyo valor es cadena vacía, de modo que
   * sin esta comprobación las bandas alternas quedarían con huecos en las
   * filas que tienen una observación en blanco.
   */
  private estilo(hoja: XLSX.WorkSheet, fila: number, col: number, s: any) {
    const ref = XLSX.utils.encode_cell({ r: fila, c: col });
    if (!hoja[ref]) hoja[ref] = { t: 's', v: '' };
    hoja[ref].s = { ...(hoja[ref].s || {}), ...s };
  }

  // ════════════════════════════════════════════════════════════
  // PDF
  // ════════════════════════════════════════════════════════════

  /**
   * Genera el PDF a partir de los datos, no imprimiendo la pantalla.
   *
   * La impresión del navegador reproducía la interfaz completa, con su
   * menú, sus filtros y sus botones, y recortaba la tabla al ancho de la
   * página. Este documento contiene lo mismo que el Excel, en horizontal
   * y con la cabecera repetida en cada página.
   */
  exportarPDF() {
    if (!this.reporte) return;
    this.isExportando = true;

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const ancho = doc.internal.pageSize.getWidth();
      const alto  = doc.internal.pageSize.getHeight();
      const cab   = this.encabezados();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Consolidado Quincenal de Asistencia', 14, 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(this.reporte.descripcion, 14, 20);
      doc.text(`Período: ${this.periodo()}`, 14, 25);
      doc.text(`Trabajadores: ${this.trabajadoresFiltrados.length}`, 14, 30);

      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(`Emitido el ${fechaPe(new Date().toISOString())}`,
               ancho - 14, 14, { align: 'right' });
      doc.setTextColor(0);

      const anchoObs = cab.length - 1;

      autoTable(doc, {
        head: [cab],
        body: this.filasHoras() as any,
        startY: 35,
        theme: 'grid',
        styles: {
          font: 'helvetica', fontSize: 6.5, cellPadding: 1.4,
          overflow: 'linebreak', valign: 'middle',
        },
        headStyles: {
          fillColor: [30, 41, 59], textColor: 255,
          fontSize: 6.5, halign: 'center', valign: 'middle',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 34, halign: 'left' },
          1: { cellWidth: 20, halign: 'left' },
          2: { cellWidth: 24, halign: 'left' },
          [anchoObs]: { cellWidth: 32, halign: 'left', fontSize: 5.5 },
        },
        // Las columnas de horas van centradas; las de texto conservan su
        // alineación a la izquierda.
        didParseCell: d => {
          if (d.column.index >= 3 && d.column.index < anchoObs) {
            d.cell.styles.halign = 'center';
          }
        },
        didDrawPage: () => {
          doc.setFontSize(7);
          doc.setTextColor(130);
          doc.text(
            'El sistema entrega las horas trabajadas. El cálculo de montos y recargos lo realiza Contabilidad.',
            14, alto - 8);
          doc.text(`Página ${doc.getNumberOfPages()}`,
            ancho - 14, alto - 8, { align: 'right' });
          doc.setTextColor(0);
        },
      });

      if (this.hayFeriados) {
        const fin = (doc as any).lastAutoTable?.finalY ?? 35;
        let y = fin + 6;
        if (y > alto - 20) { doc.addPage(); y = 20; }
        doc.setFontSize(7.5);
        doc.setTextColor(110);
        doc.text(
          'Las columnas de feriado contienen los minutos trabajados dentro del día feriado. '
          + 'Ya están descontados de la columna normal del mismo turno.',
          14, y);
        doc.setTextColor(0);
      }

      doc.save(this.nombreArchivo('pdf'));
    } finally {
      this.isExportando = false;
      this.cdr.detectChanges();
    }
  }

  // ════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════

  formatMin(min: number | null | undefined): string {
    if (min == null) return '00:00';
    const signo = min < 0 ? '-' : '';
    const abs   = Math.abs(min);
    return signo
      + String(Math.floor(abs / 60)).padStart(2, '0') + ':'
      + String(abs % 60).padStart(2, '0');
  }
}
