"use client";

/**
 * 일반건물 별개취득 — 취득시 기준시가 **읽기 전용 파생 표시** (소득세법 §99①1호 가목·나목).
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md §6 Phase 3
 *
 * **입력 정본은 파트 카드**(`LandBuildingSplitSection`의 `PartAcqStdPrice`)다. 종전에는 자산 전체
 * 블록(`StandardPriceInput` area 모드)이 같은 폼 필드(`standardPricePerSqmAtAcq`·`acquisitionArea`)를
 * 한 화면에서 다시 입력받아 **면적 칸이 2개**였고, 별개취득 + 건물분 명시 입력 시 엔진은 결합 총액을
 * 아예 참조하지 않으므로(`transfer-tax-split-gain.ts:52-56`) 쓰이지도 않는 총액을 채우게 했다.
 *
 * ⚠️ 토지분 산식은 **엔진과 같은 헬퍼**(`calcLandStdPriceAtAcq`)를 쓴다 — UI가 재구현하면
 *    절사 규약이 갈려 표시값과 계산값이 어긋난다(`Math.floor` — 반올림 금지).
 * ⚠️ 주택(라목)은 대상이 아니다 — 부수토지 포함 결합 공시가 정본이라 총액을 사용자가 입력한다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { calcLandStdPriceAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";

/** 읽기 전용 금액 셀 — 금액 칼럼 정렬 규약(amount-column-align) 적용 */
function AmountCell({ value }: { value: number | null }) {
  return (
    <div className="flex h-9 items-center justify-end rounded-md border border-input bg-muted/40 px-3 text-sm font-mono tabular-nums whitespace-nowrap text-muted-foreground">
      {value !== null ? value.toLocaleString() : <span className="text-muted-foreground/50">자동 계산</span>}
    </div>
  );
}

export function SplitAcqStdReadonlyPanel(props: {
  /** ㎡당 개별공시지가 (원/㎡) — 파트 토지 카드 입력값 */
  pricePerSqmAtAcq: string;
  /** 토지 면적 (㎡) — 파트 토지 카드 입력값 */
  acquisitionArea: string;
  /** 건물분 기준시가 (원) — 파트 건물 카드 입력값 */
  buildingStdPriceAtAcq: string;
}) {
  const land = calcLandStdPriceAtAcq(
    parseAmount(props.pricePerSqmAtAcq),
    parseDecimal(props.acquisitionArea),
  );
  const building = parseAmount(props.buildingStdPriceAtAcq) || null;
  const total = land !== null && building !== null ? land + building : null;

  return (
    <div className="space-y-1.5" data-testid="split-acq-std-readonly">
      <label className="text-sm font-medium">취득시 기준시가 (원)</label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <FieldCard label="토지분" unit="원" hint="㎡당 공시지가 × 면적 (§99①1호 가목)">
          <AmountCell value={land} />
        </FieldCard>
        <FieldCard label="건물분" unit="원" hint="국세청장 산정액 (§99①1호 나목)">
          <AmountCell value={building} />
        </FieldCard>
        <FieldCard label="합계" unit="원" hint="개산공제·안분 비율의 base">
          <AmountCell value={total} />
        </FieldCard>
      </div>
      <p className="text-caption text-muted-foreground">
        토지·건물 취득시기가 달라 각 파트가 <strong>자기 취득일의 직전 고시분</strong>을 쓰므로,
        위 「토지 취득가액 방식」·「건물 취득가액 방식」의 각 기준시가 카드에서 입력합니다
        (소득세법 §99①1호 가목·나목·시행령 §164③).
      </p>
    </div>
  );
}
