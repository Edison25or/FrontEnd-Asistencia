import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TurnoService, Turno } from '../../../core/services/turno.service';
import { AuthService } from '../../../core/services/auth';

/**
 * Catálogo de turnos (RN-18, CU24).
 *
 * ============================================================
 * QUE CAMBIA
 * ============================================================
 * 1. Desaparece la edición de turnos. El backend no la expone: cambiar el
 *    nombre o el horario de un turno en uso alteraría la interpretación de
 *    jornadas ya consolidadas, y eso reescribiría el pasado. Para
 *    corregir un turno se crea uno nuevo y se desactiva el anterior.
 *
 * 2. Desaparece toleranciaMinutos. Las tolerancias se mudaron al esquema
 *    de horario y ahora son tres, no una: tardanza, previa y posterior
 *    (RN-17). Una sola no permitía distinguir una entrada anticipada
 *    normal de una que dispara la confirmación por doble escaneo.
 *
 * 3. horaEntrada y horaSalida pasan a horaInicio y horaFin, y son
 *    INFORMATIVAS: describen el turno en la interfaz, pero no clasifican
 *    marcaciones. El turno de una jornada se toma del esquema programado,
 *    nunca de la hora real de marcación (RN-25).
 *
 * 4. Eliminar pasa a desactivar. Un turno con historial no puede borrarse
 *    sin dejar jornadas sin clasificar.
 */
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

  turnos: Turno[] = [];
  isLoading  = true;
  rolUsuario = '';

  // Modal de alta
  mostrarModal = false;
  isProcesando = false;
  errorModal   = '';

  // Modal de desactivación
  mostrarModalEliminar = false;
  turnoParaEliminar: Turno | null = null;
  errorEliminar = '';

  turnoForm!: FormGroup;

  ngOnInit() {
    this.rolUsuario = this.authService.getRolUsuario() || '';
    this.initForm();
    this.cargarTurnos();
  }

  initForm() {
    this.turnoForm = this.fb.group({
      nombre:     ['', [Validators.required, Validators.maxLength(40)]],
      horaInicio: [''],
      horaFin:    ['']
    });
  }

  cargarTurnos() {
    this.isLoading = true;
    this.turnoService.getAll().subscribe({
      next: (data: Turno[]) => {
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

  // ---------- Alta ----------

  abrirModalNuevo() {
    this.errorModal = '';
    this.turnoForm.reset({ nombre: '', horaInicio: '', horaFin: '' });
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.turnoForm.reset({ nombre: '', horaInicio: '', horaFin: '' });
    this.errorModal = '';
  }

  guardar() {
    if (this.turnoForm.invalid) {
      this.turnoForm.markAllAsTouched();
      return;
    }

    this.isProcesando = true;
    this.errorModal   = '';

    this.turnoService.crear(this.turnoForm.value).subscribe({
      next: () => {
        this.isProcesando = false;
        this.cerrarModal();
        this.cargarTurnos();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorModal   = err.error?.message || 'Error al crear el turno.';
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ---------- Desactivación ----------

  confirmarEliminar(turno: Turno) {
    this.turnoParaEliminar    = turno;
    this.errorEliminar        = '';
    this.mostrarModalEliminar = true;
  }

  cerrarModalEliminar() {
    this.mostrarModalEliminar = false;
    this.turnoParaEliminar    = null;
    this.errorEliminar        = '';
  }

  /**
   * Desactiva el turno. El backend lo rechaza si algún esquema de horario
   * vigente lo usa, y devuelve cuántos son.
   */
  desactivar() {
    if (!this.turnoParaEliminar) return;
    this.isProcesando  = true;
    this.errorEliminar = '';

    this.turnoService.desactivar(this.turnoParaEliminar.idTurno).subscribe({
      next: () => {
        this.isProcesando = false;
        this.cerrarModalEliminar();
        this.cargarTurnos();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.errorEliminar = err.error?.message || 'No se pudo desactivar el turno.';
        this.isProcesando  = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ---------- Helpers ----------

  esSuperAdmin() { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  esAdmin()      { return this.rolUsuario === 'ROLE_ADMIN' || this.esSuperAdmin(); }

  /**
   * Duración del turno a partir de sus horas informativas.
   * Si la salida es anterior a la entrada, el turno cruza la medianoche.
   */
  duracionTurno(inicio: string | null, fin: string | null): string {
    if (!inicio || !fin) return '—';
    const [hi, mi] = inicio.split(':').map(Number);
    const [hf, mf] = fin.split(':').map(Number);
    let mins = (hf * 60 + mf) - (hi * 60 + mi);
    if (mins <= 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  hora(v: string | null): string {
    return v ? v.substring(0, 5) : '—';
  }
}
