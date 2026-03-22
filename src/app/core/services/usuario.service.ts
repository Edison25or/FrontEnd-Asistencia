import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UsuarioService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:8080/api/usuarios';

  // Conecta con el endpoint: PUT /api/usuarios/trabajador/{idTrabajador}/rol
  cambiarRol(idTrabajador: number, nuevoRol: string): Observable<any> {
    // El backend espera recibir un mapa/JSON tipo {"rol": "ROLE_ADMIN"} y devuelve un String
    return this.http.put(`${this.apiUrl}/trabajador/${idTrabajador}/rol`, 
      { rol: nuevoRol }, 
      { responseType: 'text' } 
    );
  }
}