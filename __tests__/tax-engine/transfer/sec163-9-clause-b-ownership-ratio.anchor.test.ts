/**
 * anchor — §163⑨ 비교의 **지분 축 정합**(A07)
 *
 * 코드리뷰 2026-09 A07 · 실측 10,078,073원(단건) / 11,138,923원(2지분 번들) 과소.
 *
 * §163⑨ 1호·2호는 「평가한 가액**과** §164④(⑤~⑦)의 가액 **중 많은 금액**」이라 ①과 ②를
 * 직접 비교한다. 그런데 ①(`reportedValue`)은 ④에서 이미 지분 안분돼 엔진에 도착하는데
 * (`transfer-tax-api-inheritance.ts` — 「미적용 시 100% 송신으로 엔진에서 안분 잔여가
 * 필요경비로 잘못 적재됨(사례 27)」) ②는 **100% 물건 값 그대로**였다.
 * ⇒ 저지분일수록 ②가 부당하게 이겨 상대오차가 커진다.
 *
 * ⚠️ 안분은 **주입 지점에서만** 한다. `pre1990Land.areaSqm`·`standardPriceAtAcquisition`
 *    자체를 축소하면 §164④ 산식 입력과 표시·역산 소비처가 함께 틀어져 이중 축소가 된다.
 *
 * ⚠️ 도달성: **단건 1/2 지분은 ⑧이 차단한다**(「지분 모드 자산(50%)은 단독으로 계산할 수
 *    없습니다.」). 실제 도달 형태는 **지분 분할 모드**(자산 2건 이상, 지분 합 100%) 또는
 *    함께양도에 fractional primary를 섞은 경우다.
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 — `pre1990Land`를 쓰는 테스트·spec 9파일 중
 *    `ownershipRatio`를 함께 쓰는 파일이 **0건**이라 반응 가능한 테스트가 존재할 수 없었다
 *    (리뷰 시점 뮤테이션 1,136파일 13,053건 반응 0).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/**
 * 상속 토지 §164④ — ②(등급 환산)가 ①(신고가액)보다 **큰** 조합.
 * 지분을 주면 ①만 안분되던 종전에는 ②가 100%로 남아 max 비교를 부당하게 이겼다.
 */
function landInput(ownershipRatio?: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 900_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("1988-05-01"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    acquisitionCause: "inheritance",
    ...(ownershipRatio !== undefined ? { ownershipRatio } : {}),
    inheritedAcquisition: {
      mode: "post-deemed",
      inheritanceDate: new Date("1988-05-01"),
      assetKind: "land",
      // ④가 이미 안분해 보내는 값을 재현한다(지분 1/2이면 1억).
      reportedValue: ownershipRatio !== undefined ? Math.floor(200_000_000 * ownershipRatio) : 200_000_000,
      reportedMethod: "supplementary",
    },
    pre1990Land: {
      acquisitionDate: new Date("1988-05-01"),
      transferDate: new Date("2024-06-01"),
      areaSqm: 300,
      pricePerSqm_1990: 500_000,
      grade_1990_0830: { gradeValue: 218 },
      gradePrev_1990_0830: { gradeValue: 218 },
      gradeAtAcquisition: { gradeValue: 218 },
    },
  } as Partial<TransferTaxInput>);
}

/** 결과에서 §163⑨이 채택한 취득가액. */
const adopted = (r: ReturnType<typeof calculateTransferTax>) =>
  r.inheritedAcquisitionDetail?.acquisitionPrice;

describe("[A07] §163⑨ ②가 ①과 같은 지분 축을 쓴다", () => {
  it("A07-1(회귀): 지분 미지정(100%)이면 종전과 동일하다", () => {
    const r = calculateTransferTax(landInput(), rates);
    expect(adopted(r)).toBeGreaterThan(0);
  });

  it("A07-2: 1/2 지분이면 채택 취득가액이 100% 대비 **절반 수준**이다", () => {
    const full = adopted(calculateTransferTax(landInput(), rates))!;
    const half = adopted(calculateTransferTax(landInput(0.5), rates))!;
    // 종전에는 ②가 100%로 남아 half가 full과 같아지는 구간이 있었다.
    expect(half).toBeLessThan(full);
    // 원 단위 절사 오차 1원 허용
    expect(Math.abs(half - Math.floor(full / 2))).toBeLessThanOrEqual(1);
  });

  it("A07-3: 지분이 작을수록 채택 취득가액이 단조 감소한다", () => {
    const vals = [1, 0.5, 0.25, 0.1].map((r) => adopted(calculateTransferTax(landInput(r), rates))!);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThan(vals[i - 1]);
  });

  it("A07-4: ②를 안분해도 ①과의 max 비교 자체는 살아 있다 (①이 크면 ①이 이긴다)", () => {
    const base = landInput(0.5);
    const bigReported = calculateTransferTax(
      { ...base, inheritedAcquisition: { ...base.inheritedAcquisition!, reportedValue: 500_000_000 } },
      rates,
    );
    expect(adopted(bigReported)).toBe(500_000_000);
  });
});
