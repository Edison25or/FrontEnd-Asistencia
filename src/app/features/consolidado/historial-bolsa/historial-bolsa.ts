import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsolidadoService } from '../../../core/services/consolidado.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-historial-bolsa',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './historial-bolsa.html',
  styleUrl:    './historial-bolsa.css'
})
export class HistorialBolsaComponent implements OnInit {
  private svc  = inject(ConsolidadoService);
  private trabSvc = inject(TrabajadorService);
  private cdr  = inject(ChangeDetectorRef);

  trabajadores:     any[] = [];
  trabajadoresFilt: any[] = [];
  terminoBusq       = '';
  trabSel:          any   = null;

  historial:    any[] = [];
  isLoadingT    = false;
  isLoadingH    = false;
  buscado       = false;

  ngOnInit() { this.cargarTrabajadores(); }

  cargarTrabajadores() {
    this.isLoadingT = true;
    this.trabSvc.getTrabajadores(0, 500).subscribe({
      next: (res: any) => {
        this.trabajadores = res.content || res;
        this.trabajadoresFilt = this.trabajadores;
        this.isLoadingT = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoadingT = false; this.cdr.detectChanges(); }
    });
  }

  filtrarTrabajadores() {
    const t = this.terminoBusq.toLowerCase();
    this.trabajadoresFilt = t
      ? this.trabajadores.filter(w =>
          (w.pNombre + ' ' + w.aPaterno + ' ' + w.aMaterno).toLowerCase().includes(t)
          || w.nroDocumento?.includes(t))
      : this.trabajadores;
  }

  seleccionarTrabajador(t: any) {
    this.trabSel = t;
    this.terminoBusq = t.pNombre + ' ' + t.aPaterno;
    this.trabajadoresFilt = [];
    this.cargarHistorial();
  }

  cargarHistorial() {
    if (!this.trabSel) return;
    this.isLoadingH = true; this.buscado = true;
    this.svc.getHistorialBolsa(this.trabSel.idTrabajador).subscribe({
      next: h  => { this.historial = h; this.isLoadingH = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingH = false; this.cdr.detectChanges(); }
    });
  }

  // ── Saldo actual (última quincena cerrada) ─────────────────
  get saldoActual(): number {
    const cerradas = this.historial.filter(h => h.estadoQuincena === 'CERRADA');
    return cerradas.length > 0 ? cerradas[0].bolsaSalida : 0;
  }

  // ── Exportar Excel ────────────────────────────────────────
  exportarExcel() {
    if (!this.historial.length || !this.trabSel) return;

    const filas = this.historial.map(h => ({
      'Quincena':           h.quincenaDescripcion,
      'Inicio':             h.fechaInicio,
      'Fin':                h.fechaFin,
      'Estado':             h.estadoQuincena,
      'Bolsa Entrada':      h.hBolsaEntrada,
      'H. Extra a Bolsa':   h.hBolsaAcumulada,
      'H. Consumidas':      h.hBolsaConsumida,
      'Bolsa Salida':       h.hBolsaSalida,
      'Min. Extra Pagados': h.minExtraPagados,
    }));

    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [
      {wch:28},{wch:12},{wch:12},{wch:10},
      {wch:13},{wch:16},{wch:14},{wch:12},{wch:18}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bolsa');
    const nombre = `bolsa_${this.trabSel.aPaterno}_${this.trabSel.pNombre}.xlsx`
      .replace(/\s+/g, '_');
    XLSX.writeFile(wb, nombre);
  }

  formatMin(min: number | null): string {
    if (min == null) return '00:00';
    const sign = min < 0 ? '-' : '';
    const abs  = Math.abs(min);
    return sign + String(Math.floor(abs/60)).padStart(2,'0')
         + ':' + String(abs % 60).padStart(2,'0');
  }

  estadoBadge(e: string) {
    return { CERRADA: 'badge-gris', ABIERTA: 'badge-verde',
             REAPERTURA_PENDIENTE: 'badge-naranja' }[e] ?? 'badge-gris';
  }
}