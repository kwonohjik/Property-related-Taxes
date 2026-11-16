"use client";

/**
 * 증여 전 동일세대 거주기간(개월) 입력 — 판정 메뉴·계산기 증여 칸(`GiftHouseholdFactInputs`)과 이월과세 폼(`CarryoverGiftExclusionSection`)이 함께 쓴다 (결정 #38-7)
 *
 * 상속 「상속개시 전 동일세대 거주기간」(`InheritedSameHouseholdField`)과 같은 모양·같은 조건부 노출이다 — 호출부가 「증여자와 계속 같은 세대 = 예」일 때만 렌더한다.
 * 비과세 거주요건(「소득세법 시행령」 §154①)과 장기보유특별공제 표2 대상 판정에 통산한다(결정 #38-9). 표2 거주기간 공제율에는 통산하지 않는다 —
 * 이월과세도 거주기간은 증여받은 자가 취득한 날부터다(사전-2025-법규재산-1126).
 * 선택 입력이다 — 비우면 통산하지 않고 계산하며, 그 기간이 있었다면 결론이 달라질 때만 결과가 확인 필요를 알린다.
 * 통산의 정면 해석(주택 전부 증여·현행 조정대상지역 거주요건)은 확인하지 못해 고지에도 그렇게 적는다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { parsePriorResidenceMonths } from "@/lib/calc/gift-household-payload";

export function PriorHouseholdResidenceField({
  value,
  onChange,
  field,
  testId,
}: {
  /** 개월 수 문자열. `""` = 미답 */
  value: string;
  onChange: (value: string) => void;
  /** 검증 오류 → 입력칸 이동 앵커 — ⑧ `ValidationIssue.field`와 같은 값 */
  field: string;
  testId?: string;
}) {
  const parsed = parsePriorResidenceMonths(value);
  return (
    <FieldCard
      label="증여 전 동일세대 거주기간"
      field={field}
      unit="개월"
      hint="증여일 전 증여자와 같은 세대로 이 집에 거주한 개월 수 — 비과세 거주요건·표2 대상 판정에 통산합니다(거주기간 공제율은 증여일부터, 이월과세도 같음 · 사전-2025-법규재산-1126). 증여 후 본인 거주는 아래 거주기간에. 비우면 통산 없이 확인 필요 고지."
    >
      <div data-testid={testId}>
        <IntegerInput
          ariaLabel="증여 전 동일세대 거주기간"
          allowEmpty
          value={parsed === undefined || !Number.isInteger(parsed) ? undefined : parsed}
          onChange={(v) => onChange(v === undefined ? "" : String(v))}
        />
      </div>
    </FieldCard>
  );
}
