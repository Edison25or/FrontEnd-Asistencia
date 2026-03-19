import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TurnoService } from '../../../core/services/turno.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-turno-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './turno-list.html',
  styleUrl: './turno-list.css'
})
export class TurnoListComponent implements OnInit {

  private turnoService = inject(TurnoService);
  private authService  = inject(AuthService);
  private fb           = inject(FormBuilder);
  private cdr          = inject(ChangeDetectorRef);

  turnos: any[]  = [];
  isLoading      = true;
  rolUsuario     = '';

  // Modal
  mostrarModal      = false;
  isProcesando      = false;
  modoEdicion       = false;
  turnoEditandoId: number | null = null;
  errorModal        = '';

  // Modal eliminar
  mostrarModalEliminar = false;
  turnoParaEliminar: any = null;

  turnoForm!: FormGroup;

  ngOnInit() {
    this.rolUsuario = this.authService.getRolUsuario() || '';
    this.initForm();
    this.cargarTurnos();
  }

  initForm() {
    this.turnoForm = this.fb.group({
      nombre:             ['', [Validators.required, Validators.maxLength(50)]],
      horaEntrada:        ['', Validators.required],
      horaSalida:         ['', Validators.required],
      toleranciaMinutos:  [10, [Validators.required, Validators.min(0), Validators.max(60)]]
    });
  }

  cargarTurnos() {
    this.isLoading = true;
    this.turnoService.getAll().subscribe({
      next: (data) => {
        this.turnos = data;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  abrirModalNuevo() {
    this.modoEdicion = false;
    this.turnoEditandoId = null;
    this.errorModal = '';
    this.turnoForm.reset({ toleranciaMinutos: 10 });
    this.mostrarModal = true;
  }

  abrirModalEditar(turno: any) {
    this.modoEdicion = true;
    this.turnoEditandoId = turno.idTurno;
    this.errorModal = '';
    this.turnoForm.patchValue({
      nombre:            turno.nombre,
      horaEntrada:       turno.horaEntrada,
      horaSalida:        turno.horaSalida,
      toleranciaMinutos: turno.toleranciaMinutos
    });
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.turnoForm.reset({ toleranciaMinutos: 10 });
    this.errorModal = '';
  }

  guardar() {
    if (this.turnoForm.invalid) {
      this.turnoForm.markAllAsTouched();
      return;
    }

    this.isProcesando = true;
    this.errorModal = '';
    const payload = this.turnoForm.value;

    const op = this.modoEdicion
      ? this.turnoService.actualizar(this.turnoEditandoId!, payload)
      : this.turnoService.crear(payload);

    op.subscribe({
      next: () => {
        this.isProcesando = false;
        this.cdr.detectChanges();
        this.cerrarModal();
        this.cargarTurnos();
      },
      error: (err) => {
        this.errorModal = err.error?.message || 'Error al guardar el turno.';
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  confirmarEliminar(turno: any) {
    this.turnoParaEliminar = turno;
    this.mostrarModalEliminar = true;
  }

  cerrarModalEliminar() {
    this.mostrarModalEliminar = false;
    this.turnoParaEliminar = null;
  }

  eliminar() {
    if (!this.turnoParaEliminar) return;
    this.isProcesando = true;

    this.turnoService.eliminar(this.turnoParaEliminar.idTurno).subscribe({
      next: () => {
        this.isProcesando = false;
        this.cdr.detectChanges();
        this.cerrarModalEliminar();
        this.cargarTurnos();
      },
      error: (err) => {
        this.isProcesando = false;
        this.cdr.detectChanges();
        alert(err.error?.message || 'No se pudo eliminar el turno.');
      }
    });
  }

  esSuperAdmin() { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  esAdmin()      { return this.rolUsuario === 'ROLE_ADMIN' || this.esSuperAdmin(); }

  // Calcula duración del turno en horas
  duracionTurno(entrada: string, salida: string): string {
    if (!entrada || !salida) return '—';
    const [he, me] = entrada.split(':').map(Number);
    const [hs, ms] = salida.split(':').map(Number);
    let mins = (hs * 60 + ms) - (he * 60 + me);
    if (mins < 0) mins += 24 * 60; // turno nocturno que cruza medianoche
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
}
