import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../core/services/asistencia.service';

@Component({
  selector: 'app-marcado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './marcado.html',
  styleUrl: './marcado.css'
})
export class MarcadoComponent implements OnInit, OnDestroy {

  private asistenciaService = inject(AsistenciaService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('codigoInput') codigoInput!: ElementRef;

  codigoBarras = '';
  estado: 'ESPERA' | 'PROCESANDO' | 'EXITO' | 'ERROR' = 'ESPERA';
  ultimoRegistro: any = null;
  mensajeError = '';

  enPlanta: any[] = [];
  isLoadingPlanta = false;

  horaActual  = '';
  fechaActual = '';
  private relojInterval: any;
  private resetTimeout:  any;

  ngOnInit() {
    this.iniciarReloj();
    this.cargarEnPlanta();
    setTimeout(() => this.codigoInput?.nativeElement.focus(), 200);
  }

  ngOnDestroy() {
    clearInterval(this.relojInterval);
    clearTimeout(this.resetTimeout);
  }

  iniciarReloj() {
    const actualizar = () => {
      const ahora = new Date();
      this.horaActual  = ahora.toLocaleTimeString('es-PE',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.fechaActual = ahora.toLocaleDateString('es-PE',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      this.cdr.detectChanges();
    };
    actualizar();
    this.relojInterval = setInterval(actualizar, 1000);
  }

  cargarEnPlanta() {
    this.isLoadingPlanta = true;
    this.asistenciaService.getEnPlantaPublica().subscribe({
      next:  (data) => { this.enPlanta = data; this.isLoadingPlanta = false; this.cdr.detectChanges(); },
      error: ()     => { this.isLoadingPlanta = false; this.cdr.detectChanges(); }
    });
  }

  onCodigoLeido() {
    const codigo = this.codigoBarras.trim().toUpperCase();
    if (!codigo) return;

    this.estado = 'PROCESANDO';
    this.codigoBarras = '';
    this.cdr.detectChanges();

    this.asistenciaService.marcar(codigo).subscribe({
      next: (res) => {
        setTimeout(() => {
          this.ultimoRegistro = res;
          this.estado = 'EXITO';
          this.cdr.detectChanges();
          this.cargarEnPlanta();
          this.resetTimeout = setTimeout(() => {
            this.estado = 'ESPERA';
            this.ultimoRegistro = null;
            this.cdr.detectChanges();
            this.codigoInput?.nativeElement.focus();
          }, 4000);
        }, 0);
      },
      error: (err) => {
        setTimeout(() => {
          this.mensajeError = err.error?.message || 'Error al registrar asistencia.';
          this.estado = 'ERROR';
          this.cdr.detectChanges();
          this.resetTimeout = setTimeout(() => {
            this.estado = 'ESPERA';
            this.mensajeError = '';
            this.cdr.detectChanges();
            this.codigoInput?.nativeElement.focus();
          }, 4000);
        }, 0);
      }
    });
  }

  refocus() { this.codigoInput?.nativeElement.focus(); }

  /**
   * Lee el estado diario del registro (A_TIEMPO / TARDE).
   * El nuevo DTO devuelve 'estadoDiario' para el resultado del día.
   * 'estado' ahora contiene el workflow (MARCADO, CALCULADO…) — no sirve aquí.
   * Fallback a 'estado' para compatibilidad con registros pre-migración.
   */
  private getEstadoDiario(registro: any): string {
    return registro?.estadoDiario || '';
  }

  getColorEstado(registro: any): string {
    switch (this.getEstadoDiario(registro)) {
      case 'A_TIEMPO':       return '#16a34a';
      case 'TARDE':          return '#d97706';
      case 'FALTA':          return '#dc2626';
      case 'NO_PROGRAMADO':  return '#6366f1';
      default:               return '#64748b';
    }
  }

  getEtiquetaEstado(registro: any): string {
    switch (this.getEstadoDiario(registro)) {
      case 'A_TIEMPO':       return '✓ A TIEMPO';
      case 'TARDE':          return '⚠ TARDE';
      case 'FALTA':          return '✗ FALTA';
      case 'NO_PROGRAMADO':  return 'ℹ NO PROGRAMADO';
      default:               return '';
    }
  }

  // true si hay estado diario que mostrar (evita mostrar badge vacío)
  tieneEstadoDiario(registro: any): boolean {
    return !!this.getEstadoDiario(registro);
  }
}