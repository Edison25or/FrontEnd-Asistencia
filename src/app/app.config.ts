import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
// Importamos withInterceptors
import { provideHttpClient, withInterceptors } from '@angular/common/http'; 
// Importamos nuestro interceptor (verifica que la ruta coincida con donde lo guardaste)
import { authInterceptor } from './core/interceptors/auth.interceptor'; 

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // ¡Aquí encendemos el interceptor a nivel global!
    provideHttpClient(withInterceptors([authInterceptor])) 
  ]
};