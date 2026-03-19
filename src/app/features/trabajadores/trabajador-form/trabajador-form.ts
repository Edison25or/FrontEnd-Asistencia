
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TrabajadorService } from '../../../core/services/trabajador.service';

@Component({
  selector: 'app-trabajador-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './trabajador-form.html',
  styleUrl: './trabajador-form.css'
})
export class TrabajadorFormComponent implements OnInit{

  private fb = inject(FormBuilder);
  private trabajadorService = inject(TrabajadorService);
  private router = inject(Router);

  isLoading = false;
  errorMessage = '';

  generos: any[] = [];
  areas: any[] = [];
  puestos: any[] = [];

  // Inicializamos el formulario con las validaciones requeridas por el backend
  trabajadorForm: FormGroup = this.fb.group({
    docIdentidad: ['DNI', Validators.required],
    nroDocumento: ['', [Validators.required, Validators.minLength(8)]],
    pNombre: ['', Validators.required],
    sNombre: [''],
    aPaterno: ['', Validators.required],
    aMaterno: ['', Validators.required],
    fechaNac: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    direccion: [''],
    telefono: [''],
    contactoEmergencias: [''],
    nroContacto: [''],
    parentesco: [''],
    idArea: ['', Validators.required], // <--- NUEVO CAMPO TEMPORAL
    idPuesto: [{value: '', disabled: true}, Validators.required], // Empieza bloqueado
    idGenero: ['', Validators.required]
  });

  ngOnInit() {
    // 1. Cargar las listas iniciales (Géneros y Áreas)
    this.trabajadorService.getGeneros().subscribe(data => this.generos = data);
    this.trabajadorService.getAreas().subscribe(data => this.areas = data);

    // 2. Escuchar cuando el usuario cambia de Área
    this.trabajadorForm.get('idArea')?.valueChanges.subscribe(idAreaSeleccionada => {
      if (idAreaSeleccionada) {
        // Desbloqueamos el selector de puesto y buscamos los nuevos datos
        this.trabajadorForm.get('idPuesto')?.enable();
        this.trabajadorService.getPuestosByArea(idAreaSeleccionada).subscribe(data => {
          this.puestos = data;
          this.trabajadorForm.get('idPuesto')?.setValue(''); // Reseteamos el puesto anterior
        });
      }
    });
  }

  onSubmit() {
    if (this.trabajadorForm.valid) {
        this.isLoading = true;

        const payload = { ...this.trabajadorForm.value };
        delete payload.idArea;

        this.trabajadorService.crearTrabajador(payload).subscribe({
            next: (res) => {
            this.isLoading = false;

            alert('¡Trabajador registrado con éxito y cuenta de usuario generada!');
            this.router.navigate(['/dashboard/trabajadores']); // Volvemos a la tabla
            },
            error: (err) => {
            this.isLoading = false;
            console.error(err);
            // Mostramos el mensaje de error que viene de tu BusinessException
            this.errorMessage = err.error?.message || 'Error al registrar el trabajador.';
            }

        });
    } else {
      this.trabajadorForm.markAllAsTouched(); // Muestra los errores en rojo si intentan guardar vacío
    }
  }

  cancelar() {
    this.router.navigate(['/dashboard/trabajadores']);
  }
}