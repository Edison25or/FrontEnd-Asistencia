import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsolidadoService } from '../../../core/services/consolidado.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-mi-consolidado',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mi-consolidado.html',
  styleUrl: './mi-consolidado.css'
})
export class MiConsolidadoComponent implements OnInit {

  private consolidadoService = inject(ConsolidadoService);
  private authService        = inject(AuthService);
  private cdr                = inject(ChangeDetectorRef);

  quincenas: any[] = [];
  detalle: any = null;
  quincenaSeleccionada: number | null = null;
  cargando = true;
  cargandoDetalle = false;

  ngOnInit() { this.cargarQuincenas(); }

  cargarQuincenas() {
    this.cargando = true;
    this.consolidadoService.getQuincenas().subscribe({
      next: (data) => {
        // Solo quincenas cerradas, últimas 4 (como la app móvil)
        this.quincenas = data.filter((q: any) => q.estado === 'CERRADA').slice(0, 4);
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargando = false; this.cdr.detectChanges(); }
    });
  }

  seleccionarQuincena(idQuincena: number) {
    if (this.quincenaSeleccionada === idQuincena) {
      this.quincenaSeleccionada = null;
      this.detalle = null;
      return;
    }
    this.quincenaSeleccionada = idQuincena;
    this.cargandoDetalle = true;
    this.detalle = null;

    const idTrab = this.authService.getIdTrabajador();
    if (!idTrab) return;

    this.consolidadoService.getConsolidadoTrabajador(idQuincena, idTrab).subscribe({
      next: (data) => {
        this.detalle = data;
        this.cargandoDetalle = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.detalle = null;
        this.cargandoDetalle = false;
        this.cdr.detectChanges();
      }
    });
  }

  getConsolidadoTrabajador(idQuincena: number, idTrabajador: number) {
    return this.consolidadoService.getConsolidadoTrabajador(idQuincena, idTrabajador);
  }
}
