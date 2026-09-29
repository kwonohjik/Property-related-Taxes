"use client";

/**
 * 「소득세법 시행령」 §155의3 상생임대주택 특례 입력 (판정 메뉴 ② → 공용)
 *
 * §155의3①: 「국내에 1주택(… 1세대1주택으로 보는 경우를 포함한다)을 소유한 1세대가 다음 각 호의 요건을 모두
 * 갖춘 주택(… "상생임대주택")을 양도하는 경우에는 제154조제1항, 제155조제20항제1호 및 제159조의4를 적용할 때
 * 해당 규정에 따른 거주기간의 제한을 받지 않는다」(MST 286211 실독).
 *
 * 2026-09-29 E-1 한계(e1z) G2: `app/calc/one-house-exemption/steps/Step3.tsx`에서 옮겼다(JSX·testid 그대로).
 * 증여세 부담부증여 양도 경로(`BurdenedGiftHousingFieldSet`)도 같은 사실을 받아야 해서 같은 위젯을 쓴다 —
 * 평행 UI를 만들지 않는다. 두 폼이 같은 이름의 5필드를 가지므로 props를 그 필드만의 `Pick`으로 좁혔다.
 * ④ `buildWinWinRentalPayload` · ⑧ `winWinRentalFieldErrors`(`lib/calc/one-house-extra-facts-payload.ts`)도 공용이다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import type { WinWinRentalFields } from "@/lib/calc/one-house-extra-facts-payload";

type Props = {
  value: WinWinRentalFields;
  onChange: (patch: Partial<WinWinRentalFields>) => void;
};

export function WinWinRentalSpecialField({ value, onChange }: Props) {
  return (
    <ToggleCard
      data-testid="one-house-win-win-rental"
      checked={value.winWinRentalSpecial}
      onCheckedChange={(winWinRentalSpecial) => onChange({ winWinRentalSpecial })}
      title="상생임대주택 특례"
      description="임대료를 5% 이하로 올린 계약 — 거주기간 요건이 면제됩니다"
      tone="violet"
      lawRefs={[{ legalBasis: "소득세법 시행령 §155의3", label: "영 §155의3" }]}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldCard label="상생임대차계약 체결일">
          <DateInput
            data-testid="ww-contract-date"
            value={value.winWinRentalContractDate}
            onChange={(winWinRentalContractDate) => onChange({ winWinRentalContractDate })}
          />
        </FieldCard>
        {/*
          🔑 **「인상률」로 받는다 — 「증가율」이 아니다.**
          `DecimalInput`은 음수를 입력할 수 없다(`DecimalInput.tsx:55` 「음수 제외」).
          §155의3①1호 요건은 「증가율이 **5% 이하**」이므로 임대료를 내린 경우도 당연히
          충족이고, 인하폭이 얼마인지는 **판정을 바꾸지 않는다**. ⇒ 음수 입력 위젯을 새로
          만드는 대신 물음을 「올린 비율」로 좁히고, 내린 경우는 0으로 적게 안내한다.
          (어댑터는 음수도 그대로 통과시킨다 — 다른 입력 경로가 생겨도 잘리지 않는다.)
        */}
        <FieldCard
          label="직전임대차 대비 임대료 인상률"
          hint="백분율. 임대료를 내렸거나 그대로면 0을 입력하세요"
        >
          <DecimalInput
            data-testid="ww-increase-rate"
            value={value.winWinRentalIncreaseRatePct}
            onChange={(winWinRentalIncreaseRatePct) => onChange({ winWinRentalIncreaseRatePct })}
            unit="%"
          />
        </FieldCard>
        <FieldCard label="직전임대차 임대기간" hint="개월. 1개월 미만은 1개월로 봅니다">
          <IntegerInput
            /* 🔑 `FieldCard` 라벨은 `htmlFor`로 묶여 있지 않다 — E2E가 집을 수 있도록 aria를 준다. */
            ariaLabel="직전임대차 임대기간"
            allowEmpty
            value={value.winWinRentalPriorLeaseMonths === "" ? undefined : Number(value.winWinRentalPriorLeaseMonths)}
            onChange={(v) => onChange({ winWinRentalPriorLeaseMonths: v === undefined ? "" : String(v) })}
          />
        </FieldCard>
        <FieldCard label="상생임대차 임대기간" hint="개월">
          <IntegerInput
            ariaLabel="상생임대차 임대기간"
            allowEmpty
            value={value.winWinRentalLeaseMonths === "" ? undefined : Number(value.winWinRentalLeaseMonths)}
            onChange={(v) => onChange({ winWinRentalLeaseMonths: v === undefined ? "" : String(v) })}
          />
        </FieldCard>
      </div>
    </ToggleCard>
  );
}
