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
            // Bloquear acceso a trabajadores sin rol de gestión
            if (info.rol === 'ROLE_TRABAJADOR') {
              this.authService.logout();
              this.errorMessage = 'No tienes permisos para acceder al sistema. Contacta al Administrador.';
              this.isLoading    = false;
              this.cdr.detectChanges();
              return;
            }

            this.loginSuccess = true;
            this.isLoading    = false;
            this.errorMessage = '';
            this.cdr.detectChanges();
            setTimeout(() => {
              if (info.debeCambiarPassword) {
                this.router.navigate(['/dashboard'], { state: { forzarCambioPassword: true } });
              } else {
                this.router.navigate(['/dashboard']);
              }
            }, 2500);
          },
          error: () => {
            this.loginSuccess = true;
            this.isLoading    = false;
            this.cdr.detectChanges();
            setTimeout(() => this.router.navigate(['/dashboard']), 2500);
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

  // ── Modal informativo "¿Olvidaste tu clave?" ───────────────
  mostrarModalRecuperar = false;
  abrirModalRecuperar()  { this.mostrarModalRecuperar = true;  }
  cerrarModalRecuperar() { this.mostrarModalRecuperar = false; }
}