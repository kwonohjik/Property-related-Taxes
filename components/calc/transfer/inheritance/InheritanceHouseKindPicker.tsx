"use client";

/**
 * 상속 주택 개별/공동 구분 픽커 (보충적평가 보조계산·§164⑦ 환산 조회용).
 *
 * 세액 무관 — 엔진은 개별/공동 모두 floor(신고가액)로 동일 처리한다.
 * 이 선택은 공시가격 자동조회 DB(개별주택가격 vs 공동주택가격)와 표시 라벨만 결정.
 * 상단 자산 구분 라디오를 폐지하고, 주택 자산의 조회가 필요한 맥락에서만 노출한다.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { deriveInheritanceHouseKind } from "@/lib/calc/transfer-tax-api-helpers";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const HOUSE_KIND_OPTIONS = [
  { value: "house_individual", label: "개별·다세대주택 (개별주택가격)" },
  { value: "house_apart", label: "공동주택 (공동주택가격)" },
] as const;

export function InheritanceHouseKindPicker({
  asset,
  onChange,
}: {
  /**
   * 자산 폼 — 개별/공동 현재값은 **공용 파생**(`deriveInheritanceHouseKind`)으로 여기서 구한다.
   * 종전에는 호출부가 같은 파생을 세 곳에서 각자 계산해 넘겼다.
   */
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const value = deriveInheritanceHouseKind(asset);
  /**
   * 개별↔공동 전환 시 stale 조회값 정리 (2026-09-05 · 코드리뷰 Q17에서 정정).
   *
   * 🔴 종전에는 여기서 `useSupplementaryHelper: false`도 함께 껐다. 그런데 이 픽커는
   *   **그 토글의 내부**(PostDeemedInputs 「보충적평가 보조계산」)에 산다 — 주택 구분을
   *   고르는 순간 픽커가 들어 있던 패널이 통째로 접혔다.
   *
   * ⚠️ 토글을 끄지 않는 대신 **파생 신고가액도 함께 비운다**. 조회 3필드만 비우면
   *   `publishedValueAtInheritance`(그 3필드에서 계산돼 들어간 값)가 옛 구분의 값으로
   *   남는다 — 화면에는 빈 칸, 엔진에는 stale 금액이 가는 조합이다.
   *   비우는 조건은 `reportedPatch`(PostDeemedInputs)와 **같다**: 보조계산 ON + 보충적평가.
   */
  const helperFeeds =
    asset.useSupplementaryHelper === true &&
    asset.inheritanceValuationMethod === "supplementary";
  return (
    <div className="space-y-1.5">
      <label className="block text-caption text-muted-foreground font-medium">
        주택 구분 (공시가격 조회용)
      </label>
      <RadioCardGroup
        name={`inh-house-kind-${asset.assetId}`}
        tone="amber"
        layout="stack"
        options={HOUSE_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        onChange={(v) =>
          onChange({
            inheritanceAssetKind: v as AssetForm["inheritanceAssetKind"],
            // 개별↔공동 전환 시 조회값 초기화 (stale 방지) — 토글은 끄지 않는다(위 주석).
            supplementaryLandUnitPrice: "",
            supplementaryLandArea: "",
            supplementaryBuildingValue: "",
            ...(helperFeeds ? { publishedValueAtInheritance: "" } : {}),
          })
        }
      />
    </div>
  );
}
