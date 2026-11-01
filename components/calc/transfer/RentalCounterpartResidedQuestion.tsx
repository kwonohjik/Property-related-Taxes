"use client";

/**
 * §155④⑤ × ⑳ 상대 쪽 임대 — 합가 상대 쪽 주택 2년 거주 문항(기준-2024-법규재산-0061). 미선택은 그 경로 불성립(`merge-rental-carveout.ts`).
 * 계산기 ⑳ 카드와 판정 메뉴 ③ 합가 전 보유자 칸이 함께 쓴다 — 판정 메뉴는 ③에서 보유자를 골라야 이 문항의 게이트가 열린다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

export function RentalCounterpartResidedQuestion({
  value,
  onChange,
}: {
  value: "" | "yes" | "no" | undefined;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="space-y-1.5" data-field="rentalHousingException.counterpartHouseResidedTwoYears">
      <p className="text-sm font-medium">합가 상대 쪽 주택에 2년 이상 거주했나요?</p>
      <RadioCardGroup<"yes" | "no">
        name="rental-counterpart-resided-two-years"
        tone="violet"
        layout="inline"
        value={value === "yes" || value === "no" ? value : ""}
        onChange={onChange}
        options={[
          { value: "yes", label: "예", testId: "rental-counterpart-resided-yes" },
          { value: "no", label: "아니오", testId: "rental-counterpart-resided-no" },
        ]}
      />
      <p className="text-caption text-muted-foreground" data-testid="rental-counterpart-resided-hint">
        임대주택이 합가 상대 쪽 1채이고 양도 주택이 그 쪽 소유가 아니면 양도 주택에 거주 2년을 적용하지 않습니다(기준-2024-법규재산-0061).
      </p>
    </div>
  );
}
