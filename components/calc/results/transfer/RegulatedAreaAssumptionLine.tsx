"use client";

/**
 * 결과 화면의 **조정대상지역 판정 — 확인 필요** 한 줄 (계획서 `docs/00-pm/regulated-area-assumption-notice.plan.md`).
 *
 * 법정동코드 없이 주소 문자열로 판정했고 신뢰도가 높지 않으면(시·도를 알아볼 수 없음 · 동·읍·면 예외를 못 봄 · 데이터에 없는 시·도)
 * 그 판정값이 그대로 세액에 실린다. 근거는 Step4 「보유 상황」 안내에만 있어, 그 단계를 건너뛰고 계산하면 사용자가 가정을 모른다.
 * 입력(폼)에서 읽기만 한다 — ④와 같은 leaf(`regulatedAddressAssumptions`). 엔진 결과에 싣지 않는 이유와 `PrintSection` 밖에 두는 이유는
 * `SameDayOrderLine`·`OneHouseJudgmentProvenanceLine`과 같다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  regulatedAddressAssumptions,
  type RegulatedFlagsForm,
} from "@/lib/calc/effective-regulated-at-acquisition";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import {
  REGULATED_ASSUMPTION_TITLE,
  regulatedAssumptionFooter,
  regulatedAssumptionRowHead,
  regulatedAssumptionRowVerdict,
  type RegulatedAssumptionSelectWhere,
} from "@/lib/calc/regulated-area-assumption-text";

export function RegulatedAreaAssumptionLine({
  form,
  label,
  selectWhere = "calculator",
}: {
  form: (RegulatedFlagsForm & Pick<TransferFormData, "regionCode">) | null | undefined;
  /** 다건처럼 여러 건을 한 화면에 그릴 때 어느 건인지 밝힌다. */
  label?: string;
  /** 「직접 선택」 칸이 있는 곳 — 판정 메뉴는 「② 양도 대상 주택」이다. */
  selectWhere?: RegulatedAssumptionSelectWhere;
}) {
  if (!form) return null;
  const rows = regulatedAddressAssumptions(form);
  if (rows.length === 0) return null;
  return (
    <div data-testid="regulated-area-assumption-line">
      <ToneCard tone="amber" title={label ? `${REGULATED_ASSUMPTION_TITLE} · ${label}` : REGULATED_ASSUMPTION_TITLE}>
        <ul className="space-y-1 text-sm leading-relaxed text-amber-800 dark:text-amber-200">
          {rows.map((r) => (
            <li key={r.which} data-testid={`regulated-area-assumption-${r.which}`}>
              {regulatedAssumptionRowHead(r)}: <b>{regulatedAssumptionRowVerdict(r)}</b> — {r.basis}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          {regulatedAssumptionFooter(selectWhere, rows)}
        </p>
      </ToneCard>
    </div>
  );
}
