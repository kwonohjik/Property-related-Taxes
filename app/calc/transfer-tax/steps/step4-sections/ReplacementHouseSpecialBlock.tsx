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
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { completionDeadlineYearsLabel } from "@/lib/calc/one-house-era-labels";
import { POST_MANAGEMENT_FILING } from "@/lib/tax-engine/transfer-tax-89-2-consequences";

export function ReplacementHouseSpecialBlock({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  // §156의2⑤2호 「완성된 후 N년 이내」 — 양도일 연혁(2023-01-12 전 양도 2년 · 이후 3년, 엔진 leaf 단일 소스)
  const completionYears = completionDeadlineYearsLabel(form.transferDate);
  // §156의2⑤3호 전단 「완성되기 전」 양도 — 준공일을 요구하지 않는다(S15-4). ④·⑧과 같은 `=== true` 읽기(옛 record는 완성 후 갈래).
  const beforeCompletion = form.replSoldBeforeCompletion === true;
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
            replSoldBeforeCompletion: v ? form.replSoldBeforeCompletion === true : false,
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
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium">신축주택 완성 시점 (대체주택 양도 당시)</label>
            <RadioCardGroup
              name="repl-completion-kind"
              tone="emerald"
              value={beforeCompletion ? "before" : "after"}
              onChange={(v: string) => onChange({ replSoldBeforeCompletion: v === "before" })}
              options={[
                {
                  value: "after",
                  label: "신축주택이 완성된 뒤 양도했다",
                  description: `완성(준공)된 날부터 ${completionYears} 이내에 양도해야 합니다 (§156의2⑤3호 후단) — 준공일을 입력하세요`,
                },
                {
                  value: "before",
                  label: "신축주택이 완성되기 전에 양도했다",
                  description: "§156의2⑤3호 전단 — 아직 준공되지 않았다면 준공일을 입력하지 않아도 됩니다",
                },
              ]}
            />
          </div>
          {!beforeCompletion && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                신축주택 준공일 <span className="text-destructive">*</span>
              </label>
              <DateInput
                data-testid="repl-completion-date"
                value={form.replCompletionDate}
                onChange={(v) => onChange({ replCompletionDate: v })}
              />
              <p className="text-xs text-muted-foreground">재개발·재건축으로 완성된 신축주택의 사용승인일</p>
            </div>
          )}
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
          description={`신축주택 완성 후 ${completionYears} 내 세대전원 이사 및 1년 이상 거주할 것을 확인합니다 (§156의2⑤2호)`}
          tone="violet"
        />
        {/* 사후관리 경고 카드 (§156의2⑬) */}
        <div className="rounded-lg border border-rose-300 bg-rose-50/60 px-4 py-3 text-xs leading-relaxed text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-semibold text-rose-800 dark:text-rose-300">사후관리 주의 (소득세법 시행령 §156의2⑬)</p>
          {/* 추징 사유는 「신축주택 양도」가 아니라 ⑤2호 요건(이사·1년 계속 거주)을 갖추지 못하게 된 것이고, 기한은 사유 발생 달 말일부터 2개월이다(§156의2⑬ <개정 2013.2.15>). 문구는 계산기·판정 메뉴 고지와 같은 leaf다(S15-8). */}
          <p className="mt-1">
            신축주택 완성 후 {completionYears} 내 세대전원 이사·1년 이상 계속 거주 요건(⑤2호)을 갖추지 못하게
            되면 {POST_MANAGEMENT_FILING}.
          </p>
        </div>
      </ToggleCard>
    </>
  );
}
