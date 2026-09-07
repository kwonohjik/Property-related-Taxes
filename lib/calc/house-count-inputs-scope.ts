/**
 * ④ 주택수 판정 입력(세대 보유 주택 목록·감면주택 제외·3주택+ 배제특례)의 **노출 술어**.
 *
 * ## 왜 leaf인가 — 「빈 행 + 주택수 축소」가 탈출 불가였다 (2026-09-07 대장 재대조)
 *
 * ⑤는 `isHousingLike && 세대주택수 ≥ 2`(3주택+ 배제특례는 `≥ 3`)에서만 이 위젯들을 렌더하는데,
 * ⑧은 **배열에 행이 있으면** 무조건 검증한다. 그래서
 *
 *   1. 주택 목록에 행을 추가하고 취득일을 비운 채
 *   2. 세대 보유 주택 수를 1채로 낮추면
 *
 * 위젯이 사라지고 그 행만 `form.houses`에 남아 「보유 주택 1: 취득일을 입력하세요」로
 * 1단계가 막힌다 — **그 행을 지울 화면이 없다**.
 *
 * ## ⑧을 건드리지 않는다 — 그 skip은 이미 한 번 걷어낸 것이다
 *
 * `transfer-tax-validate.ts`의 두 블록은 종전에 `surchargeSuppressed`면 검증을 건너뛰었는데,
 * ④가 값을 그대로 전송하므로 **창 밖에서 입력한 뒤 양도일을 창 안으로 옮기면 무검증 통과**가
 * 되는 비대칭이 생겨 D4-03에서 제거됐다. 여기서 다시 게이트를 넣으면 그 결함이 되살아난다.
 *
 * ⇒ 고칠 곳은 **⑤ 렌더 게이트**다. 「값이 남아 있으면 그 값을 고칠 화면도 남는다」로 넓힌다.
 *   컴패니언 NBL 「접기」가 복귀 버튼을 함께 지우던 것과 같은 처방이다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isHousingLike } from "@/lib/calc/housing-like-asset";

/** 주택수 판정 입력에 **이미 담긴 데이터**가 있는가 — 있으면 지울 화면도 있어야 한다. */
export function houseCountInputsHaveData(form: TransferFormData): boolean {
  return (
    (form.houses?.length ?? 0) > 0 ||
    (form.specialHouseExclusions?.length ?? 0) > 0 ||
    (form.presaleRights?.length ?? 0) > 0
  );
}

/**
 * `HouseCountExemptionInputs`(세대 보유 주택 목록 + 감면주택 제외 + 분양권)를 렌더하는가.
 *
 * 종전 조건(`primaryKind === "housing"` 또는 `isHousingLike && ≥2채`)을 **그대로 유지**하고
 * 「담긴 데이터가 있으면」을 OR로 더한다 — 넓히기만 하므로 기존 노출은 하나도 줄지 않는다.
 */
export function houseCountInputsVisible(
  form: TransferFormData,
  primaryKind: string | undefined,
  opts: { requireHousingPrimary?: boolean } = {},
): boolean {
  if (houseCountInputsHaveData(form)) return true;
  const count = parseInt(form.householdHousingCount || "1", 10);
  if (isHousingLike(primaryKind ?? "") && count >= 2) return true;
  return !opts.requireHousingPrimary && primaryKind === "housing";
}

/**
 * 「양도 주택 3주택+ 전용 배제 특례」 섹션을 렌더하는가.
 *
 * ⑧(`transfer-tax-validate.ts`)은 `sellingHouseExclusion`의 토글이 켜져 있으면 기간(년)을
 * 무조건 요구한다. 주택수를 2채로 낮추면 그 토글을 끌 화면이 사라져 같은 dead-end가 된다.
 */
export function sellingHouseExclusionVisible(form: TransferFormData): boolean {
  const se = form.sellingHouseExclusion;
  if (se?.isEmployeeHousing || se?.isDayCareCenter) return true;
  return parseInt(form.householdHousingCount || "1", 10) >= 3;
}
