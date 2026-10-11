/**
 * G3-10 anchor — 완공APT 청산금 **수령** 동시신고의 상세명세서·결과 카드는 시행령 §166②2호(= 제1항제2호 가목·나목) 구조를 적는다.
 *
 * ## 결함 (수정 전 실측 — 사례 47 사실관계, 20억 · 「미충족」 선언)
 * 수령인데 비과세가 아니면 납부(§166②1호) 라벨·산식으로 떨어졌다.
 *   - 행 라벨 「③ 청산금 납부분 (§166②1호 · §166⑤2호가목)」
 *   - 양도가액 「2,000,000,000 − 2,000,000,000 = 200,000,000」 (산술상 거짓)
 *   - 「의제 양도가액 = 권리가액 = 600,000,000」(입력 권리가액은 8억), 「의제 = 청산금 = 25,000,000」(청산금은 2억)
 *   - 표2 52% 옆 「표1 강등」 하드코딩, 카드의 「§166⑤2호가목 (인가일 기산)」·「안분 취득가액(=청산금)」
 * 시행령 §166②1호·⑤2호가목은 납부 전용이다. 수령은 §166②2호 → §166①2호 가목(인가후)·나목(인가전)이고 청산금 수령분은
 * 종전주택 일부의 분할양도(법규재산2012-358)다. 표시는 엔진 값과 산술·조문이 맞아야 한다. 세액 무영향.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../../../tax-engine/_helpers/mock-rates";
import {
  case44RedevelopmentInfo,
  case47RedevelopmentInfo,
} from "../../../../tax-engine/transfer-tax/redevelopment/_helpers";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import {
  buildRedevPerAssetForAcquisition,
  buildRedevPerAssetForGain,
  buildRedevPerAssetForGrossGain,
  buildRedevPerAssetForLthd,
  buildRedevPerAssetForTransfer,
} from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";

const rates = makeMockRates();
function sim(price: number, redev: Partial<RedevelopmentInfo> = {}, o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: price,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment: { ...case47RedevelopmentInfo(), ...redev },
    ...o,
  });
}
const detailOf = (i: TransferTaxInput) => calculateTransferTax(i, rates).redevelopmentDetail!;

/** 문자열 안의 모든 「A − B = C」 등식이 산술상 참인지 */
function everyEqHolds(formula: string): boolean {
  const re = /([\d,]+) − ([\d,]+) = ([\d,]+)/g;
  const n = (s: string) => Number(s.replace(/,/g, ""));
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) if (n(m[1]) - n(m[2]) !== n(m[3])) return false;
  return true;
}

const SALE = 2_000_000_000;
const a = detailOf(sim(SALE, { exemptionEligibleAtApproval: false })); // 미충족 선언 — 비과세 아님(청산금분 과세)
const rows = (arr: ReturnType<typeof buildRedevPerAssetForTransfer>) => arr.map((p) => String(p.formula));

describe("G3-10 — 수령 동시신고 상세명세서는 수령 구조(§166②2호)다", () => {
  it("행 라벨 — 「납부」·§166②1호·§166⑤2호가목이 없고 §166②2호 · §166①2호 가목·나목이다", () => {
    const labels = buildRedevPerAssetForTransfer(a, SALE, "apt", "receive").map((p) => p.label);
    expect(labels).toEqual([
      "① 인가전 분 (§166②2호 · §166①2호 나목 (수령 안분))",
      "② 인가후 기존건물분 (§166②2호 · §166①2호 가목)",
      "③ 청산금 수령분 (종전주택 일부의 분할양도 · 법규재산2012-358)",
    ]);
    for (const l of labels) {
      expect(l).not.toContain("납부");
      expect(l).not.toContain("§166②1호");
      expect(l).not.toContain("§166⑤2호가목");
    }
  });

  it("양도가액 산식 — 모든 등식이 산술상 참이고 엔진 값(평가액 8억 · 청산금 2억 · 양도가액 20억)과 맞다", () => {
    const f = rows(buildRedevPerAssetForTransfer(a, SALE, "apt", "receive"));
    for (const x of f) expect(everyEqHolds(x), x).toBe(true);
    expect(f[0]).toContain("평가액 800,000,000 − 청산금 200,000,000 = 600,000,000");
    expect(f[1]).toContain("양도가액 = 2,000,000,000");
    expect(f[2]).toContain("청산금 수령액 = 200,000,000");
  });

  it("취득가액 산식 — 「의제 = 청산금 = 25,000,000」 같은 값 어긋남이 없다 (청산금은 2억, 25,000,000은 종전취득가 × 청산금/권리가액)", () => {
    const f = rows(buildRedevPerAssetForAcquisition(a, "apt", "receive"));
    for (const x of f) {
      expect(everyEqHolds(x), x).toBe(true);
      expect(x).not.toContain("의제 = 청산금");
      expect(x).not.toContain("의제 = 권리가액");
    }
    expect(f[1]).toContain("분양가 = 평가액 800,000,000 − 청산금 200,000,000 = 600,000,000");
    expect(f[2]).toContain("종전 취득가액 × (청산금 200,000,000) ÷ (평가액 800,000,000) = 25,000,000");
  });

  it("양도차익 산식도 산술상 참 — 전체·과세대상 두 행", () => {
    for (const arr of [
      buildRedevPerAssetForGrossGain(a, "apt", "receive"),
      buildRedevPerAssetForGain(a, "apt", "receive"),
    ]) {
      // 12억 안분 후 과세대상 행은 「A − B = 안분 전」 뒤에 안분 안내가 붙는 기존 표시라 안분이 없는 청산금분만 본다.
      expect(everyEqHolds(String(arr[2].formula)), String(arr[2].formula)).toBe(true);
    }
  });

  it("표2(52%)가 적용된 청산금분 장특 문구에 「표1 강등」이 없다 — 비과세 차감 행도 같다", () => {
    const b = detailOf(sim(1_000_000_000, { exemptionEligibleAtApproval: true, newHouseResidenceMonths: 36, priorHouseResidenceMonths: 218 }));
    expect(b.settlement.lthdRate).toBeCloseTo(0.52, 5);
    expect(b.settlementExemptionApplied).toBe(true);
    const lthd = String(buildRedevPerAssetForLthd(b, "apt", "receive")[2].formula);
    expect(lthd).toContain("52%");
    expect(lthd).toContain("표2(보유+거주)");
    expect(lthd).not.toContain("표1 강등");
  });

  it("긍정 짝 — 신축 거주가 없어 표1(30%)이면 「표1(보유만)」으로 적는다", () => {
    const c = detailOf(sim(1_000_000_000, { exemptionEligibleAtApproval: true }));
    expect(c.settlement.lthdRate).toBeCloseTo(0.3, 5);
    const lthd = String(buildRedevPerAssetForLthd(c, "apt", "receive")[2].formula);
    expect(lthd).toContain("30%");
    expect(lthd).toContain("표1(보유만)");
  });

  it("권리가액 고가 안분(청산금분) — 라벨에 안분이 드러나고 등식은 참이다", () => {
    const hv = detailOf(sim(SALE, { rightsValue: 1_500_000_000 }));
    const t = buildRedevPerAssetForTransfer(hv, SALE, "apt", "receive");
    expect(t[2].label).toContain("권리가액 기준 고가주택 안분");
    expect(t[2].label).not.toContain("납부");
    for (const x of rows(t)) expect(everyEqHolds(x), x).toBe(true);
  });
});

describe("G3-10 긍정 짝 — 납부(사례 44)는 종전 납부 구조 그대로", () => {
  const pay = detailOf(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2007-04-09"),
      acquisitionPrice: 100_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(),
    }),
  );
  it("납부 라벨·산식이 유지된다", () => {
    const t = buildRedevPerAssetForTransfer(pay, 525_000_000, "apt", "pay");
    expect(t[2].label).toContain("③ 청산금 납부분");
    expect(t[2].label).toContain("§166②1호 · §166⑤2호가목");
    expect(String(t[2].formula)).toContain("분양가 안분 후 잔액");
    expect(everyEqHolds(String(t[2].formula))).toBe(true);
    const acq = buildRedevPerAssetForAcquisition(pay, "apt", "pay");
    expect(String(acq[2].formula)).toContain("의제 = 청산금");
  });
});

describe("G3-10 — 결과 카드", () => {
  it("수령 청산금분에 「인가일 기산」·「안분 취득가액(=청산금)」·「§166②1호」가 없고 수령 구조 문구가 있다", () => {
    const { container } = render(<RedevelopmentDetailCard detail={a} subject="apt" settlementDirection="receive" />);
    const txt = container.textContent ?? "";
    expect(txt).not.toContain("인가일 기산");
    expect(txt).not.toContain("안분 취득가액(=청산금)");
    expect(txt).not.toContain("§166②1호");
    expect(txt).not.toContain("③ 청산금 분");
    expect(txt).toContain("③ 청산금 수령분");
    expect(txt).toContain("§166②2호");
    expect(txt).toContain("법규재산2012-358");
    expect(txt).toContain("의제 양도가액(=권리가액 − 청산금)");
    expect(txt).toContain("분양가(=권리가액 − 청산금)");
  });

  it("긍정 짝 · 납부는 종전 카드 그대로 — 「인가일 기산」·「안분 취득가액(=청산금)」", () => {
    const { container } = render(<RedevelopmentDetailCard detail={a} subject="apt" settlementDirection="pay" />);
    const txt = container.textContent ?? "";
    expect(txt).toContain("§166⑤2호가목 (인가일 기산)");
    expect(txt).toContain("안분 취득가액(=청산금)");
    expect(txt).toContain("③ 청산금 분");
  });
});
