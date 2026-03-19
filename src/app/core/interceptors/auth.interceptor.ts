import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('auth_token');
  const router = inject(Router);

  // 1. REGLA DE ORO: Si la petición es para hacer login, la dejamos pasar LIMPIA (sin token)
  if (req.url.includes('/login')) {
    return next(req);
  }

  // 2. Si no es login y tenemos token, se lo inyectamos
  let authReq = req;
  if (token) {
    authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
  }

  // 3. Enviamos la petición y "escuchamos" la respuesta del backend
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si Spring Boot nos dice 401 (No Autorizado) o 403 (Prohibido)
      // POR ESTO:
      if (error.status === 401) {
        console.warn('El token ha vencido o es inválido. Cerrando sesión automáticamente...');
        localStorage.removeItem('token');
        router.navigate(['/login']);
      }
      
      // Opcional: Puedes agregar un bloque para el 403 y solo mostrar un mensaje en consola
      if (error.status === 403) {
         console.error('Error 403: No tienes los permisos suficientes para ver esta información.');
      }
      
      // Dejamos que el error siga su camino por si otro componente quiere leerlo
      return throwError(() => error);
    })
  );
};