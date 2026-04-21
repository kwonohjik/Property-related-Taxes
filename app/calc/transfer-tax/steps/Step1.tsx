import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { ResetButton } from "@/components/calc/shared/ResetButton";

// ============================================================
// Step 1: 물건 유형
// ============================================================
export function Step1({
  form,
  onChange,
  onReset,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  onReset: () => void;
}) {
  const options = [
    { value: "housing",        label: "주택",   icon: "🏠", desc: "아파트, 단독주택, 연립 등" },
    { value: "right_to_move_in", label: "입주권", icon: "🏗️", desc: "재개발·재건축 입주권" },
    { value: "presale_right",  label: "분양권", icon: "📋", desc: "아파트 분양권" },
    { value: "land",           label: "토지",   icon: "🌱", desc: "농지, 임야, 나대지 등" },
    { value: "building",       label: "건물",   icon: "🏢", desc: "상가, 오피스, 창고 등" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">양도하는 부동산의 유형을 선택하세요.</p>
        <ResetButton onReset={onReset} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ propertyType: opt.value })}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all",
              form.propertyType === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <span className="text-3xl">{opt.icon}</span>
            <span className="text-sm font-semibold">{opt.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</span>
          </button>
        ))}
      </div>

      {form.propertyType === "right_to_move_in" && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <label className="block text-sm font-medium">조합원 유형</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                value: false,
                label: "원조합원",
                desc: "재개발·재건축 조합원자격을 직접 취득",
              },
              {
                value: true,
                label: "승계조합원",
                desc: "타인의 입주권을 양수(승계취득)",
              },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => onChange({ isSuccessorRightToMoveIn: opt.value })}
                className={cn(
                  "rounded-md border-2 p-3 text-left transition-all",
                  form.isSuccessorRightToMoveIn === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
                )}
              >
                <div className="text-sm font-semibold">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            ※ 승계조합원은 장기보유특별공제가 적용되지 않습니다 (소득세법 §95② 단서).
          </p>
        </div>
      )}
    </div>
  );
}
