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
        // El servidor ahora exige cambiar la contraseña temporal antes de
        // usar el sistema (RN-07): responde 403 con este código a todo lo
        // que no sea consultar el propio perfil o enviar la contraseña
        // nueva. Antes la restricción vivía solo en la interfaz.
        //
        // Se lleva al portal del trabajador, que es donde el flujo de
        // inicio de sesión abre el modal obligatorio. La guarda sobre la
        // ruta actual evita el bucle: estando ya en el portal, sus propias
        // cargas de datos devolverán 403 y no deben volver a navegar.
        if (error.error?.codigo === 'PASSWORD_TEMPORAL') {
          if (!router.url.startsWith('/mi-portal')) {
            router.navigate(['/mi-portal'], { state: { forzarCambioPassword: true } });
          }
        } else {
          console.error('Error 403: Permisos insuficientes.');
        }
      }

      return throwError(() => error);
    })
  );
};