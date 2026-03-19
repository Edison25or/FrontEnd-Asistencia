import { TestBed } from '@angular/core/testing';

// 1. Cambiamos 'Auth' por 'AuthService' (que es el nombre real de tu clase)
import { AuthService } from './auth';

describe('AuthService', () => {
  let service: AuthService; // 2. Actualizamos el tipo de dato

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService); // 3. Inyectamos la clase correcta
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});