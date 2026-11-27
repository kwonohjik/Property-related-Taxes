"use client";

/**
 * ExitTaxForeignWorkerBlock — 국외주식등 제외: 외국인근로자 (시행령 §178의8②2·3호) (⑤)
 *
 * 계획서: `docs/02-design/features/stock-transfer-exit-tax-2027.plan.md` §2.1 C-3(병합안) · `.ui.plan.md` §4.3
 * 마운트: 출국일 2027.1.1. 이후 + 국외주식 종목이 1건 이상일 때만(`ExitTaxHoldingsBlock`이 게이트 — ④·⑧과 같은 조건).
 *
 * 구조(C-3): 라디오(해당 없음 / 본인 / 가족) + 요건 4개 체크(사용자 선언) + 가족이면 구분·근로 개시일.
 * 엔진은 요건을 자동 판정하지 않고 선언 4개가 **모두** 선택돼야 제외한다(하나라도 아니면 과세). 3호는 엔진이
 * `취득일 < 근로 개시일`로 종목별 판정한다 — 종목마다 토글을 두지 않는다.
 *
 * ① 「국외주식등 양도가액 합계 5억원 이하」 제외(영 §178의8②1호)는 **입력이 없다** — 합계 계산·임계 비교는 엔진이 하고
 *   결과에 판정이 표시된다(계획 D-5). 그래서 이 블록은 정적 설명만 둔다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";

type WorkerStatus = StockTransferFormData["etForeignWorkerStatus"];
type FamilyKind = Exclude<StockTransferFormData["etForeignWorkerFamilyKind"], "">;

const STATUS_OPTIONS: { value: WorkerStatus; label: string; description: string }[] = [
  {
    value: "none",
    label: "해당 없음",
    description: "외국인근로자 제외를 적용하지 않습니다 (기본값)",
  },
  {
    value: "foreign_worker",
    label: "외국인근로자 본인 (§178의8②2호)",
    description: "외국인 임원·사용인이 소유한 국외주식등 — 아래 요건 4개를 모두 선택한 경우에만 제외됩니다",
  },
  {
    value: "foreign_worker_family",
    label: "외국인근로자의 배우자·20세 이하 직계비속 (§178의8②3호)",
    description: "근로자가 국내에서 근로를 제공하기 시작한 날 전에 취득한 국외주식등만 제외됩니다",
  },
];

const FAMILY_OPTIONS: { value: FamilyKind; label: string }[] = [
  { value: "spouse", label: "외국인근로자의 배우자" },
  { value: "child_20_or_under", label: "외국인근로자의 20세 이하 직계비속" },
];

export function ExitTaxForeignWorkerBlock({ form, onChange }: StockStepBlockProps) {
  const status = form.etForeignWorkerStatus;

  return (
    <SectionBox label="국외주식등 제외 — 외국인근로자 (시행령 §178의8②)" tone="violet">
      <p className="text-xs leading-relaxed text-violet-700 dark:text-violet-300">
        출국 당시 소유한 국외주식등의 양도가액 합계가 <strong>5억원 이하</strong>이면 국외전출자 주식등에서 제외됩니다(§178의8②1호) —
        입력은 없고 판정은 계산 결과에 표시됩니다. 아래는 외국인근로자 제외(§178의8②2·3호)이며, 요건은 직접 판단해 선택합니다.
      </p>

      <RadioCardGroup
        name="exit-foreign-worker-status"
        value={status}
        // 3중 패턴: UI는 store 값을 그대로 쓴다(factory default "none") — `||` 표시 fallback을 따로 두지 않는다
        onChange={(v) => onChange({ etForeignWorkerStatus: v })}
        tone="violet"
        layout="stack"
        options={STATUS_OPTIONS}
        data-field="etForeignWorkerStatus"
      />

      {status !== "none" && (
        <div className="space-y-2" data-testid="exit-foreign-worker-checks">
          <p className="text-xs font-medium text-violet-900 dark:text-violet-200">
            요건 (4개 모두 해당해야 제외) — 하나라도 해당하지 않으면 과세 대상으로 계산합니다
          </p>
          <ToggleCard
            title="외국인인 임원 또는 사용인"
            checked={form.etForeignWorkerIsOfficerOrEmployee}
            onCheckedChange={(v) => onChange({ etForeignWorkerIsOfficerOrEmployee: v })}
            tone="violet"
            size="sm"
          />
          <ToggleCard
            title="일용근로자가 아님"
            checked={form.etForeignWorkerIsNotDailyWorker}
            onCheckedChange={(v) => onChange({ etForeignWorkerIsNotDailyWorker: v })}
            tone="violet"
            size="sm"
          />
          <ToggleCard
            title="출국일 10년 전부터 출국일까지 국내 거소·주소 기간의 100분의 80 이상 국내에서 근로를 제공"
            checked={form.etForeignWorkerDomesticRatio80}
            onCheckedChange={(v) => onChange({ etForeignWorkerDomesticRatio80: v })}
            tone="violet"
            size="sm"
          />
          <ToggleCard
            title="국내에서 근로의 제공이 종료된 날부터 6개월 이내에 출국"
            checked={form.etForeignWorkerDeparted6Months}
            onCheckedChange={(v) => onChange({ etForeignWorkerDeparted6Months: v })}
            tone="violet"
            size="sm"
          />
        </div>
      )}

      {status === "foreign_worker_family" && (
        <div className="space-y-2" data-testid="exit-foreign-worker-family">
          <RadioCardGroup
            name="exit-foreign-worker-family-kind"
            // 미선택은 "" — 가족 구분을 대신 고르지 않는다(비어 있으면 ⑧이 차단)
            value={form.etForeignWorkerFamilyKind}
            onChange={(v) => onChange({ etForeignWorkerFamilyKind: v })}
            tone="violet"
            layout="inline"
            options={FAMILY_OPTIONS}
            data-field="etForeignWorkerFamilyKind"
          />
          <FieldCard
            label="외국인근로자가 국내에서 근로를 제공하기 시작한 날"
            required
            stacked
            hint="종목 취득일이 이 날보다 앞서면 제외 대상입니다 (같은 날 취득은 제외되지 않습니다). 20세 이하 판정 시점은 법령에 명시가 없어 선택한 구분대로 처리하며 결과에서 확인 필요로 고지됩니다."
            field="etForeignWorkerStartDate"
          >
            <DateInput
              value={form.etForeignWorkerStartDate}
              onChange={(v) => onChange({ etForeignWorkerStartDate: v })}
            />
          </FieldCard>
        </div>
      )}
    </SectionBox>
  );
}
