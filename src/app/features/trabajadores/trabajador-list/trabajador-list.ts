import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { fechaLocal } from '../../../shared/fecha-pe.pipe';
import { AvisoService } from '../../../shared/aviso.service';
import { mensajeError } from '../../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AuthService } from '../../../core/services/auth';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { CatalogoService, CatalogoSimple } from '../../../core/services/catalogo.service';

import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

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
  private aviso = inject(AvisoService);
  private trabajadorService = inject(TrabajadorService);
  private usuarioService   = inject(UsuarioService);
  private catalogoService  = inject(CatalogoService);
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

  /**
   * Catálogo de motivos de cese (RN-11).
   *
   * El campo era texto libre, de modo que el catálogo cargado en Tablas
   * Maestras no se usaba nunca: el backend resuelve el motivo por
   * coincidencia exacta de nombre, y "renuncia", "Renuncia voluntaria" y
   * "renunció" acababan como tres textos sueltos distintos en
   * detalleMotivoCese.
   */
  motivosCese: CatalogoSimple[] = [];

  /** Detalle libre, solo cuando el motivo elegido es "Otro". */
  detalleMotivoCese      = '';

  get requiereDetalle(): boolean {
    return this.motivoCese.trim().toLowerCase() === 'otro';
  }
  fechaCese              = '';
  today = fechaLocal();

  // --- MODAL REINGRESO ---
  mostrarModalReingreso        = false;
  trabajadorParaReingreso: any  = null;
  areasReingreso: any[]        = [];
  puestosReingreso: any[]      = [];
  areaSeleccionadaReingreso: number | ''  = '';
  puestoSeleccionadoReingreso: number | '' = '';

  /**
   * Si está activo, el trabajador vuelve a su puesto anterior y no se
   * envía idPuesto. Es el caso habitual del reingreso (RN-12).
   */
  conservarPuesto = true;

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

// Regex reutilizables
  private soloLetras = Validators.pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ ]+$/);
  private celularPeru = Validators.pattern(/^9\d{8}$/);

  editForm: FormGroup = this.fb.group({
    docIdentidad:        ['', Validators.required],
    nroDocumento:        ['', [Validators.required, Validators.minLength(8), Validators.maxLength(8), Validators.pattern(/^\d{8}$/)]],
    pNombre:             ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    sNombre:             ['', [Validators.maxLength(50), this.soloLetras]],
    aPaterno:            ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    aMaterno:            ['', [Validators.required, Validators.maxLength(50), this.soloLetras]],
    fechaNac:            ['', [Validators.required, this.edadMinimaValidator(18)]],
    email:               ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    telefono:            ['', [this.celularPeru]],
    direccion:           ['', Validators.maxLength(255)],
    contactoEmergencias: ['', Validators.maxLength(100)],
    nroContacto:         ['', [this.celularPeru]],
    parentesco:          [''],
    idGenero:            ['', Validators.required],
    idArea:              ['', Validators.required],
    idPuesto:            [{ value: '', disabled: true }, Validators.required],
  });


  // --- MENSAJE CREDENCIAL TRAS EDICIÓN ---
  mensajeCredencial = '';

  /**
   * Redacta el aviso de cambio de credenciales.
   *
   * El servidor devuelve dos indicadores; el texto es responsabilidad de
   * la interfaz, que es donde se decide cómo se le habla al usuario.
   */
  private armarAvisoCredencial(res: any): string {
    const partes: string[] = [];

    if (res?.cambioUsuario) {
      partes.push(`El trabajador iniciará sesión con su nuevo correo: ${res.email}.`);
    }
    if (res?.cambioPassword) {
      partes.push('Su contraseña pasó a ser el nuevo número de documento, '
                + 'y deberá cambiarla al entrar.');
    }
    return partes.join(' ');
  }

  // --- MODAL RESET PASSWORD ---
  mostrarModalReset        = false;
  trabajadorParaReset: any = null;
  resetExito               = false;
  resetError               = '';
  isProcesandoReset        = false;

  ngOnInit(): void {
    this.catalogoService.getMotivosCese().subscribe({
      next: (m: CatalogoSimple[]) => {
        // "Otro" siempre al final: es el descarte para lo que no encaja en
        // ningún motivo tipificado, no una opción más de la lista. Puesto
        // entre las demás, invita a elegirlo por comodidad y el catálogo
        // pierde sentido.
        this.motivosCese = [...m].sort((a, b) => {
          const aOtro = a.nombre.trim().toLowerCase() === 'otro';
          const bOtro = b.nombre.trim().toLowerCase() === 'otro';
          if (aOtro !== bOtro) return aOtro ? 1 : -1;
          return a.nombre.localeCompare(b.nombre, 'es');
        });
        this.cdr.detectChanges();
      }
    });
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
        // El texto se redacta AQUÍ, a partir de lo que el servidor
        // informa que cambió. Antes llegaba escrito desde el backend, de
        // modo que ajustar el tono o el formato obligaba a recompilar.
        this.mensajeCredencial = this.armarAvisoCredencial(res);
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
    this.detalleMotivoCese  = '';
    this.fechaCese          = fechaLocal(); // Hoy por defecto
    this.mostrarModalCese   = true;
    this.cdr.detectChanges();
  }

  cerrarModalCese() {
    this.mostrarModalCese   = false;
    this.trabajadorParaCese = null;
    this.motivoCese         = '';
    this.detalleMotivoCese  = '';
    this.fechaCese          = '';
    this.cdr.detectChanges();
  }

procesarCese() {
    if (!this.trabajadorParaCese) return;
    if (!this.fechaCese) {
      this.aviso.error('Debe seleccionar una fecha de cese.');
      return;
    }

    const id     = this.trabajadorParaCese.idTrabajador;
    // Se envía el nombre del catálogo tal cual: el backend lo resuelve por
    // coincidencia exacta. Cuando es "Otro", se adjunta el detalle escrito.
    const base   = this.motivoCese.trim();
    const motivo = this.requiereDetalle && this.detalleMotivoCese.trim()
      ? `${base}: ${this.detalleMotivoCese.trim()}`
      : base;

    this.isProcesandoModal = true;
    this.cdr.detectChanges();

    this.trabajadorService.cesarTrabajador(id, motivo, this.fechaCese).subscribe({
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
          const mensaje = mensajeError(err, 'Error al cesar al trabajador.');
          this.aviso.exito(mensaje);
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
    this.conservarPuesto               = true;
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

  /**
   * Reingreso. El puesto es OPCIONAL (RN-12): sin indicarlo, el backend
   * conserva el del registro anterior.
   *
   * El formulario lo exigía siempre, lo que obligaba a volver a elegir
   * área y puesto incluso cuando el trabajador volvía al mismo sitio.
   */
  procesarReingreso() {
    if (!this.trabajadorParaReingreso) return;

    const id = this.trabajadorParaReingreso.idTrabajador;
    const idPuesto: number | undefined = this.conservarPuesto || !this.puestoSeleccionadoReingreso
      ? undefined
      : Number(this.puestoSeleccionadoReingreso);

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
        this.resetError        = mensajeError(err, 'No se pudo resetear la contraseña.');
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
    this.cambiarPagina(this.page + 1);
  }

  paginaAnterior() {
    if (this.page > 0) {
      this.cambiarPagina(this.page - 1);
    }
  }

  /** Validator custom: edad mínima */
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

  /** Cambia los validators de nroDocumento según el tipo seleccionado */
  private actualizarValidacionDocumentoEdicion(tipo: string) {
    const ctrl = this.editForm.get('nroDocumento');
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

  /** Placeholder dinámico para el nro documento en edición */
  getPlaceholderDocumentoEdicion(): string {
    const tipo = this.editForm.get('docIdentidad')?.value;
    switch (tipo) {
      case 'DNI': return '8 dígitos numéricos';
      case 'CE': return '9-12 dígitos numéricos';
      case 'PASAPORTE': return '6-20 caracteres alfanuméricos';
      default: return '';
    }
  }


}