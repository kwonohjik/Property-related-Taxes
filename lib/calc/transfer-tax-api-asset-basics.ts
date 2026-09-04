/**
 * ④ **자산 기본 파생 leaf** — 상속 주택 구분 · 공유지분율 · 양도비 파생.
 *
 * `transfer-tax-api-helpers.ts`에서 분리했다(800줄 정책). 여기 있는 것들의 공통점은
 * **의존이 거의 없는 순수 파생**이라는 것이고, 그래서 `helpers`와
 * `transfer-tax-api-companion-payload.ts`가 **둘 다** 이 파일을 볼 수 있다.
 *
 * 🔑 **순환을 끊으려고 만든 파일이다.** `buildAssetPayload`를 별도 파일로 뺐더니
 *    `helpers`(재export) ↔ `companion-payload`(이 3종을 import)로 순환이 생겼다.
 *    저장소는 같은 이유로 `general-building-part-cards.ts`를 만든 전례가 있다.
 *
 * ⚠️ 이 파일은 `transfer-tax-api-*`의 어느 것도 import하지 않는다 — leaf를 유지할 것.
 *
 * 종전 경로 호환을 위해 `transfer-tax-api-helpers.ts`가 전부 재export한다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 상속 주택 개별/공동 구분 — **UI·API 공용 단일 소스**.
 *
 * `inheritanceAssetKind`는 미선택("")으로 시작하고, 픽커(InheritanceHouseKindPicker)가
 * 동·호 유무로 기본값을 **표시**한다. 이 파생을 복제하지 말고 이 함수를 호출할 것 —
 * 소비처가 raw 비교(`=== "house_individual"`)를 하면 픽커에 "개별"이 선택돼 보이는데도
 * 그 소비처만 false가 되어, 이미 checked인 라디오를 다시 눌러도 change가 안 나 **막힌다**
 * (2026-07-30 실측: HouseValuationSection 3시점 일괄 계산 버튼이 초기 진입 시 미노출).
 * 세액 무관 — 조회 DB(개별주택가격 vs 공동주택가격)·라벨·게이팅용.
 */
export function deriveInheritanceHouseKind(
  asset: AssetForm,
): "house_individual" | "house_apart" {
  if (asset.inheritanceAssetKind === "house_individual") return "house_individual";
  if (asset.inheritanceAssetKind === "house_apart") return "house_apart";
  return asset.addressDong && asset.addressHo ? "house_apart" : "house_individual";
}

/**
 * 상속 취득가액 엔진 payload용 assetKind 파생 — 상단 `asset.assetKind` 기준.
 *
 * 엔진(inheritance-acquisition)은 land(단가×면적/legacyFallback) vs house(총액)만 구분하므로
 * land vs 非land 이분으로 매핑한다. housing/redevelopment는 개별/공동 refinement를 유지하되
 * (조회 DB·라벨용, 세액 무관), 미선택 시 동·호 유무로 도출. 그 외(건물·권리 등)는 총액-safe house_apart.
 * 상단 자산 구분 라디오 폐지 후에도 §164⑦(helpers.ts:142)·다건 land 안분이 항상 정확하도록 보장.
 */
export function deriveEngineInheritanceAssetKind(
  asset: AssetForm,
): "land" | "house_individual" | "house_apart" {
  if (asset.assetKind === "land") return "land";
  if (asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt") {
    return deriveInheritanceHouseKind(asset);
  }
  return "house_apart";
}

/**
 * 분자·분모(number)에서 지분 모드 여부 판정. 단일 진실 공급원.
 * 분자 < 분모이고 둘 다 양수면 true (지분 모드). 100/100, 50/50 등 분자=분모는 false (단독).
 * NaN·0·음수 등 비정상 입력은 false (안전 fallback).
 */
export function isFractionalRatio(numerator: number, denominator: number): boolean {
  if (!isFinite(numerator) || !isFinite(denominator)) return false;
  if (denominator <= 0 || numerator <= 0) return false;
  return numerator < denominator;
}

/**
 * 분자·분모(string)에서 지분 모드 여부 판정. UI 폼 필드 전용 어댑터.
 */
export function isFractionalRatioStr(numerator: string, denominator: string): boolean {
  return isFractionalRatio(parseFloat(numerator), parseFloat(denominator));
}

/**
 * 자산의 공유 지분 비율을 [0..1] 실수로 계산.
 * 미설정/단독 소유 시 1.0. 분모 ≤ 0 또는 NaN 시 1.0 (안전 fallback).
 */
export function getOwnershipRatio(asset: AssetForm): number {
  const n = parseFloat(asset.ownershipNumerator || "100");
  const d = parseFloat(asset.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0) return 1.0;
  return Math.min(n / d, 1.0);
}

/** 지분 모드 여부 (자산 단위 어댑터). isFractionalRatio 단일 진실 공급원에 위임. */
export function isFractionalOwnership(asset: AssetForm): boolean {
  return isFractionalRatioStr(
    asset.ownershipNumerator || "100",
    asset.ownershipDenominator || "100",
  );
}

/**
 * "진짜 지분 모드(같은 물건 분할 취득)" 판정 — 전 자산이 fractional(분자<분모)인 경우만 true.
 * route.ts:423 `isFullFractionalBundle`(primary + 전 companion fractional)와 동일 기준.
 * companion 모드(다른 물건 함께양도)에 우연히 부분소유(1/2) 자산이 섞인 경우(primary=100/100)는
 * every=false로 배제 — 그 경우 각 자산 basic이 상이하므로 primary 병합을 하면 안 됨.
 */
export function isFullFractionalBundle(assets: AssetForm[]): boolean {
  return (
    assets.length > 1 &&
    assets.every((a) =>
      isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator),
    )
  );
}

/**
 * 자산별 effective transferExpense 계산 (B3 폼-수준 안분 로직).
 * 우선순위:
 *   1. 자산-수준 transferExpense 직접 입력 (>0): 지분 모드 시 × ratio, 단독 모드는 그대로
 *   2. 폼-수준 totalTransferExpense × ratio (지분 모드 + 자산-수준 미입력)
 *   3. 폼-수준 totalTransferExpense 그대로 (단독 모드 — 일반적으로 미사용)
 *   4. 0
 */
export function effectiveTransferExpenseFor(
  asset: AssetForm,
  ratio: number,
  fractional: boolean,
  totalTransferExpense?: number,
): number {
  const direct = parseAmount(asset.transferExpense);
  if (direct > 0) {
    return fractional ? applyRatio(direct, ratio) : direct;
  }
  if (fractional && totalTransferExpense && totalTransferExpense > 0) {
    return applyRatio(totalTransferExpense, ratio);
  }
  return 0;
}


