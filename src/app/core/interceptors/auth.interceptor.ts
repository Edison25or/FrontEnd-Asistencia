import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * Endpoints públicos que NUNCA deben llevar token.
 * Esto evita que un token almacenado en localStorage se exponga
 * en la pantalla de marcado (kiosco compartido).
 */
const PUBLIC_ENDPOINTS = [
  '/auth/login',
  '/auth/recuperar-password',
  '/asistencia/marcar',
  '/asistencia/en-planta-publica',
  '/maestros/generos',
  '/maestros/areas',
];

function isPublicRequest(url: string): boolean {
  return PUBLIC_ENDPOINTS.some(ep => url.includes(ep));
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('auth_token');
  const router = inject(Router);

  // 1. Endpoints públicos: NUNCA adjuntar token (seguridad de kiosco)
  if (isPublicRequest(req.url)) {
    return next(req);
  }

  // 2. Endpoints protegidos: adjuntar token si existe
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // 3. Manejar errores de autenticación
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        console.warn('Token vencido o inválido. Cerrando sesión...');
        localStorage.removeItem('auth_token');
        router.navigate(['/login']);
      }

      if (error.status === 403) {
        console.error('Error 403: Permisos insuficientes.');
      }

      return throwError(() => error);
    })
  );
};