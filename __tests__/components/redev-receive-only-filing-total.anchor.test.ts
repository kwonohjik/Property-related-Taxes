/**
 * receiveOnly(사례 46) 결과탭 합계 오표시 — Pre-Do anchor.
 *
 * 계획서: docs/02-design/features/redev-receive-only-display-total-mismatch.plan.md
 *
 * 결함: 「청산금 수령분 단독 신고」에서 신고 대상은 청산금 수령분뿐인데, 결과탭 합계 열이
 * 폼의 자산-수준 양도가액·양도일(신축APT 양도분)을 그대로 읽어 파트 합과 어긋난다.
 * ④ API 변환(`transfer-tax-api.ts:332,341`)에는 이미 미러가 있으나 ⑦ 표시에는 없었다.
 *
 * 법령: 소득세법 시행령 §166① 본문 + §166①2호 가목 (청산금 수령분 단독 산식)
 *       양도시기 = 소유권이전 고시일 익일 (NTS 집행기준 · 시행령 §162①9호)
 *
 * ★ 취득가액 200,000,000은 제보 화면에 없다 — ③ 열 45,600,000에서 역산한 재구성값이다
 *   (45,600,000 ÷ (114,000,000 / 500,000,000)). probe가 ③ 열 전 항목을 화면과 일치시켜 검증했다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case47RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();

// ── C1 제보 케이스 ───────────────────────────────────────────────────────────
const C1_SETTLEMENT = 114_000_000;   // 청산금 수령액 = 신고단위 양도가액 의제
const C1_APPORTIONED_ACQ = 45_600_000; // 200,000,000 × 114/500
const C1_GAIN = 68_400_000;
const C1_TRANSFER_DATE = "2024-01-26"; // 소유권이전 고시일(2024-01-25) 익일
const FORM_APT_PRICE = "525000000";    // 폼에 남은 신축APT 양도가 — 신고 대상 아님
const FORM_STALE_DATE = "2026-03-02";  // 폼에 남은 양도일 — 신고 대상 아님

function c1Redev(): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2009-10-23"),
    rightsValue: 500_000_000,
    settlementDirection: "receive",
    settlementAmount: C1_SETTLEMENT,
    settlementSaleDate: new Date(C1_TRANSFER_DATE),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    receiveOnlyMode: true,
    exemptionEligibleAtApproval: false,
  };
}

/** ④ API 변환이 미러한 뒤의 엔진 입력 (transferPrice=청산금 · transferDate=고시일 익일) */
function runEngine(redev: RedevelopmentInfo, transferPrice: number, transferDate: string) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice,
    transferDate: new Date(transferDate),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redev,
  });
  return calculateTransferTax(input, rates);
}

function formData(opts?: { residencePeriods?: { moveInDate: string; moveOutDate: string }[] }): TransferFormData {
  return {
    transferDate: FORM_STALE_DATE,
    filingDate: "2026-04-30",
    contractTotalPrice: FORM_APT_PRICE,
    assets: [{
      ...makeDefaultAsset(1),
      acquisitionDate: "2002-04-09",
      ...(opts?.residencePeriods
        ? { residenceInputMode: "interval" as const, residencePeriods: opts.residencePeriods }
        : {}),
    }],
  } as unknown as TransferFormData;
}

type Rows = ReturnType<typeof buildRows>;
const cell = (rows: Rows, label: string, col: string) => {
  const r = rows.find((x) => x.label === label);
  return r?.values[col as keyof typeof r.values] ?? null;
};
const num = (rows: Rows, label: string, col: string) => Number(cell(rows, label, col) ?? 0);
const str = (rows: Rows, label: string, col: string) => String(cell(rows, label, col) ?? "");

function c1Rows(fd = formData()) {
  const result = runEngine(c1Redev(), C1_SETTLEMENT, C1_TRANSFER_DATE);
  const { mode } = deriveColumns(result, undefined, "apt", "receive");
  return { result, rows: buildRows(result, mode, fd) };
}

describe("receiveOnly 결과탭 합계 — 신고단위는 청산금 분 단독이다", () => {
  it("A-1 신고서 양식 합계 양도가액·취득가액 = 청산금 분", () => {
    const { rows } = c1Rows();
    expect(num(rows, "양도가액", "total")).toBe(C1_SETTLEMENT);
    expect(num(rows, "취득가액", "total")).toBe(C1_APPORTIONED_ACQ);
  });

  it("A-2 신고서 양식 합계 양도일자·보유기간 = 소유권이전 고시일 익일 기준", () => {
    const { rows } = c1Rows();
    expect(str(rows, "양도일자", "total")).toContain("2024-01-26");
    expect(str(rows, "보유기간", "total")).toBe(str(rows, "보유기간", "settlement"));
  });

  it("A-3 계산명세서 양도가액·취득가액 = 청산금 분", () => {
    const result = runEngine(c1Redev(), C1_SETTLEMENT, C1_TRANSFER_DATE);
    const items = buildStatementItems(result, formData(), undefined, undefined, undefined);
    expect(items.get("transferPrice")?.value).toBe(C1_SETTLEMENT);
    expect(items.get("acquisitionPrice")?.value).toBe(C1_APPORTIONED_ACQ);
  });

  it("A-4 자기일관성 — 양도 − 취득 − 경비 == 양도차익 (두 카드 모두)", () => {
    const { result, rows } = c1Rows();
    const expenses = num(rows, "필요경비", "total");
    expect(num(rows, "양도가액", "total") - num(rows, "취득가액", "total") - expenses).toBe(result.transferGain);

    const items = buildStatementItems(result, formData(), undefined, undefined, undefined);
    const t = Number(items.get("transferPrice")?.value ?? 0);
    const a = Number(items.get("acquisitionPrice")?.value ?? 0);
    expect(t - a - (result.expenses ?? 0)).toBe(result.transferGain);
  });

  it("A-5 합계 == ①+②+③ 파트 합", () => {
    const { rows } = c1Rows();
    for (const label of ["양도가액", "취득가액"]) {
      const parts =
        num(rows, label, "preApproval") +
        num(rows, label, "postApprovalExistingHouse") +
        num(rows, label, "settlement");
      expect(num(rows, label, "total")).toBe(parts);
    }
  });

  it("A-6 C7 거주기간 종료일 fallback — 퇴거일 미입력 시 양도일(고시일 익일)로 마감", () => {
    const { rows } = c1Rows(formData({ residencePeriods: [{ moveInDate: "2010-03-01", moveOutDate: "" }] }));
    // 퇴거일이 비면 transferDate로 마감된다 — 폼의 2026-03-02가 아니라 신고단위 양도일이어야 한다.
    expect(str(rows, "퇴거일", "total")).toContain("2024-01-26");
  });
});

describe("A-7 API JSON 경유 — branchTransferDate가 string으로 도달해도 동작한다", () => {
  it("A-7 result가 JSON 왕복해도 합계가 청산금 분으로 유지된다", () => {
    // 🔴 실제 화면은 API Route를 거쳐 result가 JSON 직렬화된다 — Date가 string이 된다.
    //   엔진을 직접 호출하는 위 anchor들은 Date라 이 경로를 덮지 못했고,
    //   E2E(E-1)가 런타임 예외(`toISOString is not a function`)를 잡아냈다.
    const engineResult = runEngine(c1Redev(), C1_SETTLEMENT, C1_TRANSFER_DATE);
    const roundTripped = JSON.parse(JSON.stringify(engineResult)) as typeof engineResult;
    expect(typeof (roundTripped.redevelopmentDetail!.settlement.branchTransferDate as unknown)).toBe("string");

    const { mode } = deriveColumns(roundTripped, undefined, "apt", "receive");
    const rows = buildRows(roundTripped, mode, formData());
    expect(num(rows, "양도가액", "total")).toBe(C1_SETTLEMENT);
    expect(str(rows, "양도일자", "total")).toContain("2024-01-26");
  });
});

describe("회귀 가드 — receiveOnly가 아닌 분기는 폼 양도가액을 유지한다", () => {
  it("G-1 C2 apt+receive+receiveOnly=false (사례 47 동시신고)", () => {
    const result = runEngine(case47RedevelopmentInfo(), 2_000_000_000, "2022-03-01");
    const { mode } = deriveColumns(result, undefined, "apt", "receive");
    const fd = {
      transferDate: "2022-03-01",
      filingDate: "2022-05-31",
      contractTotalPrice: "2000000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2001-01-01" }],
    } as unknown as TransferFormData;
    const rows = buildRows(result, mode, fd);
    // 🔴 2026-08-28 정정 (결과탭 코드리뷰 #024) — 2,000,000,000 → **2,200,000,000**.
    //    이 가드의 목적은 「receiveOnly 치환이 새어 나오지 않는가」다. 치환이 새면 합계가
    //    청산금 단독(200,000,000)이 되므로 구별력은 그대로다.
    //    다만 사례 47은 **동시신고**라 신고 단위가 두 개의 양도(신축APT 20억 + 청산금 2억)이고,
    //    합계 양도가액이 20억뿐이면 역산 취득가액이 **음수**(−100,000,000)가 된다.
    //    ⇒ 엔진 echo(`settlementSeparateConsideration`)를 더한 값이 정본이다.
    expect(num(rows, "양도가액", "total")).toBe(2_200_000_000);
    expect(num(rows, "양도가액", "total")).not.toBe(200_000_000); // receiveOnly 치환 누수 가드
    expect(str(rows, "양도일자", "total")).toContain("2022-03-01");
  });

  it("G-2 C3 apt+pay — 폼 양도가액 유지", () => {
    const payRedev: RedevelopmentInfo = { ...c1Redev(), settlementDirection: "pay", receiveOnlyMode: undefined };
    const result = runEngine(payRedev, 900_000_000, "2024-01-26");
    const { mode } = deriveColumns(result, undefined, "apt", "pay");
    const fd = {
      transferDate: "2024-01-26", filingDate: "2024-03-31", contractTotalPrice: "900000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2002-04-09" }],
    } as unknown as TransferFormData;
    const rows = buildRows(result, mode, fd);
    expect(num(rows, "양도가액", "total")).toBe(900_000_000);
  });

  it("G-3 C4 right+receive — 폼 양도가액 유지 (receiveOnly 미적용 분기)", () => {
    const rightRedev: RedevelopmentInfo = { ...c1Redev(), subject: "right", receiveOnlyMode: undefined };
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 420_000_000,
      transferDate: new Date("2024-01-26"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 200_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: rightRedev,
    });
    const result = calculateTransferTax(input, rates);
    const { mode } = deriveColumns(result, undefined, "right", "receive");
    const fd = {
      transferDate: "2024-01-26", filingDate: "2024-03-31", contractTotalPrice: "420000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2002-04-09" }],
    } as unknown as TransferFormData;
    const rows = buildRows(result, mode, fd);
    expect(num(rows, "양도가액", "total")).toBe(420_000_000);
  });
});

describe("V-1 가드 — 플래그만으로 발동하지 않는다", () => {
  it("V1 right + receiveOnlyMode=true(비정상 조합) — 인가전 분이 합계에서 소실되지 않는다", () => {
    const bad: RedevelopmentInfo = { ...c1Redev(), subject: "right", receiveOnlyMode: true };
    const input: TransferTaxInput = baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 420_000_000,
      transferDate: new Date("2024-01-26"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 200_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: bad,
    });
    const result = calculateTransferTax(input, rates);
    // 엔진은 플래그를 그대로 echo하지만(redevelopment.ts:695) 분기는 발동하지 않아 파트가 0이 아니다.
    expect(result.redevelopmentDetail?.receiveOnlyMode).toBe(true);
    expect(result.redevelopmentDetail?.preApproval.apportionedTransfer).toBeGreaterThan(0);

    const { mode } = deriveColumns(result, undefined, "right", "receive");
    // ★ 구별력 확보 — 폼 양도가액·양도일을 settlement 값과 **다르게** 둔다.
    //   같게 두면 게이트를 제거해도 같은 값이 나와 anchor가 아무것도 지키지 않는다
    //   (M-2 실측으로 발견: 초판은 둘 다 420,000,000이라 통과했다).
    const fd = {
      transferDate: FORM_STALE_DATE, filingDate: "2026-04-30", contractTotalPrice: "999000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2002-04-09" }],
    } as unknown as TransferFormData;
    const rows = buildRows(result, mode, fd);
    // 파트 0 게이트가 없으면 settlement 단독(420,000,000)으로 바뀌며 인가전 분 386,000,000이 사라진다.
    expect(num(rows, "양도가액", "total")).toBe(999_000_000);
    expect(str(rows, "양도일자", "total")).toContain(FORM_STALE_DATE);
  });
});
