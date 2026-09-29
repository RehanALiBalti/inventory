import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/verify';
import { FieldValue } from 'firebase-admin/firestore';

// POST /api/import/commit - Commit an import job (admin only)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const { importJobId, shopId } = body;

    if (!importJobId) {
      return NextResponse.json({ success: false, error: 'Import job ID required' }, { status: 400 });
    }
    if (!shopId) {
      return NextResponse.json({ success: false, error: 'shopId is required' }, { status: 400 });
    }

    const importRef = adminDb.collection('importJobs').doc(importJobId);
    const importDoc = await importRef.get();

    if (!importDoc.exists) {
      return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
    }

    const importData = importDoc.data()!;

    if (importData.shopId !== shopId) {
      return NextResponse.json({ success: false, error: 'Import job does not belong to this shop' }, { status: 400 });
    }

    if (importData.status === 'committed') {
      return NextResponse.json({ success: true, data: { alreadyCommitted: true } });
    }

    if (importData.status !== 'preview') {
      return NextResponse.json({ success: false, error: 'Import job is not in preview status' }, { status: 400 });
    }

    // Commit new products
    const rows = importData.rows || [];
    const newRows = rows.filter((r: Record<string, unknown>) => r.status === 'new');
    let committed = 0;
    const errors: string[] = [];

    // Process in batches (Firestore batch limit is 500)
    const batchSize = 400;
    for (let i = 0; i < newRows.length; i += batchSize) {
      const batch = adminDb.batch();
      const chunk = newRows.slice(i, i + batchSize);

      for (const row of chunk) {
        try {
          const productRef = adminDb.collection('products').doc();

          // Double-check SKU uniqueness WITHIN THE SHOP
          const skuCheck = await adminDb.collection('products')
            .where('shopId', '==', shopId)
            .where('sku', '==', row.generatedSku)
            .get();
          if (!skuCheck.empty) {
            row.status = 'error';
            row.error = `SKU ${row.generatedSku} already exists in this shop`;
            errors.push(`Row ${row.rowIndex}: SKU conflict`);
            continue;
          }

          batch.set(productRef, {
            name: row.trimmedName,
            sku: row.generatedSku,
            shopId,
            unit: 'pcs',
            active: true,
            lowStockThreshold: null,
            fractionalUnits: false,
            importRef: importJobId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          row.status = 'committed';
          row.productId = productRef.id;
          committed++;
        } catch (err) {
          row.status = 'error';
          row.error = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Row ${row.rowIndex}: ${row.error}`);
        }
      }

      await batch.commit();
    }

    // Update import job
    await importRef.update({
      rows,
      committedRows: committed,
      errorRows: errors.length,
      status: errors.length > 0 && committed === 0 ? 'failed' : errors.length > 0 ? 'partial' : 'committed',
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create audit log
    await adminDb.collection('auditLogs').add({
      action: 'product_imported',
      actorUid: admin.uid,
      actorName: admin.fullName,
      targetType: 'import',
      targetId: importJobId,
      targetName: importData.fileName,
      after: { committed, errors: errors.length, total: newRows.length },
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      data: { committed, errors: errors.length, total: newRows.length },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('Import commit error:', e);
    return NextResponse.json({ success: false, error: 'Failed to commit import' }, { status: 500 });
  }
}
