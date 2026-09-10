/**
 * G1(문구·조문표기 정정) 중 «값이 실제로 바뀌는» 항목의 회귀 고정.
 *
 * 대장: docs/reviews/inheritance-gift-ui-review-2026-09.md
 *   - IG-100 ExemptionSummaryCard 만원 절사 제거
 *   - IG-118 countNonDefaultOptions §22② 누락
 *   - IG-141 ⑲ 소계 산식 라벨 ↔ 값 불일치
 *   - IG-159 filingCreditRate 퍼센트 부동소수
 *   - IG-146 nonPayerNaturalGiftCredit echo
 *
 * 순수 함수·상수만 보므로 node 환경이다(.test.ts). 컴포넌트 렌더는 하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { countNonDefaultOptions } from "@/components/calc/inheritance/estate-card/chip-config";
import { BESSHI_P2_SECTION4 } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants";
import { ratePercent } from "@/lib/tax-engine/tax-utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

const baseItem = { id: "i1", name: "주식", category: "listed_stock" } as EstateItem;

describe("IG-118 · ⚙️ 옵션 카운트가 최대주주 §22②를 센다", () => {
  it("W-1 §22② true면 카운트에 포함된다 (칩 isActiveData 술어와 동일)", () => {
    const off = countNonDefaultOptions(baseItem, "inheritance");
    const on = countNonDefaultOptions(
      { ...baseItem, isSection22MajorShareholder: true },
      "inheritance",
    );
    expect(on).toBe(off + 1);
  });

  it("W-2 false·undefined는 세지 않는다 — 3-state 중 true만 «비기본»이다", () => {
    const off = countNonDefaultOptions(baseItem, "inheritance");
    expect(countNonDefaultOptions({ ...baseItem, isSection22MajorShareholder: false }, "inheritance")).toBe(off);
    expect(countNonDefaultOptions({ ...baseItem, isSection22MajorShareholder: undefined }, "inheritance")).toBe(off);
  });
});

describe("IG-141 · ⑲ 소계 산식 라벨이 실제 가산 항목과 일치한다", () => {
  it("W-3 비보험사는 번호 10개만 나열한다", () => {
    expect(BESSHI_P2_SECTION4.liabilitySubtotalFormula({})).toBe(
      "소계 (⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)",
    );
  });

  it("W-4 보험준비금이 «합산될 때만» 항이 붙는다", () => {
    expect(BESSHI_P2_SECTION4.liabilitySubtotalFormula({ insuranceReservePolicy: 5_000_000 })).toContain(
      "+보험준비금",
    );
    // 0은 합계에 기여하지 않으므로 항도 없다
    expect(BESSHI_P2_SECTION4.liabilitySubtotalFormula({ insuranceReservePolicy: 0 })).not.toContain(
      "보험준비금",
    );
  });
});

describe("IG-159 · 신고세액공제율 퍼센트 표기", () => {
  it("W-5 0.07이 7.000000000000001로 새지 않는다", () => {
    // 구별력: `0.07 * 100`은 이 단언에서 실패한다
    expect(ratePercent(0.07)).toBe(7);
    expect(String(ratePercent(0.07))).toBe("7");
  });

  it("W-6 연도별 4개 율이 모두 정수로 나온다 (2016 10% / 2017 7% / 2018 5% / 2019~ 3%)", () => {
    expect([0.1, 0.07, 0.05, 0.03].map(ratePercent)).toEqual([10, 7, 5, 3]);
  });
});

describe("IG-100 · 비과세 요약 카드가 만원 미만을 버리지 않는다", () => {
  it("W-7 정본 formatKRW는 무손실이다", () => {
    // 종전 로컬 포매터는 9,999원을 통째로 버려 "0원"을 냈다
    expect(formatKRW(123_459_999)).toBe("123,459,999");
    expect(formatKRW(9_999)).toBe("9,999");
  });
});
