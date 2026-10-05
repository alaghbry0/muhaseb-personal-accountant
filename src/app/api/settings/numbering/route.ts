import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadPrefixes, computeNextDocNo } from "@/domain/invoice-save";
import { parseSeq, parseYear } from "@/domain/numbering";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/numbering — حالة الترقيم لكل نوع مستند (FR-13-02 / §5.4-1):
 * البادئة الحالية + العداد السنوي (محسوب من آخر مستند) + الرقم القادم + عدد مستندات السنة.
 */
export async function GET() {
  try {
    const year = new Date().getFullYear();
    const prefixes = await loadPrefixes(db);

    const rows: Array<{
      docType: string;
      label: string;
      prefix: string;
      year: number;
      lastNo: number;
      nextNo: string;
      count: number;
    }> = [];

    const docTypes: Array<{ docType: string; label: string; table: "invoice" | "quotation" }> = [
      { docType: "sale", label: "فواتير البيع", table: "invoice" },
      { docType: "purchase", label: "فواتير الشراء", table: "invoice" },
      { docType: "sale_return", label: "مرتجع البيع", table: "invoice" },
      { docType: "purchase_return", label: "مرتجع الشراء", table: "invoice" },
      { docType: "quotation", label: "عروض الأسعار", table: "quotation" },
    ];

    for (const { docType, label, table } of docTypes) {
      const prefix = prefixes[docType] ?? "";
      let lastNo = 0;
      let lastNoStr: string | null = null;
      let count = 0;
      if (table === "invoice") {
        const last = await db.invoice.findFirst({
          where: { docType, invoiceNo: { startsWith: `${prefix}-${year}-` } },
          orderBy: { invoiceNo: "desc" },
          select: { invoiceNo: true },
        });
        lastNoStr = last?.invoiceNo ?? null;
        lastNo = last ? parseSeq(last.invoiceNo) : 0;
        count = await db.invoice.count({ where: { docType, issuedAt: { startsWith: `${year}-` } } });
      } else {
        const last = await db.quotation.findFirst({
          where: { quoteNo: { startsWith: `${prefix}-${year}-` } },
          orderBy: { quoteNo: "desc" },
          select: { quoteNo: true },
        });
        lastNoStr = last?.quoteNo ?? null;
        lastNo = last ? parseSeq(last.quoteNo) : 0;
        count = await db.quotation.count({
          where: { quoteNo: { startsWith: `${prefix}-${year}-` } },
        });
      }
      const nextNo = await db.$transaction((tx) =>
        computeNextDocNo(tx, table, docType, `${year}-01-01`)
      );
      rows.push({
        docType,
        label,
        prefix,
        year: lastNoStr ? parseYear(lastNoStr) : year,
        lastNo,
        nextNo,
        count,
      });
    }

    return NextResponse.json({ rows, year });
  } catch (e) {
    console.error("GET /api/settings/numbering error:", e);
    return NextResponse.json({ error: "تعذر تحميل حالة الترقيم" }, { status: 500 });
  }
}
