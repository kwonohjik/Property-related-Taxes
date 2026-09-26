/**
 * §156의2⑤ 재개발·재건축 대체주택 비과세 특례 — 입력 블록.
 *
 * `TemporaryTwoHouseSection`에서 **순수 이동**했다(JSX 불변). 판정 메뉴가 이 블록을
 * 일시적 2주택 섹션 **밖**에서도 그려야 하기 때문이다 — 법령 기본 사례(대체주택 1채 +
 * 조합원입주권 1개)는 파생 주택 수가 1이라 그 섹션이 숨는다(OH-05,
 * `judgmentReplacementHouseVisible`). 두 곳에 같은 JSX를 복제하지 않으려고 뺐다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

export function ReplacementHouseSpecialBlock({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  return (
    <>
      <p className="text-sm font-medium mt-1">재개발·재건축 대체주택 특례</p>
      <ToggleCard
        checked={form.replacementHouseSpecial}
        onCheckedChange={(v) =>
          onChange({
            replacementHouseSpecial: v,
            replBusinessApprovalDate: v ? form.replBusinessApprovalDate : "",
            replCompletionDate: v ? form.replCompletionDate : "",
            replResidenceMonths: v ? form.replResidenceMonths : "",
            replWillResideNewHouse: v ? form.replWillResideNewHouse : false,
          })
        }
        title="대체주택 비과세 특례 해당 (§156의2⑤)"
        description="재개발·재건축 시행기간 중 거주하기 위해 취득한 대체주택 양도 시 1세대1주택 의제"
        tone="emerald"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              사업시행계획인가일 <span className="text-destructive">*</span>
            </label>
            <DateInput
              value={form.replBusinessApprovalDate}
              onChange={(v) => onChange({ replBusinessApprovalDate: v })}
            />
            <p className="text-xs text-muted-foreground">재개발·재건축 조합의 사업시행인가를 받은 날</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              신축주택 준공일 <span className="text-destructive">*</span>
            </label>
            <DateInput
              value={form.replCompletionDate}
              onChange={(v) => onChange({ replCompletionDate: v })}
            />
            <p className="text-xs text-muted-foreground">재개발·재건축으로 완성된 신축주택의 사용승인일</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              대체주택 거주개월수 <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.replResidenceMonths}
              onChange={(e) =>
                onChange({ replResidenceMonths: e.target.value.replace(/[^0-9]/g, "") })
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">대체주택에 실제 거주한 총 개월수 (1년 이상 = 12개월 이상)</p>
          </div>
        </div>
        <ToggleCard
          checked={form.replWillResideNewHouse}
          onCheckedChange={(v) => onChange({ replWillResideNewHouse: v })}
          title="신축주택 1년 이상 거주 예정 (자기선언)"
          description="신축주택 완성 후 3년 내 세대전원 이사 및 1년 이상 거주할 것을 확인합니다 (§156의2⑤③)"
          tone="violet"
        />
        {/* 사후관리 경고 카드 (§156의2⑬) */}
        <div className="rounded-lg border border-rose-300 bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-semibold text-rose-800 dark:text-rose-300">사후관리 주의 (소득세법 시행령 §156의2⑬)</p>
          <p className="mt-1">
            신축주택 완성 후 3년(2023.1.12 이후 양도분) 내 세대전원 이사·1년 이상 거주하지 못하고
            신축주택을 양도하면 비과세받은 세액이 추징됩니다.
            추징세액은 해당 사유가 발생한 과세연도에 신고·납부해야 합니다.
          </p>
        </div>
      </ToggleCard>
    </>
  );
}
