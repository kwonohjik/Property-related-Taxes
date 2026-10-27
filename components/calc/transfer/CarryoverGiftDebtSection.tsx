"use client";

/**
 * 이월과세 E1(주택·토지·상업용건물 — 증여세 상당액을 직접 입력하는 자산)의 **⑤ 당초 증여 때 인수한 채무** 섹션.
 *
 * 당초 증여가 부담부증여여서 수증자가 채무를 인수했으면, 시나리오 A에서 자산을 증여분·채무 인수 부분(매입분)으로 나눠 계산한다
 * (계획서 `docs/00-pm/carryover-gift-debt-purchased-part.plan.md` §0). 비율의 분모(증여 당시 평가액)가 ④에 있어 ④ 뒤에 둔다.
 *
 * 노출은 `carryoverPurchasedPartScope` **하나**가 정한다 — ④ 전송(`carryoverPurchasedPartDebt`)·⑧ 차단(`validateCarryoverDebt`)과 같은 술어(3중 패턴).
 *  - apply: 토글 + 켜면 채무 칸.
 *  - unsupported: OFF면 안내만. 남은 ON이면 토글을 켜진 채 보여 끌 수 있게 한다(⑧ M3이 막는 막다른 길 방지 — `CarryoverGiftBlock`의 환산 토글과 같은 패턴).
 *  - none·numerator_only: 이 섹션을 그리지 않는다(일반건물·파트 이월과세는 자기 위치의 토글을 쓴다).
 * disabled ToggleCard는 쓰지 않는다 — 회색 톤이라 「OFF도 tone 유지」 규칙과 어긋난다(`components/calc/CLAUDE.md`).
 *
 * 설계서: docs/02-design/features/carryover-gift-debt-purchased-part.ui.design.md §2
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { carryoverPurchasedPartScope } from "@/lib/calc/carryover-gift-assumed-debt";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

export const DEBT_TOGGLE_TITLE = "당초 증여 때 채무를 인수했다";

/** 채무 인수 부분을 나눌 때 증여자 쪽 값(취득가액·환산 기준시가)이 적용되는 범위 — 증여분 */
export const DEBT_GIFT_PART_ONLY_HINT =
  " ※ 당초 증여 때 채무를 인수했으면 증여분에만 적용합니다(증여 당시 평가액 중 채무 인수 부분은 제외).";
/** 증여세 상당액 칸 — 「소득세법」 제97조의2 제1항 제3호 */
export const DEBT_GIFT_TAX_PART_ONLY_HINT =
  " ※ 당초 증여 때 채무를 인수했으면 증여분에만 산입합니다 — 채무 인수 부분은 증여받은 자산이 아니라 「소득세법」 제97조의2 제1항 제3호(증여세 상당액)의 대상이 아닙니다.";
/** 증여자 자본적지출 칸 — 「소득세법」 제97조의2 제1항 제2호 */
export const DEBT_DONOR_CAPEX_PART_ONLY_HINT =
  " ※ 당초 증여 때 채무를 인수했으면 증여분에만 산입합니다(「소득세법」 제97조의2 제1항 제2호).";

/**
 * 일반건물·주택 분리 계산(E2·E3·일반건물 E4)의 토글 설명 꼬리 — 이 입력에서는 증여세 상당액 안분의 분자에서만 뺀다(V-7).
 * 시나리오 A의 증여분·채무 인수 부분 분할은 PR-2·3에서 같은 술어(`numerator_only → apply`) 승격으로 붙는다(Q-UI-3 a — 막지 않고 안내만).
 */
export function DebtNumeratorOnlyNote() {
  return (
    <span className="mt-1 block" data-testid="carryover-debt-numerator-only-note">
      이 입력에서는 당초 증여 때 인수한 채무를 증여세 상당액 안분의 분자에서만 뺍니다. 시나리오 A에서 채무 인수 부분을 증여분과 따로 나누는 계산은 이 입력에 적용하지 않습니다.
    </span>
  );
}

const DEBT_APPLY_DESCRIPTION =
  "당초 증여가 부담부증여여서 채무를 인수했으면 켭니다. 부담부증여에서 수증자가 부담하는 채무액에 해당하는 부분은 양도로 보는 부분이라(「소득세법」 제88조 제1호 후단) 증여받은 자산에서 떼어, 시나리오 A에서 증여분과 채무 인수 부분으로 나누어 따로 계산합니다.";

const DEBT_FIELD_HINT =
  "당초 증여 때 인수해 증여세 과세가액에서 뺀 채무 금액입니다(「상속세 및 증여세법」 제47조 제1항). 증여 당시 평가액에서 이 금액이 차지하는 만큼이 채무 인수 부분입니다. 채무 인수 부분은 증여 등기접수일을 취득일로, 이 금액을 취득가액으로 계산합니다 — 법령에 나누는 방법이 정해져 있지 않아 이 계산기가 정한 방법입니다. 없으면 0";

interface Props {
  asset: AssetForm;
  /** 함께 양도 둘째 이후 자산 — 파트 이월과세(C) 잔재를 꺼진 것으로 읽는다(술어 옵션) */
  isNonPrimaryAsset?: boolean;
  /** 지분(공유) 모드 — 채무는 증여 당시 평가액과 같은 100% 기준이다 */
  shareMode: boolean;
  onPatchCarryover: (patch: Partial<CarryoverTaxationForm>) => void;
}

export function CarryoverGiftDebtSection({ asset, isNonPrimaryAsset, shareMode, onPatchCarryover }: Props) {
  const scope = carryoverPurchasedPartScope(asset, { isNonPrimary: isNonPrimaryAsset });
  const c = asset.carryover ?? CARRYOVER_DEFAULTS;
  if (scope.kind !== "apply" && scope.kind !== "unsupported") return null;

  if (scope.kind === "unsupported" && !c.giftDebtAssumed) {
    return (
      <ToneCard tone="amber" sectionNum={5} title="당초 증여 때 인수한 채무" bodyClassName="space-y-3">
        <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="carryover-debt-unsupported-note">
          이 자산은 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다({scope.reason}). 증여세 상당액에는 인수한 채무를 뺀 과세가액 기준으로 계산한 금액을 입력하세요.
        </p>
      </ToneCard>
    );
  }

  const unsupportedOn = scope.kind === "unsupported";
  return (
    <ToneCard tone="amber" sectionNum={5} title="당초 증여 때 인수한 채무" bodyClassName="space-y-3">
      <ToggleCard
        tone="amber"
        title={DEBT_TOGGLE_TITLE}
        description={
          unsupportedOn
            ? `이 자산에서는 채무 인수 부분을 나누어 계산하지 못합니다(${scope.reason}) — 이 토글을 끄세요.`
            : DEBT_APPLY_DESCRIPTION
        }
        checked={c.giftDebtAssumed}
        onCheckedChange={(v) => onPatchCarryover({ giftDebtAssumed: v })}
        data-testid="carryover-gift-debt-assumed"
        data-field="carryover.giftDebtAssumed"
      >
        {!unsupportedOn && (
          <FieldCard
            label="당초 증여 때 인수한 채무"
            field="carryover.giftAssumedDebt"
            hint={DEBT_FIELD_HINT + (shareMode ? " 지분 모드 — 증여 당시 평가액과 같은 100% 기준으로 입력합니다." : "")}
          >
            <CurrencyInput
              label=""
              value={c.giftAssumedDebt}
              onChange={(v) => onPatchCarryover({ giftAssumedDebt: v })}
              placeholder="없으면 0"
              data-testid="carryover-gift-assumed-debt"
            />
          </FieldCard>
        )}
      </ToggleCard>
    </ToneCard>
  );
}
