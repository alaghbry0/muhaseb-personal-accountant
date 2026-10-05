"use client";

/**
 * حقل اختيار عام (shadcn Select) + منتقي موظف — أدوات نموذج الحركة النقدية.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, User, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getJson } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "اختر…",
  required,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold text-foreground">
        {label} {required && <span className="text-[#F87171]">*</span>}
      </label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} dir="rtl" className="h-12 w-full rounded-xl border-border bg-background text-[14px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent dir="rtl" className="max-h-64">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-[14px]">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface EmployeesResponse {
  employees: Array<{ id: number; name: string; role: string | null }>
}

/** منتقي موظف — بحث فوري */
export function EmployeePicker({
  selected,
  onSelect,
}: {
  selected: { id: number; name: string } | null
  onSelect: (e: { id: number; name: string } | null) => void
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const { data } = useQuery<EmployeesResponse>({
    queryKey: ["employees", "picker", q],
    queryFn: () => getJson<EmployeesResponse>(`/api/employees?q=${encodeURIComponent(q)}`),
    enabled: open,
  })
  const employees = data?.employees ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-foreground">
        الموظف <span className="text-[#F87171]">*</span>
      </span>
      {selected && !open ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/50 bg-primary/10 px-3.5 py-3">
          <span className="flex items-center gap-2 text-[14px] font-bold text-foreground">
            <User className="size-4 text-primary" aria-hidden />
            {selected.name}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-[#F87171] hover:bg-[#F87171]/10"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-primary hover:bg-primary/10"
            >
              تغيير
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم الموظف…"
              className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="البحث عن موظف"
            />
          </div>
          <div className="scrollbar-slim max-h-44 overflow-y-auto">
            {employees.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-muted-foreground">لا نتائج</p>
            ) : (
              employees.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: e.id, name: e.name })
                    setOpen(false)
                    setQ("")
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-start text-[14px] hover:bg-accent/40",
                    selected?.id === e.id && "bg-primary/10"
                  )}
                >
                  <span className="font-medium">{e.name}</span>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    {e.role}
                    {selected?.id === e.id && <Check className="size-4 text-primary" aria-hidden />}
                  </span>
                </button>
              ))
            )}
          </div>
          {selected && (
            <button
              type="button"
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
              className="rounded-lg py-2 text-[12.5px] font-bold text-[#F87171] hover:bg-[#F87171]/10"
            >
              مسح الاختيار
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { ChevronsUpDown }
