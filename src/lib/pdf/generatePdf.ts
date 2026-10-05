import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export interface SaleReceiptData {
  id: string;
  shopName: string;
  actorName: string;
  recordedAt: string;
  occurredAt?: string;
  lineItems: {
    productName: string;
    productSku?: string;
    quantity: number;
    unit?: string;
  }[];
  notes?: string;
  reversed?: boolean;
}

export interface TransferDocData {
  id: string;
  sourceLocationName: string;
  destLocationName: string;
  actorName: string;
  recordedAt: string;
  occurredAt?: string;
  lineItems: {
    productName: string;
    productSku?: string;
    quantity: number;
  }[];
  notes?: string;
  reversed?: boolean;
}

export interface DailySalesReportData {
  shopName: string;
  dateStr: string; // e.g. YYYY-MM-DD or readable string
  sales: {
    id: string;
    time: string;
    actorName: string;
    itemsSummary: string;
    totalUnits: number;
    reversed: boolean;
    notes?: string;
  }[];
  productSummary: {
    productName: string;
    sku?: string;
    totalQuantity: number;
  }[];
}

function isPhoneLikeDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarse && window.innerWidth < 1024;
}

function downloadPdfFile(doc: jsPDF, filename: string) {
  const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Laptop and desktop always save a PDF file.
 * Phones try the share sheet first, then fall back to the same file download.
 */
export async function saveOrDownloadPdf(doc: jsPDF, filename: string) {
  if (isPhoneLikeDevice() && typeof navigator !== 'undefined' && 'canShare' in navigator) {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: filename,
          });
          return;
        } catch (e: unknown) {
          if (e instanceof Error && e.name === 'AbortError') return;
        }
      }
    } catch {
      // Fall through to a normal file download.
    }
  }

  downloadPdfFile(doc, filename);
}

/**
 * Generate and download an Official Sale Receipt PDF
 */
export async function downloadSaleReceiptPdf(data: SaleReceiptData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Background Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  // Shop Name & Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((data.shopName || 'RETAIL SHOP').toUpperCase(), margin + 6, y + 10);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('OFFICIAL SALE RECEIPT / CASH MEMO', margin + 6, y + 17);

  // Status Badge if reversed
  if (data.reversed) {
    doc.setFillColor(239, 68, 68); // red-500
    doc.roundedRect(pageWidth - margin - 34, y + 6, 28, 12, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('REVERSED', pageWidth - margin - 20, y + 14, { align: 'center' });
  }

  y += 30;

  // Metadata Grid
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('RECEIPT REF #', margin + 6, y + 7);
  doc.text('DATE & TIME', margin + 65, y + 7);
  doc.text('CASHIER / STAFF', margin + 125, y + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const refText = 'RCP-' + (data.id ? data.id.slice(-8).toUpperCase() : 'N/A');
  doc.text(refText, margin + 6, y + 15);

  const dateStr = data.occurredAt
    ? new Date(data.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : new Date(data.recordedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  doc.text(dateStr, margin + 65, y + 15);

  doc.text(data.actorName || 'Staff', margin + 125, y + 15);

  y += 28;

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 9, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('#', margin + 4, y + 6);
  doc.text('PRODUCT DESCRIPTION', margin + 16, y + 6);
  doc.text('SKU', margin + 115, y + 6);
  doc.text('QTY', margin + contentWidth - 6, y + 6, { align: 'right' });

  y += 9;

  // Table Rows
  let totalUnits = 0;
  data.lineItems.forEach((item, index) => {
    totalUnits += item.quantity;
    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 8, margin + contentWidth, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), margin + 4, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const prodName = doc.splitTextToSize(item.productName, 90);
    doc.text(prodName[0] || '', margin + 16, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(item.productSku || '—', margin + 115, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(item.quantity) + (item.unit ? ` ${item.unit}` : ''), margin + contentWidth - 6, y + 5.5, { align: 'right' });

    y += 8;
  });

  // Table Summary Footer
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL UNITS SOLD:', margin + 105, y + 6.5);
  doc.text(String(totalUnits) + ' Units', margin + contentWidth - 6, y + 6.5, { align: 'right' });

  y += 18;

  // Notes if any
  if (data.notes) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 16, 1.5, 1.5, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('CUSTOMER / TRANSACTION NOTES:', margin + 5, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(data.notes, margin + 5, y + 11);

    y += 24;
  }

  // Footer divider & Verification
  y = Math.max(y, 250);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('This is an electronically generated sales receipt. No signature required.', margin, y + 6);
  doc.text(`Generated on ${new Date().toLocaleString()}`, margin, y + 11);

  const cleanFilename = `Sale_Receipt_${refText}.pdf`;
  await saveOrDownloadPdf(doc, cleanFilename);
}

/**
 * Generate and download a Stock Transfer Note / Gate Pass PDF
 */
export async function downloadTransferPdf(data: TransferDocData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Background Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('STOCK TRANSFER NOTE & GATE PASS', margin + 6, y + 10);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('OFFICIAL INTERNAL GOODS DISPATCH MANIFEST', margin + 6, y + 17);

  // Status Badge if reversed
  if (data.reversed) {
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(pageWidth - margin - 34, y + 6, 28, 12, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('REVERSED', pageWidth - margin - 20, y + 14, { align: 'center' });
  }

  y += 30;

  // Route & Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 32, 1.5, 1.5, 'FD');

  const refText = 'TRF-' + (data.id ? data.id.slice(-8).toUpperCase() : 'N/A');

  // Row 1
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TRANSFER REF #', margin + 6, y + 7);
  doc.text('DISPATCH DATE & TIME', margin + 70, y + 7);
  doc.text('AUTHORIZED BY', margin + 130, y + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(refText, margin + 6, y + 14);

  const dateStr = data.occurredAt
    ? new Date(data.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : new Date(data.recordedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  doc.text(dateStr, margin + 70, y + 14);
  doc.text(data.actorName || 'Staff', margin + 130, y + 14);

  // Row 2: Route
  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 4, y + 18, margin + contentWidth - 4, y + 18);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('FROM (SOURCE LOCATION):', margin + 6, y + 23);
  doc.text('TO (DESTINATION LOCATION):', margin + 95, y + 23);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(data.sourceLocationName || 'Warehouse', margin + 6, y + 29);
  doc.text(data.destLocationName || 'Shop', margin + 95, y + 29);

  y += 38;

  // Line items table
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 9, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('#', margin + 4, y + 6);
  doc.text('ITEM / PRODUCT DISPATCHED', margin + 16, y + 6);
  doc.text('SKU / CODE', margin + 120, y + 6);
  doc.text('QUANTITY', margin + contentWidth - 6, y + 6, { align: 'right' });

  y += 9;

  let totalUnits = 0;
  data.lineItems.forEach((item, index) => {
    totalUnits += item.quantity;
    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 8, margin + contentWidth, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), margin + 4, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const prodName = doc.splitTextToSize(item.productName, 95);
    doc.text(prodName[0] || '', margin + 16, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(item.productSku || '—', margin + 120, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(item.quantity) + ' units', margin + contentWidth - 6, y + 5.5, { align: 'right' });

    y += 8;
  });

  // Table summary
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 10, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL UNITS DISPATCHED:', margin + 95, y + 6.5);
  doc.text(String(totalUnits) + ' Units', margin + contentWidth - 6, y + 6.5, { align: 'right' });

  y += 18;

  if (data.notes) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 15, 1.5, 1.5, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('TRANSFER NOTES & SPECIAL INSTRUCTIONS:', margin + 5, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(data.notes, margin + 5, y + 10.5);

    y += 22;
  }

  // Dual Sign-off Boxes (Essential for mobile stock gate passes)
  y = Math.max(y, 235);
  const boxWidth = (contentWidth - 8) / 2;

  // Box 1: Dispatched by
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, boxWidth, 32, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('DISPATCHED BY (WAREHOUSE):', margin + 5, y + 7);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Name: ${data.actorName || 'Warehouse Staff'}`, margin + 5, y + 14);
  doc.text('Signature: __________________________', margin + 5, y + 25);

  // Box 2: Received by
  doc.roundedRect(margin + boxWidth + 8, y, boxWidth, 32, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('RECEIVED BY (SHOP STORE):', margin + boxWidth + 13, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Shop: ${data.destLocationName || 'Shop Store'}`, margin + boxWidth + 13, y + 14);
  doc.text('Signature: __________________________', margin + boxWidth + 13, y + 25);

  y += 38;
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`System Transfer ID: ${data.id || 'N/A'} • Generated on ${new Date().toLocaleString()}`, margin, y + 5);

  const cleanFilename = `Transfer_Note_${refText}.pdf`;
  await saveOrDownloadPdf(doc, cleanFilename);
}

/**
 * Generate and download a Daily Sales Summary Report PDF
 */
export async function downloadDailySalesPdf(report: DailySalesReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((report.shopName || 'SHOP INVENTORY').toUpperCase(), margin + 6, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`DAILY SALES SUMMARY REPORT — ${report.dateStr}`, margin + 6, y + 17);

  y += 30;

  // High-level KPI Cards
  const activeSales = report.sales.filter(s => !s.reversed);
  const totalUnits = activeSales.reduce((acc, s) => acc + s.totalUnits, 0);
  const reversedCount = report.sales.filter(s => s.reversed).length;

  const cardWidth = (contentWidth - 6) / 3;

  // Card 1: Total Sales
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL TRANSACTIONS', margin + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(report.sales.length), margin + 5, y + 14);

  // Card 2: Units Sold
  doc.roundedRect(margin + cardWidth + 3, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('ACTIVE UNITS SOLD', margin + cardWidth + 8, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(totalUnits.toLocaleString() + ' Units', margin + cardWidth + 8, y + 14);

  // Card 3: Reversed Count
  doc.roundedRect(margin + (cardWidth + 3) * 2, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('REVERSED / VOIDED', margin + (cardWidth + 3) * 2 + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(reversedCount > 0 ? 239 : 100, reversedCount > 0 ? 68 : 116, reversedCount > 0 ? 68 : 139);
  doc.text(`${reversedCount} ${reversedCount === 1 ? 'sale' : 'sales'}`, margin + (cardWidth + 3) * 2 + 5, y + 14);

  y += 24;

  // Section 1: Product Turnover Summary Table
  if (report.productSummary && report.productSummary.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('PRODUCT TURNOVER BREAKDOWN (TODAY)', margin, y + 4);

    y += 7;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, 'FD');

    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('PRODUCT NAME', margin + 4, y + 5);
    doc.text('SKU', margin + 115, y + 5);
    doc.text('TOTAL UNITS SOLD', margin + contentWidth - 4, y + 5, { align: 'right' });

    y += 7;
    report.productSummary.slice(0, 15).forEach((p, idx) => {
      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 7, margin + contentWidth, y + 7);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const name = doc.splitTextToSize(p.productName, 90);
      doc.text(name[0] || '', margin + 4, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(p.sku || '—', margin + 115, y + 5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text(String(p.totalQuantity) + ' units', margin + contentWidth - 4, y + 5, { align: 'right' });

      y += 7;
    });

    y += 7;
  }

  // Section 2: Detailed Sales Transactions Log
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('ITEMIZED SALES LOG', margin, y + 4);

  y += 7;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 7, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('TIME', margin + 4, y + 5);
  doc.text('CASHIER', margin + 28, y + 5);
  doc.text('ITEMS SOLD', margin + 65, y + 5);
  doc.text('STATUS', margin + 140, y + 5);
  doc.text('UNITS', margin + contentWidth - 4, y + 5, { align: 'right' });

  y += 7;

  report.sales.slice(0, 30).forEach((s, idx) => {
    // Check if new page needed
    if (y > 270) {
      doc.addPage();
      y = 16;
    }

    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7.5, margin + contentWidth, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(s.time || '-', margin + 4, y + 5);

    doc.text(s.actorName || 'Staff', margin + 28, y + 5);

    const itemsText = doc.splitTextToSize(s.itemsSummary || '-', 70);
    doc.text(itemsText[0] || '', margin + 65, y + 5);

    if (s.reversed) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(239, 68, 68);
      doc.text('Reversed', margin + 140, y + 5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text('Active', margin + 140, y + 5);
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(s.totalUnits), margin + contentWidth - 4, y + 5, { align: 'right' });

    y += 7.5;
  });

  // Footer
  y = Math.max(y + 8, 275);
  if (y > 280) {
    doc.addPage();
    y = 20;
  }
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, margin + contentWidth, y);
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Daily Sales Report generated on ${new Date().toLocaleString()}`, margin, y + 5);

  const cleanFilename = `Daily_Sales_${report.dateStr.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  await saveOrDownloadPdf(doc, cleanFilename);
}

export interface GenericMovementExport {
  id: string;
  type?: string;
  lineItems: { productName: string; quantity: number }[];
  actorName: string;
  recordedAt: string;
  occurredAt?: string;
  reversed: boolean;
  notes?: string;
  sourceLocationName?: string;
  destLocationName?: string;
}

/**
 * Helper to add header & page numbers to all pages of a document
 */
function applyPageNumbers(doc: jsPDF, title: string) {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`${title} • Generated ${new Date().toLocaleString()}`, margin, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, margin + contentWidth, pageHeight - 7, { align: 'right' });
  }
}

/**
 * Generate and download an OVERALL All Sales Records PDF (Multi-page)
 */
export async function downloadAllSalesRecordPdf(shopName: string, sales: GenericMovementExport[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((shopName || 'SHOP STORE').toUpperCase(), margin + 6, y + 10);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('COMPLETE SALES LEDGER & MASTER RECORD', margin + 6, y + 17);

  y += 30;

  // Summary KPI Cards
  const activeSales = sales.filter((s) => !s.reversed);
  const totalUnits = activeSales.reduce(
    (sum, s) => sum + (s.lineItems?.reduce((sub, li) => sub + (li.quantity || 0), 0) || 0),
    0
  );
  const reversedCount = sales.filter((s) => s.reversed).length;
  const cardWidth = (contentWidth - 6) / 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);

  // Card 1
  doc.roundedRect(margin, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL SALES ENTRIES', margin + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(sales.length), margin + 5, y + 14);

  // Card 2
  doc.roundedRect(margin + cardWidth + 3, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('ACTIVE UNITS SOLD', margin + cardWidth + 8, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(totalUnits.toLocaleString() + ' Units', margin + cardWidth + 8, y + 14);

  // Card 3
  doc.roundedRect(margin + (cardWidth + 3) * 2, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('REVERSED SALES', margin + (cardWidth + 3) * 2 + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(reversedCount > 0 ? 239 : 100, reversedCount > 0 ? 68 : 116, reversedCount > 0 ? 68 : 139);
  doc.text(`${reversedCount} Reversed`, margin + (cardWidth + 3) * 2 + 5, y + 14);

  y += 24;

  const drawTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('DATE', margin + 4, y + 5);
    doc.text('REF #', margin + 28, y + 5);
    doc.text('ITEMS SOLD', margin + 55, y + 5);
    doc.text('CASHIER', margin + 125, y + 5);
    doc.text('STATUS', margin + 155, y + 5);
    doc.text('UNITS', margin + contentWidth - 4, y + 5, { align: 'right' });
    y += 7;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`COMPLETE TRANSACTION LIST (${sales.length} RECORDS)`, margin, y + 4);
  y += 7;

  drawTableHeader();

  sales.forEach((s, idx) => {
    if (y + 9 > pageHeight - 20) {
      doc.addPage();
      y = 16;
      drawTableHeader();
    }

    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7.5, margin + contentWidth, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const dateText = s.occurredAt
      ? new Date(s.occurredAt).toLocaleDateString([], { dateStyle: 'short' })
      : new Date(s.recordedAt).toLocaleDateString([], { dateStyle: 'short' });
    doc.text(dateText, margin + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(s.id.slice(-6).toUpperCase(), margin + 28, y + 5);

    doc.setFont('helvetica', 'normal');
    const itemsSummary = s.lineItems?.map((li) => `${li.productName} ×${li.quantity}`).join(', ') || '—';
    const splitSummary = doc.splitTextToSize(itemsSummary, 68);
    doc.text(splitSummary[0] || '—', margin + 55, y + 5);

    doc.text(s.actorName || 'Staff', margin + 125, y + 5);

    if (s.reversed) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(239, 68, 68);
      doc.text('Reversed', margin + 155, y + 5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text('Active', margin + 155, y + 5);
    }

    const units = s.lineItems?.reduce((acc, li) => acc + (li.quantity || 0), 0) || 0;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(units), margin + contentWidth - 4, y + 5, { align: 'right' });

    y += 7.5;
  });

  applyPageNumbers(doc, `${shopName} — Sales Ledger`);
  await saveOrDownloadPdf(doc, `All_Sales_Records_${shopName.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Generate and download an OVERALL All Transfers Records PDF (Multi-page)
 */
export async function downloadAllTransfersRecordPdf(shopName: string, transfers: GenericMovementExport[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Banner
  doc.setFillColor(30, 41, 59); // slate-800
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((shopName || 'SHOP STORE').toUpperCase(), margin + 6, y + 10);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('COMPLETE STOCK TRANSFERS & DISPATCH MANIFEST', margin + 6, y + 17);

  y += 30;

  const activeTransfers = transfers.filter((t) => !t.reversed);
  const totalUnits = activeTransfers.reduce(
    (sum, t) => sum + (t.lineItems?.reduce((sub, li) => sub + (li.quantity || 0), 0) || 0),
    0
  );
  const reversedCount = transfers.filter((t) => t.reversed).length;
  const cardWidth = (contentWidth - 6) / 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);

  doc.roundedRect(margin, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL TRANSFERS', margin + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(transfers.length), margin + 5, y + 14);

  doc.roundedRect(margin + cardWidth + 3, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('ACTIVE UNITS TRANSFERRED', margin + cardWidth + 8, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(16, 185, 129);
  doc.text(totalUnits.toLocaleString() + ' Units', margin + cardWidth + 8, y + 14);

  doc.roundedRect(margin + (cardWidth + 3) * 2, y, cardWidth, 18, 1.5, 1.5, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('REVERSED TRANSFERS', margin + (cardWidth + 3) * 2 + 5, y + 6);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(reversedCount > 0 ? 239 : 100, reversedCount > 0 ? 68 : 116, reversedCount > 0 ? 68 : 139);
  doc.text(`${reversedCount} Reversed`, margin + (cardWidth + 3) * 2 + 5, y + 14);

  y += 24;

  const drawTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('DATE', margin + 4, y + 5);
    doc.text('REF #', margin + 28, y + 5);
    doc.text('ROUTE (FROM -> TO)', margin + 52, y + 5);
    doc.text('ITEMS DISPATCHED', margin + 115, y + 5);
    doc.text('STATUS', margin + 155, y + 5);
    doc.text('UNITS', margin + contentWidth - 4, y + 5, { align: 'right' });
    y += 7;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`COMPLETE TRANSFER LIST (${transfers.length} RECORDS)`, margin, y + 4);
  y += 7;

  drawTableHeader();

  transfers.forEach((t, idx) => {
    if (y + 9 > pageHeight - 20) {
      doc.addPage();
      y = 16;
      drawTableHeader();
    }

    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7.5, margin + contentWidth, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const dateText = t.recordedAt ? new Date(t.recordedAt).toLocaleDateString([], { dateStyle: 'short' }) : '-';
    doc.text(dateText, margin + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(t.id.slice(-6).toUpperCase(), margin + 28, y + 5);

    doc.setFont('helvetica', 'normal');
    const routeText = `${t.sourceLocationName || 'Warehouse'} -> ${t.destLocationName || 'Shop'}`;
    const splitRoute = doc.splitTextToSize(routeText, 60);
    doc.text(splitRoute[0] || '—', margin + 52, y + 5);

    const itemsSummary = t.lineItems?.map((li) => `${li.productName} ×${li.quantity}`).join(', ') || '—';
    const splitItems = doc.splitTextToSize(itemsSummary, 38);
    doc.text(splitItems[0] || '—', margin + 115, y + 5);

    if (t.reversed) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(239, 68, 68);
      doc.text('Reversed', margin + 155, y + 5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text('Active', margin + 155, y + 5);
    }

    const units = t.lineItems?.reduce((acc, li) => acc + (li.quantity || 0), 0) || 0;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(String(units), margin + contentWidth - 4, y + 5, { align: 'right' });

    y += 7.5;
  });

  applyPageNumbers(doc, `${shopName} — Transfers Manifest`);
  await saveOrDownloadPdf(doc, `All_Transfers_Records_${shopName.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Generate and download an OVERALL Master History / Ledger Records PDF (Multi-page)
 */
export async function downloadMasterHistoryReportPdf(
  shopName: string,
  movements: GenericMovementExport[],
  filterLabel = 'All Movements'
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((shopName || 'MASTER LEDGER').toUpperCase(), margin + 6, y + 10);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`COMPLETE AUDIT TRAIL & TRANSACTION HISTORY • ${filterLabel.toUpperCase()}`, margin + 6, y + 17);

  y += 30;

  // Breakdown metrics
  const totalCount = movements.length;
  const salesCount = movements.filter((m) => m.type === 'sale').length;
  const transfersCount = movements.filter((m) => m.type?.includes('transfer')).length;
  const receivedCount = movements.filter((m) => m.type === 'stock_received').length;
  const reversedCount = movements.filter((m) => m.reversed || m.type === 'reversal').length;

  const cardWidth = (contentWidth - 9) / 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);

  // 4 mini stat boxes
  const stats = [
    { label: 'ALL MOVEMENTS', val: String(totalCount), color: [15, 23, 42] },
    { label: 'TOTAL SALES', val: String(salesCount), color: [16, 185, 129] },
    { label: 'TRANSFERS', val: String(transfersCount), color: [59, 130, 246] },
    { label: 'REVERSALS', val: String(reversedCount), color: [239, 68, 68] },
  ];

  stats.forEach((st, i) => {
    const x = margin + i * (cardWidth + 3);
    doc.roundedRect(x, y, cardWidth, 16, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(st.label, x + 4, y + 5.5);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(st.color[0], st.color[1], st.color[2]);
    doc.text(st.val, x + 4, y + 13);
  });

  y += 22;

  const drawTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('DATE', margin + 4, y + 5);
    doc.text('TYPE', margin + 28, y + 5);
    doc.text('ITEMS AFFECTED', margin + 62, y + 5);
    doc.text('STAFF / ACTOR', margin + 130, y + 5);
    doc.text('STATUS', margin + contentWidth - 4, y + 5, { align: 'right' });
    y += 7;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`TRANSACTION LEDGER (${movements.length} RECORDS)`, margin, y + 4);
  y += 7;

  drawTableHeader();

  movements.forEach((m, idx) => {
    if (y + 9 > pageHeight - 20) {
      doc.addPage();
      y = 16;
      drawTableHeader();
    }

    const isEven = idx % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 7.5, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y + 7.5, margin + contentWidth, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const dateText = m.recordedAt ? new Date(m.recordedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
    doc.text(dateText, margin + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const typeClean = (m.type || 'Movement').replace(/_/g, ' ');
    doc.text(typeClean.slice(0, 18), margin + 28, y + 5);

    doc.setFont('helvetica', 'normal');
    const itemsSummary = m.lineItems?.map((li) => `${li.productName} ×${li.quantity}`).join(', ') || '—';
    const splitSummary = doc.splitTextToSize(itemsSummary, 64);
    doc.text(splitSummary[0] || '—', margin + 62, y + 5);

    doc.text(m.actorName || 'Staff', margin + 130, y + 5);

    if (m.reversed) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(239, 68, 68);
      doc.text('Reversed', margin + contentWidth - 4, y + 5, { align: 'right' });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text('Active', margin + contentWidth - 4, y + 5, { align: 'right' });
    }

    y += 7.5;
  });

  applyPageNumbers(doc, `${shopName} — Master History`);
  await saveOrDownloadPdf(doc, `Master_History_${shopName.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Universal Excel Exporter for spreadsheet downloads
 */
export function exportToExcel(
  filename: string,
  sheets: { name: string; data: Record<string, unknown>[] }[]
) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

