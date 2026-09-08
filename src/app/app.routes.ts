import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
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
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_JEFE'])],
        loadComponent: () => import('./features/asistencia/reporte-asistencia/reporte-asistencia').then(m => m.ReporteAsistenciaComponent)
      },
      {
        path: 'carnets',
        // CU-11 los asigna al area administrativa.
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN'])],
        loadComponent: () => import('./features/carnets/carne-list/carne-list').then(m => m.CarneListComponent)
      },
      // Turnos vive ahora como pestaña dentro de Tablas Maestras, junto a
      // Tipos de Ausencia y Motivos de Cese. Se conserva la ruta como
      // redirección para no romper enlaces guardados.
      { path: 'turnos', redirectTo: 'maestros', pathMatch: 'full' },
      {
        path: 'estadisticas',
        // Ocultar la opción del menú no basta: quien conozca la ruta
        // puede escribirla en la barra de direcciones. La guarda cierra
        // esa vía, y el @PreAuthorize del servidor cierra la de llamar
        // al punto de acceso directamente.
        // Los roles se comparan con el valor del token, no con el nombre
        // que muestra el menú: son cadenas distintas y mezclarlas dejaría
        // la guarda rechazando a todos.
        //
        // El Jefe queda fuera por ahora, como el Supervisor. El servidor
        // sigue admitiéndolo acotado a su área, así que devolverle el
        // acceso es añadir ROLE_JEFE aquí y en el menú.
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN'])],
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
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_JEFE'])],
        loadComponent: () => import('./features/esquemas-horario/esquema-horario-list/esquema-horario-list').then(m => m.EsquemaHorarioListComponent)
      },
      {
        path: 'grupos',
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_JEFE'])],
        loadComponent: () => import('./features/grupos/grupo-list/grupo-list').then(m => m.GrupoListComponent)
      },
      {
        path: 'programacion',
        canActivate: [rolGuard(['ROLE_SUPERADMIN', 'ROLE_ADMIN', 'ROLE_JEFE'])],
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
      // La pantalla de inicio depende del rol.
      //
      // Estadísticas da el estado general del período de un vistazo, pero
      // el Supervisor no accede a ella (CU-22): a él le corresponde el
      // listado del día, que es su herramienta de turno. Redirigirlo a
      // una pantalla vedada lo dejaría ante un rechazo nada más entrar.
      // redirectTo acepta una función, que se evalúa en cada navegación.
      // Con un valor fijo, el destino quedaría congelado con el rol de
      // quien cargó la aplicación primero.
      { path: '', pathMatch: 'full', redirectTo: () => inicioSegunRol() }
    ]
  }
];


/**
 * Guarda de ruta por rol.
 *
 * Devuelve una función que solo permite continuar si el rol del token
 * figura entre los admitidos. Cuando no lo está, redirige al inicio que
 * le corresponde en lugar de dejar la pantalla en blanco.
 *
 * El rol se lee del token y no de localStorage: es la misma fuente que
 * usa el resto de la aplicación, y guardarlo aparte abriría la puerta a
 * que ambos valores dejaran de coincidir.
 */
function rolGuard(rolesPermitidos: string[]) {
  return () => {
    const router = inject(Router);
    const rol = leerRol();

    if (rolesPermitidos.includes(rol)) return true;
    return router.createUrlTree(['/dashboard', inicioSegunRol()]);
  };
}

/** Rol del token de sesión, tal como lo emite el backend. */
function leerRol(): string {
  const token = localStorage.getItem('auth_token');
  if (!token) return '';
  try {
    return JSON.parse(atob(token.split('.')[1])).rol || '';
  } catch {
    return '';
  }
}

/**
 * Pantalla de inicio que corresponde al rol.
 *
 * El Supervisor no accede a Estadísticas (CU-22), de modo que entra
 * directamente al listado del día, que es su herramienta de turno.
 */
function inicioSegunRol(): string {
  const rol = leerRol();
  // Quien no accede a Estadísticas entra al listado del día, que es la
  // pantalla operativa. Redirigirlo a una vedada lo dejaría ante un
  // rechazo nada más iniciar sesión.
  return (rol === 'ROLE_SUPERVISOR' || rol === 'ROLE_JEFE')
    ? 'asistencias' : 'estadisticas';
}
