import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConsolidadoService } from '../../../core/services/consolidado.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-mi-bolsa',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mi-bolsa.html',
  styleUrl: './mi-bolsa.css'
})
export class MiBolsaComponent implements OnInit {

  private consolidadoService = inject(ConsolidadoService);
  private authService        = inject(AuthService);
  private cdr                = inject(ChangeDetectorRef);

  historial: any[] = [];
  saldoActual = '00:00';
  cargando = true;

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    const idTrab = this.authService.getIdTrabajador();
    if (!idTrab) { this.cargando = false; return; }

    this.consolidadoService.getHistorialBolsa(idTrab).subscribe({
      next: (data) => {
        this.historial = data;
        this.saldoActual = data.length > 0 ? data[0].hBolsaSalida : '00:00';
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargando = false; this.cdr.detectChanges(); }
    });
  }
}
