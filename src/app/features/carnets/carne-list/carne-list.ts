import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { CarneService } from '../../../core/services/carne.service';

@Component({
  selector: 'app-carne-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './carne-list.html',
  styleUrl: './carne-list.css'
})
export class CarneListComponent implements OnInit {

  private trabajadorService = inject(TrabajadorService);
  private carneService      = inject(CarneService);
  private cdr               = inject(ChangeDetectorRef);

  trabajadores: any[]          = [];
  trabajadoresFiltrados: any[] = [];
  isLoading                    = true;
  isGenerando                  = false;
  terminoBusqueda              = '';

  seleccionados: Set<number> = new Set();
  todosSeleccionados         = false;

  ngOnInit() { this.cargar(); }

  cargar() {
    this.isLoading = true;
    this.trabajadorService.getTrabajadores(0, 500).subscribe({
      next: (res) => {
        this.trabajadores          = res.content || res;
        this.trabajadoresFiltrados = [...this.trabajadores];
        this.isLoading             = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  filtrar() {
    const t = this.terminoBusqueda.toLowerCase();
    this.trabajadoresFiltrados = this.trabajadores.filter(tr =>
      tr.nombreCompleto?.toLowerCase().includes(t) ||
      tr.nroDocumento?.includes(t) ||
      tr.areaNombre?.toLowerCase().includes(t) ||
      tr.puestoNombre?.toLowerCase().includes(t)
    );
    this.actualizarEstadoGeneral();
    this.cdr.detectChanges();
  }

  toggleSeleccion(id: number) {
    this.seleccionados.has(id)
      ? this.seleccionados.delete(id)
      : this.seleccionados.add(id);
    this.actualizarEstadoGeneral();
    this.cdr.detectChanges();
  }

  toggleTodos() {
    if (this.todosSeleccionados) {
      this.trabajadoresFiltrados.forEach(t => this.seleccionados.delete(t.idTrabajador));
    } else {
      this.trabajadoresFiltrados.forEach(t => this.seleccionados.add(t.idTrabajador));
    }
    this.actualizarEstadoGeneral();
    this.cdr.detectChanges();
  }

  actualizarEstadoGeneral() {
    this.todosSeleccionados = this.trabajadoresFiltrados.length > 0 &&
      this.trabajadoresFiltrados.every(t => this.seleccionados.has(t.idTrabajador));
  }

  limpiarSeleccion() {
    this.seleccionados.clear();
    this.actualizarEstadoGeneral();
    this.cdr.detectChanges();
  }

  async imprimirSeleccionados() {
    const lista = this.trabajadores.filter(t => this.seleccionados.has(t.idTrabajador));
    if (lista.length === 0) return;
    this.isGenerando = true;
    this.cdr.detectChanges();
    await this.carneService.generarPDF(lista);
    this.isGenerando = false;
    this.cdr.detectChanges();
  }

  async imprimirIndividual(trabajador: any) {
    this.isGenerando = true;
    this.cdr.detectChanges();
    await this.carneService.generarPDFIndividual(trabajador);
    this.isGenerando = false;
    this.cdr.detectChanges();
  }

  get totalSeleccionados() { return this.seleccionados.size; }
}