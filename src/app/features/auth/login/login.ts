import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {

  private fb          = inject(FormBuilder);
  private authService = inject(AuthService);
  private cdr         = inject(ChangeDetectorRef);
  private router      = inject(Router);

  // ── Login ─────────────────────────────────────────────────
  showPassword = false;
  errorMessage = '';
  loginSuccess = false;
  isLoading    = false;

  loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  togglePasswordVisibility() { this.showPassword = !this.showPassword; }

  onSubmit() {
    if (this.loginForm.invalid) return;
    this.isLoading = true;

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.authService.getUsuarioInfo().subscribe({
          next: (info) => {
            this.loginSuccess = true;
            this.isLoading    = false;
            this.errorMessage = '';
            this.cdr.detectChanges();

            setTimeout(() => {
              const destino = this.resolverDestino(info.rol, info.debeCambiarPassword);
              this.router.navigate([destino.ruta], { state: destino.state });
            }, 2500);
          },
          error: () => {
            this.loginSuccess = true;
            this.isLoading    = false;
            this.cdr.detectChanges();
            setTimeout(() => this.router.navigate(['/seleccionar-rol']), 2500);
          }
        });
      },
      error: () => {
        this.errorMessage = 'Correo o contraseña incorrectos.';
        this.isLoading    = false;
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Determina a dónde redirigir después del login según rol y estado de contraseña.
   *
   * Flujo:
   * - TRABAJADOR → mi-portal (con flag de contraseña si aplica)
   * - Otros roles → seleccionar-rol (con flag de contraseña si aplica)
   *   - Si debe cambiar contraseña, el destino final maneja el modal obligatorio
   */
  private resolverDestino(rol: string, debeCambiarPassword: boolean): { ruta: string; state: any } {
    if (rol === 'ROLE_TRABAJADOR') {
      return {
        ruta: '/mi-portal',
        state: debeCambiarPassword ? { forzarCambioPassword: true } : {}
      };
    }

    // Roles superiores: si debe cambiar contraseña, ir directo al portal del trabajador
    // (el modal obligatorio se abrirá ahí), luego podrán elegir vista
    if (debeCambiarPassword) {
      return {
        ruta: '/mi-portal',
        state: { forzarCambioPassword: true }
      };
    }

    return { ruta: '/seleccionar-rol', state: {} };
  }

  // ── Modal informativo "¿Olvidaste tu clave?" ───────────────
  mostrarModalRecuperar = false;
  abrirModalRecuperar()  { this.mostrarModalRecuperar = true;  }
  cerrarModalRecuperar() { this.mostrarModalRecuperar = false; }
}