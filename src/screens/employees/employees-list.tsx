"use client";

/**
 * الموظفون — قائمة (الوحدة 07): إحصاءات (العدد + إجمالي الرواتب الشهرية المكافئ)
 * + بحث + صف لكل موظف (الوظيفة، الراتب، دورة الراتب، الهاتف) → بطاقة الموظف.
 * FAB «موظف جديد» (FR-07-01).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, BriefcaseBusiness, Phone } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import {
  AppHeader, ListRow, AmountText, EmptyState, SearchBar, StatTile, StatusChip,
} from "@/components/ds";
import { EmployeeForm } from "@/components/employees/employee-form";

interface EmployeeListItem {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  salary: number;
  salaryCycle: "monthly" | "weekly" | "daily";
  salaryCycleLabel: string;
  hiredAt: string | null;
}

interface EmployeesResponse {
  employees: EmployeeListItem[];
  stats: { count: number; monthlyEquivalent: number; totalRaw: number };
}

export default function EmployeesListScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const url = useMemo(() => (q ? `/api/employees?q=${encodeURIComponent(q)}` : "/api/employees"), [q]);
  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["employees", "list", url],
    queryFn: () => getJson<EmployeesResponse>(url),
  });

  const employees = data?.employees ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title={`الموظفون (${data?.stats.count ?? 0})`}
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            aria-label="موظف جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <SearchBar value={q} onChange={setQ} placeholder="البحث باسم الموظف أو الوظيفة أو الهاتف…" />
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile
              title="عدد الموظفين"
              amount={data?.stats.count ?? 0}
              plain
              icon={BriefcaseBusiness}
              hint="موظف نشط"
            />
            <StatTile
              title="إجمالي الرواتب الشهرية"
              amount={data?.stats.monthlyEquivalent ?? 0}
              currency="YER"
              variant="primary"
              hint="المكافئ: أسبوعي×4 / يومي×30"
            />
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الموظفين…</p>
        ) : employees.length === 0 ? (
          <EmptyState
            icon={BriefcaseBusiness}
            message={q ? "لا نتائج مطابقة للبحث" : "لا موظفون بعد"}
            hint={q ? undefined : "سجّل موظفيك لإدارة حضورهم وسحبياتهم ورواتبهم"}
            className="py-12"
          />
        ) : (
          <div className="flex flex-col">
            {employees.map((e) => (
              <ListRow
                key={e.id}
                onClick={() => push("employees-card", { employeeId: e.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-[#FBBF24]/15 text-[15px] font-bold text-[#FBBF24]">
                    {e.name.trim().charAt(0)}
                  </span>
                }
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate">{e.name}</span>
                    {e.role && <StatusChip status="active" label={e.role} />}
                    <StatusChip status="completed" label={e.salaryCycleLabel} />
                  </span>
                }
                subtitle={
                  e.phone ? (
                    <span className="flex items-center gap-1 font-num" dir="ltr">
                      <Phone className="size-3" aria-hidden />
                      {e.phone}
                    </span>
                  ) : (
                    "بلا هاتف مسجل"
                  )
                }
                trailing={
                  <span className="flex flex-col items-end">
                    <AmountText value={e.salary} currency="YER" size="md" variant="primary" />
                    <span className="text-[11px] text-muted-foreground">
                      {e.salaryCycle === "monthly" ? "شهرياً" : e.salaryCycle === "weekly" ? "أسبوعياً" : "يومياً"}
                    </span>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <EmployeeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["employees"] });
        }}
      />
    </div>
  );
}
