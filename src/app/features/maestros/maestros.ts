import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, forkJoin, of } from 'rxjs';
import { MaestrosService, GeneroItem, AreaItem, PuestoItem } from '../../core/services/maestros.service';
import { TurnoService, Turno } from '../../core/services/turno.service';
import { CatalogoService, CatalogoSimple } from '../../core/services/catalogo.service';

/**
 * Tablas maestras (CU24).
 *
 * ============================================================
 * QUE SE AGREGA
 * ============================================================
 * Tres catálogos que antes no tenían pantalla:
 *
 *   Turnos (RN-18)             - reemplaza la clasificación por umbral
 *                                horario fijo del prototipo.
 *   Tipos de Ausencia (RN-16)  - común a permisos y faltas justificadas.
 *   Motivos de Cese (RN-11)    - reemplaza el texto libre del cese.
 *
 * ============================================================
 * POR QUE ESTOS TRES NO SE EDITAN NI SE REACTIVAN
 * ============================================================
 * Género, Área y Puesto tienen edición y un toggle que alterna activo e
 * inactivo. Los tres nuevos NO: el backend solo expone alta y baja.
 *
 * La razón es que sus valores quedan referenciados en registros
 * históricos. Renombrar un turno cambiaría la interpretación de jornadas
 * ya consolidadas, y renombrar un motivo de cese reescribiría el
 * historial laboral de alguien. Para corregir uno se crea el nuevo y se
 * desactiva el anterior, que es lo que hace el catálogo.
 */
type Tab = 'generos' | 'areas' | 'puestos' | 'turnos' | 'tipos-ausencia' | 'motivos-cese';
type ModalMode = 'crear' | 'editar';

@Component({
  selector: 'app-maestros',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './maestros.html',
  styleUrl:    './maestros.css'
})
export class MaestrosComponent implements OnInit {
  private svc       = inject(MaestrosService);
  private turnoSvc  = inject(TurnoService);
  private catSvc    = inject(CatalogoService);
  private fb        = inject(FormBuilder);
  private cdr       = inject(ChangeDetectorRef);

  // ── Tabs ──────────────────────────────────────────────────
  tabActual: Tab = 'generos';
  setTab(tab: Tab) { this.tabActual = tab; this.cerrarModal(); }

  /** Catálogos que solo admiten alta y baja, no edición. */
  private readonly SOLO_ALTA_Y_BAJA: Tab[] = ['turnos', 'tipos-ausencia', 'motivos-cese'];

  get permiteEditar(): boolean {
    return !this.SOLO_ALTA_Y_BAJA.includes(this.tabActual);
  }

  /** true si el catálogo puede reactivar un elemento dado de baja. */
  get permiteReactivar(): boolean {
    return !this.SOLO_ALTA_Y_BAJA.includes(this.tabActual);
  }

  // ── Datos ─────────────────────────────────────────────────
  generos:  GeneroItem[]  = [];
  areas:    AreaItem[]    = [];
  puestos:  PuestoItem[]  = [];
  areasActivas: AreaItem[] = [];

  turnos:         Turno[]          = [];
  tiposAusencia:  CatalogoSimple[] = [];
  motivosCese:    CatalogoSimple[] = [];

  isLoading   = false;
  errorGlobal = '';

  // ── Modal ─────────────────────────────────────────────────
  mostrarModal  = false;
  modalMode:    ModalMode = 'crear';
  modalTitulo   = '';
  modalError    = '';
  guardando     = false;
  editandoId: number | null = null;

  generoForm: FormGroup = this.fb.group({
    genero: ['', [Validators.required, Validators.maxLength(20)]]
  });

  areaForm: FormGroup = this.fb.group({
    area: ['', [Validators.required, Validators.maxLength(100)]]
  });

  puestoForm: FormGroup = this.fb.group({
    puesto:            ['', [Validators.required, Validators.maxLength(100)]],
    descripcionPuesto: ['', Validators.maxLength(255)],
    idArea:            ['', Validators.required]
  });

  /** Las horas son informativas: describen el turno, no clasifican (RN-25). */
  turnoForm: FormGroup = this.fb.group({
    nombre:     ['', [Validators.required, Validators.maxLength(40)]],
    horaInicio: [''],
    horaFin:    ['']
  });

  /**
   * Los dos indicadores clasifican el tipo según se planifique o no.
   *
   * Nacen marcados porque la mayoría de los tipos admiten ambas
   * situaciones: una operación programada es un permiso por descanso
   * médico y la misma dolencia súbita es una falta justificada. Quien
   * crea el tipo desmarca la que no corresponda.
   */
  tipoAusenciaForm: FormGroup = this.fb.group({
    nombre:                  ['', [Validators.required, Validators.maxLength(80)]],
    descripcion:             ['', Validators.maxLength(200)],
    aplicaPermiso:           [true],
    aplicaFaltaJustificada:  [true]
  });

  motivoCeseForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(80)]]
  });

  // ── Toggle confirmación ───────────────────────────────────
  itemToggle: any  = null;
  mostrarConfirmToggle = false;

  // ── Lifecycle ─────────────────────────────────────────────
  ngOnInit() { this.cargar(); }

  cargar() {
    this.isLoading = true;
    this.cdr.detectChanges();

    forkJoin({
      generos:      this.svc.getGeneros(),
      areas:        this.svc.getAreas(),
      puestos:      this.svc.getPuestos(),
      areasActivas: this.svc.getAreasActivas(),
      turnos:       this.turnoSvc.getAll(),
      tiposAus:     this.catSvc.getTiposAusencia(),
      motivos:      this.catSvc.getMotivosCese()
    }).subscribe({
      next: (res) => {
        this.generos      = res.generos.sort((a, b) => a.idGenero - b.idGenero);
        this.areas        = res.areas.sort((a, b) => a.idArea - b.idArea);
        this.puestos      = res.puestos.sort((a, b) => a.idPuesto - b.idPuesto);
        this.areasActivas = res.areasActivas.sort((a, b) => a.idArea - b.idArea);

        this.turnos        = res.turnos.sort((a, b) => a.idTurno - b.idTurno);
        this.tiposAusencia = res.tiposAus.sort((a, b) => a.id - b.id);
        this.motivosCese   = res.motivos.sort((a, b) => a.id - b.id);

        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Abrir modales ─────────────────────────────────────────
  abrirCrear() {
    this.modalMode    = 'crear';
    this.editandoId   = null;
    this.modalError   = '';
    this.guardando    = false;
    this.mostrarModal = true;
    this.formActual.reset();
    if (this.tabActual === 'puestos') this.puestoForm.get('idArea')?.setValue('');
    // reset() deja los booleanos en null, que el backend lee como false y
    // crearia un tipo que no aparece en ninguna de las dos pantallas.
    if (this.tabActual === 'tipos-ausencia') {
      this.tipoAusenciaForm.patchValue({
        aplicaPermiso: true, aplicaFaltaJustificada: true
      });
    }
    this.modalTitulo = `Nuevo ${this.labelSingular}`;
    this.cdr.detectChanges();
  }

  abrirEditar(item: any) {
    // Los catálogos de solo alta y baja no se editan: renombrarlos
    // alteraría la interpretación de registros históricos.
    if (!this.permiteEditar) return;

    this.modalMode    = 'editar';
    this.editandoId   = this.idDe(item);
    this.modalError   = '';
    this.guardando    = false;
    this.mostrarModal = true;
    this.modalTitulo  = `Editar ${this.labelSingular}`;

    if (this.tabActual === 'generos') this.generoForm.patchValue({ genero: item.genero });
    if (this.tabActual === 'areas')   this.areaForm.patchValue({ area: item.area });
    if (this.tabActual === 'puestos') this.puestoForm.patchValue({
      puesto: item.puesto, descripcionPuesto: item.descripcionPuesto ?? '', idArea: item.idArea
    });
    this.cdr.detectChanges();
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editandoId   = null;
    this.modalError   = '';
    this.cdr.detectChanges();
  }

  // ── Guardar ───────────────────────────────────────────────
  guardar() {
    const form = this.formActual;
    if (form.invalid) { form.markAllAsTouched(); return; }

    this.guardando  = true;
    this.modalError = '';
    const crear = this.modalMode === 'crear';

    let op$: Observable<any>;
    switch (this.tabActual) {
      case 'generos':
        op$ = crear ? this.svc.crearGenero(this.generoForm.value)
                    : this.svc.editarGenero(this.editandoId!, this.generoForm.value);
        break;
      case 'areas':
        op$ = crear ? this.svc.crearArea(this.areaForm.value)
                    : this.svc.editarArea(this.editandoId!, this.areaForm.value);
        break;
      case 'puestos':
        op$ = crear ? this.svc.crearPuesto(this.puestoForm.value)
                    : this.svc.editarPuesto(this.editandoId!, this.puestoForm.value);
        break;
      case 'turnos':
        op$ = this.turnoSvc.crear(this.turnoForm.value);
        break;
      case 'tipos-ausencia':
        op$ = this.catSvc.crearTipoAusencia(this.tipoAusenciaForm.value);
        break;
      default:
        op$ = this.catSvc.crearMotivoCese(this.motivoCeseForm.value);
    }

    op$.subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModal();
        this.cargar();
      },
      error: (err: any) => {
        this.modalError = mensajeError(err, 'Error al guardar.');
        this.guardando  = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Baja / reactivación ───────────────────────────────────
  confirmarToggle(item: any) {
    // Un catálogo de solo alta y baja no reactiva: si ya está inactivo,
    // no hay nada que confirmar.
    if (!this.permiteReactivar && !item.activo) return;

    this.itemToggle           = item;
    this.mostrarConfirmToggle = true;
    this.cdr.detectChanges();
  }

  cancelarToggle() {
    this.itemToggle           = null;
    this.mostrarConfirmToggle = false;
    this.cdr.detectChanges();
  }

  procesarToggle() {
    if (!this.itemToggle) return;
    const id = this.idDe(this.itemToggle);

    let op$: Observable<any>;
    switch (this.tabActual) {
      case 'generos':        op$ = this.svc.toggleGenero(id);            break;
      case 'areas':          op$ = this.svc.toggleArea(id);              break;
      case 'puestos':        op$ = this.svc.togglePuesto(id);            break;
      case 'turnos':         op$ = this.turnoSvc.desactivar(id);         break;
      case 'tipos-ausencia': op$ = this.catSvc.desactivarTipoAusencia(id); break;
      default:               op$ = this.catSvc.desactivarMotivoCese(id);
    }

    op$.subscribe({
      next:  () => { this.cancelarToggle(); this.cargar(); },
      error: (err: any) => {
        // El backend rechaza desactivar un turno en uso por algún esquema
        // vigente, y explica cuántos son.
        this.errorGlobal = mensajeError(err, 'Error.');
        this.cancelarToggle();
        this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  /** Identificador del elemento según la pestaña activa. */
  private idDe(item: any): number {
    switch (this.tabActual) {
      case 'generos':        return item.idGenero;
      case 'areas':          return item.idArea;
      case 'puestos':        return item.idPuesto;
      case 'turnos':         return item.idTurno;
      default:               return item.id;   // tipos-ausencia, motivos-cese
    }
  }

  /**
   * true si se está creando un tipo de ausencia sin marcar ninguna de las
   * dos casillas. Ese tipo no aparecería en ninguna pantalla.
   */
  get tipoAusenciaSinDestino(): boolean {
    if (this.tabActual !== 'tipos-ausencia') return false;
    return !this.tipoAusenciaForm.get('aplicaPermiso')?.value
        && !this.tipoAusenciaForm.get('aplicaFaltaJustificada')?.value;
  }

  get formActual(): FormGroup {
    switch (this.tabActual) {
      case 'generos':        return this.generoForm;
      case 'areas':          return this.areaForm;
      case 'puestos':        return this.puestoForm;
      case 'turnos':         return this.turnoForm;
      case 'tipos-ausencia': return this.tipoAusenciaForm;
      default:               return this.motivoCeseForm;
    }
  }

  get labelSingular(): string {
    return {
      'generos':        'Género',
      'areas':          'Área',
      'puestos':        'Puesto',
      'turnos':         'Turno',
      'tipos-ausencia': 'Tipo de Ausencia',
      'motivos-cese':   'Motivo de Cese'
    }[this.tabActual];
  }

  get itemsActuales(): any[] {
    return {
      'generos':        this.generos,
      'areas':          this.areas,
      'puestos':        this.puestos,
      'turnos':         this.turnos,
      'tipos-ausencia': this.tiposAusencia,
      'motivos-cese':   this.motivosCese
    }[this.tabActual] as any[];
  }

  /** Nombre visible del elemento, sea cual sea la pestaña. */
  nombreDe(item: any): string {
    return item.genero ?? item.area ?? item.puesto ?? item.nombre ?? '-';
  }

  /** Segunda columna, distinta en cada catálogo. */
  detalleDe(item: any): string {
    switch (this.tabActual) {
      case 'puestos':
        return item.areaNombre ?? '-';
      case 'turnos':
        return this.rangoTurno(item);
      case 'tipos-ausencia':
        return item.descripcion ?? '-';
      default:
        return '-';
    }
  }

  /** Rango horario informativo del turno. */
  private rangoTurno(t: Turno): string {
    if (!t.horaInicio || !t.horaFin) return '-';
    const ini = t.horaInicio.substring(0, 5);
    const fin = t.horaFin.substring(0, 5);
    return t.cruzaMedianoche
      ? `${ini} → ${fin} (día siguiente)`
      : `${ini} → ${fin}`;
  }

  /** Encabezado de la segunda columna. */
  get labelDetalle(): string {
    return {
      'generos':        '',
      'areas':          '',
      'puestos':        'Área',
      'turnos':         'Horario',
      'tipos-ausencia': 'Descripción',
      'motivos-cese':   ''
    }[this.tabActual];
  }

  get tieneColumnaDetalle(): boolean {
    return this.labelDetalle !== '';
  }
}
