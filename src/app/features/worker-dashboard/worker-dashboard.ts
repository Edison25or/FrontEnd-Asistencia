import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
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
  selector: 'app-worker-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './worker-dashboard.html',
  styleUrl: './worker-dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkerDashboardComponent implements OnInit {

  private authService = inject(AuthService);
  private router      = inject(Router);
  private cdr         = inject(ChangeDetectorRef);
  private fb          = inject(FormBuilder);

  userName  = '';
  userRole  = '';
  userEmail = '';
  cargando  = true;
  tieneRolSuperior = false; // true si puede volver al selector de rol

  // ── Modal cambiar contraseña ──────────────────────────────
  mostrarModalPassword  = false;
  esCambioObligatorio   = false;
  passwordError         = '';
  passwordExito         = false;
  passwordCargando      = false;
  showActual = false;
  showNueva  = false;
  showConfirmar = false;

  passwordForm: FormGroup = this.fb.group({
    passwordActual: ['', Validators.required],
    passwordNueva:  ['', [Validators.required, Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;:,.<>?])[^\s]{10,20}$/), noIgualAActual]],
    confirmar:      ['', Validators.required]
  }, { validators: confirmarIgual });

  // ── Menú avatar ───────────────────────────────────────────
  menuAbierto = false;
  toggleMenu() { this.menuAbierto = !this.menuAbierto; this.cdr.markForCheck(); }
  cerrarMenu() { this.menuAbierto = false; this.cdr.markForCheck(); }

  ngOnInit() {
    const navState = history.state;
    const forzar = navState?.['forzarCambioPassword'] === true;

    if (forzar) {
      this.abrirModalPassword(true);
    }

    this.authService.getUsuarioInfo().subscribe({
      next: (info) => {
        this.userName  = info.nombre;
        this.userRole  = info.rol;
        this.userEmail = info.email;
        this.cargando  = false;
        this.tieneRolSuperior = info.rol !== 'ROLE_TRABAJADOR';

        if (!forzar && info.debeCambiarPassword) {
          this.abrirModalPassword(true);
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.userName = 'Usuario';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  volverASelector() {
    this.router.navigate(['/seleccionar-rol']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // ── Modal password ────────────────────────────────────────
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
        this.passwordExito       = true;
        this.passwordCargando    = false;
        this.esCambioObligatorio = false;
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
}
