/**
 * 1세대1주택 비과세 **판정 메뉴** 폼 타입 (P4-2b-1)
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` Q-8 · §20.4 · §20.8.
 *
 * ## 왜 `TransferFormData` **슈퍼셋**인가 (Q-8)
 *
 * 판정 메뉴는 계산기의 섹션 11종을 **수정 없이** 재사용한다. 그 섹션들은 `form: TransferFormData`
 * + `onChange(Partial<TransferFormData>)` props에 묶여 있으므로, 폼 상태가 `TransferFormData`의
 * 슈퍼셋이면 그대로 통과한다(`strictFunctionTypes` 반변성상 추가 필드가 전부 optional이거나
 * 슈퍼셋이면 성립 — 11종 전건 `tsc --noEmit` 0 error로 실측).
 *
 * 대안이었던 `Pick<TransferFormData, …>`는 **TS2740으로 성립하지 않는다**(실측).
 *
 * ## 🔴 `saleTargetHouseId`·`saleExpectedDate`·`saleExpectedPrice`는 만들지 않는다 (§20.4)
 *
 * Q-8 문언에는 이 셋이 있었으나 실측이 전제를 뒤집었다:
 *
 *   · 명부(`houses`)는 **「다른 보유 주택」**이다 — 양도 대상은 들어 있지 않다
 *     (`HousesListSection.tsx:529` 「현재 양도하는 주택 **외** 세대 구성원이 보유한 주택」).
 *     API 변환 층이 `id:"selling"` 행을 앞에 붙이며, 그 행의 취득일·기준시가·지역을
 *     전부 `assets[0]`에서 읽는다(`transfer-tax-api-houses.ts:29-41`).
 *     ⇒ 「명부 중에서 양도 대상을 고른다」가 성립하지 않는다.
 *   · 양도예정일·예상양도가는 `transferDate`·`assets[0].transferPrice`가 **이미 그 자리**이고,
 *     재사용 leaf들이 **그 필드를 읽는다**. 별도 필드를 두면 dual truth다.
 *
 * ⇒ 슈퍼셋이 실제로 더하는 것은 **§155의2·§155의3 입력뿐**이다. 이 둘은 계산기 화면에
 *   만들지 않기로 했으므로(D-4) `TransferFormData`가 아니라 여기에 둔다.
 */
import type { TransferFormData } from "./calc-wizard-form.types";
import { createDefaultTransferFormData } from "./calc-wizard-store";
import { migrateAsset } from "./calc-wizard-asset-migrate";

/**
 * §155의2·§155의3 입력 13필드는 **별도 파일이 정본**이다(P5-a).
 * 계산기 폼(`TransferFormData.importedOneHouseFacts`)도 같은 타입을 쓰므로, 여기에 두면
 * 두 폼 타입이 서로를 import해 순환이 된다. 재export만 남겨 기존 import 경로를 지킨다.
 */
import type { OneHouseJudgmentExtraFields } from "./one-house-extra-fields.types";
import { oneHouseJudgmentExtraDefaults } from "./one-house-extra-fields.types";
export type { OneHouseJudgmentExtraFields };
export { oneHouseJudgmentExtraDefaults };

/** 판정 메뉴 폼 — `TransferFormData` 슈퍼셋(Q-8). */
export type OneHouseJudgmentFormData = TransferFormData & OneHouseJudgmentExtraFields;


/**
 * 판정 메뉴 초기 폼.
 *
 * 🔑 `createDefaultTransferFormData()`를 **재사용**한다 — 기본값을 베껴 쓰면 계산기와 판정 메뉴의
 *    같은 필드가 서로 다른 값에서 출발해 조용히 갈린다(`feedback_store_default_vs_ui_display_fallback`).
 *
 * 🔑 `householdHousingCount`는 **초기값 그대로 두고 쓰지 않는다** — 판정 메뉴의 주택 수는
 *    명부에서 파생한다(G-1). `deriveJudgmentHouseCount`가 유일한 소스다.
 */
export function createInitialOneHouseJudgmentForm(): OneHouseJudgmentFormData {
  return { ...createDefaultTransferFormData(), ...oneHouseJudgmentExtraDefaults };
}

/**
 * 외부에서 온 폼(세션 리하이드레이션 · **이력 재개**)을 초기값 위에 덮는다 (P4-2b-3).
 *
 * 🔑 구 스키마 **판별을 하지 않는다**. 계산기 store가 키 화이트리스트로 판별했다가
 *    「모든 신 스키마 폼이 구 스키마로 오분류돼 F5마다 자산 전부 소실」된 전례가
 *    `calc-wizard-store.ts:221-247`에 남아 있다. 덮어쓰기만 하면 오분류가 성립하지 않는다.
 *
 * 🔑 이력 record에는 `buildingStdSnapshots`처럼 **저장 층이 끼워 넣은 키**가 섞여 있다.
 *    폼 타입에 없는 키는 아래 화면들이 읽지 않으므로 그대로 흘려보낸다 — 걸러 내려다
 *    화이트리스트를 만드는 순간 위 전례를 되풀이한다.
 */
export function normalizeOneHouseJudgmentForm(
  raw: Record<string, unknown> | null | undefined,
): OneHouseJudgmentFormData {
  const base = createInitialOneHouseJudgmentForm();
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Partial<OneHouseJudgmentFormData>) };

  /**
   * 🔴 **자산도 마이그레이션한다** — 폼 최상위 병합만으로는 부족하다.
   *
   * `assets`는 배열이라 통째로 갈아끼워지므로, 저장 당시 없던 자산-수준 필드가 **그대로 빈
   * 채로** 화면에 도달한다. §155⑳ 섹션이 `asset.rentalHousingException.applyException`을
   * 읽는 순간 구 record는 예외로 화면이 죽는다(E2E OHH-3가 실제로 그렇게 깨졌다).
   *
   * 🔑 계산기의 `migrateAsset`을 **그대로** 쓴다 — 자산-수준 기본값의 정본이 그것이고,
   *    이력 재개에서 그 leaf를 빠뜨려 결함을 낸 전례가 이미 있다(2026-09-07).
   */
  return { ...merged, assets: (merged.assets ?? []).map(migrateAsset) };
}

/**
 * 명부 → 세대 보유 주택 수 (**판정 메뉴의 정본** — G-1 · D-3).
 *
 * 🔴 계산기는 사용자가 「1 / 2 / 3+」로 선언한 스칼라를 쓰지만 판정 메뉴에는 그 위젯이 없다.
 *    명부는 「다른 보유 주택」이므로 **양도 대상 1채를 더한다** — API 변환 층이 `id:"selling"`
 *    행을 앞에 붙이는 것과 같은 식이며(`transfer-tax-api-houses.ts:29`), route가 본문을 받은 뒤
 *    독립적으로 계산하는 `deriveHouseholdHousingCount(engineHouses) = engineHouses.length`와
 *    **같은 값**이어야 한다(P4-2a).
 *
 * 🔑 분양권·조합원입주권은 더하지 않는다 — §89①3호의 「주택 수」가 아니라 §89②의 별개 축이다.
 */
export function deriveJudgmentHouseCount(
  form: Pick<OneHouseJudgmentFormData, "houses" | "assets">,
): number {
  return (judgmentSaleIsHousing(form) ? 1 : 0) + (form.houses?.length ?? 0);
}

/**
 * 양도 대상이 §89①3호의 「주택」인가 (P4-3b).
 *
 * 🔴 **조합원입주권을 양도하면 주택이 아니다.** §89①4호 가목이 「다른 주택을 보유하지
 *    **아니할** 것」 = 0채를 요구하는데, 양도 대상을 주택으로 세면 명부가 비어도 1채가 되어
 *    가목이 **절대 성립하지 않는다**. route도 같은 갈래를 둔다
 *    (`deriveHouseholdHousingCount(houses, sellingIsHousing)`) — 두 값이 어긋나면
 *    §154① 단서 게이트(클라이언트)와 판정(서버)이 다른 주택 수를 본다.
 */
export function judgmentSaleIsHousing(
  form: Pick<OneHouseJudgmentFormData, "assets">,
): boolean {
  return form.assets?.[0]?.assetKind !== "right_to_move_in";
}

/**
 * 명부 → 세대 보유 **조합원입주권 수** (§89①4호 본문). 양도 대상 입주권을 **포함**한다.
 * 분양권은 세지 않는다 — 그 보유 여부는 가·나목이 따로 묻는 축이다.
 */
export function deriveJudgmentRightCount(
  form: Pick<OneHouseJudgmentFormData, "presaleRights" | "assets">,
): number {
  const listed = (form.presaleRights ?? []).filter((r) => r.type === "redevelopment_right").length;
  return listed + (judgmentSaleIsHousing(form) ? 0 : 1);
}

/**
 * 재사용 섹션에 넘길 **파생 폼 뷰**.
 *
 * 🔴 `HousesListSection`·`MergedHouseholdRightSection`·`TemporaryTwoHouseSection` 호출부는
 *    렌더 게이트로 `form.householdHousingCount`를 읽는다. 판정 메뉴는 그 값을 store에 쓰지
 *    않으므로(Q-8) **넘기기 직전에 합성**한다.
 *
 * 🔑 `useEffect`로 store에 미러링하지 않는다 — 무한 루프 위험이자 금지 규약이다
 *    (`feedback_useeffect_store_mirror_forbidden`). 파생 뷰는 읽기 전용 사본이고,
 *    사용자 입력은 원본 `form`으로만 돌아간다.
 */
export function withDerivedHouseCount(form: OneHouseJudgmentFormData): OneHouseJudgmentFormData {
  return { ...form, householdHousingCount: String(deriveJudgmentHouseCount(form)) };
}
