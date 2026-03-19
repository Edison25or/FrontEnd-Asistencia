import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth'; // Asegúrate de que la ruta coincida con tu servicio

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verificamos si existe el token en el localStorage
  if (authService.getToken()) {
    return true; // Le damos luz verde, puede pasar
  } else {
    // Si no tiene token, lo pateamos de vuelta al login
    router.navigate(['/login']);
    return false;
  }
};