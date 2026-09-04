import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GrupoService } from '../../../core/services/grupo.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { AuthService } from '../../../core/services/auth';
import { MaestrosService } from '../../../core/services/maestros.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-grupo-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './grupo-list.html',
  styleUrl:    './grupo-list.css'
})
export class GrupoListComponent implements OnInit {

  private grupoService      = inject(GrupoService);
  private trabajadorService = inject(TrabajadorService);
  private authService       = inject(AuthService);
  private maestrosService   = inject(MaestrosService);
  private fb                = inject(FormBuilder);
  private cdr               = inject(ChangeDetectorRef);

  grupos: any[]       = [];
  trabajadores: any[] = [];
  areas: any[]        = [];
  isLoading           = true;
  rolUsuario          = '';

  // ── Modal crear/editar ────────────────────────────────────
  mostrarModal       = false;
  isProcesando       = false;
  modoEdicion        = false;
  grupoEditandoId: number | null = null;
  errorModal         = '';
  grupoForm!: FormGroup;

  // ── Paneles (sin drag & drop) ─────────────────────────────
  terminoBusqueda    = '';
  panelDisponibles:  any[] = [];
  panelEnGrupo:      any[] = [];

  // ── Modal detalle ─────────────────────────────────────────
  mostrarDetalle  = false;
  grupoDetalle: any = null;

  // ── Modal eliminar ────────────────────────────────────────
  mostrarModalEliminar   = false;
  grupoParaEliminar: any = null;

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit() {
    this.rolUsuario = this.authService.getRolUsuario() || '';
    this.initForm();
    this.cargarTodo();
  }

  initForm() {
    this.grupoForm = this.fb.group({
      nombre:      ['', [Validators.required, Validators.maxLength(50)]],
      descripcion: ['', Validators.maxLength(150)],
      // Obligatoria: todos los miembros de un grupo deben pertenecer a la
      // misma área (RN-20). Sin este campo el backend rechaza el alta.
      idArea:      [null, Validators.required]
    });
  }

  // Carga grupos y trabajadores en paralelo para tener ambos antes de abrir modales
  cargarTodo() {
    this.isLoading = true;
    forkJoin({
      grupos:       this.grupoService.getAll(),
      trabajadores: this.trabajadorService.getTrabajadores(0, 500),
      areas:        this.maestrosService.getAreas()
    }).subscribe({
      next: (res: any) => {
        this.grupos       = res.grupos;
        this.trabajadores = res.trabajadores.content || res.trabajadores;
        this.areas        = res.areas;
        this.isLoading    = false;
        this.cdr.detectChanges();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  // ── IDs ocupados calculados desde la lista de grupos ──────
  // Más confiable que depender del campo grupoActualId del backend.
  private getIdsOcupados(excluirGrupoId: number | null): Set<number> {
    const ocupados = new Set<number>();
    for (const g of this.grupos) {
      if (excluirGrupoId !== null && g.idGrupo === excluirGrupoId) continue;
      for (const t of (g.trabajadores || [])) {
        ocupados.add(t.idTrabajador);
      }
    }
    return ocupados;
  }

  /**
   * Construye los dos paneles.
   *
   * Los disponibles se filtran además por ÁREA (RN-20): un grupo es de una
   * sola área, y el backend rechaza el alta si algún miembro es de otra.
   * Filtrar aquí evita ofrecer a alguien que el servidor va a rechazar.
   */
  private construirPaneles(idsEnGrupo: Set<number>, excluirGrupoId: number | null) {
    this.terminoBusqueda = '';
    const idsOcupados    = this.getIdsOcupados(excluirGrupoId);
    const idArea         = this.grupoForm.get('idArea')?.value;

    this.panelEnGrupo     = this.trabajadores.filter(t => idsEnGrupo.has(t.idTrabajador));
    this.panelDisponibles = this.trabajadores.filter(t =>
      !idsEnGrupo.has(t.idTrabajador)
      && !idsOcupados.has(t.idTrabajador)
      && (!idArea || this.areaDe(t) === idArea)
    );
    this.cdr.detectChanges();
  }

  /** Área del trabajador, vía su puesto. */
  private areaDe(t: any): number | null {
    return t?.idArea ?? t?.puesto?.area?.idArea ?? t?.area?.idArea ?? null;
  }

  /**
   * Al cambiar el área se rehacen los paneles: los que ya estaban
   * seleccionados y no pertenecen a la nueva área vuelven a disponibles.
   */
  onAreaChange() {
    const idArea = this.grupoForm.get('idArea')?.value;
    const sobran = this.panelEnGrupo.filter(t => this.areaDe(t) !== idArea);
    if (sobran.length > 0) {
      this.panelEnGrupo = this.panelEnGrupo.filter(t => this.areaDe(t) === idArea);
    }
    const ids = new Set<number>(this.panelEnGrupo.map(t => t.idTrabajador));
    this.construirPaneles(ids, this.grupoEditandoId);
  }

  // ── Getters filtrados para búsqueda ───────────────────────
  get disponiblesFiltrados(): any[] {
    const q = this.terminoBusqueda.toLowerCase();
    if (!q) return this.panelDisponibles;
    return this.panelDisponibles.filter(t =>
      t.nombreCompleto?.toLowerCase().includes(q) || t.nroDocumento?.includes(q)
    );
  }

  get enGrupoFiltrados(): any[] {
    const q = this.terminoBusqueda.toLowerCase();
    if (!q) return this.panelEnGrupo;
    return this.panelEnGrupo.filter(t =>
      t.nombreCompleto?.toLowerCase().includes(q) || t.nroDocumento?.includes(q)
    );
  }

  // ── Mover entre paneles (solo click) ─────────────────────
  moverAGrupo(item: any) {
    this.panelDisponibles = this.panelDisponibles.filter(t => t.idTrabajador !== item.idTrabajador);
    this.panelEnGrupo     = [...this.panelEnGrupo, item];
    this.cdr.detectChanges();
  }

  moverADisponibles(item: any) {
    this.panelEnGrupo     = this.panelEnGrupo.filter(t => t.idTrabajador !== item.idTrabajador);
    this.panelDisponibles = [...this.panelDisponibles, item];
    this.cdr.detectChanges();
  }

  limpiarGrupo() {
    this.panelDisponibles = [...this.panelDisponibles, ...this.panelEnGrupo];
    this.panelEnGrupo     = [];
    this.cdr.detectChanges();
  }

  // ── Modales ───────────────────────────────────────────────
  abrirModalNuevo() {
    this.modoEdicion     = false;
    this.grupoEditandoId = null;
    this.errorModal      = '';
    this.grupoForm.reset({ nombre: '', descripcion: '', idArea: null });
    this.construirPaneles(new Set(), null);
    this.mostrarModal = true;
  }

  abrirModalEditar(grupo: any) {
    this.modoEdicion     = true;
    this.grupoEditandoId = grupo.idGrupo;
    this.errorModal      = '';
    this.grupoForm.patchValue({
      nombre: grupo.nombre, descripcion: grupo.descripcion, idArea: grupo.idArea });
    const idsActuales = new Set<number>(grupo.trabajadores?.map((t: any) => t.idTrabajador) || []);
    this.construirPaneles(idsActuales, grupo.idGrupo);
    this.mostrarModal = true;
  }

  cerrarModal() { this.mostrarModal = false; this.errorModal = ''; }

  guardar() {
    if (this.grupoForm.invalid) { this.grupoForm.markAllAsTouched(); return; }
    this.isProcesando = true;
    this.errorModal   = '';

    const payload = {
      ...this.grupoForm.value,
      idsTrabajadores: this.panelEnGrupo.map((t: any) => t.idTrabajador)
    };

    const op = this.modoEdicion
      ? this.grupoService.actualizar(this.grupoEditandoId!, payload)
      : this.grupoService.crear(payload);

    op.subscribe({
      next: () => {
        this.isProcesando = false;
        this.cerrarModal();
        this.cargarTodo();
      },
      error: (err: any) => {
        this.errorModal   = err.error?.message || 'Error al guardar.';
        this.isProcesando = false;
        this.cdr.detectChanges();
      }
    });
  }

  verDetalle(grupo: any) { this.grupoDetalle = grupo; this.mostrarDetalle = true; }
  cerrarDetalle() {
    this.mostrarDetalle = false;
    setTimeout(() => { this.grupoDetalle = null; this.cdr.detectChanges(); }, 200);
  }

  confirmarEliminar(grupo: any) { this.grupoParaEliminar = grupo; this.mostrarModalEliminar = true; }
  cerrarModalEliminar() { this.mostrarModalEliminar = false; this.grupoParaEliminar = null; }

  eliminar() {
    if (!this.grupoParaEliminar) return;
    this.isProcesando = true;
    this.grupoService.eliminar(this.grupoParaEliminar.idGrupo).subscribe({
      next: () => {
        this.isProcesando = false;
        this.cerrarModalEliminar();
        this.cargarTodo();
      },
      error: (err: any) => {
        this.isProcesando = false;
        this.cdr.detectChanges();
        alert(err.error?.message || 'No se pudo eliminar.');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  esSuperAdmin()     { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  esAdmin()          { return this.rolUsuario === 'ROLE_ADMIN' || this.rolUsuario === 'ROLE_JEFE' || this.esSuperAdmin(); }
  esSoloSupervisor() { return this.rolUsuario === 'ROLE_SUPERVISOR' && !this.esAdmin(); }
  getPreviewMiembros(trabajadores: any[]): any[] { return trabajadores?.slice(0, 5) || []; }

  // "Juan Carlos Pérez López" → "Juan Pérez"
  primerNombreApellido(nombreCompleto: string): string {
    if (!nombreCompleto) return '';
    const partes = nombreCompleto.trim().split(/\s+/);
    // nombreCompleto viene como "pNombre sNombre aPaterno aMaterno"
    // queremos solo el primer token y el tercero (aPaterno)
    const primer  = partes[0] || '';
    const paterno = partes.length >= 3 ? partes[partes.length - 2] : (partes[1] || '');
    return `${primer} ${paterno}`.trim();
  }
}