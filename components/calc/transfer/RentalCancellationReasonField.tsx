"use client";

/**
 * 명부 장기임대 행 「임대사업자 말소일」의 말소 사유 — 다주택 중과 「소득세법 시행령」 §167의3①2호 단서.
 *
 * 자동말소(민특법 §6⑤, 임대의무기간 종료일)면 가·다·라·마목은 임대기간요건을 갖춘 것으로 본다. 자진말소·미선택은
 * 장기임대주택으로 보지 않는다(사용자 결정 2026-10-13 — 엔진 `rental-cancellation-deeming.ts`가 확인 필요 고지).
 * 말소일을 입력했을 때만 묻는다(④ `transfer-tax-api-houses.ts`도 말소일이 있을 때만 보낸다).
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

type Reason = "auto" | "voluntary";

export function RentalCancellationReasonField({
  value,
  onChange,
  testIdPrefix,
}: {
  value: "" | Reason | undefined;
  onChange: (v: Reason) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-caption text-muted-foreground font-medium">말소 사유</label>
      <RadioCardGroup
        name={testIdPrefix}
        data-testid={testIdPrefix}
        tone="violet"
        layout="inline"
        options={[
          { value: "auto", label: "자동말소", description: "임대의무기간 종료일 말소 (민특법 §6⑤)", testId: `${testIdPrefix}-auto` },
          { value: "voluntary", label: "자진말소", description: "임대의무기간 내 말소 신청 (민특법 §6①11호)", testId: `${testIdPrefix}-voluntary` },
        ]}
        value={value ?? ""}
        onChange={onChange}
      />
      <p className="text-caption text-muted-foreground/70">
        자동말소면 가·다·라·마목은 임대기간요건을 갖춘 것으로 봅니다(소령 §167의3①2호 단서). 자진말소이거나 고르지 않으면
        장기임대주택으로 보지 않습니다 — 자진말소 후 1년 이내에 이 주택을 양도하면 유형에서 사목을 고르세요.
      </p>
    </div>
  );
}
