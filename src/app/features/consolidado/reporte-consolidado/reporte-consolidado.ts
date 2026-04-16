import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsolidadoService } from '../../../core/services/consolidado.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-reporte-consolidado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reporte-consolidado.html',
  styleUrl:    './reporte-consolidado.css'
})
export class ReporteConsolidadoComponent implements OnInit {
  private svc = inject(ConsolidadoService);
  private cdr = inject(ChangeDetectorRef);

  quincenas:      any[] = [];
  quincenaSel:    any   = null;
  reporte:        any   = null;
  isLoadingQ      = false;
  isLoadingR      = false;
  isExportando    = false;
  filtroNombre    = '';
  filtroTurno     = '';   // 'dia' | 'noche' | ''
  buscado         = false;

  ngOnInit() { this.cargarQuincenas(); }

  cargarQuincenas() {
    this.isLoadingQ = true;
    this.svc.getQuincenas().subscribe({
      next: q  => { this.quincenas = q.filter((q: any) => q.totalConsolidados > 0);
                    this.isLoadingQ = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  buscar() {
    if (!this.quincenaSel) return;
    this.isLoadingR = true; this.buscado = true;
    this.svc.getReporte(this.quincenaSel).subscribe({
      next: r  => { this.reporte = r; this.isLoadingR = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingR = false; this.cdr.detectChanges(); }
    });
  }

  get trabajadoresFiltrados(): any[] {
    if (!this.reporte?.trabajadores) return [];
    return this.reporte.trabajadores.filter((t: any) => {
      const ok1 = !this.filtroNombre ||
        t.trabajadorNombre?.toLowerCase().includes(this.filtroNombre.toLowerCase());
      return ok1;
    });
  }

  totalExtraMin(t: any): number {
    return (t.minExtraDiaA || 0) + (t.minExtranocheA || 0)
         + (t.minExtraDiaB || 0) + (t.minExtraNocheB || 0);
  }

  // ── Exportar Excel ────────────────────────────────────────
  // ── Exportar Excel ────────────────────────────────────────
  exportarExcel() {
    if (!this.reporte) return;
    this.isExportando = true;

    const filas = this.reporte.trabajadores.map((t: any) => {
      // Total a pagar en planilla = horas normales + lo efectivamente pagado de extras
      const minExtraPagados = t.minExtraPagados ?? 0;
      const minNormales     = (t.minNormalesDia ?? 0) + (t.minNormalesNoche ?? 0);
      const totalPagarMin   = minNormales + minExtraPagados;

      return {
        'ID':                t.idTrabajador,
        'Trabajador':        t.trabajadorNombre,
        'Área':              t.areaNombre       ?? '—',
        'Puesto':            t.puestoNombre     ?? '—',
        'H. Norm. Día':      t.hNormalesDia,
        'H. Norm. Noche':    t.hNormalesNoche,
        [`H. Extra Día A (${t.tasaA}%)`]:    t.hExtraDiaA,
        [`H. Extra Noche A (${t.tasaA}%)`]:  t.hExtraNocheA,
        [`H. Extra Día B (${t.tasaB}%)`]:    t.hExtraDiaB,
        [`H. Extra Noche B (${t.tasaB}%)`]:  t.hExtraNocheB,
        'Total Normal':      t.hTotalNormales,
        'Total Extra':       t.hTotalExtra,
        'Total General':     t.hTotalGeneral,
        'Debe (min)':        t.hDebe ?? '00:00',
        'H. Extra Pagadas':  t.hExtraPagados   ?? '00:00',
        'H. a Bolsa':        t.hExtraABolsa    ?? '00:00',
        'H. Consumidas':     t.hBolsaConsumida ?? '00:00',
        'Total a Pagar':     this.formatMin(totalPagarMin),
        'Días Falta':        t.diasFalta,
        'Días Permiso':      t.diasPermiso,
        'Bolsa Entrada':     t.hBolsaEntrada,
        'Bolsa Salida':      t.hBolsaSalida,
        'Otro Bono (S/.)':   t.otroBono    ?? 0,
        'Detalle Bono':      t.detalleOtroBono ?? '',
        'Observaciones':     t.observaciones ?? '',
        'Estado':            t.estado,
      };
    });

    // Fila de totales al final
    const totalMinExtraPagados = this.reporte.trabajadores
      .reduce((s: number, t: any) => s + (t.minExtraPagados ?? 0), 0);
    const totalMinNormales = this.reporte.trabajadores
      .reduce((s: number, t: any) =>
        s + (t.minNormalesDia ?? 0) + (t.minNormalesNoche ?? 0), 0);
    const totalMinABolsa = this.reporte.trabajadores
      .reduce((s: number, t: any) => s + (t.minExtraABolsa ?? 0), 0);
    const totalMinConsumidas = this.reporte.trabajadores
      .reduce((s: number, t: any) => s + (t.bolsaConsumida ?? 0), 0);
    const totalMinDebe = this.reporte.trabajadores
      .reduce((s: number, t: any) => s + (t.minDebe ?? 0), 0);
    const totalPagarGeneral = totalMinNormales + totalMinExtraPagados;

    filas.push({
      'ID': '', 'Trabajador': 'TOTALES',
      'Área': '', 'Puesto': '',
      'H. Norm. Día':   this.reporte.totalHNormalesDia,
      'H. Norm. Noche': this.reporte.totalHNormalesNoche,
      [`H. Extra Día A (${this.reporte.trabajadores[0]?.tasaA}%)`]:   '',
      [`H. Extra Noche A (${this.reporte.trabajadores[0]?.tasaA}%)`]: '',
      [`H. Extra Día B (${this.reporte.trabajadores[0]?.tasaB}%)`]:   '',
      [`H. Extra Noche B (${this.reporte.trabajadores[0]?.tasaB}%)`]: '',
      'Total Normal': '', 'Total Extra': '',
      'Total General':  this.reporte.totalHGeneral,
      'Debe (min)':       this.formatMin(totalMinDebe),
      'H. Extra Pagadas': this.formatMin(totalMinExtraPagados),
      'H. a Bolsa':       this.formatMin(totalMinABolsa),
      'H. Consumidas':    this.formatMin(totalMinConsumidas),
      'Total a Pagar':    this.formatMin(totalPagarGeneral),
      'Días Falta':     this.reporte.totalDiasFalta,
      'Días Permiso':   this.reporte.totalDiasPermiso,
      'Bolsa Entrada': '', 'Bolsa Salida': '',
      'Otro Bono (S/.)': '', 'Detalle Bono': '', 'Observaciones': '', 'Estado': '',
    });

    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [
      {wch:7},{wch:28},{wch:18},{wch:22},
      {wch:13},{wch:14},{wch:16},{wch:17},{wch:16},{wch:17},
      {wch:13},{wch:12},{wch:13},
      {wch:11},{wch:14},{wch:12},{wch:14},{wch:14},
      {wch:11},{wch:12},
      {wch:13},{wch:12},
      {wch:14},{wch:22},{wch:25},{wch:11}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Consolidado');
    XLSX.writeFile(wb, `consolidado_${this.reporte.descripcion.replace(/ /g,'_')}.xlsx`);
    this.isExportando = false;
    this.cdr.detectChanges();
  }

  // ── Exportar PDF (impresión del navegador) ────────────────
  exportarPDF() {
    window.print();
  }

  hoy(): string {
    return new Date().toLocaleDateString('es-PE',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  formatMin(min: number | null): string {
    if (min == null) return '00:00';
    const sign = min < 0 ? '-' : '';
    const abs  = Math.abs(min);
    return sign + String(Math.floor(abs / 60)).padStart(2,'0')
         + ':' + String(abs % 60).padStart(2,'0');
  }
}