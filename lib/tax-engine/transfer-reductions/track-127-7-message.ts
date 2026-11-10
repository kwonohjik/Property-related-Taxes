/**
 * 조특법 §127⑦ 트랙 교차 차단 문구 — ⑧ validate(`transfer-tax-validate-reductions.ts`)와 ⑫ Zod(`transfer-tax-schema-reduction-refines.ts`)가
 * 같은 문구를 쓰도록 한 곳에 둔다(NH-41 · 계획서 `track-127-7-cross-nh41.plan.md`). 판정은 `findTrack127_7Conflict`가 한다.
 */
import { REDUCTION_METADATA } from "./metadata";
import { track127_7EffectLabel, type Track127_7Conflict } from "./income-deduction-router";

/**
 * 이 자산에서 «장기임대주택 거주주택 비과세 특례(소령 §155⑳)» 선언이 엔진에 실리는가 — ⑤·⑧·⑫ 공용 술어 (V-7, 계획서 `rental-97-v7-residence-path.plan.md`).
 *
 * - 첫 자산(`assetIndex === 0`)만: ④는 `rentalHousingException`을 top-level 단일 객체로 첫 자산에서만 싣는다(`canDeclareRentalHousingException`).
 * - `housing`만: 이 경로가 §97의3·§97의4를 세액에 반영하지 않는 것은 주택 종류다. `redevelopment_apt`(완공 아파트)는 선언해도 §97의3이 반영된다(계획서 §3.5).
 * - `declared`: ④가 실제로 payload를 싣는가 — ⑧은 `toRentalHousingExceptionApi(asset) !== undefined`, ⑫는 요청 본문의 `rentalHousingException.applyException === true`.
 *
 * ⚠️ 선언은 «성립»이 아니다. 성립 여부는 엔진만 안다(세대 구성 판정이 DB 세율을 쓰고 Zod 검증이 그보다 먼저다). 그래서 이 술어는 **차단 기준이 아니라
 *    문구 안내**에만 쓴다 — 선언만으로 §127⑦ 차단을 풀면 불성립 입력이 일반 경로에서 §97의3과 다른 감면을 이중 적용한다(계획서 §3.4, 263,950,998).
 */
export function rentalHousingPathApplies(a: { assetIndex: number; assetKind?: string; declared: boolean }): boolean {
  return a.assetIndex === 0 && a.assetKind === "housing" && a.declared;
}

const RENTAL_HOUSING_PATH_NOTICE =
  "참고: 장기임대주택 거주주택 비과세 특례(소득세법 시행령 §155⑳)를 선언한 계산입니다. 이 특례가 성립하면 이 경로는 §97의3·§97의4를 세액에 반영하지 않으므로 " +
  "(성립하지 않으면 일반 경로에서 반영됩니다) §97의3·§97의4를 해제하고 다른 감면만 선택하면 그 감면이 계산됩니다.";

/** 충돌 쌍에 §97의3·§97의4가 있고 거주주택 특례 선언이 실리는 계산이면 안내 문구, 아니면 null. ⑤ 배너·⑧·⑫가 같은 문구를 쓴다. */
export function rentalHousingPathNotice(conflict: Track127_7Conflict, rentalHousingPath: boolean | undefined): string | null {
  if (!rentalHousingPath) return null;
  const involvesRentalLthd = [conflict.first.type, conflict.second.type].some((t) => t === "rental_97_3" || t === "rental_97_4");
  return involvesRentalLthd ? RENTAL_HOUSING_PATH_NOTICE : null;
}

export function track127_7ConflictMessage(conflict: Track127_7Conflict, opts?: { rentalHousingPath?: boolean }): string {
  const label = (t: string) => REDUCTION_METADATA[t as keyof typeof REDUCTION_METADATA]?.uiLabel ?? t;
  const { first, second } = conflict;
  const notice = rentalHousingPathNotice(conflict, opts?.rentalHousingPath);
  return (
    `조특법 §127⑦ 중복배제: 「${label(first.type)}」(${track127_7EffectLabel(first.type, first.kind)})과(와) ` +
    `「${label(second.type)}」(${track127_7EffectLabel(second.type, second.kind)})은(는) 동시에 적용받을 수 없습니다. ` +
    "둘 중 하나만 선택하세요 — 어느 쪽이 유리한지는 각각 선택해 계산한 뒤 총 납부세액을 비교하면 됩니다." +
    (notice ? ` ${notice}` : "")
  );
}
