import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-role-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './role-selector.html',
  styleUrl: './role-selector.css'
})
export class RoleSelectorComponent implements OnInit {

  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  userName = '';
  userRole = '';
  rolLabel = '';
  cargando = true;

  private readonly ROLE_LABELS: Record<string, string> = {
    'ROLE_SUPERADMIN': 'Súper Administrador',
    'ROLE_ADMIN':      'Administrador',
    'ROLE_JEFE':       'Jefe',
    'ROLE_SUPERVISOR': 'Supervisor',
  };

  ngOnInit() {
    this.authService.getUsuarioInfo().subscribe({
      next: (info) => {
        this.userName = info.nombre;
        this.userRole = info.rol;
        this.rolLabel = this.ROLE_LABELS[info.rol] ?? info.rol;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.userRole = this.authService.getRolUsuario() ?? '';
        this.rolLabel = this.ROLE_LABELS[this.userRole] ?? this.userRole;
        this.userName = 'Usuario';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  accederComoRol() {
    this.router.navigate(['/dashboard']);
  }

  accederComoTrabajador() {
    this.router.navigate(['/mi-portal']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
