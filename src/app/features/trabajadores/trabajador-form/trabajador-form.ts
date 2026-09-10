import { Component, inject, OnInit } from '@angular/core';
import { AvisoService } from '../../../shared/aviso.service';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TrabajadorService } from '../../../core/services/trabajador.service';

@Component({
  selector: 'app-trabajador-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './trabajador-form.html',
  styleUrl: './trabajador-form.css'
})
export class TrabajadorFormComponent implements OnInit {

  private fb = inject(FormBuilder);

  private aviso = inject(AvisoService);
  private trabajadorService = inject(TrabajadorService);
  private router = inject(Router);

  isLoading = false;
  errorMessage = '';

  generos: any[] = [];
  areas: any[] = [];
  puestos: any[] = [];

  // Regex reutilizables
  private soloLetras = Validators.pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/);
  private celularPeru = Validators.pattern(/^9\d{8}$/);

  trabajadorForm: FormGroup = this.fb.group({
    docIdentidad: ['DNI', Validators.required],
    nroDocumento: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(8), Validators.pattern(/^\d{8}$/)]],
    pNombre: ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    sNombre: ['', [Validators.maxLength(50), this.soloLetras]],
    aPaterno: ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    aMaterno: ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    fechaNac: ['', [Validators.required, this.edadMinimaValidator(18)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    direccion: ['', Validators.maxLength(255)],
    telefono: ['', [this.celularPeru]],
    contactoEmergencias: ['', Validators.maxLength(100)],
    nroContacto: ['', [this.celularPeru]],
    parentesco: [''],
    idArea: ['', Validators.required],
    idPuesto: [{ value: '', disabled: true }, Validators.required],
    idGenero: ['', Validators.required]
  });

  ngOnInit() {
    this.trabajadorService.getGeneros().subscribe(data => this.generos = data);
    this.trabajadorService.getAreas().subscribe(data => this.areas = data);

    // Cuando cambia el tipo de documento, reconfiguramos la validación de nroDocumento
    this.trabajadorForm.get('docIdentidad')?.valueChanges.subscribe(tipo => {
      this.actualizarValidacionDocumento(tipo);
    });

    // Cuando cambia el área, cargamos los puestos
    this.trabajadorForm.get('idArea')?.valueChanges.subscribe(idArea => {
      if (idArea) {
        this.trabajadorForm.get('idPuesto')?.enable();
        this.trabajadorService.getPuestosByArea(idArea).subscribe(data => {
          this.puestos = data;
          this.trabajadorForm.get('idPuesto')?.setValue('');
        });
      }
    });
  }

  /** Cambia los validators de nroDocumento según el tipo seleccionado */
  private actualizarValidacionDocumento(tipo: string) {
    const ctrl = this.trabajadorForm.get('nroDocumento');
    if (!ctrl) return;

    switch (tipo) {
      case 'DNI':
        ctrl.setValidators([Validators.required, Validators.minLength(8), Validators.maxLength(8), Validators.pattern(/^\d{8}$/)]);
        break;
      case 'CE':
        ctrl.setValidators([Validators.required, Validators.minLength(9), Validators.maxLength(12), Validators.pattern(/^\d{9,12}$/)]);
        break;
      case 'PASAPORTE':
        ctrl.setValidators([Validators.required, Validators.minLength(6), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9]{6,20}$/)]);
        break;
    }
    ctrl.updateValueAndValidity();
  }

  /** Validator custom: edad mínima en años */
  private edadMinimaValidator(edadMinima: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      const fechaNac = new Date(control.value);
      const hoy = new Date();
      let edad = hoy.getFullYear() - fechaNac.getFullYear();
      const m = hoy.getMonth() - fechaNac.getMonth();
      if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
        edad--;
      }
      return edad < edadMinima ? { edadMinima: { requerida: edadMinima, actual: edad } } : null;
    };
  }

  /** Helper para mostrar placeholder dinámico del nro documento */
  getPlaceholderDocumento(): string {
    const tipo = this.trabajadorForm.get('docIdentidad')?.value;
    switch (tipo) {
      case 'DNI': return 'Ej. 72345678 (8 dígitos)';
      case 'CE': return 'Ej. 001234567 (9-12 dígitos)';
      case 'PASAPORTE': return 'Ej. AB1234567 (6-20 alfanuméricos)';
      default: return '';
    }
  }

  onSubmit() {
    if (this.trabajadorForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';

      const payload = { ...this.trabajadorForm.value };
      delete payload.idArea;

      this.trabajadorService.crearTrabajador(payload).subscribe({
        next: () => {
          this.isLoading = false;
          this.aviso.exito('Trabajador registrado con éxito y cuenta de usuario generada!');
          this.router.navigate(['/dashboard/trabajadores']);
        },
        error: (err) => {
          this.isLoading = false;
          console.error(err);
          // Si el backend devuelve un mapa de errores de validación (400)
          if (err.status === 400 && typeof err.error === 'object' && !err.error.message) {
            const campos = Object.entries(err.error).map(([k, v]) => `${v}`).join('\n');
            this.errorMessage = campos;
          } else {
            this.errorMessage = err.error?.message || 'Error al registrar el trabajador.';
          }
        }
      });
    } else {
      this.trabajadorForm.markAllAsTouched();
    }
  }

  cancelar() {
    this.router.navigate(['/dashboard/trabajadores']);
  }
}