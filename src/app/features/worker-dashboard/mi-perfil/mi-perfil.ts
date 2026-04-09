import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrabajadorService, TrabajadorRequest } from '../../../core/services/trabajador.service';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-mi-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mi-perfil.html',
  styleUrl: './mi-perfil.css'
})
export class MiPerfilComponent implements OnInit {

  private trabajadorService = inject(TrabajadorService);
  private authService       = inject(AuthService);
  private cdr               = inject(ChangeDetectorRef);

  perfil: any = null;
  cargando = true;
  guardando = false;
  mensaje = '';
  mensajeTipo: 'ok' | 'error' | '' = '';
  editando = false;

  // Campos editables (copia para edición)
  form = { telefono: '', direccion: '', contactoEmergencias: '', nroContacto: '', parentesco: '' };

  parentescos = [
    { value: 'PADRE',     label: 'Padre' },
    { value: 'MADRE',     label: 'Madre' },
    { value: 'CONYUGE',   label: 'Cónyuge' },
    { value: 'HIJO_A',    label: 'Hijo/a' },
    { value: 'HERMANO_A', label: 'Hermano/a' },
    { value: 'OTRO',      label: 'Otro' },
  ];

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    const id = this.authService.getIdTrabajador();
    if (!id) { this.cargando = false; return; }

    this.trabajadorService.getTrabajadorById(id).subscribe({
      next: (data) => {
        this.perfil = data;
        this.resetForm();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargando = false; this.cdr.detectChanges(); }
    });
  }

  toggleEdicion() {
    this.editando = !this.editando;
    if (!this.editando) this.resetForm();
    this.mensaje = '';
    this.cdr.detectChanges();
  }

  resetForm() {
    if (!this.perfil) return;
    this.form = {
      telefono:            this.perfil.telefono || '',
      direccion:           this.perfil.direccion || '',
      contactoEmergencias: this.perfil.contactoEmergencias || '',
      nroContacto:         this.perfil.nroContacto || '',
      parentesco:          this.perfil.parentesco || ''
    };
  }

  guardar() {
    if (!this.perfil) return;

    // Verificar si hay cambios
    const sinCambios =
      this.form.telefono === (this.perfil.telefono || '') &&
      this.form.direccion === (this.perfil.direccion || '') &&
      this.form.contactoEmergencias === (this.perfil.contactoEmergencias || '') &&
      this.form.nroContacto === (this.perfil.nroContacto || '') &&
      this.form.parentesco === (this.perfil.parentesco || '');

    if (sinCambios) {
      this.mensaje = 'No hay cambios para guardar.';
      this.mensajeTipo = 'error';
      this.cdr.detectChanges();
      return;
    }

    this.guardando = true;
    this.mensaje = '';

    // Envía todos los campos (el backend requiere el DTO completo)
    // pero solo modifica los editables — los demás van con su valor original
    const request: TrabajadorRequest = {
      docIdentidad:        this.perfil.docIdentidad,
      nroDocumento:        this.perfil.nroDocumento,
      pNombre:             this.perfil.pNombre,
      sNombre:             this.perfil.sNombre,
      aPaterno:            this.perfil.aPaterno,
      aMaterno:            this.perfil.aMaterno,
      fechaNac:            this.perfil.fechaNac,
      email:               this.perfil.email,
      idPuesto:            this.perfil.idPuesto,
      idGenero:            this.perfil.idGenero,
      // Campos editables
      telefono:            this.form.telefono || undefined,
      direccion:           this.form.direccion || undefined,
      contactoEmergencias: this.form.contactoEmergencias || undefined,
      nroContacto:         this.form.nroContacto || undefined,
      parentesco:          (this.form.parentesco as any) || undefined,
    };

    this.trabajadorService.updateTrabajador(this.perfil.idTrabajador, request).subscribe({
      next: (data) => {
        this.perfil = data;
        this.resetForm();
        this.editando = false;
        this.guardando = false;
        this.mensaje = '¡Datos actualizados correctamente!';
        this.mensajeTipo = 'ok';
        this.cdr.detectChanges();
        setTimeout(() => { this.mensaje = ''; this.cdr.detectChanges(); }, 3000);
      },
      error: (err) => {
        this.guardando = false;
        this.mensaje = err.error?.message || 'Error al guardar los cambios.';
        this.mensajeTipo = 'error';
        this.cdr.detectChanges();
      }
    });
  }
}
