/**
 * anchor — §164⑦ 산식 **괄호 단서**(§164⑧ 준용) 미구현 구간 차단 (A11)
 *
 * 코드리뷰 2026-09 A11 · 실측 10,288,162원 과소.
 *
 * 조문은 **본문 텍스트에 없고 산식 이미지 안에 있다**(법제처 `lsInfoR.do`의
 * `<img alt="@@LATEX@@…">` 디코드로 확인 — 조문 API·NTS 아카이브로는 재현되지 않는다):
 *   「… / …최초로 공시한 주택가격공시당시의 …합계액**(취득당시의 가액과 최초로 공시한
 *    주택가격 공시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)**」
 *
 * 두 합계가 같으면 비율이 1이 되어 `P_A_est = P_F`가 되고 환산이 무의미해진다.
 * 트리거는 우연이 아니다 — 「소득세법 시행령」 §164③이 「새로운 기준시가가 고시되기 전에
 * 취득…하는 경우에는 **직전의 기준시가**에 의한다」이므로, 취득일이 최초공시일 직전 고시주기
 * 안이면 두 시점이 같은 고시분으로 귀착해 **필연적으로 일치**한다.
 *
 * ## ⚠️ 「같으면 항상 틀린다」가 아니다 — 이 anchor의 핵심 경계
 *
 * 「소득세법 시행규칙」 §80①은 2호로 가른다:
 *   1호 = 취득연도의 **다음 연도 말일 이전** 양도(준용에서는 「최초공시」) → 가목 대체분모 필요
 *   2호 = 그 외 → 「당해 양도자산의 **취득당시의 기준시가**」 = Sum_A
 * ⇒ 2호 구간에서는 대체분모 = Sum_A = Sum_F라 **비율 1이 곧 법령이 요구하는 값**이다.
 *   무조건 차단하면 정상 계산을 막는 새 오류가 된다.
 *
 * 형제 §164⑥은 이 규칙을 이미 구현·차단했다(`commercial-164-6-proviso.ts`).
 * §164⑦만 그 밖에 있었다 — `164⑦` × `제8항` 교집합 grep 0건으로 **미인지**였다.
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 — `pre-housing-disclosure.test.ts`
 *    전건에 `Sum_A === Sum_F` 케이스·「제8항」·「164⑧」 문자열이 모두 0건이었고,
 *    등가합 케이스만 파괴하는 뮤테이션이 1,459파일 16,428건에서 **반응 0건**이었다.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

const PROVISO = /§164⑧을 준용/;

/**
 * PHD(§164⑦) 3-시점 환산 자산. 토지 200㎡.
 * 기본값은 **Sum_A ≠ Sum_F**(취득 토지단가만 낮춤) — 단서 미해당.
 */
function phdForm(over: Record<string, unknown> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2023-06-30";
  form.contractTotalPrice = "1,500,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-02-01",
    useEstimatedAcquisition: true,
    usePreHousingDisclosure: true,
    acquisitionArea: "200",
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "300,000,000",
    phdLandPricePerSqmAtAcq: "900,000",
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdLandPricePerSqmAtFirst: "1,000,000",
    phdBuildingStdPriceAtFirst: "100,000,000",
    phdTransferHousingPrice: "900,000,000",
    phdLandPricePerSqmAtTransfer: "3,000,000",
    phdBuildingStdPriceAtTransfer: "200,000,000",
    ...over,
  };
  return form;
}

/** Sum_A == Sum_F (토지단가·건물 모두 동일) */
const equalSums = (o: Record<string, unknown> = {}) =>
  phdForm({ phdLandPricePerSqmAtAcq: "1,000,000", ...o });

describe("[A11] §164⑦ 괄호 단서 — §80①1호 구간만 차단한다", () => {
  it("A11-1(회귀): 두 합계가 다르면 차단하지 않는다", () => {
    expect(validateStep(0, phdForm()) ?? "").not.toMatch(PROVISO);
  });

  it("A11-2: 합계가 같고 최초공시가 취득연도 내(§80①1호) → 차단", () => {
    // 취득 2005-02-01 · 최초공시 2005-04-30 → 같은 연도 = 1호
    expect(validateStep(0, equalSums())).toMatch(PROVISO);
  });

  it("A11-3: 합계가 같고 최초공시가 취득 다음 연도 말일 이내(§80①1호) → 차단", () => {
    expect(
      validateStep(0, equalSums({ acquisitionDate: "2004-11-01" })),
    ).toMatch(PROVISO);
  });

  it("A11-4(경계): 합계가 같아도 §80①**2호** 구간이면 차단하지 않는다 — 비율 1이 곧 정답", () => {
    // 취득 2003-02-01 · 최초공시 2005-04-30 → 취득연도+1(2004) 말일 후 = 2호
    expect(
      validateStep(0, equalSums({ acquisitionDate: "2003-02-01" })) ?? "",
    ).not.toMatch(PROVISO);
  });

  it("A11-5: 차단 메시지가 해소 경로를 제시한다 (dead-end 방지)", () => {
    expect(validateStep(0, equalSums())).toMatch(/3-시점 환산.*끄고.*직접 입력/);
  });
});
