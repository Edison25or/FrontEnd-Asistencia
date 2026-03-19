import { Component, OnInit, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../core/services/auth';

function noIgualAActual(control: AbstractControl): ValidationErrors | null {
  const actual = control.parent?.get('passwordActual')?.value;
  return control.value && control.value === actual ? { igualAActual: true } : null;
}

function confirmarIgual(group: AbstractControl): ValidationErrors | null {
  const nueva    = group.get('passwordNueva')?.value;
  const confirma = group.get('confirmar')?.value;
  return nueva && confirma && nueva !== confirma ? { noCoincide: true } : null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private cdr         = inject(ChangeDetectorRef);
  private fb          = inject(FormBuilder);

  // ── Datos del usuario ─────────────────────────────────────
  userName:  string  = '';
  userRole:  string  = '';
  userEmail: string  = '';
  cargando:  boolean = true;

  // ── Dropdown avatar ───────────────────────────────────────
  menuAbierto = false;
  toggleMenu() { this.menuAbierto = !this.menuAbierto; this.cdr.markForCheck(); }
  cerrarMenu() { this.menuAbierto = false; this.cdr.markForCheck(); }

  // ── Modal cambiar contraseña ──────────────────────────────
  mostrarModalPassword  = false;
  esCambioObligatorio   = false;   // ← true = no se puede cerrar el modal
  passwordError         = '';
  passwordExito         = false;
  passwordCargando      = false;
  showActual            = false;
  showNueva             = false;
  showConfirmar         = false;

  // ── Control de Menú Acordeón (NUEVO) ──────────────────────
  secciones = {
    asistencia: true,
    trabajadores: true,
    horarios: true,
    configuracion: true
  };

  toggleSeccion(seccion: 'asistencia' | 'trabajadores' | 'horarios' | 'configuracion') {
    this.secciones[seccion] = !this.secciones[seccion];
    this.cdr.markForCheck();
  }

  // Punto 5: regex contraseña segura (10-20 chars, may, min, número, especial, sin espacios)
  private readonly PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;:,.<>?])[^\s]{10,20}$/;

  passwordForm: FormGroup = this.fb.group({
    passwordActual: ['', Validators.required],
    passwordNueva:  ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;:,.<>?])[^\s]{10,20}$/), noIgualAActual]],
    confirmar:      ['', Validators.required]
  }, { validators: confirmarIgual });


  abrirModalPassword(obligatorio = false) {
    this.cerrarMenu();
    this.esCambioObligatorio  = obligatorio;
    this.mostrarModalPassword = true;
    this.passwordError        = '';
    this.passwordExito        = false;
    this.passwordCargando     = false;
    this.passwordForm.reset();
    this.cdr.detectChanges();
  }

  // Solo se puede cerrar si NO es obligatorio
  cerrarModalPassword() {
    if (this.esCambioObligatorio) return;
    this.mostrarModalPassword = false;
    this.cdr.markForCheck();
  }

  guardarPassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }
    this.passwordCargando = true;
    this.passwordError    = '';

    const { passwordActual, passwordNueva } = this.passwordForm.value;

    this.authService.cambiarPassword(passwordActual, passwordNueva).subscribe({
      next: () => {
        this.passwordExito        = true;
        this.passwordCargando     = false;
        this.esCambioObligatorio  = false;  // ya no es obligatorio después de cambiar
        this.cdr.markForCheck();
        setTimeout(() => {
          this.mostrarModalPassword = false;
          this.cdr.markForCheck();
        }, 2000);
      },
      error: (err) => {
        this.passwordError    = err.error?.message || 'Error al cambiar la contraseña.';
        this.passwordCargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit(): void {
    // Leer flag enviado desde el login via navigation state
    const navState = history.state;
    const forzar   = navState?.['forzarCambioPassword'] === true;

    if (forzar) {
      this.abrirModalPassword(true);
    }

    this.authService.getUsuarioInfo().subscribe({
      next: (info) => {
        this.userName  = info.nombre;
        this.userRole  = this.formatearRol(info.rol);
        this.userEmail = info.email;
        this.cargando  = false;

        // Doble seguro: si el flag viene del backend y no vino por state
        if (!forzar && info.debeCambiarPassword) {
          this.abrirModalPassword(true);
        }

        this.cdr.detectChanges();
      },
      error: () => {
        this.userRole = this.formatearRol(this.authService.getRolUsuario() ?? '');
        this.userName = 'Usuario';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private formatearRol(rol: string): string {
    const mapa: Record<string, string> = {
      'ROLE_SUPERADMIN': 'Súper Administrador',
      'ROLE_ADMIN':      'Administrador',
      'ROLE_SUPERVISOR': 'Supervisor',
      'ROLE_TRABAJADOR': 'Trabajador',
    };
    return mapa[rol] ?? rol;
  }
}