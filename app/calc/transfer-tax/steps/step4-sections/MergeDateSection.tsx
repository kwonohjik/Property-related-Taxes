import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

// ============================================================
// 합가 특례 (P2) — Step 4 섹션
// ============================================================

// ============================================================
// Step 4 보조 컴포넌트: 합가 특례 (P2)
// ============================================================

export function MergeDateSection({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  const hasAnyMerge = form.marriageDate || form.parentalCareMergeDate;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        합가 특례{" "}
        <span className="text-xs text-muted-foreground font-normal">(선택 — 혼인·동거봉양 합가 시 중과 배제)</span>
      </p>
      <div
        className={cn(
          "rounded-lg border px-4 py-3 space-y-4 transition-colors",
          hasAnyMerge ? "border-primary/40 bg-primary/5" : "border-border",
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">혼인합가일</label>
            <DateInput
              value={form.marriageDate}
              onChange={(v) => onChange({ marriageDate: v })}
            />
            <p className="text-xs text-muted-foreground">혼인합가 후 5년 이내 양도 시 중과 배제</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">동거봉양 합가일</label>
            <DateInput
              value={form.parentalCareMergeDate}
              onChange={(v) => onChange({ parentalCareMergeDate: v })}
            />
            <p className="text-xs text-muted-foreground">동거봉양 합가 후 10년 이내 양도 시 중과 배제</p>
          </div>
        </div>
      </div>
    </div>
  );
}
