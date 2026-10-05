"use client";

/**
 * سجل التدقيق (FR-12-04): الوقت، المستخدم، الإجراء (شريحة ملونة)، الكيان،
 * تفاصيل JSON قابلة للطي + فلترة بالإجراء. غير قابل للمسح من الواجهة.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ChevronDown, ShieldCheck } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { AppHeader, AppCard, EmptyState } from "@/components/ds";
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_COLORS } from "@/domain/audit";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: number;
  at: string;
  userId: number | null;
  userName: string;
  action: string;
  entity: string | null;
  entityId: number | null;
  details: string | null;
}

export default function SettingsAuditScreen() {
  const [action, setAction] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ logs: AuditRow[]; actions: string[]; total: number }>({
    queryKey: ["audit", action ?? "all"],
    queryFn: () =>
      getJson<{ logs: AuditRow[]; actions: string[]; total: number }>(
        `/api/audit?limit=150${action ? `&action=${encodeURIComponent(action)}` : ""}`
      ),
  });

  const logs = data?.logs ?? [];
  const actions = data?.actions ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="سجل التدقيق"
        action={
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
            {data?.total ?? 0} حدث
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4 pb-8">
        <AppCard noPad className="flex items-center gap-2 p-3">
          <ShieldCheck className="size-4 shrink-0 text-[#34D399]" aria-hidden />
          <p className="text-[12px] leading-5 text-muted-foreground">
            كل عملية حساسة تُسجَّل تلقائياً (من، ماذا، متى) — الحذف غير متاح من الواجهة.
          </p>
        </AppCard>

        {/* فلاتر الإجراء */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="فلترة بالإجراء">
          <button
            type="button"
            onClick={() => setAction(null)}
            aria-pressed={action === null}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
              action === null
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            الكل
          </button>
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAction(a)}
              aria-pressed={action === a}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                action === a
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {AUDIT_ACTION_LABELS[a] ?? a}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : logs.length === 0 ? (
          <EmptyState icon={ScrollText} message="لا أحداث مسجلة" hint="تُسجَّل عمليات البيع والسندات والرواتب والنسخ تلقائياً" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {logs.map((r) => (
              <AuditCard key={r.id} row={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditCard({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const color = AUDIT_ACTION_COLORS[row.action] ?? "#94A3B8";
  const label = AUDIT_ACTION_LABELS[row.action] ?? row.action;

  let detailsPretty: string | null = null;
  if (row.details) {
    try {
      detailsPretty = JSON.stringify(JSON.parse(row.details), null, 2);
    } catch {
      detailsPretty = row.details;
    }
  }

  return (
    <AppCard noPad className="flex flex-col gap-2 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className="inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold"
            style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}4d` }}
          >
            {label}
          </span>
          <span className="text-[12.5px] leading-5 text-muted-foreground">
            {row.userName} • {formatDateTime(row.at)}
            {row.entity ? ` • ${row.entity}${row.entityId != null ? ` #${row.entityId}` : ""}` : ""}
          </span>
        </div>
        {detailsPretty ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="تفاصيل الحدث"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        ) : null}
      </div>
      {open && detailsPretty ? (
        <pre
          dir="ltr"
          className="max-h-56 overflow-auto scrollbar-slim rounded-xl border border-border/60 bg-muted/60 p-3 text-left text-[11.5px] leading-5 text-muted-foreground"
        >
          {detailsPretty}
        </pre>
      ) : null}
    </AppCard>
  );
}
