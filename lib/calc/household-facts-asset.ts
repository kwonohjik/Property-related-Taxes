/**
 * NH-14 — 「세대·주택 현황」(1세대 여부 · 세대 보유 주택 명부 · 분양권·입주권 목록)을 **어느 자산의 종류로** 묻는가.
 *
 * 보유 상황 단계의 ① 세대·주택 현황은 종전에 **첫 자산**이 주택 계열일 때만 열렸다. 첫 자산이 토지·건물(주택이 아닌 자산)인데
 * 함께 양도하는 자산에 주택(일반 주택 · 겸용주택 · 재개발 완공주택)이 있으면 그 칸이 통째로 숨고, 함께 양도 주택은 숨은 기본값
 * (1세대 해당 · 세대 보유 주택 1채 · 분양권·입주권 없음)으로 1세대1주택 판정을 받았다(리뷰 실측: 독립 나대지 먼저 18,628,500 ↔ 주택 먼저
 * 154,286,000 — 세대에 다른 주택 1채가 있는 사실을 입력할 길이 없었다).
 *
 * 함께 양도 주택은 세대 단위 사실을 **첫 자산의 폼 값**에서 받는다(`bundled-route.ts` 컴패니언 `primaryEngineInput`). 그래서 첫 자산이
 * 주택이 아니어도 함께 양도 주택이 있으면 그 칸을 열고 — 칸의 필수 답(`householdNoOtherHousesConfirmed` · `householdNoPresaleRightsConfirmed`)이
 * 비면 기존 ⑧이 막는다. 이 술어 **한 곳**이 ⑤ 표시 · ④ 전송 · ⑧ 검증의 게이트다(3중 패턴).
 *
 * 범위 밖(첫 자산이 주택 계열이면 종전과 같다): 첫 자산이 주택 · 입주권 · 분양권 · 재개발 완공주택이면 그 자산이 기준이다.
 * 지분 분할 묶음(축 B)은 같은 물건의 다른 지분이라 함께 양도 주택이 아니다 — G1(`reverse-appurtenant-house.ts`)과 같은 제외.
 */
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isHousingLike, isOneHouseExemptionAsset } from "@/lib/calc/housing-like-asset";
import { isFractionalRatioStr, isFractionalSplitEntryBundle } from "@/lib/calc/transfer-tax-api-asset-basics";

type HouseholdFactsAsset = Pick<AssetForm, "assetKind" | "ownershipNumerator" | "ownershipDenominator">;

/**
 * 지분 분할(축 B) 묶음인가 — 형제 카드의 저장 `assetKind`는 `makeDefaultAsset(2)` 기본값(`"housing"`)일 뿐 같은 물건의 다른 지분이다.
 * 사용자의 선택(`assetSplitMode`)이 "fractional"이면 그것이고, 선택이 저장되지 않은 종전 세션·이력은 ④와 같은 데이터 판정
 * (`isFullFractionalBundle` 기준 — 전 자산 지분 < 1 · 단 선택이 "companion"이면 아니다)과 진입 직후(전 자산 지분율 빈칸)로 가른다.
 */
function isFractionalSplitBundle(assets: readonly HouseholdFactsAsset[], declaredMode?: TransferFormData["assetSplitMode"]): boolean {
  if (declaredMode === "fractional") return true;
  if (isFractionalSplitEntryBundle(assets)) return true;
  if (declaredMode === "companion") return false;
  return assets.length > 1 && assets.every((a) => isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator));
}

/**
 * 세대·주택 현황의 기준 자산 — 첫 자산이 주택 계열이면 첫 자산, 아니면(토지·건물 등) 함께 양도 자산 중 첫 주택
 * (일반 주택 · 겸용주택 · 재개발 완공주택 — `isOneHouseExemptionAsset`). 해당 없으면 첫 자산(없으면 undefined).
 */
export function householdFactsAssetOf<T extends HouseholdFactsAsset>(
  assets: readonly T[] | undefined,
  declaredMode?: TransferFormData["assetSplitMode"],
): T | undefined {
  const [primary, ...companions] = assets ?? [];
  if (!primary || isHousingLike(primary.assetKind)) return primary;
  if (isFractionalSplitBundle(assets ?? [], declaredMode)) return primary;
  return (
    companions.find((a) => isOneHouseExemptionAsset(a.assetKind)) ??
    // 함께 양도하는 주택이 없고 조합원입주권이 있으면 그 입주권이 기준이다 — §89①4호 가목은 «다른 주택·분양권 미보유»(세대 사실)를 요구하는데,
    // 기준 자산이 토지면 그 사실을 입력할 칸이 없어 컴패니언 입주권의 4호가 화면에서 열리지 않았다(`companion-right-4ho-open.plan.md` §9 V-2).
    companions.find((a) => a.assetKind === "right_to_move_in") ??
    primary
  );
}

/** 세대·주택 현황의 기준 자산 종류 — 기준 자산이 없으면 빈 문자열(`Step4`의 `primaryKind` 규약). */
export function householdFactsKindOf(
  assets: readonly HouseholdFactsAsset[] | undefined,
  declaredMode?: TransferFormData["assetSplitMode"],
): string {
  return householdFactsAssetOf(assets, declaredMode)?.assetKind ?? "";
}

/** 폼 기준 편의 — ⑤·④·⑧이 같은 인자(`assets` · `assetSplitMode`)로 부르도록 한 곳에 둔다. */
export function householdFactsKindOfForm(form: Pick<TransferFormData, "assets" | "assetSplitMode">): string {
  return householdFactsKindOf(form.assets, form.assetSplitMode);
}

/** 첫 자산이 주택 계열이 아닌데 함께 양도 주택 때문에 현황 칸이 열린 구성인가(표시·고지용). */
export function householdFactsOpenedByCompanion(form: Pick<TransferFormData, "assets" | "assetSplitMode">): boolean {
  const first = form.assets?.[0];
  return !!first && householdFactsAssetOf(form.assets, form.assetSplitMode) !== first;
}
