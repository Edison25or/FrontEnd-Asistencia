import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProgramacionService } from '../../../core/services/programacion.service';
import { GrupoService } from '../../../core/services/grupo.service';
import { EsquemaHorarioService } from '../../../core/services/esquema-horario.service';
import { TrabajadorService } from '../../../core/services/trabajador.service';
import { AuthService } from '../../../core/services/auth';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-programacion-semanal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './programacion-semanal.html',
  styleUrl:    './programacion-semanal.css'
})
export class ProgramacionSemanalComponent implements OnInit {

  private programacionService = inject(ProgramacionService);
  private authService         = inject(AuthService);
  private grupoService        = inject(GrupoService);
  private esquemaService      = inject(EsquemaHorarioService);
  private trabajadorService   = inject(TrabajadorService);
  private cdr                 = inject(ChangeDetectorRef);

  programaciones: any[] = [];
  grupos:         any[] = [];
  esquemas:       any[] = [];
  trabajadores:   any[] = [];   // todos los trabajadores activos

  semanaSeleccionada = '';
  isLoading          = false;

  /** Rol y área del usuario, para acotar el alcance del Jefe. */
  rolUsuario = '';
  areaPropia = '';
  isProcesando       = false;
  errorGlobal        = '';

  // ── Drag & Drop ───────────────────────────────────────────
  draggingGrupo: any         = null;
  dropTargetId:  number|null = null;

  // ── Modales ───────────────────────────────────────────────
  mostrarResultado   = false;
  resultadoBulk: any = null;
  esquemaNombreBulk  = '';

  mostrarMiembros    = false;
  grupoMiembros: any = null;

  mostrarModalEliminarGrupo = false;
  grupoParaQuitar: any      = null;
  esquemaParaQuitar: any    = null;

  // Modal advertencia: trabajadores sin grupo
  mostrarAdvert     = false;
  trabSinGrupo: any[] = [];

  // Modal confirmación final de semana
  mostrarConfirmacion       = false;
  resumenConfirmacion: { esquema: string; grupos: string[]; total: number }[] = [];
  // Resultado del backend tras confirmar
  resultadoConfirmacion: any = null;
  mostrarResultadoConf      = false;

  readonly DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  ngOnInit() {
    this.semanaSeleccionada = this.getSabadoSemanaActual();
    this.cargarTodo();
  }

  cargarTodo() {
    this.isLoading = true;
    forkJoin({
      grupos:       this.grupoService.getAll(),
      esquemas:     this.esquemaService.getAll(),
      trabajadores: this.trabajadorService.getTrabajadores(0, 500)
    }).subscribe({
      next: res => {
        this.grupos       = res.grupos;
        this.esquemas     = res.esquemas;
        this.trabajadores = res.trabajadores.content || res.trabajadores;

        // ============================================================
        // ALCANCE DEL JEFE
        // ============================================================
        // El Jefe asigna los horarios de SU area (CU-14, RN-01). Sin este
        // filtro veia los grupos de Calidad y Limpieza, podia moverlos de
        // esquema, y al confirmar la semana recibia un aviso sobre
        // personal de Administracion y Comercial que no le corresponde.
        this.rolUsuario = this.authService.getRolUsuario() || '';

        if (this.rolUsuario === 'ROLE_JEFE') {
          const idPropio = this.authService.getIdTrabajador();
          const yo = this.trabajadores.find((t: any) =>
            String(t.idTrabajador) === String(idPropio));
          this.areaPropia = yo?.areaNombre ?? '';

          if (this.areaPropia) {
            this.grupos = this.grupos.filter((g: any) =>
              g.areaNombre === this.areaPropia);
            this.trabajadores = this.trabajadores.filter((t: any) =>
              t.areaNombre === this.areaPropia);
          }
        }

        this.isLoading    = false;
        this.cargarProgramaciones();
      },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  cargarProgramaciones() {
    const obs = this.semanaSeleccionada
      ? this.programacionService.getBySemana(this.semanaSeleccionada)
      : this.programacionService.getAll();
    obs.subscribe({
      next: d  => { this.programaciones = d; this.cdr.detectChanges(); },
      error: () => { this.cdr.detectChanges(); }
    });
  }

  cambiarSemana() { this.cargarProgramaciones(); }

  // ── Derivaciones de datos ─────────────────────────────────

  /** Programaciones de un esquema en la semana activa */
  getProgramacionesByEsquema(idEsquema: number): any[] {
    return this.programaciones.filter(p => p.idEsquema === idEsquema);
  }

  /**
   * Grupos asignados a un esquema esta semana, reconstruidos
   * desde los snapshots guardados en cada programación.
   * Esto garantiza que la tarjeta muestre el nombre correcto
   * aunque el grupo haya cambiado o sido eliminado después.
   */
  getGruposDeEsquema(idEsquema: number): any[] {
    const progs = this.getProgramacionesByEsquema(idEsquema);

    // Agrupar por grupoIdSnapshot - cada grupo único forma una tarjeta
    const mapaGrupos = new Map<string, any>();
    for (const p of progs) {
      const key = p.grupoIdSnapshot != null
        ? `grupo_${p.grupoIdSnapshot}`
        : `individual_${p.idTrabajador}`;

      if (!mapaGrupos.has(key)) {
        mapaGrupos.set(key, {
          idGrupo:     p.grupoIdSnapshot,
          nombre:      p.grupoNombreSnapshot || 'Individual',
          esIndividual: p.grupoIdSnapshot == null,
          programaciones: []
        });
      }
      mapaGrupos.get(key).programaciones.push(p);
    }

    return Array.from(mapaGrupos.values());
  }

  /**
   * Grupos sin ningún miembro asignado en la semana activa
   * (ninguno de sus trabajadores aparece en programaciones de esta semana)
   */
  getGruposSinAsignar(): any[] {
    const todosAsig = new Set(this.programaciones.map(p => p.idTrabajador));
    return this.grupos.filter(g =>
      g.totalTrabajadores > 0 &&
      !g.trabajadores?.some((t: any) => todosAsig.has(t.idTrabajador))
    );
  }

  /** Trabajadores activos que no pertenecen a ningún grupo */
  getTrabajadoresSinGrupo(): any[] {
    const idsConGrupo = new Set<number>();
    for (const g of this.grupos) {
      for (const t of (g.trabajadores || [])) idsConGrupo.add(t.idTrabajador);
    }
    return this.trabajadores.filter(t => !idsConGrupo.has(t.idTrabajador));
  }

  /** Devuelve true si la semana ya terminó (solo lectura) */
  esSemanaPassada(): boolean {
    if (!this.semanaSeleccionada) return false;
    const [y, m, d] = this.semanaSeleccionada.split('-').map(Number);
    const fin = new Date(y, m - 1, d + 6);   // semanaFin = semanaInicio + 6 días
    fin.setHours(23, 59, 59);
    return fin < new Date();
  }

  /** Helper: primer nombre + apellido paterno */
  nombreCorto(nc: string): string {
    if (!nc) return '';
    const p = nc.trim().split(/\s+/);
    const pat = p.length >= 3 ? p[p.length - 2] : (p[1] || '');
    return `${p[0]} ${pat}`.trim();
  }

  /** Días laborables del esquema, ordenados Sáb→Dom→Lun→Vie */
  getDiasEsquema(e: any): any[] {
    const orden = [6, 7, 1, 2, 3, 4, 5]; // Sáb primero, sigue la semana laboral
    return (e.horariosDia || [])
      .filter((d: any) => !d.esDescanso)
      .sort((a: any, b: any) => orden.indexOf(a.diaSemana) - orden.indexOf(b.diaSemana));
  }

  getDescansos(e: any): string {
    return (e.horariosDia || [])
      .filter((d: any) => d.esDescanso)
      .map((d: any) => this.DIAS[d.diaSemana - 1])
      .join(', ');
  }

  // ── Drag & Drop ───────────────────────────────────────────
  onDragStart(event: DragEvent, grupo: any) {
    this.draggingGrupo = grupo;
    event.dataTransfer!.effectAllowed = 'copy';
  }

  onDragEnd() {
    this.draggingGrupo = null;
    this.dropTargetId  = null;
    this.cdr.detectChanges();
  }

  onDragOver(event: DragEvent, idEsquema: number) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    if (this.dropTargetId !== idEsquema) {
      this.dropTargetId = idEsquema;
      this.cdr.detectChanges();
    }
  }

  onDragLeave(event: DragEvent, idEsquema: number) {
    const rel  = event.relatedTarget as HTMLElement;
    const zona = event.currentTarget as HTMLElement;
    if (!zona.contains(rel) && this.dropTargetId === idEsquema) {
      this.dropTargetId = null;
      this.cdr.detectChanges();
    }
  }

  onDrop(event: DragEvent, esquema: any) {
    event.preventDefault();
    this.dropTargetId = null;
    if (!this.draggingGrupo || !this.semanaSeleccionada) { this.onDragEnd(); return; }
    const grupo = this.draggingGrupo;
    this.onDragEnd();
    this.asignarGrupo(grupo, esquema);
  }

  private asignarGrupo(grupo: any, esquema: any) {
    if (!grupo.totalTrabajadores) {
      this.mostrarError(`El grupo «${grupo.nombre}» no tiene miembros.`); return;
    }
    this.isProcesando = true;
    this.programacionService.crearDesdeGrupo(grupo.idGrupo, this.semanaSeleccionada, esquema.idEsquema).subscribe({
      next: (res: any) => {
        this.isProcesando      = false;
        this.resultadoBulk     = res;
        this.esquemaNombreBulk = esquema.nombre;
        this.mostrarResultado  = true;
        this.cargarProgramaciones();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isProcesando = false;
        this.mostrarError(mensajeError(err, 'Error al asignar.'));
      }
    });
  }

  // ── Quitar grupo de un esquema (elimina todas sus programaciones) ─
  pedirQuitarGrupo(grupo: any, esquema: any, e: Event) {
    e.stopPropagation();
    this.grupoParaQuitar  = grupo;
    this.esquemaParaQuitar = esquema;
    this.mostrarModalEliminarGrupo = true;
  }

  /**
   * Quita del esquema todas las programaciones del grupo.
   *
   * ============================================================
   * POR QUE NO BORRABA NADA
   * ============================================================
   * Buscaba los miembros en grupoParaQuitar.trabajadores, pero la tarjeta
   * de grupo NO tiene ese campo: getGruposDeEsquema() la construye a
   * partir del snapshot de las programaciones y le pone
   * `programaciones`, no `trabajadores`.
   *
   * El resultado era un Set vacio, ningun elemento coincidia, y la guarda
   * `if (!aEliminar.length)` cerraba el modal en silencio. Parecia que la
   * accion se ejecutaba y no pasaba nada.
   *
   * Ahora se usan directamente las programaciones que la propia tarjeta
   * ya trae. Ademas es mas correcto: el snapshot refleja quien estaba en
   * el grupo AL PROGRAMAR la semana, mientras que la composicion actual
   * del grupo pudo cambiar despues. Cruzar contra la actual habria dejado
   * sin borrar a quien ya salio del grupo.
   */
  quitarGrupoDeEsquema() {
    if (!this.grupoParaQuitar || !this.esquemaParaQuitar) return;

    const aEliminar: any[] = this.grupoParaQuitar.programaciones ?? [];

    if (!aEliminar.length) {
      this.mostrarModalEliminarGrupo = false;
      this.mostrarError('No se encontraron asignaciones que quitar para este grupo.');
      return;
    }

    this.isProcesando = true;
    forkJoin(aEliminar.map((p: any) => this.programacionService.eliminar(p.idProgramacion)))
      .subscribe({
        next: () => {
          this.isProcesando              = false;
          this.mostrarModalEliminarGrupo = false;
          this.grupoParaQuitar           = null;
          this.esquemaParaQuitar         = null;
          this.cargarProgramaciones();
        },
        error: (err: any) => {
          // Antes el error se tragaba sin avisar. Una semana ya pasada,
          // por ejemplo, la rechaza el backend y el usuario no veia nada.
          this.isProcesando = false;
          this.mostrarModalEliminarGrupo = false;
          this.mostrarError(mensajeError(err, 'No se pudo quitar el grupo del esquema.'));
          this.cdr.detectChanges();
        }
      });
  }

  // ── Confirmación final de semana (punto 5) ────────────────
  iniciarConfirmacion() {
    if (!this.semanaSeleccionada) {
      this.mostrarError('Selecciona una semana antes de confirmar.'); return;
    }
    // Punto 4: advertir sobre trabajadores sin grupo
    this.trabSinGrupo = this.getTrabajadoresSinGrupo();
    if (this.trabSinGrupo.length > 0) {
      this.mostrarAdvert = true; return;
    }
    this.abrirResumen();
  }

  continuarDesdeAdvert() {
    this.mostrarAdvert = false;
    this.abrirResumen();
  }

  private abrirResumen() {
    // Construir resumen por esquema
    this.resumenConfirmacion = this.esquemas
      .map(e => {
        const grupos = this.getGruposDeEsquema(e.idEsquema);
        const total  = this.getProgramacionesByEsquema(e.idEsquema).length;
        return { esquema: e.nombre, grupos: grupos.map((g: any) => g.nombre), total };
      })
      .filter(r => r.total > 0);
    this.mostrarConfirmacion = true;
  }

  cerrarConfirmacion() { this.mostrarConfirmacion = false; }

  /** Llama al backend para confirmar la semana y generar pre-registros */
  ejecutarConfirmacion() {
    if (!this.semanaSeleccionada) return;
    this.isProcesando       = true;
    this.mostrarConfirmacion = false;

    this.programacionService.confirmarSemana(this.semanaSeleccionada).subscribe({
      next: (res: any) => {
        this.isProcesando          = false;
        this.resultadoConfirmacion = res;
        this.mostrarResultadoConf  = true;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isProcesando = false;
        this.mostrarError(mensajeError(err, 'Error al confirmar la semana.'));
      }
    });
  }

  cerrarResultadoConf() { this.mostrarResultadoConf = false; this.resultadoConfirmacion = null; }

  // ── Modales menores ───────────────────────────────────────
  cerrarResultado() { this.mostrarResultado = false; this.resultadoBulk = null; }
  verMiembros(grupo: any, e: Event) {
    e.stopPropagation();
    // Si viene del panel de grupos sin asignar, tiene trabajadores[] directo.
    // Si viene de un grupo asignado (snapshot), buscar en this.grupos por idGrupo.
    // Si no se encuentra (grupo eliminado), construir desde las programaciones del snapshot.
    if (grupo.trabajadores) {
      this.grupoMiembros = grupo;
    } else if (grupo.idGrupo) {
      const grupoActual = this.grupos.find((g: any) => g.idGrupo === grupo.idGrupo);
      this.grupoMiembros = grupoActual || {
        nombre:           grupo.nombre,
        totalTrabajadores: grupo.programaciones?.length || 0,
        descripcion:      '(grupo modificado o eliminado)',
        trabajadores:     (grupo.programaciones || []).map((p: any) => ({
          nombreCompleto: p.trabajadorNombre,
          nroDocumento:   p.trabajadorDocumento,
          puestoNombre:   p.puestoNombre,
          areaNombre:     p.areaNombre
        }))
      };
    } else {
      this.grupoMiembros = grupo;
    }
    this.mostrarMiembros = true;
  }
  cerrarMiembros() { this.mostrarMiembros = false; this.grupoMiembros = null; }

  private mostrarError(msg: string) {
    this.errorGlobal = msg;
    this.cdr.detectChanges();
    setTimeout(() => { this.errorGlobal = ''; this.cdr.detectChanges(); }, 6000);
  }

  // ── Semanas ───────────────────────────────────────────────
  getSabadoSemanaActual(): string {
    const hoy  = new Date();
    const dia  = hoy.getDay();
    const diff = dia === 6 ? 0 : dia + 1;
    const sab  = new Date(hoy);
    sab.setDate(hoy.getDate() - diff);
    return this.toLocalISOString(sab);
  }

  getSemanas(): { value: string; label: string }[] {
    const semanas = [];
    const [sy, sm, sd] = this.getSabadoSemanaActual().split('-').map(Number);
    const base = new Date(sy, sm - 1, sd);
    for (let i = -4; i <= 4; i++) {
      const sab = new Date(base); sab.setDate(base.getDate() + i * 7);
      const vie = new Date(sab);  vie.setDate(sab.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
      semanas.push({ value: this.toLocalISOString(sab), label: `Sáb ${fmt(sab)} → Vie ${fmt(vie)}` });
    }
    return semanas;
  }

  /** Usado por reduce en el template para sumar totales */
  sumarTotal(acc: number, r: any): number { return acc + r.total; }

  private toLocalISOString(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}