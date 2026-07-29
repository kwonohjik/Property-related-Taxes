"use client";

/**
 * 상속 주택 개별/공동 구분 픽커 (보충적평가 보조계산·§164⑦ 환산 조회용).
 *
 * 세액 무관 — 엔진은 개별/공동 모두 floor(신고가액)로 동일 처리한다.
 * 이 선택은 공시가격 자동조회 DB(개별주택가격 vs 공동주택가격)와 표시 라벨만 결정.
 * 상단 자산 구분 라디오를 폐지하고, 주택 자산의 조회가 필요한 맥락에서만 노출한다.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const HOUSE_KIND_OPTIONS = [
  { value: "house_individual", label: "개별·다세대주택 (개별주택가격)" },
  { value: "house_apart", label: "공동주택 (공동주택가격)" },
] as const;

export function InheritanceHouseKindPicker({
  value,
  assetId,
  onChange,
}: {
  /** 현재 개별/공동 값 (미선택 시 호출부가 동·호로 기본 도출) */
  value: "house_individual" | "house_apart";
  assetId: string;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-caption text-muted-foreground font-medium">
        주택 구분 (공시가격 조회용)
      </label>
      <RadioCardGroup
        name={`inh-house-kind-${assetId}`}
        tone="amber"
        layout="stack"
        options={HOUSE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        onChange={(v) =>
          onChange({
            inheritanceAssetKind: v as AssetForm["inheritanceAssetKind"],
            // 개별↔공동 전환 시 보조계산 입력 초기화 (stale 조회값 방지)
            useSupplementaryHelper: false,
            supplementaryLandUnitPrice: "",
            supplementaryLandArea: "",
            supplementaryBuildingValue: "",
          })
        }
      />
    </div>
  );
}
