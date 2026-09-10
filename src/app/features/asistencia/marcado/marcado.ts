import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, ElementRef, ViewChild } from '@angular/core';
import { mensajeError } from '../../../shared/mensaje-error';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AsistenciaService } from '../../../core/services/asistencia.service';

@Component({
  selector: 'app-marcado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './marcado.html',
  styleUrl: './marcado.css'
})
export class MarcadoComponent implements OnInit, OnDestroy {

  private asistenciaService = inject(AsistenciaService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('codigoInput') codigoInput!: ElementRef;

  codigoBarras = '';
  // CONFIRMACION es un estado nuevo: el backend pidió el segundo escaneo
  // de una entrada anticipada y todavía NO ha guardado nada (HU-22).
  // Antes se trataba como éxito, así que la pantalla mostraba el mensaje
  // verde de registro exitoso sobre una jornada que seguía sin marcar.
  estado: 'ESPERA' | 'PROCESANDO' | 'EXITO' | 'ERROR' | 'CONFIRMACION' = 'ESPERA';
  ultimoRegistro: any = null;
  mensajeError = '';

  enPlanta: any[] = [];
  isLoadingPlanta = false;

  horaActual  = '';
  fechaActual = '';
  private relojInterval: any;
  private resetTimeout:  any;

  // ── Confirmación por doble escaneo (HU-22) ────────────────
  /** Segundos que quedan para volver a pasar el código. */
  segundosRestantes = 0;
  private cuentaAtras: any;

  ngOnInit() {
    this.iniciarReloj();
    this.cargarEnPlanta();
    setTimeout(() => this.codigoInput?.nativeElement.focus(), 200);
  }

  ngOnDestroy() {
    clearInterval(this.relojInterval);
    clearTimeout(this.resetTimeout);
    clearInterval(this.cuentaAtras);
  }

  iniciarReloj() {
    const actualizar = () => {
      const ahora = new Date();
      this.horaActual  = ahora.toLocaleTimeString('es-PE',
        { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.fechaActual = ahora.toLocaleDateString('es-PE',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      this.cdr.detectChanges();
    };
    actualizar();
    this.relojInterval = setInterval(actualizar, 1000);
  }

  cargarEnPlanta() {
    this.isLoadingPlanta = true;
    this.asistenciaService.getEnPlantaPublica().subscribe({
      next:  (data) => { this.enPlanta = data; this.isLoadingPlanta = false; this.cdr.detectChanges(); },
      error: ()     => { this.isLoadingPlanta = false; this.cdr.detectChanges(); }
    });
  }

  onCodigoLeido() {
    const codigo = this.codigoBarras.trim().toUpperCase();
    if (!codigo) return;

    clearInterval(this.cuentaAtras);
    this.estado = 'PROCESANDO';
    this.codigoBarras = '';
    this.cdr.detectChanges();

    this.asistenciaService.marcar(codigo).subscribe({
      next: (res) => {
        setTimeout(() => {
          this.ultimoRegistro = res;

          // ── Entrada anticipada: falta confirmar (HU-22) ──
          // No se ha guardado nada todavía. El trabajador tiene unos
          // segundos para volver a pasar el código; si no lo hace, la
          // ventana vence y no queda registro.
          if (res?.accion === 'CONFIRMACION_REQUERIDA') {
            this.iniciarConfirmacion(res.segundosParaConfirmar ?? 25);
            return;
          }

          // ── Escaneo descartado por anti-rebote (HU-53) ──
          // Se vuelve al estado de espera sin ruido: quien pasó el carné
          // dos veces sin querer no necesita un mensaje de error.
          if (res?.accion === 'IGNORADO') {
            this.estado = 'ESPERA';
            this.ultimoRegistro = null;
            this.cdr.detectChanges();
            this.codigoInput?.nativeElement.focus();
            return;
          }

          this.estado = 'EXITO';
          this.cdr.detectChanges();
          this.cargarEnPlanta();
          this.resetTimeout = setTimeout(() => {
            this.estado = 'ESPERA';
            this.ultimoRegistro = null;
            this.cdr.detectChanges();
            this.codigoInput?.nativeElement.focus();
          }, 4000);
        }, 0);
      },
      error: (err) => {
        setTimeout(() => {
          this.mensajeError = mensajeError(err, 'Error al registrar asistencia.');
          this.estado = 'ERROR';
          this.cdr.detectChanges();
          this.resetTimeout = setTimeout(() => {
            this.estado = 'ESPERA';
            this.mensajeError = '';
            this.cdr.detectChanges();
            this.codigoInput?.nativeElement.focus();
          }, 4000);
        }, 0);
      }
    });
  }

  refocus() { this.codigoInput?.nativeElement.focus(); }

  // ════════════════════════════════════════════════════════════
  // CONFIRMACIÓN POR DOBLE ESCANEO (HU-22)
  // ════════════════════════════════════════════════════════════

  /**
   * Abre la ventana de confirmación y arranca la cuenta atrás.
   *
   * El foco vuelve al input de inmediato: el trabajador tiene que poder
   * pasar el código otra vez sin tocar nada. El segundo escaneo entra por
   * onCodigoLeido() como cualquier otro, y el backend, que recuerda la
   * confirmación pendiente, lo interpreta como tal.
   */
  private iniciarConfirmacion(segundos: number) {
    clearInterval(this.cuentaAtras);
    clearTimeout(this.resetTimeout);

    this.estado            = 'CONFIRMACION';
    this.segundosRestantes = segundos;
    this.cdr.detectChanges();
    this.codigoInput?.nativeElement.focus();

    this.cuentaAtras = setInterval(() => {
      this.segundosRestantes--;
      if (this.segundosRestantes <= 0) {
        // Ventana vencida. No se guardó nada, así que no hay nada que
        // deshacer: basta volver a la espera.
        clearInterval(this.cuentaAtras);
        this.estado         = 'ESPERA';
        this.ultimoRegistro = null;
        this.codigoInput?.nativeElement.focus();
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  /** Corta la confirmación pendiente sin registrar la hora extra. */
  cancelarConfirmacion() {
    clearInterval(this.cuentaAtras);
    this.estado            = 'ESPERA';
    this.ultimoRegistro    = null;
    this.segundosRestantes = 0;
    this.cdr.detectChanges();
    this.codigoInput?.nativeElement.focus();
  }

  /**
   * Clasificación del registro.
   *
   * El antiguo campo de estado diario desaparece del DTO: era un String
   * libre con una nomenclatura distinta de las otras dos que convivían en
   * el sistema. Ahora la clasificación la lleva 'tipo', sobre el enum
   * único TipoRegistro, y 'estado' sigue siendo el flujo de trabajo
   * (MARCADO, CALCULADO, REVISADO…).
   */
  private getTipo(registro: any): string {
    return registro?.tipo || '';
  }

  getColorEstado(registro: any): string {
    // Una entrada puntual y una con tardanza comparten tipo PROGRAMADA;
    // lo que las distingue es minTardanza.
    if (this.getTipo(registro) === 'PROGRAMADA') {
      return (registro?.minTardanza ?? 0) > 0 ? '#d97706' : '#16a34a';
    }
    switch (this.getTipo(registro)) {
      case 'HORA_EXTRA_NO_PROGRAMADA': return '#7c3aed';
      case 'NO_PROGRAMADA':            return '#6366f1';
      case 'CONTINGENCIA':             return '#0891b2';
      case 'MARCACION_INCOMPLETA':     return '#d97706';
      case 'FALTA_INJUSTIFICADA':      return '#dc2626';
      default:                         return '#64748b';
    }
  }

  /**
   * true si el lector espera el segundo escaneo que confirma una entrada
   * anticipada (HU-22). Sin esto, la pantalla mostraría un mensaje de
   * éxito cuando en realidad todavía no se ha guardado nada.
   */
  requiereConfirmacion(registro: any): boolean {
    return registro?.requiereConfirmacion === true;
  }

  /**
   * Redacta el aviso de la marcación.
   *
   * El servidor devuelve un código de resultado y los datos; el texto se
   * compone aquí. Antes llegaba ya escrito, de modo que corregir una
   * palabra o cambiar el tono obligaba a recompilar el backend, y el
   * mismo texto no podía adaptarse a esta pantalla, que se lee de lejos
   * y en pocos segundos.
   */
  mensajeRegistro(registro: any): string {
    const tardanza = registro?.minTardanza ?? 0;

    switch (registro?.resultado) {
      case 'ENTRADA_OK':
        return 'Entrada registrada.';

      case 'ENTRADA_TARDE':
        return `Entrada registrada con ${tardanza} minuto`
             + `${tardanza === 1 ? '' : 's'} de tardanza.`;

      case 'SALIDA_OK':
        return 'Salida registrada. Buen trabajo.';

      case 'SALIDA_REVISION':
        return 'Salida registrada. Tu jefe revisará el tiempo adicional.';

      case 'REBOTE':
        // El lector envió dos escaneos casi seguidos: el segundo se
        // descarta para no cerrar la jornada por accidente.
        return 'Tu marcación ya se registró hace unos segundos.';

      case 'CONFIRMAR_ANTICIPADA':
        return '¿Vas a hacer horas extra? Vuelve a pasar tu código para confirmar.';

      default:
        // Respaldo para respuestas que aún traigan el texto del servidor.
        return registro?.mensaje || 'Marcación registrada.';
    }
  }

  getEtiquetaEstado(registro: any): string {
    // Puntual y tardanza comparten tipo PROGRAMADA; los separa minTardanza.
    if (this.getTipo(registro) === 'PROGRAMADA') {
      return (registro?.minTardanza ?? 0) > 0
        ? '\u26a0 TARDE (' + registro.minTardanza + ' min)'
        : '\u2713 A TIEMPO';
    }
    switch (this.getTipo(registro)) {
      case 'HORA_EXTRA_NO_PROGRAMADA': return '\u23f1 HORA EXTRA';
      case 'NO_PROGRAMADA':            return '\u2139 NO PROGRAMADA';
      case 'CONTINGENCIA':             return '\u2139 CONTINGENCIA';
      case 'MARCACION_INCOMPLETA':     return '\u26a0 INCOMPLETA';
      case 'FALTA_INJUSTIFICADA':      return '\u2717 FALTA';
      default:                         return '';
    }
  }

  // true si hay clasificacion que mostrar (evita un badge vacio).
  // Conserva el nombre para no tocar el HTML que ya lo invoca.
  tieneEstadoDiario(registro: any): boolean {
    return !!this.getTipo(registro);
  }
}