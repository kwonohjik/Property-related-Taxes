/**
 * anchor — §97의2①1호 **나목** 요건 (D9-01)
 *
 * ## 조문 (법제처 원문, 사용자 제공 화면 실측 2026-08-31)
 *
 * **조특법 §97의2①1호** — 「민간임대주택법 또는 공공주택 특별법에 따른 **건설임대주택**
 *   가. 1999년 8월 20일부터 2001년 12월 31일까지의 기간 중에 **신축된 주택**
 *   나. **1999년 8월 19일 이전에 신축된 공동주택**으로서 **1999년 8월 20일 현재 입주된
 *       사실이 없는 주택**」
 *
 * ## 🔴 직전 배치(D1-10)가 시한창만 열어 과다포섭이 됐다
 *
 * D1-10에서 `period-check`의 술어에 「1999.8.19 이전 신축」 갈래를 추가해 **나목이 통과할 수
 * 있게** 만들었다. 그때 주석에 「나목의 미입주 요건은 evaluator가 담당한다」고 적었으나
 * **evaluator에도 그 검사가 없었다** — 결과적으로 1999.8.20 현재 **이미 입주돼 있던** 구축
 * 건설임대까지 적격이 됐다.
 *
 * 리뷰가 정확히 그 함정을 지적했다: 「시한창을 넓히는 것은 오답이다. 필요한 것은 시한 완화가
 * 아니라 **나목 선언 필드 신설**(공동주택 여부 + 1999.8.20 현재 미입주)이다.」
 *
 * ⇒ 두 사실을 자기확인으로 받아 evaluator에서 검사한다. 가목(1999.8.20~2001.12.31 신축)에는
 *   걸리지 않는다 — 별개 분기다.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental972 } from "@/lib/tax-engine/transfer-reductions/rental-97-2";
import { evaluateRental97TaxAmount } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/**
 * ⚠️ 엔진의 경계 상수는 `new Date("YYYY-MM-DD")`(**UTC 자정**)이고, Route도 같은 방식으로
 *    문자열 일자를 파싱한다. 테스트에서 로컬 자정(`T00:00:00`)을 쓰면 KST 기준 9시간 앞서
 *    경계일이 하루 밀려 **없는 결함**이 만들어진다(이번 리뷰에서 두 번째로 겪었다).
 *    같은 방식으로 만들어 비교한다.
 */
const D = (s: string) => new Date(s);

/** 1호 건설임대 · 1999.8.19 이전 신축(취득) */
const NAMOK = {
  id: "rental_97_2" as const,
  transferDate: D("2006-06-01"),
  acquisitionDate: D("1998-03-01"), // 나목 범위
  rentalStartDate: D("2000-04-01"),
  rental972Type: "construction" as const,
  isNationalHousing: true,
  hasNewRentalPlus2Units: true,
  calculatedTax: 20_000_000,
};

const codesOf = (r: ReturnType<typeof evaluateRental972>) =>
  r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

describe("나목 — 두 사실을 모두 요구한다", () => {
  it("🔴 공동주택 + 1999.8.20 미입주 → 적용", () => {
    const r = evaluateRental972({
      ...NAMOK,
      isMultiUnitHousing972: true,
      isUnoccupiedAt19990820: true,
    } as Any);
    expect(r.isEligible, "나목이 성립하면 적용되어야 한다").toBe(true);
  });

  it("🔴 공동주택이 아니면 배제", () => {
    const r = evaluateRental972({
      ...NAMOK,
      isMultiUnitHousing972: false,
      isUnoccupiedAt19990820: true,
    } as Any);
    expect(r.isEligible).toBe(false);
    expect(codesOf(r)).toContain("CLAUSE_1_NA_NOT_MULTI_UNIT");
  });

  it("🔴 1999.8.20 현재 입주 사실이 있으면 배제 — 과다포섭 방지", () => {
    const r = evaluateRental972({
      ...NAMOK,
      isMultiUnitHousing972: true,
      isUnoccupiedAt19990820: false,
    } as Any);
    expect(
      r.isEligible,
      "시한창만 열고 이 검사를 빼면 구축 입주분까지 적격이 된다",
    ).toBe(false);
    expect(codesOf(r)).toContain("CLAUSE_1_NA_OCCUPIED");
  });

  it("🔴 미입력이면 두 사유가 다 뜬다 — 절반만 검증하지 않는다", () => {
    const codes = codesOf(evaluateRental972({ ...NAMOK } as Any));
    expect(codes).toContain("CLAUSE_1_NA_NOT_MULTI_UNIT");
    expect(codes).toContain("CLAUSE_1_NA_OCCUPIED");
  });
});

describe("가목에는 걸리지 않는다 — 별개 분기", () => {
  it("1999.8.20~2001.12.31 신축은 나목 필드 없이 적용된다", () => {
    const r = evaluateRental972({
      ...NAMOK,
      acquisitionDate: D("2000-06-01"), // 가목 범위
    } as Any);
    const codes = codesOf(r);
    expect(codes).not.toContain("CLAUSE_1_NA_NOT_MULTI_UNIT");
    expect(codes).not.toContain("CLAUSE_1_NA_OCCUPIED");
    expect(r.isEligible).toBe(true);
  });

  it("경계 — 1999.8.20 취득은 가목이다", () => {
    const codes = codesOf(
      evaluateRental972({ ...NAMOK, acquisitionDate: D("1999-08-20") } as Any),
    );
    expect(codes).not.toContain("CLAUSE_1_NA_OCCUPIED");
  });

  it("경계 — 1999.8.19 취득은 나목이다", () => {
    const codes = codesOf(
      evaluateRental972({ ...NAMOK, acquisitionDate: D("1999-08-19") } as Any),
    );
    expect(codes).toContain("CLAUSE_1_NA_OCCUPIED");
  });

  it("🔴 2호(매입임대)에는 걸리지 않는다 — 유형 가드 격리", () => {
    /**
     * ⚠️ 실측: 이 케이스를 취득일 2000-03-01로 쓰면 **날짜 가드**에서 이미 걸려
     *    유형 가드를 제거하는 뮤테이션이 통과했다(구별력 0).
     *    유형만 다르고 **날짜는 나목 범위**인 입력으로 격리한다.
     */
    const codes = codesOf(
      evaluateRental972({
        ...NAMOK,
        rental972Type: "purchase",
        acquisitionDate: D("1998-03-01"), // 나목 날짜 범위 — 유형만 다르다
        isUnoccupiedAtAcquisition: true,
      } as Any),
    );
    expect(codes, "나목은 1호(건설임대) 전용이다").not.toContain("CLAUSE_1_NA_NOT_MULTI_UNIT");
    expect(codes).not.toContain("CLAUSE_1_NA_OCCUPIED");
  });
});

describe("⑬ router — 나목 필드가 evaluator까지 도달한다", () => {
  const CTX = { transferDate: D("2006-06-01"), acquisitionDate: D("1998-03-01"), calculatedTax: 20_000_000 };
  const R = {
    type: "rental_97_2",
    rentalStartDate: D("2000-04-01"),
    rental972Type: "construction",
    isNationalHousing: true,
    hasNewRentalPlus2Units: true,
  };

  it("🔴 두 필드가 있으면 적용된다 — router를 통과했다는 뜻", () => {
    const r = evaluateRental97TaxAmount(
      [{ ...R, isMultiUnitHousing972: true, isUnoccupiedAt19990820: true }] as Any,
      CTX as Any,
    );
    expect(r?.isEligible, "⑬ router 명시매핑이 필드를 stripping했다").toBe(true);
  });

  it("없으면 적용되지 않는다 (구별력)", () => {
    const r = evaluateRental97TaxAmount([{ ...R }] as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
  });
});
