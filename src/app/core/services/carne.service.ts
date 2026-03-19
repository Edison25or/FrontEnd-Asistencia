import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import JsBarcode from 'jsbarcode';

const W = 62;
const H = 85;

interface LogoData {
  dataUrl: string;
  width:   number;
  height:  number;
}

interface Logos {
  verde: LogoData | null;
  negro: LogoData | null;
}

@Injectable({ providedIn: 'root' })
export class CarneService {

  async generarPDF(trabajadores: any[]): Promise<void> {
    const logos = await this.cargarLogos();
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [H, W * 2] });

    for (let i = 0; i < trabajadores.length; i++) {
      if (i > 0) doc.addPage();
      this.dibujarPar(doc, trabajadores[i], logos);
    }

    doc.save('carnes_trabajadores.pdf');
  }

  async generarPDFIndividual(trabajador: any): Promise<void> {
    const logos = await this.cargarLogos();
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [H, W * 2] });

    this.dibujarPar(doc, trabajador, logos);
    doc.save(`carne_${trabajador.idTrabajador}.pdf`);
  }

  // ── CARGA LOGOS ──────────────────────────────────────────────

  private async cargarLogos(): Promise<Logos> {
    const [verde, negro] = await Promise.all([
      this.cargarImagen('/logo_avendacom_verde.png'),
      this.cargarImagen('/logo_avendacom_negro.png'),
    ]);
    return { verde, negro };
  }

  // ── DIBUJO PAR ───────────────────────────────────────────────

  private dibujarPar(doc: jsPDF, t: any, logos: Logos): void {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W * 2, H, 'F');

    this.dibujarCarne(doc, 0, t, 'IN', logos.verde, '#8cc63f');
    this.dibujarCarne(doc, W, t, 'OU', logos.negro, '#808080');
  }

  // ── CARNÉ ────────────────────────────────────────────────────

  private dibujarCarne(
    doc:        jsPDF,
    ox:         number,
    t:          any,
    tipo:       'IN' | 'OU',
    logo:       LogoData | null,
    bandaColor: string
  ): void {
    const esEntrada = tipo === 'IN';
    const codigo    = `${t.idTrabajador}${tipo}`;
    const radio     = 3;
    const [cr, cg, cb] = this.hex2rgb(bandaColor);

    // ── Borde de color ──
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(1);
    doc.roundedRect(ox + 0.75, 0.75, W - 1.05, H - 1.1, radio, radio, 'FD');

    // ── Logo ──
    if (logo) {
      const aspect = logo.width / logo.height;
      let lw       = W - 6;
      let lh       = lw / aspect;
      const maxH   = 16;

      if (lh > maxH) {
        lh = maxH;
        lw = lh * aspect;
      }

      try {
        doc.addImage(logo.dataUrl, 'PNG', ox + (W - lw) / 2, 6, lw, lh, undefined, 'FAST');
      } catch (_) {}
    }

    // ── Nombre ──
    const nombres    = `${t.pNombre || ''} ${t.sNombre || ''}`.trim() || '—';
    const apellidos  = `${t.aPaterno || ''} ${t.aMaterno || ''}`.trim() || '—';

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(nombres,   ox + W / 2, 36, { align: 'center', maxWidth: W - 4 });
    doc.text(apellidos, ox + W / 2, 43, { align: 'center', maxWidth: W - 4 });

    // ── Puesto ──
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(t.puestoNombre || '—', ox + W / 2, 49, { align: 'center', maxWidth: W - 4 });

    // ── Área ──
    doc.text(t.areaNombre || '—', ox + W / 2, 53, { align: 'center', maxWidth: W - 4 });

    // ── DNI ──
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`DNI: ${t.nroDocumento || '—'}`, ox + W / 2, 58, { align: 'center' });

    // ── Banda ENTRADA / SALIDA ──
    const bandaY = 62;
    const bandaH = 8;
    doc.setFillColor(cr, cg, cb);
    doc.rect(ox + 0.75, bandaY, W - 1.5, bandaH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(esEntrada ? 'ENTRADA' : 'SALIDA', ox + W / 2, bandaY + 5.5, { align: 'center' });

    // ── Código de barras ──
    const barcodeW = W - 22;
    const barcodeH = 10;
    const barcodeY = bandaY + bandaH + 2.25;
    doc.addImage(
      this.barcodeHD(codigo), 'PNG',
      ox + (W - barcodeW) / 2, barcodeY,
      barcodeW, barcodeH,
      undefined, 'FAST'
    );
  }

  // ── BARCODE HD ───────────────────────────────────────────────

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

  // ── UTILIDADES ───────────────────────────────────────────────

  private cargarImagen(src: string): Promise<LogoData | null> {
    return new Promise(resolve => {
      const img       = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas  = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => resolve(null);
      img.src     = src;
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