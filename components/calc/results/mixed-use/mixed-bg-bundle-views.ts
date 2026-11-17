/**
 * 함께 양도 묶음 결과 카드의 «겸용주택 × 부담부증여» 블록 뷰 — 자산 하나분.
 *
 * 소스는 `aggregated.mixedUseBgDetailsByAsset`(키 = 자산 id · 주 자산 `primary`)뿐이다. 선례 `gbBlockViewsOf`(일반건물 자산별 슬롯)와 같은 규약이다.
 * 🔑 `aggregated.burdenedGift.perAsset`(토지·건물 2부분)은 묶음 합계 표시용 근사라 겸용 자산 행에는 쓰지 않는다 — 이 슬롯의 4부분이 정본이다.
 */
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { MixedUseBurdenedGiftBreakdown } from "@/lib/tax-engine/types/mixed-use-burdened-gift.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export interface MixedBgBundleView {
  /** 자산 id(주 자산 `primary`) — 카드 testid 키 */
  assetKey: string;
  /** 안분 표 행 라벨(「주 자산」·「자산 2」) — 없으면 폼 순서의 「자산 N」 */
  label: string;
  bg: MixedUseBurdenedGiftBreakdown;
  /** 그 자산의 입력 평가 모드 — 증여가액 라벨만 가른다(값은 전부 엔진 echo) */
  valuationMode?: TransferFormData["assets"][number]["bgValuationMode"];
}

export function mixedBgBundleViewsOf(
  aggregated: AggregateTransferResult,
  apportionment: Pick<BundledApportionmentResult, "apportioned">,
  formData: Pick<TransferFormData, "assets">,
): MixedBgBundleView[] {
  const byAsset = aggregated.mixedUseBgDetailsByAsset;
  if (!byAsset) return [];
  const indexOf = (key: string) => (key === "primary" ? 0 : formData.assets.findIndex((a) => a.assetId === key));
  return Object.keys(byAsset)
    .sort((a, b) => indexOf(a) - indexOf(b))
    .map((key) => {
      const idx = indexOf(key);
      return {
        assetKey: key,
        label: apportionment.apportioned.find((a) => a.assetId === key)?.assetLabel || (idx >= 0 ? `자산 ${idx + 1}` : key),
        bg: byAsset[key],
        // 축 B 지분 카드는 평가 모드를 저장하지 않는다(② 숨김 · 지분 카드 값 `""`) — 물건 단위 값인 자산 1의 것을 쓴다(④ 병합과 같은 출처 · PR-C).
        valuationMode: byAsset[key].axisB ? formData.assets[0]?.bgValuationMode : idx >= 0 ? formData.assets[idx]?.bgValuationMode : undefined,
      };
    });
}
