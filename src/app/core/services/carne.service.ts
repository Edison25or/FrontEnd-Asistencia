import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

/** Medidas del carné, en milímetros. */
const W = 62;
const H = 85;

interface LogoData {
  dataUrl: string;
  width:   number;
  height:  number;
}

/**
 * Generación de carnés (CU11).
 *
 * ============================================================
 * UN SOLO CÓDIGO POR TRABAJADOR
 * ============================================================
 * La versión anterior imprimía DOS carnés por trabajador, uno de ENTRADA
 * con sufijo IN y otro de SALIDA con sufijo OU, y el algoritmo de
 * marcación deducía la acción del sufijo escaneado.
 *
 * Eso contradice RT-02, que exige un único código por trabajador, y
 * además hacía posible un error habitual: pasar el carné equivocado y
 * registrar una salida cuando se estaba entrando.
 *
 * Ahora el código es uno solo y el sistema deduce si es entrada o salida
 * del estado de la jornada: si hay una jornada abierta en la ventana, el
 * escaneo es una salida; si hay una pendiente, es una entrada.
 *
 * El valor se toma de `codigoBarras`, que el backend genera y almacena en
 * el trabajador. NO se construye aquí concatenando el identificador: si
 * mañana se cambia por un código aleatorio no adivinable, el carné sigue
 * imprimiendo lo correcto sin tocar este archivo.
 */
@Injectable({ providedIn: 'root' })
export class CarneService {

  /** Un carné por página. Ya no hay que doblar la hoja. */
  async generarPDF(trabajadores: any[]): Promise<void> {
    const logo = await this.cargarImagen('/logo_avendacom_verde.png');
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] });

    for (let i = 0; i < trabajadores.length; i++) {
      if (i > 0) doc.addPage([W, H], 'portrait');
      this.dibujarCarne(doc, trabajadores[i], logo);
    }

    doc.save('carnes_trabajadores.pdf');
  }

  async generarPDFIndividual(trabajador: any): Promise<void> {
    const logo = await this.cargarImagen('/logo_avendacom_verde.png');
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] });

    this.dibujarCarne(doc, trabajador, logo);
    doc.save(`carne_${trabajador.codigoBarras || trabajador.idTrabajador}.pdf`);
  }

  // ════════════════════════════════════════════════════════════
  // DIBUJO
  // ════════════════════════════════════════════════════════════

  private dibujarCarne(doc: jsPDF, t: any, logo: LogoData | null): void {
    // El código lo entrega el backend; aquí no se construye.
    const codigo = String(t.codigoBarras ?? '').trim();
    const radio  = 3;
    const [cr, cg, cb] = this.hex2rgb('#8cc63f');

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, 'F');

    // ── Borde ──
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(1);
    doc.roundedRect(0.75, 0.75, W - 1.5, H - 1.5, radio, radio, 'FD');

    // ── Logo ──
    if (logo) {
      const aspect = logo.width / logo.height;
      let lw = W - 6;
      let lh = lw / aspect;
      const maxH = 16;
      if (lh > maxH) { lh = maxH; lw = lh * aspect; }
      try {
        doc.addImage(logo.dataUrl, 'PNG', (W - lw) / 2, 6, lw, lh, undefined, 'FAST');
      } catch (_) { /* logo opcional */ }
    }

    // ── Nombre ──
    const nombres   = `${t.pNombre || ''} ${t.sNombre || ''}`.trim() || '—';
    const apellidos = `${t.aPaterno || ''} ${t.aMaterno || ''}`.trim() || '—';

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(nombres,   W / 2, 36, { align: 'center', maxWidth: W - 4 });
    doc.text(apellidos, W / 2, 43, { align: 'center', maxWidth: W - 4 });

    // ── Puesto y área ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(t.puestoNombre || '—', W / 2, 49, { align: 'center', maxWidth: W - 4 });
    doc.text(t.areaNombre   || '—', W / 2, 53, { align: 'center', maxWidth: W - 4 });

    // ── Documento ──
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`DNI: ${t.nroDocumento || '—'}`, W / 2, 58, { align: 'center' });

    // ── Banda ──
    // Sin ENTRADA ni SALIDA: el mismo carné sirve para ambas.
    const bandaY = 62;
    const bandaH = 8;
    doc.setFillColor(cr, cg, cb);
    doc.rect(0.75, bandaY, W - 1.5, bandaH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CONTROL DE ASISTENCIA', W / 2, bandaY + 5.5, { align: 'center' });

    // ── Código de barras ──
    if (codigo) {
      const barcodeW = W - 22;
      const barcodeH = 10;
      const barcodeY = bandaY + bandaH + 2.25;
      doc.addImage(
        this.barcodeHD(codigo), 'PNG',
        (W - barcodeW) / 2, barcodeY,
        barcodeW, barcodeH,
        undefined, 'FAST'
      );
    } else {
      // Un trabajador sin código no puede marcar: findByCodigoBarras no lo
      // encuentra. Mejor decirlo en el carné que imprimir uno inservible.
      doc.setTextColor(200, 60, 60);
      doc.setFontSize(8);
      doc.text('SIN CÓDIGO ASIGNADO', W / 2, bandaY + bandaH + 8, { align: 'center' });
    }
  }

  // ════════════════════════════════════════════════════════════
  // BARCODE
  // ════════════════════════════════════════════════════════════

  /**
   * Genera el código a 6x y lo reduce, para que el PDF salga nítido en
   * impresión. Un barcode al tamaño final se ve dentado y algunos
   * lectores fallan.
   */
  private barcodeHD(codigo: string): string {
    const sc  = 6;
    const src = document.createElement('canvas');

    JsBarcode(src, codigo, {
      format:       'CODE128',
      width:        2.5 * sc,
      height:       45  * sc,
      displayValue: true,
      fontSize:     13  * sc,
      margin:       2   * sc,
      background:   '#ffffff',
      lineColor:    '#000000',
      font:         'monospace',
      textMargin:   4   * sc,
      fontOptions:  'bold',
    });

    const out = document.createElement('canvas');
    out.width  = Math.round(src.width  / sc);
    out.height = Math.round(src.height / sc);
    const ctx  = out.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, out.width, out.height);

    return out.toDataURL('image/png');
  }

  // ════════════════════════════════════════════════════════════
  // UTILIDADES
  // ════════════════════════════════════════════════════════════

  private cargarImagen(src: string): Promise<LogoData | null> {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width:   img.naturalWidth,
          height:  img.naturalHeight
        });
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  private hex2rgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
}
