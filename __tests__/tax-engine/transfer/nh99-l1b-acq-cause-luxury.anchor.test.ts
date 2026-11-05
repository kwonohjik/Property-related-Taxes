/**
 * 조특법 §99·§99의3 리뷰 L1 2차 — 엔진 anchor (NH-15 · NH-02 · NH-03 · NH-17 · NH-40 · NH-16 · NH-49).
 *
 * - NH-15 (사용자 결정 Q-1 a): 기준일 1999.9.17.까지 고급주택 가액 = 양도가액(실지거래가액) 5억원 초과. 1999.9.18.부터 6억원.
 *   (소득세법 시행령 §156 MST 22605·22607 「양도가액이 5억원을 초과」 → MST 22609 「양도당시의 실지거래가액이 6억원을 초과」)
 * - NH-02 (Q-2 b): 단독주택 1호(연면적 264㎡ 또는 딸린 토지 495㎡ + 가액 + 하한), 3호(시설)는 단독주택에만.
 * - NH-03·17·40 (Q-3): 상속·증여(지분 포함)는 불성립, 매매 취득은 최초 계약 3-state(아니오 불성립 · 모름 불성립 + 확인 필요 · 미입력 종전).
 *   이월과세 증여(carryover_gift)는 해석 확인 후 별도라 이 파일에서 어느 쪽으로도 고정하지 않는다.
 * - NH-16 (Q-6): 관리처분계획 인가일 뒤 승계조합원은 §99의3 불성립(조특령 §99의3③2호·⑤). §99에는 인가일 요건이 없다.
 * - NH-49: 2015.12.31. 이전 양도는 종전 규정 적용 대상 고지 — 차감액은 그대로.
 */
import { describe, it, expect } from "vitest";
import { evaluateNew99, type New99Input } from "@/lib/tax-engine/transfer-reductions/new-99";
import { evaluateNew993, type New993Input } from "@/lib/tax-engine/transfer-reductions/new-99-3";

const D = (s: string) => new Date(s);

function in99(o?: Partial<New99Input>): New99Input {
  return {
    transferDate: D("2024-08-01"),
    acquisitionDate: D("1999-03-01"),
    usageApprovalDate: D("1999-03-01"),
    acquisitionType: "self_built",
    transferIncome: 300_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 150_000_000,
    standardPriceAtTransfer: 400_000_000,
    wholePropertyTransferPrice: 580_000_000,
    exclusiveAreaSqm: 84,
    ...o,
  };
}

function in993(o?: Partial<New993Input>): New993Input {
  return {
    transferDate: D("2023-08-01"),
    acquisitionDate: D("2002-08-02"),
    usageApprovalDate: D("2002-08-02"),
    acquisitionType: "self_built",
    transferIncome: 300_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 150_000_000,
    standardPriceAtTransfer: 400_000_000,
    wholePropertyTransferPrice: 700_000_000,
    exclusiveAreaSqm: 84,
    region: "outside_speculation",
    isResident: true,
    isHousingConstructionBusiness: false,
    calculatedTaxBeforeReduction: 0,
    calculatedTaxAfterReduction: 0,
    ...o,
  };
}

const codes = (r: { ineligibleReasons: { code: string }[] }) => r.ineligibleReasons.map((x) => x.code);

describe("NH-15 — 1999.9.17.까지 고급주택 가액 5억원(실지거래가액)", () => {
  it("공동 170㎡ · 사용승인 1999-03-01 · 5.8억 → 고급주택(5억 초과)", () => {
    const r = evaluateNew99(in99({ exclusiveAreaSqm: 170 }));
    expect(r.isEligible).toBe(false);
    expect(codes(r)).toContain("HIGH_VALUE_HOUSE");
  });
  it("경계: 5억 정확히 → 고급주택 아님 / 500,000,001 → 고급주택", () => {
    expect(evaluateNew99(in99({ exclusiveAreaSqm: 170, wholePropertyTransferPrice: 500_000_000 })).isEligible).toBe(true);
    expect(evaluateNew99(in99({ exclusiveAreaSqm: 170, wholePropertyTransferPrice: 500_000_001 })).isEligible).toBe(false);
  });
  it("기준일 1999-09-18(국민주택) · 5.8억 → 6억 기준이라 고급주택 아님 / 1999-09-17 → 고급주택", () => {
    const after = in99({ exclusiveAreaSqm: 170, isNationalHousing: true, usageApprovalDate: D("1999-09-18"), acquisitionDate: D("1999-09-18") });
    expect(evaluateNew99(after).isEligible).toBe(true);
    const before = in99({ exclusiveAreaSqm: 170, isNationalHousing: true, usageApprovalDate: D("1999-09-17"), acquisitionDate: D("1999-09-17") });
    expect(evaluateNew99(before).isEligible).toBe(false);
  });
});

describe("NH-02 — 종전 고급주택 단독주택 기준(소득세법 시행령 §156 1호·3호)", () => {
  const detached = { houseType: "detached" as const, exclusiveAreaSqm: 0, luxuryFacility: "no" as const, stdPriceFloorMet: "yes" as const };
  it("§99 단독 연면적 200㎡·토지 300㎡·8억 → 면적 미달이라 고급주택 아님(공동 기준 165㎡로 보던 종전 판정과 반대)", () => {
    const r = evaluateNew99(in99({ ...detached, grossFloorAreaSqm: 200, attachedLandAreaSqm: 300, wholePropertyTransferPrice: 800_000_000 }));
    expect(r.isEligible).toBe(true);
    // 유형 미입력(공동주택 기준) + 전용 200㎡ → 고급주택
    const legacy = evaluateNew99(in99({ exclusiveAreaSqm: 200, wholePropertyTransferPrice: 800_000_000 }));
    expect(codes(legacy)).toContain("HIGH_VALUE_HOUSE");
  });
  it("§99 단독 연면적 150㎡·토지 600㎡·8억 → 딸린 토지 495㎡ 이상이라 고급주택", () => {
    const r = evaluateNew99(in99({ ...detached, grossFloorAreaSqm: 150, attachedLandAreaSqm: 600, wholePropertyTransferPrice: 800_000_000 }));
    expect(codes(r)).toContain("HIGH_VALUE_HOUSE");
  });
  it("§99 단독 하한 「아니오」 → 고급주택 아님 / 「모름」 → 고급주택 + 확인 필요", () => {
    const base = { ...detached, grossFloorAreaSqm: 270, attachedLandAreaSqm: 300, wholePropertyTransferPrice: 800_000_000 };
    expect(evaluateNew99(in99({ ...base, stdPriceFloorMet: "no" })).isEligible).toBe(true);
    const unk = evaluateNew99(in99({ ...base, stdPriceFloorMet: "unknown" }));
    expect(codes(unk)).toContain("HIGH_VALUE_HOUSE");
    expect(unk.warnings?.join(" ")).toContain("취득세 시가표준액 2천만원 이상");
  });
  it("§99 단독 3호 시설 「예」 → 가액과 무관하게 고급주택 / 「모름」 → 고급주택 + 확인 필요", () => {
    const small = { ...detached, grossFloorAreaSqm: 100, attachedLandAreaSqm: 200, wholePropertyTransferPrice: 300_000_000 };
    expect(codes(evaluateNew99(in99({ ...small, luxuryFacility: "yes" })))).toContain("HIGH_VALUE_HOUSE");
    const unk = evaluateNew99(in99({ ...small, luxuryFacility: "unknown" }));
    expect(codes(unk)).toContain("HIGH_VALUE_HOUSE");
    expect(unk.warnings?.join(" ")).toContain("§156 3호");
    expect(evaluateNew99(in99({ ...small, luxuryFacility: "no" })).isEligible).toBe(true);
  });
  it("공동주택은 시설 「예」여도 3호를 적용하지 않는다 (Q-2 b)", () => {
    const r = evaluateNew99(in99({ houseType: "apartment", exclusiveAreaSqm: 84, luxuryFacility: "yes" }));
    expect(r.isEligible).toBe(true);
  });
  it("§99의3 종전 규정분(사용승인 2002-08-02) 단독 200㎡·300㎡·7억 → 적격 / 2001.1.1. 이후 하한 문구는 기준시가 4천만원", () => {
    const facts = { houseType: "detached" as const, grossFloorAreaSqm: 200, attachedLandAreaSqm: 300, luxuryFacility: "no" as const, stdPriceFloorMet: "yes" as const };
    expect(evaluateNew993(in993({ luxuryFacts: facts })).isEligible).toBe(true);
    // 유형 미입력 + 전용 200㎡ → 165㎡ 공동 기준으로 고급주택
    expect(codes(evaluateNew993(in993({ exclusiveAreaSqm: 200 })))).toContain("HIGH_VALUE_HOUSE");
    const unk = evaluateNew993(in993({ luxuryFacts: { ...facts, grossFloorAreaSqm: 270, stdPriceFloorMet: "unknown" } }));
    expect(codes(unk)).toContain("HIGH_VALUE_HOUSE");
    expect(unk.warnings?.join(" ")).toContain("기준시가 4천만원 이상");
  });
  it("§99의3 개정규정분(2003.1.1. 이후 계약)은 단독 사실을 읽지 않는다 — 양도 당시 고가주택(12억)", () => {
    const r = evaluateNew993(
      in993({
        acquisitionType: "from_builder",
        contractDate: D("2003-03-01"),
        usageApprovalDate: undefined,
        acquisitionDate: D("2004-03-01"),
        firstContract: "yes",
        luxuryFacts: { houseType: "detached", luxuryFacility: "yes" },
      }),
    );
    expect(r.isEligible).toBe(true);
  });
});

describe("NH-03 · NH-17 · NH-40 — 취득 원인 게이트", () => {
  const builder99 = { acquisitionType: "from_builder" as const, contractDate: D("1998-09-01"), usageApprovalDate: undefined };
  const builder993 = { acquisitionType: "from_builder" as const, contractDate: D("2002-03-01"), usageApprovalDate: undefined };
  it("§99 2호 · §99의3 1호 상속·증여 → 불성립", () => {
    for (const cause of ["inheritance", "gift"] as const) {
      expect(codes(evaluateNew99(in99({ ...builder99, acquisitionCause: cause })))).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
      expect(codes(evaluateNew993(in993({ ...builder993, acquisitionCause: cause })))).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    }
  });
  it("매매 취득 — 최초 계약 「예」 적격 / 「아니오」 분양권 승계 불성립 / 「모름」 불성립 + 확인 필요", () => {
    expect(evaluateNew99(in99({ ...builder99, acquisitionCause: "purchase", firstContract: "yes" })).isEligible).toBe(true);
    expect(codes(evaluateNew99(in99({ ...builder99, acquisitionCause: "purchase", firstContract: "no" })))).toEqual(["NOT_FIRST_CONTRACT"]);
    const unk = evaluateNew99(in99({ ...builder99, firstContract: "unknown" }));
    expect(codes(unk)).toEqual(["FIRST_CONTRACT_UNCONFIRMED"]);
    expect(unk.ineligibleReasons[0].message).toContain("확인 필요");
    expect(codes(evaluateNew993(in993({ ...builder993, firstContract: "no" })))).toEqual(["NOT_FIRST_CONTRACT"]);
    expect(evaluateNew993(in993({ ...builder993, firstContract: "yes" })).isEligible).toBe(true);
  });
  it("값 없는 직접 API·옛 이력(미입력)은 종전과 같이 계산한다 — 화면(⑧)이 답을 필수로 받는다", () => {
    expect(evaluateNew99(in99({ ...builder99 })).isEligible).toBe(true);
    expect(evaluateNew993(in993({ ...builder993 })).isEligible).toBe(true);
  });
  it("NH-40 자기건설 지분을 증여·상속으로 취득 → 그 지분 불성립 / 매매·신축은 적격", () => {
    expect(codes(evaluateNew99(in99({ acquisitionCause: "gift" })))).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(codes(evaluateNew993(in993({ acquisitionCause: "inheritance" })))).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    for (const cause of ["purchase", "newConstruction"] as const) {
      expect(evaluateNew99(in99({ acquisitionCause: cause })).isEligible).toBe(true);
      expect(evaluateNew993(in993({ acquisitionCause: cause })).isEligible).toBe(true);
    }
  });
});

describe("NH-16 — 관리처분계획 인가일 뒤 승계조합원(조특령 §99의3③2호·⑤)", () => {
  it("§99의3 승계조합원 → 불성립 (2호·1호 모두)", () => {
    expect(codes(evaluateNew993(in993({ isRedevSuccessorMember: true })))).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(
      codes(evaluateNew993(in993({ acquisitionType: "from_builder", contractDate: D("2002-03-01"), firstContract: "yes", isRedevSuccessorMember: true }))),
    ).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(evaluateNew993(in993({ isRedevSuccessorMember: false })).isEligible).toBe(true);
  });
});

describe("NH-49 — 2015.12.31. 이전 양도 종전 규정 고지(차감액 불변)", () => {
  it("§99의3 2015-06-01 양도 → 부칙 제35조 고지, 차감액은 고지 없는 계산과 같다", () => {
    const r = evaluateNew993(in993({ transferDate: D("2015-06-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.warnings?.join(" ")).toContain("대통령령 제26959호 부칙 제35조");
    expect(r.warnings?.join(" ")).toContain("양도소득세 면제");
    // 5년 후 안분: 300,000,000 × (150M−100M)/(400M−100M) = 50,000,000
    expect(r.reducibleTransferIncome).toBe(50_000_000);
    expect(evaluateNew993(in993({ transferDate: D("2016-01-01") })).warnings).toBeUndefined();
    expect(evaluateNew993(in993({ transferDate: D("2016-01-01") })).reducibleTransferIncome).toBe(50_000_000);
  });
  it("§99 2015-12-31 양도 → 고지(100분의 100 세액 감면) / 2016-01-01 → 없음, 차감액 같음", () => {
    const r = evaluateNew99(in99({ transferDate: D("2015-12-31") }));
    expect(r.warnings?.join(" ")).toContain("100분의 100");
    const after = evaluateNew99(in99({ transferDate: D("2016-01-01") }));
    expect(after.warnings).toBeUndefined();
    expect(r.reducibleTransferIncome).toBe(after.reducibleTransferIncome);
  });
});
