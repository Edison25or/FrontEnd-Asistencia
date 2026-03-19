import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface LoginRequest  { username: string; password: string; }
export interface LoginResponse { token: string; }
export interface UsuarioInfo   { nombre: string; rol: string; email: string; debeCambiarPassword: boolean; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http    = inject(HttpClient);
  private apiUrl  = 'http://localhost:8080/api/auth';
  private baseUrl = 'http://localhost:8080/api';

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(res => localStorage.setItem('auth_token', res.token))
    );
  }

  recuperarPassword(email: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/recuperar-password`, { email }, { responseType: 'text' });
  }

  cambiarPassword(passwordActual: string, passwordNueva: string): Observable<string> {
    return this.http.put(
      `${this.baseUrl}/usuarios/me/password`,
      { passwordActual, passwordNueva },
      { responseType: 'text' }
    );
  }

  getToken(): string | null { return localStorage.getItem('auth_token'); }
  logout(): void { localStorage.removeItem('auth_token'); }

  // ✅ Corregido: usa baseUrl, no apiUrl
  getUsuarioInfo(): Observable<UsuarioInfo> {
    return this.http.get<UsuarioInfo>(`${this.baseUrl}/usuarios/me`);
  }

  getRolUsuario(): string | null {
    const token = this.getToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).rol || null; }
    catch { return null; }
  }
}