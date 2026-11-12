/**
 * 청산금 수령분 단독 신고 — 결과 카드 한 칸 구조 · 입력 화면 보라색 미리보기 수령 숨김 anchor
 * (사용자 결정 2026-11-12: 카드 a 한 칸 · 미리보기 a 수령이면 숨김 · 세액 불변 — 표시만).
 *
 * 수정 전 실측(평가액 5억 · 청산금 1.14억 · 종전 취득가 2억 · 인가 전 필요경비 1천만 · 양도비 5백만):
 * 제목 「재개발/재건축 양도차익 3분할」 · 신고하지 않는 ①·② 칸에 0원 행과 「장기보유공제 (…, 30.0%)」 · 머리에 쓰이지 않는 「분양가 386,000,000」 ·
 * 청산금 수령분 칸에 필요경비 행이 없어 114,000,000 − 45,600,000 ≠ 64,980,000.
 * 입력 화면 미리보기는 수령에도 「§166②1호 인가후 분」 문구와 「기존건물분 비율 129.53% / 청산금분 비율 29.53%」를 보였다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const rates = makeMockRates();
const run = (redevPatch: Partial<RedevelopmentInfo>, transferPrice: number) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice,
      transferDate: new Date("2024-01-26"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 200_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2009-10-23"),
        rightsValue: 500_000_000,
        settlementDirection: "receive",
        settlementAmount: 114_000_000,
        settlementSaleDate: new Date("2024-01-26"),
        preApprovalExpenses: 10_000_000,
        postApprovalExpenses: 5_000_000,
        originalAssetType: "housing",
        exemptionEligibleAtApproval: false,
        ...redevPatch,
      },
    }),
    rates,
  );
const card = (r: ReturnType<typeof run>) =>
  render(<RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="apt" settlementDirection="receive" />).container.textContent ?? "";

describe("RO-C1 단독 신고 — 한 칸 카드", () => {
  const r = run({ receiveOnlyMode: true }, 114_000_000);
  it("엔진 값(세액 불변 기준)", () => {
    const s = r.redevelopmentDetail!.settlement;
    expect([s.apportionedTransfer, s.apportionedAcquisition, s.expenses, s.gain]).toEqual([114_000_000, 45_600_000, 3_420_000, 64_980_000]);
    expect(114_000_000 - 45_600_000 - (s.expenses ?? 0)).toBe(s.gain);
  });
  it("제목 · ①② 칸·분양가 없음 · 필요경비 행", () => {
    const t = card(r);
    expect(t).toContain("청산금 수령분 단독 신고 양도차익");
    expect(t).not.toContain("3분할");
    expect(t).not.toContain("인가전 분");
    expect(t).not.toContain("인가후 기존건물분");
    expect(t).not.toContain("미신고");
    expect(t).not.toContain("분양가 386,000,000");
    expect(t).not.toContain("③ 청산금 수령분");
    expect(t).toContain("안분 필요경비 등(=필요경비 등 × 청산금권리가액)3,420,000");
    expect(t).toContain("양도차익64,980,000");
    expect(t.match(/장기보유공제 \(/g)).toHaveLength(1);
  });
});

describe("RO-C2 동시신고(수령) — 3분할 그대로", () => {
  it("제목·①②③·분양가 유지", () => {
    const t = card(run({ receiveOnlyMode: false }, 525_000_000));
    expect(t).toContain("재개발/재건축 양도차익 3분할");
    expect(t).toContain("① 인가전 분");
    expect(t).toContain("② 인가후 기존건물분");
    expect(t).toContain("③ 청산금 수령분");
    expect(t).toContain("분양가 386,000,000");
    // 동시신고도 열마다 필요경비 행을 그린다 — `redev-simultaneous-card-expenses.anchor.test.tsx`
    expect(t).toContain("안분 필요경비 등(=인가전 필요경비 등 × 청산금권리가액)2,280,000");
  });
});

describe("RO-P 입력 화면 보라색 미리보기", () => {
  const asset = (direction: "receive" | "pay") =>
    ({
      ...makeDefaultAsset(1), assetKind: "redevelopment_apt", redevSubject: "apt", redevRightsValue: "500000000",
      redevSettlementAmount: "114000000", redevSettlementDirection: direction,
    }) as AssetForm;
  const block = (a: AssetForm) =>
    render(<RedevelopmentBlock asset={a} onChange={() => {}} transferDate="2024-01-26" />).container.textContent ?? "";
  it("수령 — 미리보기 없음(129.53% 없음) · 하늘색 분양가액 카드는 남는다", () => {
    const t = block(asset("receive"));
    expect(t).not.toContain("미리보기 — 분양가");
    expect(t).not.toContain("129.53");
    expect(t).toContain("분양가액 (자동 도출, 입력 불요)");
  });
  it("납부 — 미리보기 그대로(분양가 6.14억 · 81.43% / 18.57%)", () => {
    const t = block(asset("pay"));
    expect(t).toContain("미리보기 — 분양가");
    expect(t).toContain("분양가 = 권리가액 + 청산금 = 614,000,000");
    expect(t).toContain("기존건물분 비율: 81.43%");
    expect(t).toContain("청산금분 비율: 18.57%");
  });
});
