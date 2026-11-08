/**
 * anchor — 조특법 §98의2 특칙(장특 표2 보유기간별 공제율) 결과의 「보유·거주 기간분 장특」 표시 + §127⑦ 택일 문구 조사
 *
 * 1단계 브라우저 확인(2026-11-09)에서 발견:
 *  · §98의2 특칙이 적용되면 엔진이 보유·거주 sub-step을 내지 않아 상세명세서 fallback이 「§95② 표1 — 보유기간별 공제만」
 *    「※ 표1 적용 — 거주분 0」으로 떨어졌다. 공제액·공제율(40%·80%)은 표2 특칙인데 문구만 표1이었다(세액 영향 없음).
 *  · §127⑦ 택일 안내(⑤ 패널)·차단 메시지(⑧)가 라벨 뒤에 「는」「과」·「은」을 고정해 받침과 어긋났다
 *    (「…일반세율」는 · 「…감면」는 · 「(…특례)과」). 코드베이스 관례대로 「은(는)」「과(와)」로 쓴다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { LTHD_982_RESIDENCE_FORMULA } from "@/components/calc/results/transfer/DetailedStatementLthdFormulas";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { makeMockRates, baseTransferInput } from "../../../../tax-engine/_helpers/mock-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const D = (s: string) => new Date(s);
const R982 = { type: "unsold_98_2" as const, isNonCapitalUnsold982: true, isFirstOrFcfsContract982: true, occupiedAtContract982: "no" as const };

function items(transferDate: string, reductions: unknown[]) {
  const r = calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2009-06-15"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      reductions,
    } as Any),
    makeMockRates(),
  );
  const form = createDefaultTransferFormData();
  form.transferDate = transferDate;
  form.assets[0] = { ...form.assets[0], acquisitionDate: "2009-06-15" };
  return { r, map: buildStatementItems(r, form, undefined, undefined, undefined) };
}

describe("§98의2 특칙 — 보유·거주 기간분 장특 문구가 표1이 아니다", () => {
  it.each([
    ["2024-06-03 양도 — 보유 열 연 4%·40%", "2024-06-03", 40, 120_000_000],
    ["2020-12-31 양도 — 2020.12.31. 이전 연 8%·80%", "2020-12-31", 80, 240_000_000],
  ])("%s", (_n, transferDate, pct, deduction) => {
    const { r, map } = items(transferDate, [R982]);
    expect(r.unsold982Detail?.lthd982Echo?.outcome).toBe("table2_holding");
    expect(r.longTermHoldingDeduction).toBe(deduction);
    const holding = map.get("ltHoldingPart")!;
    const residence = map.get("ltResidencePart")!;
    expect(holding.value).toBe(deduction);
    expect(holding.formula).toContain(`조특법 §98의2① 특칙 — §95② 표2 보유기간별 공제율 ${pct}%만 적용`);
    expect(holding.formula).not.toContain("표1");
    expect(holding.note).toBe(`조특법 §98의2① 특칙 — 표2 보유기간별 공제율 ${pct}% (거주분 0)`);
    expect(holding.legalBasis).toBe("조특법 §98의2① · 소득세법 §95② 표2");
    expect(residence.value).toBe(0);
    expect(residence.formula).toBe(LTHD_982_RESIDENCE_FORMULA);
    expect(residence.legalBasis).toBe("조특법 §98의2① · 소득세법 §95② 표2");
  });

  it("대조 — §98의2 없는 일반 다주택은 종전 표1 문구 그대로", () => {
    const { map } = items("2024-06-03", []);
    expect(map.get("ltHoldingPart")!.formula).toContain("§95② 표1 — 보유기간별 공제만");
    expect(map.get("ltHoldingPart")!.note).toBe("표1 적용 — 거주분 0 (거주 미충족 또는 일반 자산)");
    expect(map.get("ltResidencePart")!.legalBasis).toBe("소득세법 §95② 표1");
  });

  it("부적격(입주 사실 모름)은 특칙 문구를 쓰지 않는다", () => {
    const { r, map } = items("2024-06-03", [{ ...R982, occupiedAtContract982: "unknown" }]);
    expect(r.unsold982Detail?.lthd982Echo).toBeUndefined();
    expect(map.get("ltHoldingPart")!.formula).not.toContain("§98의2");
  });
});

describe("§127⑦ 택일 차단 메시지(⑧) — 라벨 뒤 조사는 「과(와)」「은(는)」", () => {
  function formOf(types: string[]): TransferFormData {
    const f = createDefaultTransferFormData();
    Object.assign(f, { transferDate: "2024-06-03", contractTotalPrice: "600,000,000", householdHousingCount: "1" });
    const asset = {
      ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-06-01",
      actualSalePrice: "600000000", fixedAcquisitionPrice: "300000000",
      reductions: types.map((t) => getReductionDefault(t as never)),
    } as AssetForm;
    f.assets[0] = { ...f.assets[0], ...asset, assetId: f.assets[0].assetId };
    return withTestAddress(f);
  }
  it("§98의2 + §99 — 받침 없는 「특례」 뒤에도 틀리지 않는다", () => {
    const m = String(validateStep(2, formOf(["unsold_98_2", "new_99"])) ?? "");
    expect(m).toContain("(장기보유특별공제 표2·일반세율 특례)과(와) 「");
    expect(m).toContain("(양도소득금액 차감)은(는) 동시에 적용받을 수 없습니다");
  });
});
