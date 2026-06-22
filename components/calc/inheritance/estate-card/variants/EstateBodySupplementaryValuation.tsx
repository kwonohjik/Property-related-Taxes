/**
 * EstateBodySupplementaryValuation — 부동산 보충적 평가(§61①) 입력 섹션.
 *
 * EstateBodyRealEstate에서 분리(800줄 정책). 토지·아파트·상업용 건물 공통 보충평가 +
 * 상업용 건물 전용 §61 경로 라디오(일괄고시 §61①3호 / 건물+부수토지 분리 §61①2호·1호).
 * 보충평가 관련 local state(토글·단가·경로 모드)는 본 컴포넌트 내부에 격리.
 */

import { useState } from "react";
import type { AddressValue } from "@/components/ui/address-search";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  RadioCardGroup,
  type RadioCardOption,
} from "@/components/calc/inputs/RadioCardGroup";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { resolvePropertyKind } from "./EstateBodyHelpers";

type RealEstateCat =
  | "real_estate_land"
  | "real_estate_building"
  | "real_estate_apartment";

interface Props {
  item: EstateItem;
  set: (patch: Partial<EstateItem>) => void;
  cat: RealEstateCat;
  propertyKind: ReturnType<typeof resolvePropertyKind>;
  valuationDate?: string;
  addrValue: AddressValue;
  /** SUPPLEMENTARY_LABEL[cat] — 물건별 보충평가 라벨 (D-2) */
  supplementaryLabel: string;
}

const CB_ROUTE_OPTIONS = (itemId: string): RadioCardOption<"lump_sum" | "separate">[] => [
  {
    value: "lump_sum",
    label: "국세청 일괄고시 기준시가 (오피스텔·대규모 상가)",
    description: "국세청장이 토지·건물을 일괄 산정·고시한 가액 1개로 평가 (상증법 §61①3호)",
    testId: `cb-route-lump-${itemId}`,
  },
  {
    value: "separate",
    label: "건물 기준시가 + 부수토지 개별공시지가 분리",
    description:
      "일괄고시 대상이 아닌 일반 상업용 건물 — 건물 기준시가(§61①2호) + 부수토지 개별공시지가(§61①1호) 합산",
    testId: `cb-route-separate-${itemId}`,
  },
];

export function EstateBodySupplementaryValuation({
  item,
  set,
  cat,
  propertyKind,
  valuationDate,
  addrValue,
  supplementaryLabel,
}: Props) {
  const [standardPricePerSqm, setStandardPricePerSqm] = useState("");
  // 부수토지(개별공시지가) 단가 local state — 상업용 건물 경로 B 전용. 총액만 store 저장(StandardPriceInput 내부 곱).
  const [appurtenantLandPricePerSqm, setAppurtenantLandPricePerSqm] = useState("");
  // 보충적 평가 토글 — 값>0이면 초기 ON(비파괴). mount 1회. OFF로 닫아도 store 값 보존.
  const [supplementaryOpen, setSupplementaryOpen] = useState(
    () => (item.standardPrice ?? 0) > 0,
  );
  // §61 경로 — 상업용 건물 보충평가: 일괄고시(§61①3호) vs 건물+부수토지 분리(§61①2호·1호).
  // 부수토지 값>0이면 초기 분리(경로 B). mount 1회 derive(비파괴, useEffect 미러링 아님).
  const [separateLandMode, setSeparateLandMode] = useState(
    () => (item.appurtenantLandStandardPrice ?? 0) > 0,
  );

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="emerald"
      size="sm"
      title={supplementaryLabel}
      description="시가·감정가·매매사례가 모두 없을 때 최종 적용"
      checked={supplementaryOpen}
      onCheckedChange={setSupplementaryOpen}
    >
      <div className="space-y-2">
        {!addrValue.jibun && (
          <p className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
            ⚠️ 공시가격 자동 조회는 상단 <strong>자산 명칭(소재지 검색)</strong>에서
            지번 주소를 선택해야 활성화됩니다.
          </p>
        )}
        {/* §61 경로 라디오 — 상업용 건물 전용. 일괄고시(§61①3호) vs 건물+부수토지 분리(§61①2호·1호) */}
        {cat === "real_estate_building" && (
          <RadioCardGroup
            name={`cb-valuation-route-${item.id}`}
            lawLinks="상증법"
            tone="emerald"
            layout="stack"
            value={separateLandMode ? "separate" : "lump_sum"}
            onChange={(v) => {
              const sep = v === "separate";
              setSeparateLandMode(sep);
              // 경로 A(일괄고시) 전환 시 부수토지 값 제거 — 잔존 합산(이중계상) 방지
              if (!sep && item.appurtenantLandStandardPrice != null) {
                set({ appurtenantLandStandardPrice: undefined });
              }
            }}
            options={CB_ROUTE_OPTIONS(item.id)}
          />
        )}
        <StandardPriceInput
          propertyKind={propertyKind}
          referenceDate={valuationDate}
          totalPrice={item.standardPrice != null ? String(item.standardPrice) : ""}
          onTotalPriceChange={(v) =>
            set({ standardPrice: parseAmount(v) || undefined })
          }
          pricePerSqm={standardPricePerSqm}
          onPricePerSqmChange={setStandardPricePerSqm}
          jibun={addrValue.jibun}
          label={
            cat === "real_estate_building" && separateLandMode ? "건물 기준시가" : ""
          }
          enableLookup={true}
        />
        {propertyKind !== "land" && (
          <div className="flex justify-end">
            <BuildingStdPriceModalButton
              buttonLabel="건물 기준시가 계산"
              lockedTaxType="inheritance_gift"
              initialAddress={addrValue}
              onApply={(v) => set({ standardPrice: v })}
            />
          </div>
        )}
        {/* 경로 B 부수토지 — 개별공시지가(원/㎡)×대지면적 → 총액. 토지 StandardPriceInput(area-mode) 재사용 */}
        {cat === "real_estate_building" && separateLandMode && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 space-y-1.5 dark:border-emerald-800/40 dark:bg-emerald-950/20">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              부수토지 개별공시지가 (§61①1호)
            </p>
            <StandardPriceInput
              propertyKind="land"
              referenceDate={valuationDate}
              totalPrice={
                item.appurtenantLandStandardPrice != null
                  ? String(item.appurtenantLandStandardPrice)
                  : ""
              }
              onTotalPriceChange={(v) =>
                set({ appurtenantLandStandardPrice: parseAmount(v) || undefined })
              }
              pricePerSqm={appurtenantLandPricePerSqm}
              onPricePerSqmChange={setAppurtenantLandPricePerSqm}
              jibun={addrValue.jibun}
              label=""
              enableLookup={true}
            />
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
