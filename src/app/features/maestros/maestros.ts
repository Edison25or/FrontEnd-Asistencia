import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { MaestrosService, GeneroItem, AreaItem, PuestoItem } from '../../core/services/maestros.service';

type Tab = 'generos' | 'areas' | 'puestos';
type ModalMode = 'crear' | 'editar';

@Component({
  selector: 'app-maestros',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './maestros.html',
  styleUrl:    './maestros.css'
})
export class MaestrosComponent implements OnInit {
  private svc = inject(MaestrosService);
  private fb  = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  // ── Tabs ──────────────────────────────────────────────────
  tabActual: Tab = 'generos';
  setTab(tab: Tab) { this.tabActual = tab; this.cerrarModal(); }

  // ── Datos ─────────────────────────────────────────────────
  generos:  GeneroItem[]  = [];
  areas:    AreaItem[]    = [];
  puestos:  PuestoItem[]  = [];
  areasActivas: AreaItem[] = [];

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
      areasActivas: this.svc.getAreasActivas()
    }).subscribe({
      next: (res) => {
        // Ordenamos cada array por su respectivo ID de menor a mayor
        this.generos      = res.generos.sort((a, b) => a.idGenero - b.idGenero);
        this.areas        = res.areas.sort((a, b) => a.idArea - b.idArea);
        this.puestos      = res.puestos.sort((a, b) => a.idPuesto - b.idPuesto);
        this.areasActivas = res.areasActivas.sort((a, b) => a.idArea - b.idArea);

        this.isLoading    = false;
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
    this.modalTitulo = `Nuevo ${this.labelSingular}`;
    this.cdr.detectChanges();
  }

  abrirEditar(item: any) {
    this.modalMode    = 'editar';
    this.editandoId   = this.tabActual === 'generos' ? item.idGenero
                        : this.tabActual === 'areas'   ? item.idArea
                        :                                item.idPuesto;
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
    if (this.tabActual === 'generos') {
      op$ = crear ? this.svc.crearGenero(this.generoForm.value)
                  : this.svc.editarGenero(this.editandoId!, this.generoForm.value);
    } else if (this.tabActual === 'areas') {
      op$ = crear ? this.svc.crearArea(this.areaForm.value)
                  : this.svc.editarArea(this.editandoId!, this.areaForm.value);
    } else {
      op$ = crear ? this.svc.crearPuesto(this.puestoForm.value)
                  : this.svc.editarPuesto(this.editandoId!, this.puestoForm.value);
    }

    op$.subscribe({
      next: () => {
        this.guardando = false;
        this.cerrarModal();
        this.cargar();
      },
      error: (err: any) => {
        this.modalError = err.error?.message || 'Error al guardar.';
        this.guardando  = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Toggle activo/inactivo ────────────────────────────────
  confirmarToggle(item: any) {
    this.itemToggle          = item;
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
    // Usar el campo correcto según el tab activo para evitar
    // que idArea de un puesto sea tomado antes que idPuesto
    const id = this.tabActual === 'generos' ? this.itemToggle.idGenero
             : this.tabActual === 'areas'   ? this.itemToggle.idArea
             :                                this.itemToggle.idPuesto;
    let op$: Observable<any>;
    if (this.tabActual === 'generos') op$ = this.svc.toggleGenero(id);
    else if (this.tabActual === 'areas') op$ = this.svc.toggleArea(id);
    else op$ = this.svc.togglePuesto(id);

    op$.subscribe({
      next: () => { this.cancelarToggle(); this.cargar(); },
      error: (err: any) => { this.errorGlobal = err.error?.message || 'Error.'; this.cancelarToggle(); this.cdr.detectChanges(); }
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  get formActual(): FormGroup {
    if (this.tabActual === 'generos') return this.generoForm;
    if (this.tabActual === 'areas')   return this.areaForm;
    return this.puestoForm;
  }

  get labelSingular(): string {
    return { generos: 'Género', areas: 'Área', puestos: 'Puesto' }[this.tabActual];
  }

  get itemsActuales(): any[] {
    return { generos: this.generos, areas: this.areas, puestos: this.puestos }[this.tabActual];
  }
}