import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AuthService } from '../../../core/services/auth';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { UsuarioService } from '../../../core/services/usuario.service';

@Component({
  selector: 'app-trabajador-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './trabajador-list.html',
  styleUrl: './trabajador-list.css'
})
export class TrabajadorListComponent implements OnInit {

  // --- SERVICIOS ---
  private authService      = inject(AuthService);
  private trabajadorService = inject(TrabajadorService);
  private usuarioService   = inject(UsuarioService);
  private router           = inject(Router);
  private cdr              = inject(ChangeDetectorRef);
  private fb               = inject(FormBuilder);

  // --- VARIABLES DE USUARIO ---
  rolUsuario: string = '';
  isProcesandoModal = false;

  // --- DATOS, BÚSQUEDA Y PAGINACIÓN ---
  trabajadores: any[]         = [];
  trabajadoresFiltrados: any[] = [];
  isLoading    = true;
  page         = 0;
  size         = 20;
  estadoActual: 'ACTIVO' | 'INACTIVO' = 'ACTIVO';
  terminoBusqueda = '';
  private searchSubject = new Subject<string>();

  // --- MODAL ROL ---
  mostrarModalRol       = false;
  trabajadorParaRol: any = null;
  nuevoRolSeleccionado  = '';

  // --- MODAL CESE ---
  mostrarModalCese       = false;
  trabajadorParaCese: any = null;
  motivoCese             = '';

  // --- MODAL REINGRESO ---
  mostrarModalReingreso        = false;
  trabajadorParaReingreso: any  = null;
  areasReingreso: any[]        = [];
  puestosReingreso: any[]      = [];
  areaSeleccionadaReingreso: number | ''  = '';
  puestoSeleccionadoReingreso: number | '' = '';

  // --- MODAL DETALLE ---
  mostrarModalDetalle    = false;
  trabajadorDetalle: any = null;
  isLoadingDetalle       = false;

  // --- MODAL EDICIÓN ---
  mostrarModalEdicion      = false;
  trabajadorEditandoId: number | null = null;
  isLoadingEdicion         = false;
  areasEdicion: any[]      = [];
  puestosEdicion: any[]    = [];
  generosEdicion: any[]    = [];

  editForm: FormGroup = this.fb.group({
    docIdentidad:        ['', Validators.required],
    nroDocumento:        ['', [Validators.required, Validators.minLength(8)]],
    pNombre:             ['', Validators.required],
    sNombre:             [''],
    aPaterno:            ['', Validators.required],
    aMaterno:            ['', Validators.required],
    fechaNac:            ['', Validators.required],
    email:               ['', [Validators.required, Validators.email]],
    telefono:            [''],
    direccion:           [''],
    contactoEmergencias: [''],
    nroContacto:         [''],
    parentesco:          [''],
    idGenero:            ['', Validators.required],
    idArea:              ['', Validators.required],
    idPuesto:            [{ value: '', disabled: true }, Validators.required],
  });


  // --- MENSAJE CREDENCIAL TRAS EDICIÓN ---
  mensajeCredencial = '';

  // --- MODAL RESET PASSWORD ---
  mostrarModalReset        = false;
  trabajadorParaReset: any = null;
  resetExito               = false;
  resetError               = '';
  isProcesandoReset        = false;

  ngOnInit(): void {
    this.rolUsuario = this.authService.getRolUsuario() || '';
    this.cargarTrabajadores();

    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(termino => {
      if (termino.trim().length >= 2) {
        this.buscarEnBackend(termino);
      } else {
        this.cargarTrabajadores();
      }
    });
  }

  // ==========================================
  // ROLES
  // ==========================================
  esSuperAdmin(): boolean {
    return this.rolUsuario === 'ROLE_SUPERADMIN';
  }

  esAdminOSuperAdmin(): boolean {
    return this.rolUsuario === 'ROLE_SUPERADMIN' || this.rolUsuario === 'ROLE_ADMIN';
  }

  // ==========================================
  // CARGA Y FILTRADO
  // ==========================================

  cargarTrabajadores() {
    this.isLoading = true;
    this.trabajadorService.getTrabajadores(this.page, this.size, this.estadoActual).subscribe({
      next: (res: any) => {
        // Extraemos los datos (si viene de un Pageable de Spring suele estar en .content)
        const data = res.content || res;

        // Ordenamos por ID antes de asignar
        // Cambia 'idTrabajador' por el nombre exacto de tu columna ID
        this.trabajadores = data.sort((a: any, b: any) => a.idTrabajador - b.idTrabajador);
        
        this.trabajadoresFiltrados = [...this.trabajadores];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }
  buscar() {
    this.searchSubject.next(this.terminoBusqueda);
  }

  buscarEnBackend(termino: string) {
    this.isLoading = true;
    this.trabajadorService.buscarTrabajadores(termino, this.estadoActual).subscribe({
      next: (res: any) => {
        this.trabajadoresFiltrados = res.content || res;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  toggleEstado() {
    this.estadoActual = this.estadoActual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    this.page = 0;
    this.terminoBusqueda = '';
    this.cargarTrabajadores();
  }

  // ==========================================
  // NAVEGACIÓN
  // ==========================================
  irANuevo() {
    this.router.navigate(['/dashboard/trabajadores/nuevo']);
  }

  // ==========================================
  // MODAL DETALLE
  // ==========================================
  verDetalle(id: number) {
    this.trabajadorDetalle = null;
    this.isLoadingDetalle  = true;
    this.mostrarModalDetalle = true;
    this.cdr.detectChanges();

    this.trabajadorService.getTrabajadorById(id).subscribe({
      next: (res) => {
        setTimeout(() => {
          this.trabajadorDetalle = res;
          this.isLoadingDetalle  = false;
          this.cdr.detectChanges();
        }, 0);
      },
      error: () => {
        this.isLoadingDetalle = false;
        this.cdr.detectChanges();
      }
    });
  }

  cerrarModalDetalle() {
    this.mostrarModalDetalle = false;
    this.trabajadorDetalle   = null;
    this.cdr.detectChanges();
  }

  // ==========================================
  // MODAL EDICIÓN
  // ==========================================
  editar(id: number) {
    this.trabajadorEditandoId = id;
    this.isLoadingEdicion     = true;
    this.mostrarModalEdicion  = true;
    this.puestosEdicion       = [];
    this.cdr.detectChanges();

    // Cargamos áreas y géneros en paralelo con los datos del trabajador
    this.trabajadorService.getAreas().subscribe(data => {
      this.areasEdicion = data;
      this.cdr.detectChanges();
    });

    this.trabajadorService.getGeneros().subscribe(data => {
      this.generosEdicion = data;
      this.cdr.detectChanges();
    });

    this.trabajadorService.getTrabajadorById(id).subscribe({
      next: (t) => {
        setTimeout(() => {
          // Primero cargamos los puestos del área actual
          this.trabajadorService.getPuestosByArea(t.idAreaActual || this.getIdAreaDesdePuesto(t)).subscribe(puestos => {
            this.puestosEdicion = puestos;

            // Luego rellenamos el formulario
            this.editForm.patchValue({
              docIdentidad:        t.docIdentidad,
              nroDocumento:        t.nroDocumento,
              pNombre:             t.pNombre        || t.nombreCompleto?.split(' ')[0],
              sNombre:             t.sNombre        || '',
              aPaterno:            t.aPaterno       || t.nombreCompleto?.split(' ')[1],
              aMaterno:            t.aMaterno       || t.nombreCompleto?.split(' ')[2],
              fechaNac:            t.fechaNac,
              email:               t.email,
              telefono:            t.telefono       || '',
              direccion:           t.direccion      || '',
              contactoEmergencias: t.contactoEmergencias || '',
              nroContacto:         t.nroContacto    || '',
              parentesco:          t.parentesco     || '',
              idGenero:            t.idGenero,
              idArea:              t.idArea,
              idPuesto:            t.idPuesto,
            });

            this.editForm.get('idPuesto')?.enable();

            // Campos sensibles: solo SuperAdmin puede editarlos
            if (!this.esSuperAdmin()) {
              this.editForm.get('docIdentidad')?.disable();
              this.editForm.get('nroDocumento')?.disable();
              this.editForm.get('email')?.disable();
            } else {
              this.editForm.get('docIdentidad')?.enable();
              this.editForm.get('nroDocumento')?.enable();
              this.editForm.get('email')?.enable();
            }

            this.isLoadingEdicion = false;
            this.cdr.detectChanges();
          });
        }, 0);
      },
      error: () => {
        this.isLoadingEdicion = false;
        this.cdr.detectChanges();
      }
    });

    // Escuchar cambio de área dentro del modal de edición
    this.editForm.get('idArea')?.valueChanges.subscribe(idArea => {
      if (idArea) {
        this.editForm.get('idPuesto')?.enable();
        this.editForm.get('idPuesto')?.setValue('');
        this.trabajadorService.getPuestosByArea(idArea).subscribe(data => {
          this.puestosEdicion = data;
          this.cdr.detectChanges();
        });
      }
    });
  }

  // Helper: obtiene el idArea buscando en la lista de áreas por nombre
  private getIdAreaDesdePuesto(t: any): number {
    const area = this.areasEdicion.find(a => a.area === t.areaNombre);
    return area?.idArea || 0;
  }

  cerrarModalEdicion() {
    this.mostrarModalEdicion  = false;
    this.trabajadorEditandoId = null;
    this.mensajeCredencial    = '';
    this.editForm.reset();
    this.puestosEdicion = [];
    this.cdr.detectChanges();
  }

  guardarEdicion() {
    if (this.editForm.invalid || !this.trabajadorEditandoId) return;

    this.isProcesandoModal = true;
    this.cdr.detectChanges();

    const payload = { ...this.editForm.getRawValue() };
    delete payload.idArea;

    this.trabajadorService.updateTrabajador(this.trabajadorEditandoId, payload).subscribe({
      next: (res: any) => {
        this.isProcesandoModal = false;
        this.mensajeCredencial = res?.mensajeCredencial || '';
        this.cdr.detectChanges();
        if (!this.mensajeCredencial) {
          // Sin mensaje especial: cerrar directamente
          this.cerrarModalEdicion();
        }
        // Si hay mensaje, el modal permanece abierto mostrando el aviso
        // y el botón cambia a "Cerrar"
        this.cargarTrabajadores();
      },
      error: (err) => {
        this.isProcesandoModal = false;
        console.error('Error al actualizar trabajador', err);
        this.cdr.detectChanges();
      }
    });
  }

  // ==========================================
  // MODAL CESE
  // ==========================================
  abrirModalCese(trabajador: any) {
    this.trabajadorParaCese = trabajador;
    this.motivoCese         = '';
    this.mostrarModalCese   = true;
    this.cdr.detectChanges();
  }

  cerrarModalCese() {
    this.mostrarModalCese   = false;
    this.trabajadorParaCese = null;
    this.motivoCese         = '';
    this.cdr.detectChanges();
  }

  procesarCese() {
    if (!this.trabajadorParaCese) return;

    const id     = this.trabajadorParaCese.idTrabajador;
    const motivo = this.motivoCese.trim() || 'Cese de actividades';

    this.isProcesandoModal = true;
    this.cdr.detectChanges();

    this.trabajadorService.cesarTrabajador(id, motivo).subscribe({
      next: () => {
        this.isProcesandoModal = false;
        this.cerrarModalCese();
        this.cargarTrabajadores();
      },
      error: (err) => {
        this.isProcesandoModal = false;
        if (err.status === 200 || err.status === 204) {
          this.cerrarModalCese();
          this.cargarTrabajadores();
        } else {
          console.error('Error al cesar al trabajador', err);
          this.cdr.detectChanges();
        }
      }
    });
  }

  // ==========================================
  // MODAL ROL
  // ==========================================
  abrirModalCambioRol(trabajador: any) {
    this.trabajadorParaRol       = trabajador;
    this.nuevoRolSeleccionado    = trabajador.rol || 'ROLE_TRABAJADOR';
    this.mostrarModalRol         = true;
    this.cdr.detectChanges();
  }

  cerrarModalRol() {
    this.mostrarModalRol      = false;
    this.trabajadorParaRol    = null;
    this.nuevoRolSeleccionado = '';
    this.cdr.detectChanges();
  }

  guardarNuevoRol() {
    if (!this.trabajadorParaRol || !this.nuevoRolSeleccionado) return;

    this.isProcesandoModal = true;
    this.cdr.detectChanges();

    this.usuarioService.cambiarRol(this.trabajadorParaRol.idTrabajador, this.nuevoRolSeleccionado).subscribe({
      next: () => {
        this.isProcesandoModal = false;
        this.cerrarModalRol();
        this.cargarTrabajadores();
      },
      error: (err) => {
        this.isProcesandoModal = false;
        if (err.status === 200) {
          this.cerrarModalRol();
          this.cargarTrabajadores();
        } else {
          console.error('Error cambiando el rol', err);
          this.cdr.detectChanges();
        }
      }
    });
  }

  // ==========================================
  // MODAL REINGRESO
  // ==========================================
  abrirModalReingreso(trabajador: any) {
    this.trabajadorParaReingreso       = trabajador;
    this.areaSeleccionadaReingreso     = '';
    this.puestoSeleccionadoReingreso   = '';
    this.puestosReingreso              = [];
    this.mostrarModalReingreso         = true;

    if (this.areasReingreso.length === 0) {
      this.trabajadorService.getAreas().subscribe(data => {
        this.areasReingreso = data;
        this.cdr.detectChanges();
      });
    }
    this.cdr.detectChanges();
  }

  cerrarModalReingreso() {
    this.mostrarModalReingreso       = false;
    this.trabajadorParaReingreso     = null;
    this.areaSeleccionadaReingreso   = '';
    this.puestoSeleccionadoReingreso = '';
    this.puestosReingreso            = [];
    this.cdr.detectChanges();
  }

  onAreaReingresoCambia(idArea: number) {
    this.puestoSeleccionadoReingreso = '';
    this.puestosReingreso            = [];
    if (idArea) {
      this.trabajadorService.getPuestosByArea(idArea).subscribe(data => {
        this.puestosReingreso = data;
        this.cdr.detectChanges();
      });
    }
  }

  procesarReingreso() {
    if (!this.trabajadorParaReingreso || !this.puestoSeleccionadoReingreso) return;

    const id      = this.trabajadorParaReingreso.idTrabajador;
    const idPuesto = Number(this.puestoSeleccionadoReingreso);

    this.isProcesandoModal = true;
    this.cdr.detectChanges();

    this.trabajadorService.reingresarTrabajador(id, idPuesto).subscribe({
      next: () => {
        this.isProcesandoModal = false;
        this.cdr.detectChanges();
        this.cerrarModalReingreso();
        this.cargarTrabajadores();
      },
      error: (err) => {
        this.isProcesandoModal = false;
        console.error('Error al reingresar trabajador', err);
        this.cdr.detectChanges();
      }
    });
  }

  // ==========================================
  // RESET PASSWORD
  // ==========================================
  abrirModalReset(trabajador: any) {
    this.trabajadorParaReset = trabajador;
    this.resetExito          = false;
    this.resetError          = '';
    this.isProcesandoReset   = false;
    this.mostrarModalReset   = true;
    this.cdr.detectChanges();
  }

  cerrarModalReset() {
    this.mostrarModalReset   = false;
    this.trabajadorParaReset = null;
    this.cdr.detectChanges();
  }

  procesarReset() {
    if (!this.trabajadorParaReset) return;
    this.isProcesandoReset = true;
    this.resetError        = '';
    this.cdr.detectChanges();

    this.trabajadorService.resetearPassword(this.trabajadorParaReset.idTrabajador).subscribe({
      next: () => {
        this.resetExito        = true;
        this.isProcesandoReset = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.resetError        = err.error?.message || 'No se pudo resetear la contraseña.';
        this.isProcesandoReset = false;
        this.cdr.detectChanges();
      }
    });
  }

  cambiarPagina(nuevaPagina: number) {
    if (nuevaPagina >= 0) {
      this.page = nuevaPagina;
      this.cargarTrabajadores();
    }
  }

  paginaSiguiente() {
    // Opcional: puedes verificar si hay más datos con el totalPages que devuelve Spring
    this.cambiarPagina(this.page + 1);
  }

  paginaAnterior() {
    if (this.page > 0) {
      this.cambiarPagina(this.page - 1);
    }
  }


}