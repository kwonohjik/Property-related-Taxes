/**
 * anchor — §97의5는 §97의3·§97의4와 **중복 적용하지 않는다** (D2-05)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의5②** — 「제1항에 따른 세액감면은 **제97조의3**에 따른 장기일반민간임대주택등에
 * 대한 양도소득세의 과세특례 및 **제97조의4**에 따른 장기임대주택에 대한 양도소득세의 과세특례와
 * **중복하여 적용하지 아니한다**.」
 *
 * (참고 — 같은 축의 다른 배제: **조특법 §97의3②** 「제1항에 따른 과세특례는 제97조의4에 따른
 *  … 과세특례와 중복하여 적용하지 아니한다」. §97의3과 §97의4는 둘 다 LTHD 트랙이라
 *  router가 배열 첫 항목만 평가해 공존이 성립하지 않으므로 여기서는 범위 밖으로 둔다.)
 *
 * ## 결함
 * `evaluateRental97Lthd`(STEP 4)와 `evaluateRental97TaxAmount`(STEP 8)가 각자 자기 ID 집합의
 * 첫 항목만 보고 **상대 트랙을 참조하지 않았다**. 한 자산에 §97의3과 §97의5가 함께 실리면
 * 장특 70% 대체와 산출세액 100% 감면이 **동시에** 적용됐다.
 *
 * ⚠️ 이것은 §127⑦의 「후보 중 택일(max)」이 아니라 **조문이 정한 우선순위**다 —
 *    §97의5가 있으면 §97의3·§97의4를 끈다.
 *
 * ⚠️ 도달 경로는 `/api/calc/transfer` 직접 POST다. 앱 UI는 `toggleGroupRadio`가 같은
 *    category를 하나만 남겨 공존 배열을 만들 수 없다 — 그래서 UI만 믿으면 안 되고
 *    엔진 가드가 정본이다. ⑧validate에도 같은 상호배타를 둬 모순을 막는다.
 *
 * 관련 anchor는 리뷰 시점 **0건**이었다(안전망 없음).
 */
import { describe, it, expect } from "vitest";
import {
  evaluateRental97Lthd,
  evaluateRental97TaxAmount,
} from "@/lib/tax-engine/transfer-reductions/rental-97-router";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

const CTX = {
  transferDate: D("2029-01-01"),
  acquisitionDate: D("2018-06-01"),
  stdPriceAtAcquisition: 500_000_000,
  stdPriceAtTransfer: 900_000_000,
  calculatedTax: 100_000_000,
};

const R973 = {
  type: "rental_97_3",
  registrationDate: D("2018-08-01"),
  rentalStartDate: D("2018-09-01"),
  isTaxRegistered: true,
  officialPriceAtStart: 600_000_000,
  stdPriceAtRentalStart: 600_000_000,
  isNationalHousingScale: true,
  region: "capital",
  propertyType: "apartment",
  rentalHousingType: "long_term_private",
  rentalContinuesToTransfer: true,
};

const R975 = {
  type: "rental_97_5",
  registrationDate: D("2018-08-01"),
  rentalStartDate: D("2018-09-01"),
  isTaxRegistered: true,
  officialPriceAtStart: 600_000_000,
  stdPriceAtRentalStart: 600_000_000,
  region: "capital",
  rentalContinuesToTransfer: true,
};

describe("기준선 — 단독이면 각자 적용된다", () => {
  it("§97의3 단독: LTHD 70% 대체", () => {
    const r = evaluateRental97Lthd([R973] as Any, CTX as Any);
    expect(r?.isEligible).toBe(true);
  });

  it("§97의5 단독: 세액감면 적용", () => {
    const r = evaluateRental97TaxAmount([R975] as Any, CTX as Any);
    expect(r?.isEligible).toBe(true);
  });
});

describe("🔴 §97의5가 함께 있으면 §97의3·§97의4를 끈다 (조특법 §97의5②)", () => {
  it("§97의3 + §97의5 → LTHD 트랙이 배제된다", () => {
    const r = evaluateRental97Lthd([R973, R975] as Any, CTX as Any);
    expect(r?.isEligible, "70% 대체와 100% 감면이 동시 적용되면 안 된다").toBe(false);
    const codes = r && !r.isEligible ? (r.ineligibleReasons ?? []).map((x) => x.code) : [];
    expect(codes).toContain("OVERLAP_EXCLUDED_BY_97_5");
  });

  it("배열 순서를 바꿔도 같다 — 「첫 항목 우선」이 아니라 조문상 우선순위", () => {
    const r = evaluateRental97Lthd([R975, R973] as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
  });

  it("§97의4 + §97의5 → 같은 배제가 걸린다", () => {
    const r974 = { ...R973, type: "rental_97_4" };
    const r = evaluateRental97Lthd([r974, R975] as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
  });

  it("살아남는 쪽은 §97의5다 — 세액감면 트랙은 그대로 적용된다", () => {
    const r = evaluateRental97TaxAmount([R973, R975] as Any, CTX as Any);
    expect(r?.id).toBe("rental_97_5");
    expect(r?.isEligible).toBe(true);
  });

  it("불적용 사유의 근거는 조특법 §97의5②다", () => {
    const r = evaluateRental97Lthd([R973, R975] as Any, CTX as Any);
    const reason =
      r && !r.isEligible
        ? (r.ineligibleReasons ?? []).find((x) => x.code === "OVERLAP_EXCLUDED_BY_97_5")
        : undefined;
    expect(reason?.legalBasis).toBe("조특법 §97의5②");
  });
});

describe("본 필드 미입력(stub) §97의5는 배제를 발동시키지 않는다", () => {
  it("stub 항목은 「선택됐다」로 보지 않는다", () => {
    const stub = { type: "rental_97_5" };
    const r = evaluateRental97Lthd([R973, stub] as Any, CTX as Any);
    expect(r?.isEligible, "stub만으로 정상 §97의3이 꺼지면 안 된다").toBe(true);
  });
});
