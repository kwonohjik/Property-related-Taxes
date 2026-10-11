/**
 * 결정 #22(S06-4) ⑧ — 기준시가 순서 검증: 정상 입력(직전 양도 뒤 하락)은 막지 않고, 해석례가 없는 입력만 「계산기 미지원」으로 막는다.
 *
 * | 입력 | 처리 |
 * |---|---|
 * | 현 < 직전 (직전 ≥ 취득) | 통과 — 엔진이 §161②2호 분자 음수를 0으로 본다 |
 * | 현 < 취득 (분모 음수) | 차단 — 계산기 미지원(해석례 미확보) |
 * | 직전 < 취득, 12억 이하 | 통과 — 과세분 0(사전-2021-법규재산-0585) |
 * | 직전 < 취득, 12억 초과 또는 양도가액 모름 | 차단 — 계산기 미지원(하위 결정 다) |
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type Rh = AssetForm["rentalHousingException"];

function asset(acq: string, prior: string, transfer: string): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      wasRegisteredRentalOrChildcare: true,
      priorResidenceTransferDate: "2020-01-10",
      postRegistrationResidenceMonths: "30",
      standardPriceAtAcquisitionForPhrp: acq,
      standardPriceAtPriorTransfer: prior,
      standardPriceAtTransferForPhrp: transfer,
    } as Rh,
  };
}
const call = (a: AssetForm, high?: { transferPrice: number }) =>
  validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", "2024-06-01", "full", false, false, undefined, high);

describe("S06-4 ⑧ 직전 양도 뒤 하락", () => {
  it("P-1 ★ 현 5억 < 직전 6억(≥ 취득 3억) → 통과 (전: 「확인 후 재입력하세요」 차단)", () => {
    expect(call(asset("300,000,000", "600,000,000", "500,000,000"))).toBeNull();
  });
  it("P-2 대조 — 상승(3/4.5/5)도 통과, 분모 0(3/4/3)은 종전 문구로 차단", () => {
    expect(call(asset("300,000,000", "450,000,000", "500,000,000"))).toBeNull();
    expect(call(asset("300,000,000", "400,000,000", "300,000,000"))).toContain("동일하여");
  });
});

describe("S06-4 ⑧ 분모 음수", () => {
  it("P-3 ★ 현 2억 < 취득 3억 → 계산기 미지원 문구로 차단 (「재입력」 아님)", () => {
    const m = call(asset("300,000,000", "400,000,000", "200,000,000"));
    expect(m).toContain("계산기 미지원(해석례 미확보)");
    expect(m).not.toContain("재입력");
  });
});

describe("S06-4 ⑧ 취득 뒤 하락했다가 회복 (직전 < 취득) — 12억 이하만 연다", () => {
  const a = () => asset("300,000,000", "250,000,000", "500,000,000");
  it("P-4 ★ 양도가액 8억(12억 이하) → 통과", () => {
    expect(call(a(), { transferPrice: 800_000_000 })).toBeNull();
  });
  it("P-5 ★ 정확히 12억 → 통과(이하) / 12억 + 1원 → 차단 (경계)", () => {
    expect(call(a(), { transferPrice: 1_200_000_000 })).toBeNull();
    expect(call(a(), { transferPrice: 1_200_000_001 })).toContain("계산기 미지원(해석례 미확보)");
  });
  it("P-6 ★ 양도가액을 모르면(미전달 — 함께양도 묶음·부담부증여) 열지 않는다", () => {
    expect(call(a())).toContain("계산기 미지원(해석례 미확보)");
  });
});

describe("S06-4 ⑧ 계산기 진입점(validateAssetEntry)이 단건 계약 총액을 12억 판정가로 넘긴다", () => {
  function entry(total: string): string | null {
    const form = createDefaultTransferFormData();
    form.transferDate = "2024-06-01";
    form.contractTotalPrice = total;
    form.assets[0] = {
      ...asset("300,000,000", "250,000,000", "500,000,000"),
      fixedAcquisitionPrice: "400,000,000",
      acquisitionCause: "purchase",
      addressJibun: "서울 강남구 테스트동 1-1",
      actualSalePrice: total,
    };
    return validateAssetEntry(form.assets[0], 0, form);
  }
  it("P-7 8억 → 가격 순서 오류 없음 / 20억 → 계산기 미지원", () => {
    expect(entry("800,000,000") ?? "").not.toContain("계산기 미지원");
    expect(entry("2,000,000,000") ?? "").toContain("계산기 미지원");
  });
});
