import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { DashboardComponent } from './features/dashboard/dashboard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'marcado',
    loadComponent: () => import('./features/asistencia/marcado/marcado').then(m => m.MarcadoComponent)
  },

  // ── Selector de rol (para roles superiores a TRABAJADOR) ──
  {
    path: 'seleccionar-rol',
    canActivate: [authGuard],
    loadComponent: () => import('./features/role-selector/role-selector').then(m => m.RoleSelectorComponent)
  },

  // ── Portal del Trabajador (accesible por TODOS los roles) ─
  // Cada componente solo muestra datos del usuario autenticado
  {
    path: 'mi-portal',
    canActivate: [authGuard],
    loadComponent: () => import('./features/worker-dashboard/worker-dashboard').then(m => m.WorkerDashboardComponent),
    children: [
      {
        path: 'asistencia',
        loadComponent: () => import('./features/worker-dashboard/mi-asistencia/mi-asistencia').then(m => m.MiAsistenciaComponent)
      },
      {
        path: 'horario',
        loadComponent: () => import('./features/worker-dashboard/mi-horario/mi-horario').then(m => m.MiHorarioComponent)
      },
      {
        path: 'consolidado',
        loadComponent: () => import('./features/worker-dashboard/mi-consolidado/mi-consolidado').then(m => m.MiConsolidadoComponent)
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/worker-dashboard/mi-perfil/mi-perfil').then(m => m.MiPerfilComponent)
      },
      { path: '', redirectTo: 'asistencia', pathMatch: 'full' }
    ]
  },

  // ── Dashboard Administrativo (SUPERADMIN, ADMIN, JEFE, SUPERVISOR) ─
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'trabajadores',
        loadComponent: () => import('./features/trabajadores/trabajador-list/trabajador-list').then(m => m.TrabajadorListComponent)
      },
      {
        path: 'trabajadores/nuevo',
        loadComponent: () => import('./features/trabajadores/trabajador-form/trabajador-form').then(m => m.TrabajadorFormComponent)
      },
      {
        path: 'asistencias',
        loadComponent: () => import('./features/asistencia/asistencia-dia/asistencia-dia').then(m => m.AsistenciaDiaComponent)
      },
      {
        path: 'reporte',
        loadComponent: () => import('./features/asistencia/reporte-asistencia/reporte-asistencia').then(m => m.ReporteAsistenciaComponent)
      },
      {
        path: 'carnets',
        loadComponent: () => import('./features/carnets/carne-list/carne-list').then(m => m.CarneListComponent)
      },
      // Turnos vive ahora como pestaña dentro de Tablas Maestras, junto a
      // Tipos de Ausencia y Motivos de Cese. Se conserva la ruta como
      // redirección para no romper enlaces guardados.
      { path: 'turnos', redirectTo: 'maestros', pathMatch: 'full' },
      {
        path: 'estadisticas',
        loadComponent: () => import('./features/estadisticas/estadisticas').then(m => m.EstadisticasComponent)
      },
      {
        path: 'ausencias',
        loadComponent: () => import('./features/ausencias/ausencias').then(m => m.AusenciasComponent)
      },
      {
        path: 'parametros',
        loadComponent: () => import('./features/parametros/parametros').then(m => m.ParametrosComponent)
      },
      {
        path: 'feriados',
        loadComponent: () => import('./features/feriados/feriados').then(m => m.FeriadosComponent)
      },
      {
        path: 'esquemas-horario',
        loadComponent: () => import('./features/esquemas-horario/esquema-horario-list/esquema-horario-list').then(m => m.EsquemaHorarioListComponent)
      },
      {
        path: 'grupos',
        loadComponent: () => import('./features/grupos/grupo-list/grupo-list').then(m => m.GrupoListComponent)
      },
      {
        path: 'programacion',
        loadComponent: () => import('./features/programacion/programacion-semanal/programacion-semanal').then(m => m.ProgramacionSemanalComponent)
      },
      {
        path: 'maestros',
        loadComponent: () => import('./features/maestros/maestros').then(m => m.MaestrosComponent)
      },
      {
        path: 'auditoria',
        loadComponent: () => import('./features/auditoria/auditoria').then(m => m.AuditoriaComponent)
      },
      {
        path: 'revision-asistencias',
        loadComponent: () => import('./features/asistencia/revision-asistencia/revision-asistencia').then(m => m.RevisionAsistenciaComponent)
      },
      {
        path: 'consolidado',
        loadComponent: () => import('./features/consolidado/consolidado').then(m => m.ConsolidadoComponent)
      },
      {
        path: 'reporte-consolidado',
        loadComponent: () => import('./features/consolidado/reporte-consolidado/reporte-consolidado').then(m => m.ReporteConsolidadoComponent)
      },
      { path: '', redirectTo: 'asistencias', pathMatch: 'full' }
    ]
  }
];
