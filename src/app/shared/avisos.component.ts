import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvisoService } from './aviso.service';

/**
 * Pila de avisos de la aplicación.
 *
 * Se coloca una sola vez, en la plantilla del panel, y muestra lo que
 * cualquier pantalla envíe a través de AvisoService.
 */
@Component({
  selector: 'app-avisos',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="avisos-pila" *ngIf="svc.avisos().length > 0">
      <div *ngFor="let a of svc.avisos()"
           class="aviso"
           [class.aviso-exito]="a.tipo === 'exito'"
           [class.aviso-error]="a.tipo === 'error'"
           [class.aviso-info]="a.tipo === 'info'">

        <span class="aviso-icono">
          <ng-container [ngSwitch]="a.tipo">
            <svg *ngSwitchCase="'exito'" width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <svg *ngSwitchCase="'error'" width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <svg *ngSwitchDefault width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </ng-container>
        </span>

        <span class="aviso-texto">{{ a.texto }}</span>

        <button class="aviso-cerrar" (click)="svc.cerrar(a.id)" aria-label="Cerrar">✕</button>
      </div>
    </div>
  `,
  styles: [`
    .avisos-pila {
      position: fixed;
      top: 76px;
      right: 22px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: 9px;
      max-width: 400px;
    }
    .aviso {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 13px 15px;
      border-radius: 10px;
      border: 1px solid;
      background: #fff;
      box-shadow: 0 6px 20px rgba(15, 23, 42, .12);
      font-size: .87rem;
      line-height: 1.5;
      animation: entrar .18s ease-out;
    }
    @keyframes entrar {
      from { opacity: 0; transform: translateX(14px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .aviso-exito { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
    .aviso-error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .aviso-info  { border-color: #bfdbfe; background: #eff6ff; color: #1e40af; }

    .aviso-icono  { flex-shrink: 0; margin-top: 1px; }
    .aviso-texto  { flex: 1; }
    .aviso-cerrar {
      flex-shrink: 0;
      border: none;
      background: none;
      color: inherit;
      opacity: .55;
      cursor: pointer;
      font-size: .95rem;
      padding: 0 2px;
      line-height: 1;
    }
    .aviso-cerrar:hover { opacity: 1; }
  `]
})
export class AvisosComponent {
  svc = inject(AvisoService);
}
