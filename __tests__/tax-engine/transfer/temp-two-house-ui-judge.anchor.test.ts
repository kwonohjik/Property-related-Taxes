/**
 * 앵커 — UI 판정 헬퍼 judgeTempTwoHouseFromForm (§155① 요건 카드)
 * 엔진 judgeTemporaryTwoHouseTiming·resolveExemptionProviso 단일소스 재사용을 폼 primitive 경로로 검증.
 */
import { describe, it, expect } from "vitest";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";

const EMPTY = {
  provisoReason: "",
  provisoDepartureDate: "",
  provisoExpropriationDate: "",
  provisoBusinessApprovalDate: "",
  residencePeriodMonths: "0",
};

describe("judgeTempTwoHouseFromForm (UI 판정 앵커)", () => {
  it("입력 부족 → pending", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "",
      transferDate: "2021-06-01",
      ...EMPTY,
    });
    expect(v.status).toBe("pending");
  });

  it("부분 입력 Invalid Date → pending (RangeError 회귀)", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "2023-13-",
      transferDate: "2021-06-01",
      ...EMPTY,
    });
    expect(v.status).toBe("pending");
  });

  it("TT-1 정상: 1년 경과 + 3년내 → eligible", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "2020-01-01",
      transferDate: "2021-06-01",
      ...EMPTY,
    });
    expect(v.status).toBe("eligible");
  });

  it("TT-2 1년 미경과 → ineligible (oneYearMet false)", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2020-01-01",
      newHouseAcquisitionDate: "2020-06-01",
      transferDate: "2022-06-01",
      ...EMPTY,
    });
    expect(v.status).toBe("ineligible");
    if (v.status !== "pending") {
      expect(v.oneYearMet).toBe(false);
      expect(v.threeYearMet).toBe(true);
    }
  });

  it("TT-3 3년 초과 → ineligible (threeYearMet false)", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2018-01-01",
      newHouseAcquisitionDate: "2020-01-01",
      transferDate: "2023-06-01",
      ...EMPTY,
    });
    expect(v.status).toBe("ineligible");
    if (v.status !== "pending") {
      expect(v.oneYearMet).toBe(true);
      expect(v.threeYearMet).toBe(false);
    }
  });

  it("TT-4 수용 waiver: 1년 미경과여도 eligible (oneYearWaived)", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2020-01-01",
      newHouseAcquisitionDate: "2020-06-01",
      transferDate: "2021-01-01",
      provisoReason: "expropriation",
      provisoBusinessApprovalDate: "2020-06-01", // 취득 < 사업인정 → 적격
      provisoExpropriationDate: "2020-12-01",
      provisoDepartureDate: "",
      residencePeriodMonths: "0",
    });
    expect(v.status).toBe("eligible");
    if (v.status !== "pending") expect(v.oneYearWaived).toBe(true);
  });

  it("TT-9 수용 사유선택하나 조건 미충족(취득≥사업인정) → waiver 불성립 → ineligible", () => {
    const v = judgeTempTwoHouseFromForm({
      previousAcquisitionDate: "2020-01-01",
      newHouseAcquisitionDate: "2020-06-01",
      transferDate: "2022-06-01",
      provisoReason: "expropriation",
      provisoBusinessApprovalDate: "2019-01-01", // 취득(2020) ≥ 사업인정 → null
      provisoExpropriationDate: "2022-01-01",
      provisoDepartureDate: "",
      residencePeriodMonths: "0",
    });
    expect(v.status).toBe("ineligible");
    if (v.status !== "pending") expect(v.oneYearWaived).toBe(false);
  });
});
