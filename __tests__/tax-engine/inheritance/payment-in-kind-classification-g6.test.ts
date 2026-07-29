/**
 * G-6 물납 법정분류 anchor — 상증법 §73⑤ 금융재산 / 상증령 §74① 충당재산
 *
 * 리뷰 2round H-36·H-42·H-41(부분)·H-37(반증). derivePaymentInKindAssets가 표시용
 * buildSummaryCategory(PDF표8)를 물납 법정분류에 전용하던 결함 교정.
 *
 * 법령(KoreanLaw MCP 2026-07-17):
 *   - §73⑤(상증령): "금융재산" = 금전·예금·적금·부금·계금·출자금·특정금전신탁·보험금·공제금·어음.
 *       → 보험금·특정금전신탁 포함(H-36), 대부금채권·전환사채 비열거(H-42).
 *   - §74①1호: 국내 소재 부동산. §74①2호: 국채·공채·주권·내국법인 발행 채권/증권.
 *       → 전환사채=내국법인 증권=충당가능(H-41 부분). 부동산신탁 수익권(§9)은 "부동산" 아님(H-37 반증).
 *
 * 금액을 항목별로 달리해 composition을 고정(합계 우연 일치 회피).
 */
import { describe, it, expect } from "vitest";
import { derivePaymentInKindAssets } from "@/lib/tax-engine/credits/payment-in-kind";
import type {
  EstateItem,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const items = [
  { id: "cash", category: "cash", name: "현금" }, //                                 §73⑤ 금전
  { id: "dep", category: "deposit", name: "예금" }, //                               §73⑤ 예금
  { id: "ins", category: "financial", name: "보험금", deemedCategory: "insurance" }, // §73⑤ 보험금 (H-36)
  { id: "tc", category: "financial", name: "특정금전신탁", deemedCategory: "trust", trustType: "cash_trust" }, // §73⑤ (H-36)
  { id: "tre", category: "financial", name: "부동산신탁", deemedCategory: "trust", trustType: "real_estate" }, // 충당불가 (H-37)
  { id: "recv", category: "receivable", name: "대부금채권" }, //                     §73⑤ 비열거 (H-42)
  { id: "cb", category: "convertible_bond", name: "전환사채" }, //                   §74①2호 충당증권 (H-41·H-42)
  { id: "re", category: "real_estate_land", name: "토지" }, //                       §74①1호
] as unknown as EstateItem[];

const amt: Record<string, number> = {
  cash: 100_000_000,
  dep: 200_000_000,
  ins: 300_000_000,
  tc: 400_000_000,
  tre: 500_000_000,
  recv: 600_000_000,
  cb: 700_000_000,
  re: 800_000_000,
};
const valResult = {
  valuationResults: items.map((i) => ({ estateItemId: i.id, valuatedAmount: amt[i.id] })),
} as unknown as Pick<InheritanceTaxResult, "valuationResults">;

describe("G-6 물납 법정분류 (§73⑤·§74①)", () => {
  const a = derivePaymentInKindAssets(items, valResult, 0);

  it("H-36 보험금·특정금전신탁 → §73⑤ 금융재산 포함", () => {
    // 금융재산 = 현금1 + 예금2 + 보험금3 + 특정금전신탁4 = 10억 (부동산신탁·대부금채권·전환사채 제외)
    expect(a.grossFinancialValue).toBe(1_000_000_000);
  });

  it("H-42 대부금채권·전환사채 → 금융재산 제외", () => {
    // 대부금채권6·전환사채7 미포함 → 금융재산에 6억·7억 없음
    expect(a.grossFinancialValue).not.toBe(1_600_000_000); // + 대부금채권6
    expect(a.grossFinancialValue).not.toBe(1_700_000_000); // + 전환사채7
  });

  it("H-41(부분) 전환사채 → §74①2호 충당가능 유가증권 산입 (종전 0 하드코딩)", () => {
    expect(a.eligibleSecuritiesValue).toBe(700_000_000);
  });

  it("H-37(반증) 부동산신탁 수익권 → 충당 불가 (부동산·유가증권 어디에도 미산입)", () => {
    // 부동산신탁5(5억)은 realEstate·eligibleSecurities 어디에도 없음
    expect(a.realEstateValue).toBe(800_000_000); // 토지만
    expect(a.eligibleSecuritiesValue).toBe(700_000_000); // 전환사채만
  });

  it("회귀: 부동산·상장·비상장 분류 불변", () => {
    expect(a.realEstateValue).toBe(800_000_000); // 토지
    expect(a.tradableListedValue).toBe(0); // (상장주식 없음)
    expect(a.unlistedStockValue).toBe(0); // (비상장주식 없음)
  });

  it("대부금채권(receivable)은 금융재산·충당재산 모두 미산입 (분모 estateBase에만 반영)", () => {
    // netFinancial 10억에 대부금채권6억 없음 + 충당가능(부동산+유가증권) = 토지8 + 전환사채7 = 15억
    expect(a.realEstateValue + a.eligibleSecuritiesValue).toBe(1_500_000_000);
  });
});
