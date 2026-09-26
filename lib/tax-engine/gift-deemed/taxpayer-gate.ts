/**
 * 증여세 납세의무 게이트 — 「상속세 및 증여세법」§4의2
 *
 * 설계·근거: `docs/00-pm/gift-deemed-taxpayer-gate-4-2.plan.md`
 *
 * 이 모듈이 다루는 것은 **④(영리법인의 주주등)** 하나다.
 * ①·③(수증자 자신이 영리법인·소득세/법인세 피부과)은 각 엔진의 `doneeIsForProfitCorp`로
 * 이미 구현돼 있고, **수범자가 다르다**:
 *
 *   ①(+§2 9호)·③ … 증여세를 면하는 자 = **수증자 자신**
 *   ④            … 증여세를 면하는 자 = 그 **영리법인의 주주등** (수증자와 별개일 수 있다)
 *
 * 한 축으로 뭉뚱그리면 틀린다.
 */

import type { CapitalIncreaseInput } from "./gift-deemed-input-types";

/**
 * 「상증법」§39① 각 목이 **수증자의 주주 여부를 조문으로 확정하는지**.
 *
 * §4의2④는 「**해당 법인의 주주등**에 대해서는 … 증여세를 부과하지 아니한다」이므로
 * 수증자가 그 법인의 주주등이 아니면 배제가 성립하지 않는다. 각 목의 「이익을 얻은 자」:
 *
 * | 호·목 | 이익을 얻는 자 (법문) | 주주 여부 |
 * |---|---|---|
 * | 1호 가 | 「그 실권주를 **배정받은 자**」 | 사안 의존 |
 * | 1호 나 | 「그 신주 인수를 포기한 자의 **특수관계인**」 | 사안 의존 |
 * | 1호 다 | 「해당 법인의 **주주등이 아닌 자**」 | **항상 비주주** |
 * | 1호 라 | 「해당 법인의 **주주등**이 … 초과하여 직접 배정받음으로써」 | **항상 주주** |
 * | 2호 가·나 | 「그의 특수관계인에 해당하는 **신주 인수 포기자**」 | **항상 주주**(신주인수권 보유) |
 * | 2호 다·라 | 「그의 특수관계인인 **주주등**이 얻은 이익」 | **항상 주주** |
 *
 * ⚠️ 조문이 확정하는 목에서는 **입력을 무시한다** — 사용자 입력이 법문을 이기지 못하게.
 */
function statuteFixesShareholderStatus(
  direction: "low" | "high",
  subType: NonNullable<CapitalIncreaseInput["subType"]>,
): boolean | undefined {
  if (direction === "high") return true; // 2호 가~라 전부 주주
  switch (subType) {
    case "third_party": // 1호 다목 — 「주주등이 아닌 자」
      return false;
    case "excess": // 1호 라목 — 「주주등」
      return true;
    case "forfeited_realloc": // 1호 가목 — 「실권주를 배정받은 자」
    case "no_realloc": // 1호 나목 — 「포기자의 특수관계인」
      return undefined; // 사안 의존 → 입력으로 받는다
  }
}

/**
 * 「상증법」§4의2④ 배제가 성립하는가.
 *
 * 요건 둘이 **모두** 충족돼야 한다:
 *   ㉠ 영리법인이 증여받은 재산·이익에 법인세가 부과(비과세·감면 포함) — `issuerGainCorporateTaxed`
 *   ㉡ 수증자가 **그 법인의 주주등** — 목이 확정하거나, 확정하지 않으면 `doneeIsShareholderOfIssuer`
 *
 * ⚠️ ㉡의 미입력은 **배제하지 않는다**(요건 미입증). 미입력을 「주주다」로 읽으면 과소과세
 *    방향이고, 이 저장소는 §39② 소액주주 `faceValueSum`에서 같은 판단을 이미 했다.
 *
 * ⚠️ 이 함수는 §45의3~§45의5를 **알지 못한다** — ④ 단서(「제45조의3부터 제45조의5까지의
 *    규정에 따른 경우를 제외하고는」)는 그 유형의 엔진이 이 게이트를 **부르지 않음**으로써
 *    지켜진다. 그 세 유형에서 이 함수를 부르면 법문에 반한다.
 */
export function shareholderOfTaxedCorpExcluded(input: CapitalIncreaseInput): boolean {
  if (input.issuerGainCorporateTaxed !== true) return false;
  const fixed = statuteFixesShareholderStatus(
    input.direction ?? "low",
    input.subType ?? "forfeited_realloc",
  );
  return fixed ?? input.doneeIsShareholderOfIssuer === true;
}
