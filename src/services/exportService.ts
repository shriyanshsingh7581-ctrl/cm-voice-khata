import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  APP_OFFICIAL_NAME,
  Bill,
  BusinessProfile,
  CatalogItem,
  Party,
  SavedBillPhoto,
  ShopSettings,
} from '../types';

export function formatINR(amount: number): string {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
}

async function urlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates and downloads a branded A4 or Thermal 80mm PDF Invoice for a Bill.
 */
export async function downloadBillInvoicePDF(
  bill: Bill,
  businessProfile: BusinessProfile,
  shopSettings: ShopSettings,
  partyBalance?: number
) {
  const isThermal = shopSettings.defaultInvoiceDesign === 'Thermal 80mm';
  const doc = isThermal
    ? new jsPDF({ unit: 'mm', format: [80, 210] })
    : new jsPDF({ unit: 'mm', format: 'a4' });

  const pageWidth = isThermal ? 80 : 210;
  const margin = isThermal ? 5 : 14;
  let y = isThermal ? 8 : 16;

  // Header Banner
  if (!isThermal) {
    doc.setFillColor(27, 155, 98); // Emerald #1B9B62
    doc.rect(0, 0, pageWidth, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(businessProfile.businessName || APP_OFFICIAL_NAME, margin, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const subLines: string[] = [];
    if (businessProfile.address) subLines.push(businessProfile.address);
    if (shopSettings.showPhoneOnInvoice && businessProfile.phone1) {
      subLines.push(`Phone: ${businessProfile.phone1}`);
    }
    if (businessProfile.gstin) subLines.push(`GSTIN: ${businessProfile.gstin}`);
    doc.text(subLines.join('  |  ') || 'Smart Digital Invoice & Khata', margin, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(bill.txnType.toUpperCase(), pageWidth - margin, 14, { align: 'right' });
    doc.setFontSize(10);
    doc.text(`#${bill.billNumber}`, pageWidth - margin, 22, { align: 'right' });
    y = 42;
  } else {
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(businessProfile.businessName || APP_OFFICIAL_NAME, pageWidth / 2, y, {
      align: 'center',
    });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (shopSettings.showPhoneOnInvoice && businessProfile.phone1) {
      doc.text(`Ph: ${businessProfile.phone1}`, pageWidth / 2, y, { align: 'center' });
      y += 4;
    }
    doc.text(`${bill.txnType}  |  #${bill.billNumber}`, pageWidth / 2, y, { align: 'center' });
    y += 4;
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  }

  // Party & Bill Meta
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isThermal ? 8 : 10);
  doc.text(`Party: ${bill.partyName}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${bill.date}`, pageWidth - margin, y, { align: 'right' });
  y += isThermal ? 4 : 6;

  if (bill.phone) {
    doc.text(`Phone: ${bill.phone}`, margin, y);
  }
  if (bill.supplierBillNo) {
    doc.text(`Supplier Bill: ${bill.supplierBillNo}`, pageWidth - margin, y, { align: 'right' });
  }
  if (bill.phone || bill.supplierBillNo) {
    y += isThermal ? 4 : 6;
  }
  if (bill.gstin) {
    doc.text(`Party GSTIN: ${bill.gstin}`, margin, y);
    y += isThermal ? 4 : 6;
  }

  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += isThermal ? 4 : 6;

  // Items Table Header
  if (bill.items && bill.items.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 7.5 : 9.5);
    doc.text('Item', margin, y);
    doc.text('Qty', pageWidth * 0.52, y);
    doc.text('Rate', pageWidth * 0.7, y);
    doc.text('Total', pageWidth - margin, y, { align: 'right' });
    y += isThermal ? 3 : 4;
    doc.line(margin, y, pageWidth - margin, y);
    y += isThermal ? 4 : 6;

    doc.setFont('helvetica', 'normal');
    for (const item of bill.items) {
      doc.text(String(item.name).slice(0, isThermal ? 16 : 36), margin, y);
      doc.text(`${item.qty} ${item.unit || ''}`, pageWidth * 0.52, y);
      doc.text(`Rs.${item.rate}`, pageWidth * 0.7, y);
      doc.text(`Rs.${item.total.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
      y += isThermal ? 4.5 : 6.5;
    }

    doc.line(margin, y, pageWidth - margin, y);
    y += isThermal ? 4 : 6;
  }

  // Totals Section
  doc.setFontSize(isThermal ? 8 : 10);
  if (bill.discount > 0) {
    doc.text('Discount:', pageWidth * 0.55, y);
    doc.text(`- Rs.${bill.discount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += isThermal ? 4 : 5.5;
  }
  if (bill.deliveryCharge > 0) {
    doc.text('Delivery / Freight:', pageWidth * 0.55, y);
    doc.text(`+ Rs.${bill.deliveryCharge.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += isThermal ? 4 : 5.5;
  }
  if (bill.gstAmount > 0) {
    doc.text(`GST (${bill.gstPercent}%):`, pageWidth * 0.55, y);
    doc.text(`+ Rs.${bill.gstAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
    y += isThermal ? 4 : 5.5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isThermal ? 9.5 : 12);
  doc.text('Grand Total:', pageWidth * 0.52, y);
  doc.text(`Rs.${bill.totalAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
  y += isThermal ? 5 : 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isThermal ? 8 : 10);
  doc.text(`Paid (${bill.paymentMode}):`, pageWidth * 0.52, y);
  doc.text(`Rs.${bill.receivedAmount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
  y += isThermal ? 4 : 6;

  doc.setFont('helvetica', 'bold');
  doc.text('Balance Due:', pageWidth * 0.52, y);
  doc.text(`Rs.${bill.balanceDue.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
  y += isThermal ? 5 : 8;

  // Paid Stamp if enabled and fully paid
  if (shopSettings.showPaidStampOnBills && bill.balanceDue <= 0 && bill.totalAmount > 0) {
    doc.setDrawColor(27, 155, 98);
    doc.setTextColor(27, 155, 98);
    doc.rect(margin, y - 6, 28, 9);
    doc.setFontSize(10);
    doc.text('PAID IN FULL', margin + 14, y, { align: 'center' });
    doc.setTextColor(15, 23, 42);
    y += 6;
  }

  // Party Balance if enabled
  if (shopSettings.showPartyBalanceOnBills && typeof partyBalance === 'number') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 7.5 : 9);
    const balLabel =
      partyBalance >= 0
        ? `Running Party Balance (Receivable): Rs.${Math.abs(partyBalance).toFixed(2)}`
        : `Running Party Balance (Payable): Rs.${Math.abs(partyBalance).toFixed(2)}`;
    doc.text(balLabel, margin, y);
    y += isThermal ? 5 : 7;
  }

  if (bill.note) {
    doc.setFontSize(isThermal ? 7.5 : 9);
    doc.text(`Note: ${bill.note}`, margin, y);
    y += isThermal ? 5 : 7;
  }

  // Digital Signature if saved in BusinessProfile (supports Cloudinary URL or DataURL)
  if (businessProfile.signatureUrl) {
    const sigData = await urlToDataUrl(businessProfile.signatureUrl);
    if (sigData) {
      try {
        doc.addImage(sigData, 'PNG', pageWidth - margin - 35, y, 32, 14);
        y += 16;
        doc.setFontSize(8);
        doc.text('Authorized Signatory', pageWidth - margin, y, { align: 'right' });
        y += 6;
      } catch {
        // ignore signature embed failure
      }
    }
  }

  // Footer Branding ("Powered by CM Voice Khata")
  if (shopSettings.showBranding) {
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 7.5 : 9);
    doc.setTextColor(106, 76, 255); // Royal Purple #6A4CFF
    doc.text(`Powered by ${APP_OFFICIAL_NAME}`, pageWidth / 2, y, { align: 'center' });
  }

  doc.save(`${APP_OFFICIAL_NAME.replace(/\s+/g, '_')}_${bill.billNumber}.pdf`);
}

/**
 * Exports any tabular report (Sale Report, Daybook, Parties Ledger, Bills, Items) to PDF.
 */
export function exportReportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  showBranding = true
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFillColor(106, 76, 255);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`${APP_OFFICIAL_NAME} — ${title}`, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 14, 19);

  let y = 34;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);

  const colWidth = 182 / Math.max(1, headers.length);
  headers.forEach((h, i) => {
    doc.text(String(h).slice(0, 22), 14 + i * colWidth, y);
  });
  y += 3;
  doc.line(14, y, 196, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const row of rows) {
    if (y > 272) {
      doc.addPage();
      y = 20;
    }
    row.forEach((cell, i) => {
      doc.text(String(cell ?? '').slice(0, 24), 14 + i * colWidth, y);
    });
    y += 6;
  }

  if (showBranding) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(106, 76, 255);
    doc.text(`Powered by ${APP_OFFICIAL_NAME}`, 105, 287, { align: 'center' });
  }

  doc.save(`${APP_OFFICIAL_NAME.replace(/\s+/g, '_')}_${title.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Exports any data array to Excel (.xlsx).
 */
export function exportToExcel(sheetName: string, data: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(
    data.length > 0 ? data : [{ Notice: `No entries recorded yet in ${APP_OFFICIAL_NAME}` }]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(
    workbook,
    `${APP_OFFICIAL_NAME.replace(/\s+/g, '_')}_${sheetName.replace(/\s+/g, '_')}.xlsx`
  );
}

/**
 * Parses an uploaded Excel/CSV file into CatalogItem definitions.
 */
export async function parseCatalogExcelFile(
  file: File
): Promise<Array<Pick<CatalogItem, 'name' | 'unit' | 'salePrice' | 'purchasePrice' | 'stockQty' | 'barcode' | 'hsn' | 'gstPercent'>>> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]);

  return rawRows
    .map((r) => {
      const name = String(
        r.Name || r.name || r['Item Name'] || r.Product || r.product || ''
      ).trim();
      const unit = String(r.Unit || r.unit || 'pcs').trim();
      const salePrice = Number(r['Sale Price'] || r.salePrice || r.Price || r.Rate || 0) || 0;
      const purchasePrice =
        Number(r['Purchase Price'] || r.purchasePrice || r.Cost || salePrice * 0.85) || 0;
      const stockQty = Number(r.Stock || r.stockQty || r.Qty || r.Quantity || 0) || 0;
      const barcode = String(r.Barcode || r.barcode || r.SKU || '').trim();
      const hsn = String(r.HSN || r.hsn || '').trim();
      const gstPercent = Number(r.GST || r.gstPercent || 0) || 0;
      return {
        name,
        unit,
        salePrice,
        purchasePrice,
        stockQty,
        barcode,
        hsn,
        gstPercent,
      };
    })
    .filter((item) => item.name.length > 0);
}

/**
 * Builds a WhatsApp share URL (`https://wa.me/...`) for digital bills, normal saved bill photos, or payment reminders.
 */
export function getWhatsAppShareUrl(phone: string, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const cleanPhone = digits.length === 10 ? `91${digits}` : digits;
  const encoded = encodeURIComponent(message);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function buildBillWhatsAppMessage(
  bill: Bill,
  businessName: string,
  showBranding = true
): string {
  const lines = [
    `*${businessName || APP_OFFICIAL_NAME}*`,
    `${bill.txnType} #${bill.billNumber}`,
    `Date: ${bill.date}`,
    `Party: ${bill.partyName}`,
    `Total Amount: ₹${bill.totalAmount.toFixed(2)}`,
    `Paid: ₹${bill.receivedAmount.toFixed(2)} (${bill.paymentMode})`,
    `Balance Due: ₹${bill.balanceDue.toFixed(2)}`,
  ];
  if (bill.attachmentUrl) {
    lines.push(`Bill Photo: ${bill.attachmentUrl}`);
  }
  if (showBranding) {
    lines.push(`\n_Powered by ${APP_OFFICIAL_NAME}_`);
  }
  return lines.join('\n');
}

export function buildSavedPhotoWhatsAppMessage(
  photo: SavedBillPhoto,
  businessName: string,
  showBranding = true
): string {
  const lines = [
    `*${businessName || APP_OFFICIAL_NAME}*`,
    `📷 Saved ${photo.billType} Bill Photo`,
    `Party: ${photo.partyName || 'Walk-in'}`,
    `Date: ${photo.date}`,
  ];
  if (photo.amount > 0) {
    lines.push(`Amount: ₹${photo.amount.toFixed(2)}`);
  }
  if (photo.note) {
    lines.push(`Note: ${photo.note}`);
  }
  lines.push(`View Bill Photo: ${photo.imageUrl}`);
  if (showBranding) {
    lines.push(`\n_Powered by ${APP_OFFICIAL_NAME}_`);
  }
  return lines.join('\n');
}

export function buildPartyReminderWhatsAppMessage(
  party: Party,
  businessName: string,
  showBranding = true
): string {
  const due = Math.abs(party.balance);
  const lines = [
    `Namaste *${party.name}* ji,`,
    `A gentle payment reminder from *${businessName || APP_OFFICIAL_NAME}*.`,
    party.balance >= 0
      ? `Your current pending balance due is *₹${due.toFixed(2)}*. Kindly clear the dues at your earliest convenience.`
      : `Our current ledger balance with you is *₹${due.toFixed(2)}*.`,
  ];
  if (showBranding) {
    lines.push(`\n_Powered by ${APP_OFFICIAL_NAME}_`);
  }
  return lines.join('\n');
}
