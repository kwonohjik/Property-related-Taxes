/**
 * §164⑨ 양도당시 기준시가 차감 특례 — **적격 자산 범위 단일 소스**.
 *
 * 소득세법 시행령 §164⑨은 법 **§99①1호 "가목부터 라목까지"**의 가액을 대상으로 한다:
 *   가. 토지 / 나. 건물 / 다. 오피스텔 및 상업용 건물 / 라. 주택
 * (법제처 MST 286211·280405 원문 확인 2026-07-16)
 *
 * §99①**2호**(부동산에 관한 권리 — 조합원입주권·분양권)는 **대상이 아니다**.
 *
 * ## 왜 진입점이 2개인가 (계획 Q7 B안)
 *
 * 이 판정을 쓰는 3층의 **축이 서로 다르다**:
 *   - UI(`ExpropriationBlock`)·validate(`transfer-tax-validate-asset`) → `AssetForm.assetKind` (8값)
 *   - 엔진(`applyExpropriationValuation`)                              → `TransferTaxInput.propertyType` (10값)
 *
 * 두 enum은 **다르다**. 매핑은 `transfer-tax-api.ts:196-200`에만 있고 `isMixed`·
 * `isRedevelopmentRightTransfer` **파생을 포함**해 순수 함수로 추출할 수 없다(UI 시점엔 미확정).
 * ⇒ 단일 함수를 3층이 공유하는 대신, **적격 목록(`EXPR_VALUATION_ELIGIBLE_*`)을 이 파일에 한 번만**
 *   정의하고 축별 진입점 2개가 각자 조회한다. 목록이 단일 소스이므로 드리프트가 없다.
 *
 * ⚠️ **3층 중 어느 곳도 자체 조건을 재구현하지 말 것** — 재구현하는 순간 이 파일의 의미가 사라진다.
 */
import type { TransferTaxInput } from "./types/transfer.types";

/**
 * 현행 문언(대통령령 제21301호) 적용 시작일 — **단일 소스**.
 *
 * 엔진(`transfer-tax-expropriation-valuation.ts`)·validate·UI(`ExpropriationBlock`)가 모두 이 값을
 * 쓴다. 종전엔 3파일에 리터럴이 복제돼 "동일해야 한다"는 주석만 있었고 강제력이 없었다.
 * 근거·미검증 사항은 엔진 파일의 `MIN_TRANSFER_DATE` 주석 참조.
 */
export const EXPR_VALUATION_MIN_TRANSFER_DATE = "2009-02-04";

/**
 * **§164⑨ 법령 적격 범위** — 법 §99①1호 가목~라목. 엔진 `propertyType` 축(10값 중).
 *
 * ⚠️ **이 목록 하나가 법령 범위의 단일 소스다.** `assetKind` 축 조회도 이 목록을 쓴다
 * (두 enum이 해당 값들에 대해 **문자열이 동일**하기 때문 — 별도 목록을 두면 동일 내용이
 *  복제돼 한쪽만 바뀌는 dual-truth가 된다).
 *
 * 폼에 대응이 없는 파생 값은 다음과 같이 취급한다:
 *   - `mixed-use-house`(겸용) — 나+라목 복합. **미포함** — 겸용 경로는 자체 환산 산식을 쓰며
 *     특례 배선 자체가 안 돼 있다(계획 D8/P7). 적격으로 표시하면 "게이트는 열렸는데 세액은 그대로"가 된다.
 *   - `redevelopment_apt` — 라목(주택)인지 2호가목(권리)인지 **미확정**(계획 U3). 확정 전 **미포함**
 *     (법 근거 없이 적용하지 않는 보수적 선택. 단 현재 수용 UI에 미노출이라 도달 불가 — 계획 BR-3).
 *   - `general_building_unit` — `general-building-valuation.ts`가 만드는 **엔진 내부 서브카드**
 *     propertyType이라 자산-수준 게이트에 도달하지 않는다. **미포함**.
 */
const ELIGIBLE_PROPERTY_TYPES = [
  "land", // 가목
  "building", // 나목
  "general_building", // 나목
  "commercial_building", // 다목
  "housing", // 라목 — ⚠️ 아래 주석 참조
] as const;

/**
 * **원/㎡ 트랙 지원 자산** — 위 적격 목록의 **부분집합**.
 *
 * ## ⚠️ 법령 적격(scope) ≠ 구현 지원(track) — 두 축을 섞지 말 것
 *
 * 주택(라목)은 **법령상 적격**이나 개별주택가격·공동주택가격은 **총액**이라 `원/㎡ × 면적`
 * 분해가 없다. 현행 `applyExpropriationValuation`은 **원/㎡ 3후보 min[]** 모델이므로 주택에는
 * **총액 트랙**이 따로 필요하다(계획 P5 — 미구현).
 *
 * 주택을 UI 노출 대상에 넣으면 `transferArea`가 없어(`StandardPriceInput` `isAreaMode === false`)
 * 엔진 게이트 `area > 0`에 걸린다 ⇒ **사용자가 보상액을 입력해도 아무 일도 일어나지 않는다**.
 * 이는 다필지에서 방금 고친 **침묵 무시**(계획 D7)와 같은 병이다. ⇒ **UI·validate는 이 목록을 쓴다.**
 *
 * 엔진은 `ELIGIBLE_PROPERTY_TYPES`(법령 적격)로 게이트한다 — 두 목록의 목적이 다르다:
 *   - 엔진: "§164⑨ 대상인가" (법령)
 *   - UI/validate: "지금 실제로 계산되는가" (구현)
 * P5에서 총액 트랙이 붙으면 이 목록에 `housing`을 추가하면 된다(적격 목록은 불변).
 */
const PER_SQM_TRACK_ASSET_KINDS = [
  "land", // 가목 — 개별공시지가 × 면적. `calcTransferGain` 경유 → 특례 도달 ✅
  "building", // 나목 — 국세청 고시 ㎡당 × 면적. `calcTransferGain` 경유 → 특례 도달 ✅
  "commercial_building", // 다목 — 호별고시가 × 연면적. `runCommercialBuildingStep` 내부 배선(D16-CB) → 도달 ✅
  // ⚠️ `general_building`(나목) **제외** — 아래 참조(route early-return 우회, D16-GB 미배선).
] as const;

/**
 * ## ⚠️ 일반건물은 왜 빠졌나 — **전용 경로가 특례를 우회한다** (상가는 D16-CB로 배선 완료)
 *
 * - **상업용건물**: ✅ **배선 완료(D16-CB)** — `runCommercialBuildingStep`(`transfer-tax-helpers.ts`)
 *   내부에서 `applyExpropriationValuation`으로 양도시 호별총액(환산 분모)을 낮춘다.
 *   `commercial_building`은 위 `PER_SQM_TRACK`에 **재추가**됐다.
 * - **일반건물**: ❌ **미배선(D16-GB)** — `route.ts:708` → `dispatchGeneralBuilding` → `:736`
 *   **early return**으로 `calculateTransferTax`를 **아예 호출하지 않는다**. 게다가 안분(§100)과
 *   환산 분모(§164⑨)에 같은 양도시 기준시가가 쓰여, 분모만 낮추고 안분은 원값 유지하는
 *   **분리 배선 + 법령 해석**이 필요하다. 배선 후 `PER_SQM_TRACK`에 추가하면 된다.
 *   ⇒ UI에 노출하면 사용자 입력이 **아무 일도 안 하는** 침묵 무시가 되므로 현재 **제외**.
 *
 * ※ 엔진 목록(`ELIGIBLE_PROPERTY_TYPES`)에는 `general_building`도 **그대로 둔다** —
 *   법령 적격은 사실이고, GB 경로가 배선되면 엔진 게이트는 이미 통과 상태여야 하기 때문이다.
 */

/**
 * **UI·validate 진입점** — `AssetForm.assetKind` 축.
 *
 * "**지금 실제로 계산되는가**"를 답한다(원/㎡ 트랙 + 특례 도달). 법령 적격이되 경로가 우회하거나
 * 모델이 안 맞는 자산은 **false** — 노출하면 침묵 무시가 된다(위 주석).
 */
export function isExprValuationEligibleAssetKind(assetKind: string | undefined): boolean {
  return (PER_SQM_TRACK_ASSET_KINDS as readonly string[]).includes(assetKind ?? "");
}

/**
 * **엔진 진입점** — `TransferTaxInput.propertyType` 축.
 *
 * "**§164⑨ 대상인가**"를 답한다(법령 적격, 가~라목). 주택·상가·일반건물은 **true**이나
 * 각각 `area > 0` 게이트·전용 경로 우회로 현재는 미발동이다 — 법령 범위를 구현 한계로 좁히지 않는다.
 */
export function isExprValuationEligiblePropertyType(
  propertyType: TransferTaxInput["propertyType"] | undefined,
): boolean {
  return (ELIGIBLE_PROPERTY_TYPES as readonly string[]).includes(propertyType ?? "");
}

/**
 * 법령 적격 여부(`assetKind` 축) — **진단·테스트용**. UI 노출 판정에는 쓰지 말 것.
 *
 * 위 `ELIGIBLE_PROPERTY_TYPES`를 그대로 조회한다 — `assetKind`와 `propertyType`은 **다른 enum**이나
 * 이 목록의 값들(land·building·general_building·commercial_building·housing)에 대해서는
 * **문자열이 동일**하다. 별도 목록을 두면 동일 내용 복제 = dual-truth.
 */
export function isExprValuationLegallyEligibleAssetKind(assetKind: string | undefined): boolean {
  return (ELIGIBLE_PROPERTY_TYPES as readonly string[]).includes(assetKind ?? "");
}
