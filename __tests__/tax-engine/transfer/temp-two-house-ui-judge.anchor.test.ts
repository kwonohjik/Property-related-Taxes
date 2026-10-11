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
/**
 * 신규 주택 취득 당시 비조정(선언) — 이 파일의 기간 요건(1년·3년) anchor는 조정 여부와 무관한 본문 3년 독법을 본다.
 * 조정 여부 미입력은 #30의 불성립 독법(두 주택 모두 조정)이라 2019-12-17 이후 취득·2018-10-23~2023-01-11 양도에서 기한이 짧아지므로,
 * 그 독법은 아래 TT-미입력 anchor가 따로 지킨다.
 */
const NOT_REGULATED = { eraFields: { newHouseRegulatedAtAcquisition: "no" as const } };

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
      ...NOT_REGULATED,
    });
    expect(v.status).toBe("eligible");
  });

  it("TT-미입력 ★ 신규 주택 취득 당시 조정 여부 미입력(#30) → 두 주택 모두 조정으로 읽은 불성립 독법(1년 + 전입 요건) — 선언하면 3년 독법", () => {
    const base = { previousAcquisitionDate: "2018-01-01", newHouseAcquisitionDate: "2020-01-01", transferDate: "2021-06-01", ...EMPTY };
    const unknown = judgeTempTwoHouseFromForm(base);
    expect(unknown.status).toBe("ineligible");
    if (unknown.status === "pending") return;
    expect(unknown.deadlineYears).toBe(1);
    expect(unknown.regulated.determined).toBe(false);
    expect(unknown.regulated.relevant).toBe(true); // 입력 칸이 열려 있다
    expect(unknown.moveInPending).toBe(true);
    const declared = judgeTempTwoHouseFromForm({ ...base, ...NOT_REGULATED });
    expect(declared.status).toBe("eligible");
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
      ...NOT_REGULATED,
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
