/**
 * D-6~D-9 anchor — Y-12 전수 대조에서 나온 결함 4건. 계획서 §6-G.2.
 *
 *   D-6 경기 연천군  — `41810` 오타(실제 `41800`) → 지역기준/가액기준 오분류
 *   D-7 전주 완산·덕진구 — 전북특별자치도 전환(`45` → `52`)
 *   D-8 부천시        — 일반구 신설(`41190` 소멸 → `41192`·`41194`·`41196`)
 *   D-9 화성 동탄     — 일반구 신설(`41590` 소멸 → `41597` 등)
 *
 * 공통 검증 형태는 **구·신 코드 수렴**이다 — 같은 물건을 구 코드로 조회하든
 * 현행 주소검색이 준 코드로 조회하든 결론이 같아야 한다. 그리고 수렴만 보면
 * 「전부 적용」으로 뭉개도 통과하므로, **갈려야 하는 대조군**을 반드시 함께 둔다.
 */
import { describe, it, expect } from "vitest";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { classifyRegionCriteriaByCode } from "@/lib/tax-engine/multi-house-surcharge-count";

/** 지정 기간 한가운데 — 경계 판정과 섞이지 않는 날짜 */
const DURING = "2021-06-01";

describe("D-6 경기 연천군 코드 오타 (§167의3①1호 지역기준/가액기준)", () => {
  it("D6-1: 연천군 41800은 가액기준(VALUE)이다", () => {
    // 경기 3군(연천·가평·양평)은 모두 가액기준 — 형제 2건과 같은 결론이어야 한다.
    expect(classifyRegionCriteriaByCode("4180000000")).toBe("VALUE");
  });

  it("D6-2: 가평군·양평군은 종전대로 VALUE (회귀 대조군)", () => {
    expect(classifyRegionCriteriaByCode("4182000000")).toBe("VALUE"); // 가평군
    expect(classifyRegionCriteriaByCode("4183000000")).toBe("VALUE"); // 양평군
  });

  it("D6-3: 경기 일반 시·군은 여전히 REGION — 배제가 번지지 않는다", () => {
    expect(classifyRegionCriteriaByCode("4113500000")).toBe("REGION"); // 성남 분당구
    expect(classifyRegionCriteriaByCode("4119200000")).toBe("REGION"); // 부천 원미구
  });
});

describe("D-7 전주시 — 전북특별자치도 전환 (45 → 52)", () => {
  it("D7-1: 구 코드 45111·45113은 종전대로 조정대상지역", () => {
    expect(isRegulatedByBjdCode("4511111100", DURING).isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("4511310100", DURING).isRegulated).toBe(true);
  });

  it("D7-2: 현행 코드 52111·52113도 같은 결론으로 수렴한다", () => {
    expect(isRegulatedByBjdCode("5211111100", DURING).isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("5211310100", DURING).isRegulated).toBe(true);
  });

  it("D7-3: 지정 해제(2022-09-26) 후에는 구·신 모두 미지정", () => {
    expect(isRegulatedByBjdCode("4511111100", "2023-01-01").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("5211111100", "2023-01-01").isRegulated).toBe(false);
  });

  it("D7-4: 같은 전북의 미지정 시·군은 그대로 미지정 (대조군)", () => {
    expect(isRegulatedByBjdCode("5213010100", DURING).isRegulated).toBe(false); // 군산시
  });
});

describe("D-8 부천시 — 일반구 신설 (41190 → 41192·41194·41196)", () => {
  it("D8-1: 구 코드 41190은 종전대로 조정대상지역", () => {
    expect(isRegulatedByBjdCode("4119010100", DURING).isRegulated).toBe(true);
  });

  it("D8-2: 신설 3구 전부 같은 결론으로 수렴한다 (시 전역 지정이었다)", () => {
    // 부천은 「경기도 부천시」 전역 지정이라 3개 구가 같은 이력을 그대로 물려받는다.
    expect(isRegulatedByBjdCode("4119210100", DURING).isRegulated).toBe(true); // 원미구 원미동
    expect(isRegulatedByBjdCode("4119410100", DURING).isRegulated).toBe(true); // 소사구 소사본동
    expect(isRegulatedByBjdCode("4119610100", DURING).isRegulated).toBe(true); // 오정구 오정동
  });

  it("D8-3: 지정 해제(2022-11-14) 후에는 신설 3구도 미지정", () => {
    expect(isRegulatedByBjdCode("4119210100", "2023-01-01").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4119410100", "2023-01-01").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4119610100", "2023-01-01").isRegulated).toBe(false);
  });

  it("D8-4: 지정 시작(2020-06-19) 전날은 미지정 — 시점 경계", () => {
    expect(isRegulatedByBjdCode("4119210100", "2020-06-18").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4119210100", "2020-06-19").isRegulated).toBe(true);
  });
});

describe("D-9 화성시 동탄 — 일반구 신설 (41590 → 41597 등)", () => {
  it("D9-1: 구 코드 반송동·석우동은 종전대로 조정대상지역", () => {
    expect(isRegulatedByBjdCode("4159012700", DURING).isRegulated).toBe(true); // 반송동
    expect(isRegulatedByBjdCode("4159012800", DURING).isRegulated).toBe(true); // 석우동
  });

  it("D9-2: 현행 동탄구 반송동·석우동도 같은 결론으로 수렴한다", () => {
    expect(isRegulatedByBjdCode("4159710200", DURING).isRegulated).toBe(true); // 41597102 반송동
    expect(isRegulatedByBjdCode("4159710300", DURING).isRegulated).toBe(true); // 41597103 석우동
  });

  it("D9-3: 화성은 **시 전역이 아니라 지구 한정** 지정이었다 — 부분 지정이 유지된다", () => {
    // 부천(전역)과 달리 화성은 동탄2 지구만 지정이었다. 신설 구 전역으로 넓히면
    // 근거 없이 납세자에게 불리해진다 — 지정 밖 지역은 그대로 미지정이어야 한다.
    expect(isRegulatedByBjdCode("4159310100", DURING).isRegulated).toBe(false); // 효행구 배양동
    expect(isRegulatedByBjdCode("4159510200", DURING).isRegulated).toBe(false); // 병점구 병점동
    expect(isRegulatedByBjdCode("4159110100", DURING).isRegulated).toBe(false); // 만세구 새솔동
  });

  it("D9-4: 2026-07-01 동탄구 전역 지정(국토부공고 제2026-882호)은 별건으로 살아 있다", () => {
    // 과거 이력(2017~2022 동탄2 한정)과 신규 지정(2026 동탄구 전역)은 서로 다른 건이다.
    expect(isRegulatedByBjdCode("4159711000", "2026-07-01").isRegulated).toBe(true); // 산척동
    expect(isRegulatedByBjdCode("4159711000", DURING).isRegulated).toBe(false); // 당시엔 미지정
  });
});
