import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import * as crypto from 'crypto';

// POST /api/import/preview - Upload and preview an Excel file (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const shopId = formData.get('shopId') as string;

    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ success: false, error: 'Only Excel files (.xlsx, .xls) are supported' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if this file was already imported
    const existingImport = await adminDb.collection('importJobs')
      .where('shopId', '==', shopId)
      .where('fileHash', '==', fileHash)
      .where('status', '==', 'committed')
      .limit(1)
      .get();

    if (!existingImport.empty) {
      return NextResponse.json({
        success: false,
        error: 'This file has already been imported. Upload a different file or modify the existing one.',
      }, { status: 409 });
    }

    // Parse the Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json({ success: false, error: 'File has no data rows' }, { status: 400 });
    }

    // Find header row (look for ARTICLES or similar)
    let headerRowIdx = 0;
    const headers = rawData[0] as string[];
    
    // Try to identify column mapping
    let articleColIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || '').toLowerCase().trim();
      if (h.includes('article') || h.includes('product') || h.includes('name') || h.includes('item')) {
        articleColIdx = i;
        break;
      }
    }

    // If no header found, assume second column (column B) has names
    if (articleColIdx === -1) {
      articleColIdx = 1; // Typically column B (index 1) = "ARTICLES"
    }

    // Get existing products for duplicate detection
    const existingProducts = await adminDb.collection('products')
      .where('shopId', '==', shopId)
      .get();
    const existingNames = new Set(existingProducts.docs.map(d => d.data().name?.toLowerCase().trim()));
    const existingSkus = new Set(existingProducts.docs.map(d => d.data().sku?.toLowerCase().trim()));

    // Parse rows
    const rows = [];
    const namesSeen = new Map<string, number[]>(); // name → row indices

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as string[];
      const rawName = String(row[articleColIdx] || '').toString();
      const trimmedName = rawName.trim();

      // Skip empty rows
      if (!trimmedName) continue;

      // Skip TOTAL rows
      if (trimmedName.toLowerCase() === 'total' || trimmedName.toLowerCase() === 'totals') continue;

      // Track for duplicate detection within file
      const normalizedName = trimmedName.toLowerCase();
      if (!namesSeen.has(normalizedName)) {
        namesSeen.set(normalizedName, []);
      }
      namesSeen.get(normalizedName)!.push(i);

      // Check against existing products
      const isDuplicate = existingNames.has(normalizedName);

      rows.push({
        rowIndex: i,
        rawName,
        trimmedName,
        status: isDuplicate ? 'duplicate' as const : 'new' as const,
        error: isDuplicate ? 'Product already exists in database' : undefined,
      });
    }

    // Flag ambiguous duplicates within the file
    for (const [name, indices] of Array.from(namesSeen.entries())) {
      if (indices.length > 1) {
        rows.filter(r => r.trimmedName.toLowerCase() === name)
          .forEach(r => {
            if (r.status === 'new') {
              r.status = 'duplicate' as const;
              r.error = `Duplicate name found in rows: ${indices.join(', ')}`;
            }
          });
      }
    }

    // Generate SKUs for new products
    let skuCounter = existingProducts.size + 1;
    for (const row of rows) {
      if (row.status === 'new') {
        let sku = `PRD-${String(skuCounter).padStart(4, '0')}`;
        while (existingSkus.has(sku.toLowerCase())) {
          skuCounter++;
          sku = `PRD-${String(skuCounter).padStart(4, '0')}`;
        }
        (row as Record<string, unknown>).generatedSku = sku;
        existingSkus.add(sku.toLowerCase());
        skuCounter++;
      }
    }

    // Create import job
    const importRef = adminDb.collection('importJobs').doc();
    await importRef.set({
      shopId,
      fileName: file.name,
      fileHash,
      totalRows: rows.length,
      processedRows: rows.length,
      committedRows: 0,
      skippedRows: rows.filter(r => r.status === 'duplicate').length,
      errorRows: 0,
      rows,
      status: 'preview',
      actorUid: admin.uid,
      actorName: admin.fullName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      data: {
        importJobId: importRef.id,
        fileName: file.name,
        totalRows: rows.length,
        newProducts: rows.filter(r => r.status === 'new').length,
        duplicates: rows.filter(r => r.status === 'duplicate').length,
        rows,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Import preview error:', e);
    return NextResponse.json({ success: false, error: 'Failed to process import file' }, { status: 500 });
  }
}
