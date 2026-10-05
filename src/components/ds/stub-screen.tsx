"use client";

/**
 * شاشة مؤقتة (stub) للشاشات غير المنفذة بعد — مصنع makeStub(title, description).
 * كل وحدة تستبدل stubs مجلدها فقط في المراحل القادمة.
 */
import { Construction, ArrowRight } from "lucide-react";
import type { ComponentType } from "react";
import { useNav } from "@/lib/nav";
import { AppCard } from "./app-card";

interface StubScreenProps {
  title: string;
  description?: string;
}

export function StubScreen({ title, description }: StubScreenProps) {
  const { pop, canPop } = useNav();
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {canPop() && (
        <button
          type="button"
          onClick={pop}
          aria-label="رجوع"
          className="flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-accent/40"
        >
          <ArrowRight className="size-5" aria-hidden />
        </button>
      )}
      <AppCard className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Construction className="size-8 text-primary" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-[13.5px] text-muted-foreground">
          {description ?? "هذه الشاشة قيد التطوير — المرحلة القادمة"}
        </p>
      </AppCard>
    </div>
  );
}

/** مصنع شاشات مؤقتة */
export function makeStub(title: string, description?: string): ComponentType {
  const Stub = () => <StubScreen title={title} description={description} />;
  Stub.displayName = `Stub(${title})`;
  return Stub;
}
