/**
 * S12-2 anchor — 구간 입력(interval) 모드에서 구간이 0개면 거주기간은 0개월이다.
 *
 * 숨은 개월 칸(`residencePeriodMonthsAsset`)은 interval 모드에서 화면에 없다(`ResidencePeriodSection`).
 * 「direct로 개월 입력 → 구간 입력 토글 ON → 구간 전부 삭제」 순서로 남은 옛 값이 `deriveResidencePeriodMonths`의
 * `length > 0` 조건 때문에 엔진·⑧ 상한 검사로 새, 화면 합계 「0개월」과 엔진 거주기간(36개월)이 갈렸다.
 * 근거: 「소득세법 시행령」 제154조제1항 괄호(취득 당시 조정대상지역이면 보유기간 중 거주 2년) ·
 *       제6항(「주민등록표 등본에 따른 전입일부터 전출일까지의 기간」).
 *
 * 경로: 리프(deriveResidencePeriodMonths) · 계산기 ⑧→④→⑫⑭ · 판정 메뉴 ⑧→④→⑫⑭ · 결과 화면 표시 헬퍼.
 * [긍정 짝] direct 모드의 36개월은 그대로 거주기간이다(취득 당시 조정 → 비과세).
 */
import { describe, it, expect } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { residenceMonthsOfAsset } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";
import { runCalc } from "./_owned-at-transfer-pr1a-helpers";

const T = "2026-06-15";
const ACQ = "2018-03-02"; // 강남 — 취득 당시 조정대상지역(2017-08-03~)이라 거주 2년 요건

type Mode = "interval" | "direct";

function calcForm(mode: Mode, months: string) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.transferDate = T;
  f.contractTotalPrice = "900000000";
  f.residencePeriodMonths = "";
  f.householdNoPresaleRightsConfirmed = true;
  f.householdNoOtherHousesConfirmed = true;
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: ACQ,
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "300000000",
    addressJibun: "테스트동 1",
    regionCode: "1168010100",
    residenceInputMode: mode,
    residencePeriods: [],
    residencePeriodMonthsAsset: months,
  });
  return f;
}

const judgment = (mode: Mode, months: string): RulingCase => ({
  id: "S12-2",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: T,
  summary: "",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: T,
    contractTotalPrice: "900000000",
    asset: {
      assetKind: "housing",
      acquisitionDate: ACQ,
      regionCode: "1168010100",
      residenceInputMode: mode,
      residencePeriods: [],
      residencePeriodMonthsAsset: months,
    },
  } as RulingCase["form"],
});

describe("S12-2 — interval 모드 구간 0개 = 0개월", () => {
  it("리프: interval · 구간 0개 · 숨은 36 → 0개월 / direct · 36 → 36개월 (긍정 짝)", () => {
    const p = { residencePeriods: [], residencePeriodMonthsAsset: "36" };
    expect(deriveResidencePeriodMonths({ ...p, residenceInputMode: "interval" }, T, "")).toBe(0);
    expect(deriveResidencePeriodMonths({ ...p, residenceInputMode: "direct" }, T, "")).toBe(36);
    // 폼-전역 fallback도 interval 모드에서는 읽지 않는다
    expect(deriveResidencePeriodMonths({ ...p, residenceInputMode: "interval" }, T, "60")).toBe(0);
  });

  it("리프: interval · 구간 입력 → 구간 합산 (회귀 0)", () => {
    expect(
      deriveResidencePeriodMonths(
        {
          residenceInputMode: "interval",
          residencePeriods: [{ moveInDate: "2018-03-02", moveOutDate: "2021-03-01" }],
          residencePeriodMonthsAsset: "7",
        },
        T,
        "",
      ),
    ).toBe(36);
  });

  it("결과 화면 헬퍼: 신고서·명세 거주 개월도 같은 규칙이다", () => {
    const asset = createDefaultTransferFormData().assets[0];
    expect(
      residenceMonthsOfAsset({ ...asset, residenceInputMode: "interval", residencePeriods: [], residencePeriodMonthsAsset: "36" }, T),
    ).toBe(0);
    expect(
      residenceMonthsOfAsset({ ...asset, residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "36" }, T),
    ).toBe(36);
  });

  it("계산기: interval · [] · 숨은 36 → 본문 0개월 · 과세 / direct · 36 → 비과세", async () => {
    const hidden = await runCalc(calcForm("interval", "36"));
    expect(hidden.issues).toEqual([]);
    expect(hidden.status).toBe(200);
    expect(hidden.body.residencePeriodMonths).toBe(0);
    expect(hidden.isExempt).toBe(false);
    expect(hidden.totalTax).toBeGreaterThan(0);

    const twin = await runCalc(calcForm("direct", "36"));
    expect(twin.issues).toEqual([]);
    expect(twin.body.residencePeriodMonths).toBe(36);
    expect(twin.isExempt).toBe(true);
  });

  it("계산기: 숨은 값이 보유기간을 넘어도 ⑧ 상한 검사에 걸리지 않는다 — 값 자체를 읽지 않는다 (direct는 걸림)", async () => {
    const hidden = await runCalc(calcForm("interval", "120"));
    expect(hidden.issues).toEqual([]);
    expect(hidden.body.residencePeriodMonths).toBe(0);
    const direct = await runCalc(calcForm("direct", "120"));
    expect(direct.issues.some((i) => i.field === "residencePeriodMonthsAsset")).toBe(true);
  });

  it("판정 메뉴: interval · [] · 숨은 36 → 비과세 아님 / direct · 36 → 비과세", async () => {
    const hidden = await observeCase(judgment("interval", "36"));
    expect(hidden.status).toBe(200);
    expect(hidden.validationErrors).toEqual([]);
    expect(hidden.isExempt).toBe(false);
    const twin = await observeCase(judgment("direct", "36"));
    expect(twin.isExempt).toBe(true);
  });
});
