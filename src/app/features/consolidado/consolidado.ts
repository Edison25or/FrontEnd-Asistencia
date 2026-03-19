import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConsolidadoService } from '../../core/services/consolidado.service';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-consolidado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consolidado.html',
  styleUrl:    './consolidado.css'
})
export class ConsolidadoComponent implements OnInit {
  private svc  = inject(ConsolidadoService);
  private auth = inject(AuthService);
  private cdr  = inject(ChangeDetectorRef);

  quincenas:       any[] = [];
  quincenaActual:  any   = null;
  consolidados:    any[] = [];
  isLoadingQ  = false;
  isLoadingC  = false;
  isProcesando = false;
  errorGlobal  = '';
  rolUsuario   = '';

  // ── Filtro ────────────────────────────────────────────────
  filtroNombre = '';

  // ── Modal editar campos manuales ─────────────────────────
  mostrarModalEditar  = false;
  consolidadoEditar: any = null;
  editOtroBono        = 0;
  editDetalleBono     = '';
  editObservaciones   = '';
  errorEdit           = '';

  // ── Modal cierre de quincena (decisión bolsa) ─────────────
  mostrarModalCierre   = false;
  decisionesExtra: { [idTrabajador: number]: {
    minExtraPagados: number; minExtraABolsa: number; bolsaConsumida: number;
  } } = {};
  errorCierre = '';

  // ── Modal resultado cierre ────────────────────────────────
  resultadoCierre: any = null;
  mostrarResultadoCierre = false;

  // ── Modal reapertura ──────────────────────────────────────
  mostrarModalReaper  = false;
  motivoReaper        = '';
  errorReaper         = '';
  mostrarModalAprobar = false;
  quincenaParaAprobar: any = null;

  ngOnInit() {
    this.rolUsuario = this.auth.getRolUsuario() || '';
    this.cargarQuincenas();
  }

  // ── Quincenas ─────────────────────────────────────────────
  cargarQuincenas() {
    this.isLoadingQ = true;
    this.svc.getQuincenas().subscribe({
      next: q  => { this.quincenas = q; this.isLoadingQ = false; this.cdr.detectChanges(); },
      error: () => { this.isLoadingQ = false; this.cdr.detectChanges(); }
    });
  }

  seleccionar(q: any) {
    this.quincenaActual = q;
    this.filtroNombre = '';
    this.decisionesExtra = {};
    if (q.totalConsolidados > 0) this.cargarConsolidado();
    else this.consolidados = [];
    this.cdr.detectChanges();
  }

  // ── Consolidado ───────────────────────────────────────────
  cargarConsolidado() {
    this.isLoadingC = true;
    this.svc.listar(this.quincenaActual.idQuincena).subscribe({
      next: c  => { this.consolidados = c; this.isLoadingC = false;
                    this.inicializarDecisiones(); this.cdr.detectChanges(); },
      error: () => { this.isLoadingC = false; this.cdr.detectChanges(); }
    });
  }

  generarConsolidado() {
    this.isProcesando = true; this.errorGlobal = '';
    this.svc.generar(this.quincenaActual.idQuincena).subscribe({
      next: c  => {
        this.consolidados = c; this.isProcesando = false;
        this.cargarQuincenas();
        this.inicializarDecisiones(); this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorGlobal = e.error?.message || 'Error al generar.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Filtro ────────────────────────────────────────────────
  get consolidadosFiltrados(): any[] {
    if (!this.filtroNombre) return this.consolidados;
    return this.consolidados.filter(c =>
      c.trabajadorNombre?.toLowerCase().includes(this.filtroNombre.toLowerCase()));
  }

  // ── Editar campos manuales ────────────────────────────────
  abrirEditar(c: any) {
    this.consolidadoEditar = c;
    this.editOtroBono      = c.otroBono      ?? 0;
    this.editDetalleBono   = c.detalleOtroBono ?? '';
    this.editObservaciones = c.observaciones  ?? '';
    this.errorEdit         = '';
    this.mostrarModalEditar = true;
  }

  guardarEdicion() {
    this.isProcesando = true; this.errorEdit = '';
    this.svc.editar(this.consolidadoEditar.id, {
      otroBono:        this.editOtroBono,
      detalleOtroBono: this.editDetalleBono,
      observaciones:   this.editObservaciones
    }).subscribe({
      next: (act: any) => {
        const idx = this.consolidados.findIndex(c => c.id === act.id);
        if (idx >= 0) this.consolidados[idx] = act;
        this.isProcesando = false; this.mostrarModalEditar = false;
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorEdit = e.error?.message || 'Error al guardar.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Cierre de quincena ────────────────────────────────────
  inicializarDecisiones() {
    this.decisionesExtra = {};
    for (const c of this.consolidados) {
      this.decisionesExtra[c.idTrabajador] = {
        minExtraPagados: c.getTotalExtraMinutos ?? (c.minExtraDiaA + c.minExtranocheA +
                         c.minExtraDiaB + c.minExtraNocheB),
        minExtraABolsa:  0,
        bolsaConsumida:  0
      };
    }
  }

  totalExtraMin(c: any): number {
    return (c.minExtraDiaA || 0) + (c.minExtranocheA || 0)
         + (c.minExtraDiaB || 0) + (c.minExtraNocheB || 0);
  }

  abrirCierre() {
    // Inicializar decisiones con "pagar todo" como default
    for (const c of this.consolidados) {
      if (!this.decisionesExtra[c.idTrabajador]) {
        this.decisionesExtra[c.idTrabajador] = {
          minExtraPagados: this.totalExtraMin(c),
          minExtraABolsa:  0, bolsaConsumida: 0
        };
      }
    }
    this.errorCierre = '';
    this.mostrarModalCierre = true;
  }

  pagarTodoExtra(idTrabajador: number, c: any) {
    const total = this.totalExtraMin(c);
    this.decisionesExtra[idTrabajador] = {
      minExtraPagados: total, minExtraABolsa: 0, bolsaConsumida: 0
    };
  }

  acumularTodoExtra(idTrabajador: number, c: any) {
    const total = this.totalExtraMin(c);
    this.decisionesExtra[idTrabajador] = {
      minExtraPagados: 0, minExtraABolsa: total, bolsaConsumida: 0
    };
  }

  ejecutarCierre() {
    this.isProcesando = true; this.errorCierre = '';
    const decisiones = this.consolidados.map(c => ({
      idTrabajador:    c.idTrabajador,
      minExtraPagados: this.decisionesExtra[c.idTrabajador]?.minExtraPagados ?? this.totalExtraMin(c),
      minExtraABolsa:  this.decisionesExtra[c.idTrabajador]?.minExtraABolsa  ?? 0,
      bolsaConsumida:  this.decisionesExtra[c.idTrabajador]?.bolsaConsumida  ?? 0
    }));

    this.svc.cerrar({ idQuincena: this.quincenaActual.idQuincena, decisiones }).subscribe({
      next: (res: any) => {
        this.isProcesando = false; this.mostrarModalCierre = false;
        this.resultadoCierre = res; this.mostrarResultadoCierre = true;
        this.cargarQuincenas(); this.cargarConsolidado();
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorCierre = e.error?.message || 'Error al cerrar la quincena.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Reapertura ────────────────────────────────────────────
  abrirReaper() { this.motivoReaper = ''; this.errorReaper = ''; this.mostrarModalReaper = true; }

  solicitarReapertura() {
    if (!this.motivoReaper.trim()) { this.errorReaper = 'El motivo es obligatorio.'; return; }
    this.isProcesando = true;
    this.svc.solicitarReapertura(this.quincenaActual.idQuincena, this.motivoReaper).subscribe({
      next: () => {
        this.isProcesando = false; this.mostrarModalReaper = false;
        this.cargarQuincenas(); this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.errorReaper = e.error?.message || 'Error.';
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  abrirAprobar(q: any) { this.quincenaParaAprobar = q; this.mostrarModalAprobar = true; }

  aprobarReapertura() {
    this.isProcesando = true;
    this.svc.aprobarReapertura(this.quincenaParaAprobar.idQuincena).subscribe({
      next: () => {
        this.isProcesando = false; this.mostrarModalAprobar = false;
        this.cargarQuincenas();
        if (this.quincenaActual?.idQuincena === this.quincenaParaAprobar.idQuincena)
          this.cargarConsolidado();
        this.cdr.detectChanges();
      },
      error: (e: any) => {
        this.isProcesando = false; this.cdr.detectChanges();
        alert(e.error?.message || 'Error al aprobar.');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  formatMin(min: number | null): string {
    if (min == null) return '00:00';
    const sign = min < 0 ? '-' : '';
    const abs  = Math.abs(min);
    return sign + String(Math.floor(abs / 60)).padStart(2, '0') + ':' + String(abs % 60).padStart(2, '0');
  }

  esSuperAdmin() { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  esAdmin()      { return this.rolUsuario === 'ROLE_ADMIN' || this.esSuperAdmin(); }

  estadoBadge(estado: string): string {
    return { ABIERTA: 'badge-verde', CERRADA: 'badge-gris',
             REAPERTURA_PENDIENTE: 'badge-naranja' }[estado] ?? 'badge-gris';
  }

  estadoConsBadge(estado: string): string {
    return { BORRADOR: 'badge-azul', CERRADO: 'badge-morado' }[estado] ?? 'badge-gris';
  }

  onPagadosChange(idTrab: number, c: any, val: number) {
    const total = this.totalExtraMin(c);
    this.decisionesExtra[idTrab].minExtraPagados = val;
    this.decisionesExtra[idTrab].minExtraABolsa  = Math.max(0, total - val);
  }
}