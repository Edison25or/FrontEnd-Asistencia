import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { mensajeError } from '../../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { EsquemaHorarioService } from '../../../core/services/esquema-horario.service';
import { AuthService } from '../../../core/services/auth';
import { TurnoService, Turno } from '../../../core/services/turno.service';

const DIAS = [
  { diaSemana: 6, nombre: 'Sábado' },
  { diaSemana: 7, nombre: 'Domingo' },
  { diaSemana: 1, nombre: 'Lunes' },
  { diaSemana: 2, nombre: 'Martes' },
  { diaSemana: 3, nombre: 'Miércoles' },
  { diaSemana: 4, nombre: 'Jueves' },
  { diaSemana: 5, nombre: 'Viernes' },
];

@Component({
  selector: 'app-esquema-horario-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './esquema-horario-list.html',
  styleUrl: './esquema-horario-list.css'
})
export class EsquemaHorarioListComponent implements OnInit {

  private service     = inject(EsquemaHorarioService);
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private fb          = inject(FormBuilder);
  private cdr         = inject(ChangeDetectorRef);

  grupos:   any[]  = [];
  turnos: Turno[] = [];   // cada elemento es un EsquemaGrupoResponse
  isLoading        = true;
  rolUsuario       = '';

  // ── Modal crear (v1) ──────────────────────────────────────
  mostrarModal     = false;
  isProcesando     = false;
  errorModal       = '';
  esquemaForm!: FormGroup;

  // ── Modal nueva versión ───────────────────────────────────
  mostrarModalVersion      = false;
  grupoParaNuevaVersion: any = null;
  versionForm!: FormGroup;
  mostrarAdvertVersion     = false;  // advertencia si tiene programaciones

  // ── Modal detalle / historial ─────────────────────────────
  mostrarDetalle    = false;
  grupoDetalle: any = null;

  // ── Toggle activo ─────────────────────────────────────────
  mostrarConfirmToggle    = false;
  esquemaParaToggle: any  = null;

  // ── Totales en tiempo real ────────────────────────────────
  totalNetos = 0; totalExtra = 0; totalBruto = 0;
  totalNetosV = 0; totalExtraV = 0; totalBrutoV = 0;

  // ── Versiones colapsadas en el modal detalle ─────────────
  versionesExpandidas = new Set<number>(); // idEsquema de versiones abiertas

  toggleVersion(idEsquema: number) {
    this.versionesExpandidas.has(idEsquema)
      ? this.versionesExpandidas.delete(idEsquema)
      : this.versionesExpandidas.add(idEsquema);
    this.cdr.detectChanges();
  }

  // ── Advertencias de horas ─────────────────────────────────
  readonly MAX_NETOS_MIN  = 48 * 60;   // 2880 min = 48 h
  readonly MAX_EXTRA_MIN  =  3 * 60;   //  180 min =  3 h

  get advertenciaNetos(): string | null {
    const arr = this.mostrarModalVersion ? this.totalNetosV : this.totalNetos;
    if (arr > this.MAX_NETOS_MIN)
      return `⛔ El total neto semanal (${this.formatMin(arr)}) supera las 48 horas permitidas.`;
    if (arr > 0 && arr < this.MAX_NETOS_MIN)
      return `⚠ El total neto semanal (${this.formatMin(arr)}) está por debajo de las 48 horas.`;
    return null;
  }

  get advertenciaExtra(): string | null {
    const arr = this.mostrarModalVersion ? this.totalExtraV : this.totalExtra;
    if (arr > this.MAX_EXTRA_MIN)
      return `⚠ Las horas extras (${this.formatMin(arr)}) superan las 3 horas semanales recomendadas.`;
    return null;
  }

  get errorNetosExcedido(): boolean {
    const arr = this.mostrarModalVersion ? this.totalNetosV : this.totalNetos;
    return arr > this.MAX_NETOS_MIN;
  }

  ngOnInit() {
    // El turno es obligatorio en el esquema (RN-18): reemplaza la
    // clasificación por umbral horario fijo del prototipo.
    this.turnoService.getAll().subscribe({
      next: (t: Turno[]) => { this.turnos = t; this.cdr.detectChanges(); }
    });
    this.rolUsuario = this.authService.getRolUsuario() || '';
    this.initForm();
    this.cargar();
  }

  // ── Carga ─────────────────────────────────────────────────
  cargar() {
    this.isLoading = true;
    this.service.getAllAgrupados().subscribe({
      next: d  => { this.grupos = d; this.isLoading = false; this.cdr.detectChanges(); },
      error: () => { this.isLoading = false; this.cdr.detectChanges(); }
    });
  }

  // ── Formulario crear ─────────────────────────────────────
  initForm() {
    this.esquemaForm = this.fb.group({
      nombre:            ['', [Validators.required, Validators.maxLength(80)]],
      descripcion:       ['', Validators.maxLength(200)],
      // El turno determina cómo se clasifican las horas en el consolidado
      // (RN-18, RN-25). Obligatorio.
      idTurno:             [null, Validators.required],
      // Una sola tolerancia no permitía distinguir una entrada anticipada
      // normal de una que dispara la confirmación por doble escaneo, así
      // que se desdobla en tres (RN-17).
      toleranciaTardanza:  [10, [Validators.required, Validators.min(0), Validators.max(120)]],
      toleranciaPrevia:    [15, [Validators.required, Validators.min(0), Validators.max(120)]],
      toleranciaPosterior: [15, [Validators.required, Validators.min(0), Validators.max(120)]],
      horariosDia:         this.fb.array(DIAS.map(d => this.crearDiaGroup(d.diaSemana, false)))
    });
  }

  crearDiaGroup(diaSemana: number, prefill: boolean, data?: any): FormGroup {
    const esDesc = data ? data.esDescanso : (diaSemana === 6 || diaSemana === 7);
    const g = this.fb.group({
      diaSemana:              [diaSemana],
      esDescanso:             [esDesc],
      horaEntrada:            [data?.horaEntrada || '07:00'],
      minutosRefrigerio:      [data?.minutosRefrigerio || 60],
      minutosNetos:           [data?.minutosNetos || null],
      minutosExtraProgramado: [data?.minutosExtraProgramado || 0]
    });
    g.get('esDescanso')!.valueChanges.subscribe(val => {
      const campos = ['horaEntrada','minutosRefrigerio','minutosNetos','minutosExtraProgramado'];
      campos.forEach(c => val ? g.get(c)!.disable() : g.get(c)!.enable());
      // Guard: no llamar si el formulario padre aún no fue asignado
      if (this.esquemaForm) { this.actualizarTotales(); this.cdr.detectChanges(); }
    });
    g.get('minutosNetos')!.valueChanges.subscribe(() => {
      if (this.esquemaForm) this.actualizarTotales();
    });
    g.get('minutosExtraProgramado')!.valueChanges.subscribe(() => {
      if (this.esquemaForm) this.actualizarTotales();
    });
    if (esDesc) ['horaEntrada','minutosRefrigerio','minutosNetos','minutosExtraProgramado']
      .forEach(c => g.get(c)!.disable());
    return g;
  }

  get horariosDiaArray(): FormArray {
    return this.esquemaForm?.get('horariosDia') as FormArray;
  }

  get horariosDiaVersionArray(): FormArray {
    return this.versionForm?.get('horariosDia') as FormArray;
  }

  actualizarTotales(version = false) {
    const arr = version ? this.horariosDiaVersionArray : this.horariosDiaArray;
    if (!arr) return;
    let n = 0, e = 0;
    arr.controls.forEach(c => {
      if (!c.get('esDescanso')!.value) {
        n += Number(c.get('minutosNetos')!.value) || 0;
        e += Number(c.get('minutosExtraProgramado')!.value) || 0;
      }
    });
    if (version) { this.totalNetosV = n; this.totalExtraV = e; this.totalBrutoV = n + e; }
    else         { this.totalNetos = n;  this.totalExtra = e;  this.totalBruto = n + e; }
    this.cdr.detectChanges();
  }

  getHoraSalida(index: number, version = false): string {
    const arr  = version ? this.horariosDiaVersionArray : this.horariosDiaArray;
    const ctrl = arr?.at(index);
    if (!ctrl || ctrl.get('esDescanso')!.value) return '-';
    const entrada = ctrl.get('horaEntrada')!.value;
    const netos   = Number(ctrl.get('minutosNetos')!.value) || 0;
    const refrig  = Number(ctrl.get('minutosRefrigerio')!.value) || 0;
    const extra   = Number(ctrl.get('minutosExtraProgramado')!.value) || 0;
    if (!entrada || netos === 0) return '-';
    const [h, m] = entrada.split(':').map(Number);
    const total  = h * 60 + m + netos + refrig + extra;
    return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  }

  /**
   * true si la jornada termina en el día calendario siguiente.
   *
   * Es el caso normal del turno noche y conviene señalarlo: una salida
   * "07:00" con entrada "22:45" no es un error de captura, y sin la marca
   * parece que el horario está mal configurado.
   */
  salidaCruzaMedianoche(index: number, version = false): boolean {
    const arr  = version ? this.horariosDiaVersionArray : this.horariosDiaArray;
    const ctrl = arr?.at(index);
    if (!ctrl || ctrl.get('esDescanso')!.value) return false;

    const entrada = ctrl.get('horaEntrada')!.value;
    const netos   = Number(ctrl.get('minutosNetos')!.value) || 0;
    const refrig  = Number(ctrl.get('minutosRefrigerio')!.value) || 0;
    const extra   = Number(ctrl.get('minutosExtraProgramado')!.value) || 0;
    if (!entrada || netos === 0) return false;

    const [h, m] = entrada.split(':').map(Number);
    return (h * 60 + m + netos + refrig + extra) >= 24 * 60;
  }

  getNombreDia(ds: number): string { return DIAS.find(d => d.diaSemana === ds)?.nombre || ''; }
  formatMin(min: number): string {
    if (!min) return '00:00';
    return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
  }

  // ── Abrir modal crear ─────────────────────────────────────
  abrirModalNuevo() {
    this.errorModal = '';
    this.initForm();
    this.totalNetos = 0; this.totalExtra = 0; this.totalBruto = 0;
    this.mostrarModal = true;
  }

  cerrarModal() { this.mostrarModal = false; this.errorModal = ''; }

  guardar() {
    if (this.esquemaForm.invalid) { this.esquemaForm.markAllAsTouched(); return; }
    this.isProcesando = true; this.errorModal = '';
    const raw = this.esquemaForm.getRawValue();
    const payload = {
      nombre: raw.nombre, descripcion: raw.descripcion,
      idTurno:             raw.idTurno,
      toleranciaTardanza:  raw.toleranciaTardanza,
      toleranciaPrevia:    raw.toleranciaPrevia,
      toleranciaPosterior: raw.toleranciaPosterior,
      horariosDia: raw.horariosDia.map((d: any) => ({
        diaSemana: d.diaSemana, esDescanso: d.esDescanso,
        horaEntrada:            d.esDescanso ? null : d.horaEntrada,
        minutosRefrigerio:      d.esDescanso ? null : d.minutosRefrigerio,
        minutosNetos:           d.esDescanso ? null : d.minutosNetos,
        minutosExtraProgramado: d.esDescanso ? 0 : (d.minutosExtraProgramado || 0)
      }))
    };
    this.service.crear(payload).subscribe({
      next: () => { this.isProcesando = false; this.cerrarModal(); this.cargar(); },
      error: (err: any) => {
        this.errorModal = mensajeError(err, 'Error al guardar.');
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Nueva versión ─────────────────────────────────────────
  abrirModalNuevaVersion(grupo: any) {
    this.grupoParaNuevaVersion = grupo;
    this.mostrarAdvertVersion  = grupo.versionActiva?.tieneProgramaciones;
    const v = grupo.versionActiva;

    // Pre-rellenar con los datos de la versión activa
    this.versionForm = this.fb.group({
      vigenteDesde:      ['', Validators.required],
      descripcion:       [v?.descripcion || '', Validators.maxLength(200)],
      idTurno:             [v?.idTurno ?? null, Validators.required],
      toleranciaTardanza:  [v?.toleranciaTardanza  ?? 10, [Validators.min(0), Validators.max(120)]],
      toleranciaPrevia:    [v?.toleranciaPrevia    ?? 15, [Validators.min(0), Validators.max(120)]],
      toleranciaPosterior: [v?.toleranciaPosterior ?? 15, [Validators.min(0), Validators.max(120)]],
      horariosDia: this.fb.array(
        DIAS.map(d => {
          const dData = v?.horariosDia?.find((h: any) => h.diaSemana === d.diaSemana);
          return this.crearDiaGroup(d.diaSemana, true, dData);
        })
      )
    });
    this.actualizarTotales(true);
    this.mostrarModalVersion = true;
  }

  cerrarModalVersion() { this.mostrarModalVersion = false; this.grupoParaNuevaVersion = null; }

  guardarNuevaVersion() {
    if (this.versionForm.invalid) { this.versionForm.markAllAsTouched(); return; }
    this.isProcesando = true; this.errorModal = '';
    const raw = this.versionForm.getRawValue();
    const payload = {
      vigenteDesde: raw.vigenteDesde,
      descripcion: raw.descripcion,
      idTurno:             raw.idTurno,
      toleranciaTardanza:  raw.toleranciaTardanza,
      toleranciaPrevia:    raw.toleranciaPrevia,
      toleranciaPosterior: raw.toleranciaPosterior,
      horariosDia: raw.horariosDia.map((d: any) => ({
        diaSemana: d.diaSemana, esDescanso: d.esDescanso,
        horaEntrada:            d.esDescanso ? null : d.horaEntrada,
        minutosRefrigerio:      d.esDescanso ? null : d.minutosRefrigerio,
        minutosNetos:           d.esDescanso ? null : d.minutosNetos,
        minutosExtraProgramado: d.esDescanso ? 0 : (d.minutosExtraProgramado || 0)
      }))
    };
    this.service.crearNuevaVersion(this.grupoParaNuevaVersion.grupoNombre, payload).subscribe({
      next: () => { this.isProcesando = false; this.cerrarModalVersion(); this.cargar(); },
      error: (err: any) => {
        this.errorModal = mensajeError(err, 'Error al crear nueva versión.');
        this.isProcesando = false; this.cdr.detectChanges();
      }
    });
  }

  // ── Toggle activo ─────────────────────────────────────────
  confirmarToggle(esquema: any) { this.esquemaParaToggle = esquema; this.mostrarConfirmToggle = true; }
  cerrarConfirmToggle() { this.mostrarConfirmToggle = false; this.esquemaParaToggle = null; }

  procesarToggle() {
    if (!this.esquemaParaToggle) return;
    this.service.toggleActivo(this.esquemaParaToggle.idEsquema).subscribe({
      next: () => { this.cerrarConfirmToggle(); this.cargar(); },
      error: (err: any) => { alert(mensajeError(err, 'Error.')); this.cerrarConfirmToggle(); }
    });
  }

  // ── Detalle / historial ───────────────────────────────────
  verDetalle(grupo: any) {
    this.grupoDetalle = grupo;
    this.versionesExpandidas = new Set<number>();
    // La versión activa empieza expandida
    if (grupo.versionActiva?.idEsquema)
      this.versionesExpandidas.add(grupo.versionActiva.idEsquema);
    this.mostrarDetalle = true;
  }
  cerrarDetalle() { this.mostrarDetalle = false; setTimeout(() => { this.grupoDetalle = null; this.cdr.detectChanges(); }, 200); }

  esSuperAdmin() { return this.rolUsuario === 'ROLE_SUPERADMIN'; }
  /**
   * Quien puede CREAR y MODIFICAR esquemas de horario (CU-12).
   *
   * El Jefe estaba incluido y no le corresponde. La matriz de actividades
   * asigna "definir los esquemas de la empresa" y "crear una nueva
   * versión" al área contable, mientras que al Jefe de Área le toca otra
   * cosa: asignar un esquema a cada grupo para la semana, que es CU-14.
   *
   * La distinción importa porque un esquema no pertenece a un área: sus
   * tolerancias y minutos netos rigen el cálculo de horas de toda la
   * empresa. Un Jefe que lo modificara alteraría el pago de personal que
   * no está a su cargo.
   *
   * El Jefe conserva la LECTURA, porque programa con ellos.
   */
  esAdmin()      { return this.rolUsuario === 'ROLE_ADMIN' || this.esSuperAdmin(); }

  /** Roles que consultan los esquemas sin poder modificarlos. */
  soloLectura()  { return this.rolUsuario === 'ROLE_JEFE'; }
}