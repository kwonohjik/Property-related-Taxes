/**
 * 증여세 납세의무 게이트 — 「상속세 및 증여세법」§4의2
 *
 * 설계·근거: `docs/00-pm/gift-deemed-taxpayer-gate-4-2.plan.md`
 *
 * 이 모듈이 다루는 것은 **④(영리법인의 주주등)** 와 **⑥ 단서(증여자 연대납부의무 면제)** 둘이다.
 * ①·③(수증자 자신이 영리법인·소득세/법인세 피부과)은 각 엔진의 `doneeIsForProfitCorp`로
 * 이미 구현돼 있고, **수범자가 다르다**:
 *
 *   ①(+§2 9호)·③ … 증여세를 면하는 자 = **수증자 자신**
 *   ④            … 증여세를 면하는 자 = 그 **영리법인의 주주등** (수증자와 별개일 수 있다)
 *
 * 한 축으로 뭉뚱그리면 틀린다.
 */

import type { CapitalIncreaseInput } from "./gift-deemed-input-types";
import type { DeemedGiftType } from "./types";

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
 *
 * ⑤ UI도 이 함수를 쓴다 — 폼이 「주주 여부를 물어야 하는 목인지」를 따로 판단하면
 * 엔진과 두 개의 진실이 생기고, 목이 하나 바뀔 때 한쪽만 고쳐진다.
 * `undefined`(사안 의존)일 때만 주주 여부를 묻는다.
 */
export function statuteFixesShareholderStatus(
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

/**
 * 「상증법」§4의2④ 배제가 성립하는가 — **cap-table 경로**.
 *
 * 🔑 **목(目) 표를 쓰지 않는다.** 단건 경로가 `statuteFixesShareholderStatus`로 주주 여부를
 *    판정하는 것은 **명부가 없어서**다. §39①1호 가목(실권주 배정)이 그 표에서 「사안 의존」인
 *    이유도, 배정받은 자가 기존 주주인지 제3자인지 단건 입력만으로는 알 수 없기 때문이다.
 *    cap-table에는 그 사실이 **입력에 이미 있다** — `preShares`(증자 전 보유 주식수)다.
 *
 *    ⇒ 행별 토글을 새로 만들지 않는다. 만들면 명부와 토글이라는 **두 개의 진실**이 생기고,
 *      사용자가 「증자 전 보유 0」인 행에 「주주다」라고 답하는 모순을 막을 방법이 없다.
 *
 * ⚠️ `preShares === 0`은 「증자 전 주주등이 아니다」다 — §39①1호 다목이 이익을 얻는 자를
 *    「주주등이 **아닌** 자」로 부르는 그 자리다. 신주를 인수해 증자 **후** 주주가 되는 것은
 *    ④의 「해당 법인의 주주등」과 다른 시점이므로 배제하지 않는다(단건 다목과 같은 결론).
 *
 * ⚠️ `preShares` 미입력(0)도 배제하지 않는다 — 요건 미입증이고, 배제 쪽이 과소과세 방향이다.
 *
 * ⚠️ §45의3~§45의5 단서는 이 함수가 알지 못한다 — 그 유형의 엔진이 부르지 않음으로써 지켜진다.
 */
export function capTableShareholderOfTaxedCorpExcluded(
  issuerGainCorporateTaxed: boolean | undefined,
  preShares: number,
): boolean {
  if (issuerGainCorporateTaxed !== true) return false;
  return preShares > 0;
}

/**
 * 「상증법」§4의2⑥ 단서 — 증여자 **연대납부의무 면제** 대상 유형인가.
 *
 * ⑥ 본문은 증여자에게 연대납부의무를 지우고, 그 뒤에 단서가 붙는다(2025.10.01. 시행본 verbatim):
 *
 *   「다만, 제4조제1항제2호 및 제3호, 제35조부터 제39조까지, 제39조의2, 제39조의3,
 *    제40조, 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제45조,
 *    제45조의3부터 제45조의5까지 및 제48조(출연자가 해당 공익법인의 운영에 책임이 없는
 *    경우로서 대통령령으로 정하는 경우만 해당한다)에 해당하는 경우는 제외한다.」
 *
 * 단서는 각 호 **외의 부분 본문 뒤**에 놓여 제1호~제3호 전부에 걸린다. 조건부 괄호가
 * 붙은 것은 **제48조뿐**이므로, 아래 유형들은 요건을 더 볼 것 없이 면제다.
 *
 * 🔑 **입력 축이 없다.** ④와 달리 ⑥ 단서는 「어느 조문에 해당하는가」만 묻는다 —
 *    사용자에게 물을 사실이 없으므로 토글도 ⑧ 검증도 생기지 않는다.
 *
 * 🔴 **④의 「제45조의3부터 제45조의5까지」와 혼동하지 말 것.** 같은 조문 묶음이 두 항에
 *    정반대로 등장한다:
 *      · ④ — 그 세 유형은 배제의 **예외**(= 주주등에게 증여세를 **부과**한다)
 *      · ⑥ — 그 세 유형은 단서 열거 **안**(= 증여자 연대납부의무가 **없다**)
 *    항이 다르면 결론도 다르다. `related_corp`·`specific_corp`가 아래에서 `true`인 이유다.
 *
 * ⚠️ 새 유형을 `DeemedGiftType`에 추가하면 tsc가 이 표의 키를 요구한다 —
 *    「등록을 잊어 조용히 면제되지 않는」 경로를 만들지 않기 위한 의도적 설계다.
 *    추가할 때는 **단서 열거 원문을 다시 읽고** 판단할 것. 열거 밖인데 `true`를 세우면
 *    화면이 「연대납부의무 없음」이라고 **거짓 고지**한다.
 */
const JOINT_LIABILITY_EXEMPT_BY_TYPE: Record<DeemedGiftType, boolean> = {
  // ── 단서 열거 **밖** — 증여자에게 연대납부의무가 성립한다 ──
  trust_benefit: false, // §33 신탁이익
  insurance: false, // §34 보험금
  nominee_trust: false, // §45의2 명의신탁 (열거는 §45와 §45의3~§45의5뿐)

  // ── 「제35조부터 제39조까지」 ──
  bargain_transfer: true, // §35
  debt_forgiveness: true, // §36
  free_realestate: true, // §37
  merger: true, // §38
  capital_increase: true, // §39
  capital_increase_allocation: true, // §39 — cap-table(라우터를 거치지 않는 별도 진입점)
  convertible_stock: true, // §39①3호

  // ── 개별 열거 ──
  capital_decrease: true, // §39의2
  contribution: true, // §39의3
  convertible_bond: true, // §40

  // ── 「제41조의2부터 제41조의5까지」 ──
  excess_dividend: true, // §41의2
  listing_gain: true, // §41의3 (§41의5 합병상장이익 포함 — 같은 구간)
  free_loan: true, // §41의4
  free_loan_aggregated: true, // §41의4 (§43② 합산 축)

  // ── §42·§42의2·§42의3 ──
  property_service_use: true, // §42
  org_change: true, // §42의2
  value_increase: true, // §42의3

  // ── §45 및 「제45조의3부터 제45조의5까지」 ──
  acquisition_fund_presumption: true, // §45
  related_corp: true, // §45의3 — ④에서는 제외의 예외, ⑥에서는 열거 안
  specific_corp: true, // §45의5 — 같음
};

export function jointLiabilityExemptForDeemedType(type: DeemedGiftType): boolean {
  return JOINT_LIABILITY_EXEMPT_BY_TYPE[type];
}
