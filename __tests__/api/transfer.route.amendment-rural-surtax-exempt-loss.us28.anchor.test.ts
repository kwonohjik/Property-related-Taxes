/**
 * anchor US-28 · Q-26 (그룹 M) — 수정신고·경정청구 농특세.
 *
 * (1) 비과세 조기반환(`buildExemptEarlyResult`)·양도차손 조기반환(`buildLossTransferTaxResult`)은
 *     `computeAmendment(amendment, 0)`을 농특세 인자 없이 부른다. 두 경로는 감면 산출(`calculatedTax − 감면 후`)에
 *     닿기 전에 반환하므로 이번(정정 후) 농특세는 항상 0이다 → 인자 기본값 0이 곧 정답이다(코드 변경 없음).
 *     당초 농특세가 있었다면(감면을 받았다가 비과세·차손으로 정정) 환급 줄이 이미 나온다.
 * (2) 고지 노출 술어: 농특세 줄(ruralSurtax)이 있을 때만, 수정신고·경정청구 공통.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import {
  AMENDMENT_RURAL_SURTAX_NOTICE_DETAIL,
  AMENDMENT_RURAL_SURTAX_NOTICE_LEAD,
  shouldShowAmendmentRuralSurtaxNotice,
} from "@/lib/calc/amendment-rural-surtax-notice";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function result(body: unknown): Promise<Json> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json?.error)).toBe(200);
  return json.data.result;
}

const R99 = {
  type: "new_99", acquisitionType99: "from_builder", firstContract99: "yes", contractDate99: "1998-06-01",
  isResident99: true, isHousingConstructionBusiness99: false, isNationalHousing99: true,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000,
  standardPriceAtTransfer99: 250_000_000, hasOccupancyAtContract99: false, exclusiveAreaSqm99: 84,
};
const BASE = {
  propertyType: "housing", transferPrice: 900_000_000, transferDate: "2024-08-01",
  acquisitionPrice: 300_000_000, acquisitionDate: "1999-01-01", expenses: 0,
  useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
  isOneHousehold: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
};
const REFUND = {
  correctionKind: "refund_claim", originalDeterminedTax: 10_000_000, originalRuralSurtax: 5_000_000,
  applyUnderReportingPenalty: false, underReportingReason: "normal", underReductionMode: "auto_48_2",
  applyLatePaymentPenalty: false, statutoryFilingDeadline: "2025-05-31", amendedFilingDate: "2026-03-02",
  claimReasonType: "ordinary",
};

describe("US-28 · 비과세·차손 조기반환 경로의 농특세 인자", () => {
  it("대조군(정상 경로·§99 감면): 정정 후 농특세 13,238,000이 amendmentDetail에 실린다", async () => {
    const r = await result({ ...BASE, reductions: [R99], amendment: REFUND });
    expect(r.ruralSurtax).toBe(13_238_000);
    expect(r.amendmentDetail.ruralSurtax.amendedRuralSurtax).toBe(13_238_000);
  });

  it("양도차손 + §99 감면 선택: 엔진 농특세 0 · 정정 후 농특세 0 · 당초 5,000,000은 환급 줄", async () => {
    const r = await result({ ...BASE, transferPrice: 200_000_000, reductions: [R99], amendment: REFUND });
    expect(r.ruralSurtax ?? 0).toBe(0);
    expect(r.amendmentDetail.refundTax).toBe(10_000_000);
    expect(r.amendmentDetail.ruralSurtax).toEqual({
      originalRuralSurtax: 5_000_000, amendedRuralSurtax: 0, additionalRuralSurtax: 0,
      latePaymentPenalty: 0, refundRuralSurtax: 5_000_000, totalPayable: 0,
    });
  });

  it("1세대1주택 비과세 + §99 감면 선택: 엔진 농특세 0 · 정정 후 농특세 0 · 당초분 환급 줄", async () => {
    const r = await result({
      ...BASE, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 300,
      reductions: [R99], amendment: REFUND,
    });
    expect(r.isExempt).toBe(true);
    expect(r.ruralSurtax ?? 0).toBe(0);
    expect(r.amendmentDetail.refundTax).toBe(10_000_000);
    expect(r.amendmentDetail.ruralSurtax).toMatchObject({
      amendedRuralSurtax: 0, refundRuralSurtax: 5_000_000,
    });
  });

  it("당초 농특세 미입력이면 비과세·차손 정정에 농특세 줄이 없다", async () => {
    const r = await result({
      ...BASE, transferPrice: 200_000_000, reductions: [R99],
      amendment: { ...REFUND, originalRuralSurtax: 0 },
    });
    expect(r.amendmentDetail.ruralSurtax).toBeUndefined();
  });
});

describe("US-28 · Q-26 고지 노출 술어", () => {
  const rural = {
    originalRuralSurtax: 0, amendedRuralSurtax: 1, additionalRuralSurtax: 1,
    latePaymentPenalty: 0, refundRuralSurtax: 0, totalPayable: 1,
  };
  it("농특세 줄이 있으면 노출, 없으면 비노출", () => {
    expect(shouldShowAmendmentRuralSurtaxNotice({ ruralSurtax: rural })).toBe(true);
    expect(shouldShowAmendmentRuralSurtaxNotice({ ruralSurtax: undefined })).toBe(false);
    expect(shouldShowAmendmentRuralSurtaxNotice({})).toBe(false);
  });
  it("실제 수정신고 결과: 농특세 있음 → 노출 / 정정 전후 모두 0 → 비노출", async () => {
    const amend = {
      correctionKind: "amend", originalDeterminedTax: 66_890_000, originalRuralSurtax: 12_034_000,
      applyUnderReportingPenalty: false, underReportingReason: "normal", underReductionMode: "auto_48_2",
      applyLatePaymentPenalty: false, statutoryFilingDeadline: "2025-05-31", amendedFilingDate: "2026-03-02",
    };
    const on = await result({ ...BASE, reductions: [R99], amendment: amend });
    expect(shouldShowAmendmentRuralSurtaxNotice(on.amendmentDetail)).toBe(true);
    const off = await result({ ...BASE, reductions: [], amendment: { ...amend, originalRuralSurtax: 0 } });
    expect(shouldShowAmendmentRuralSurtaxNotice(off.amendmentDetail)).toBe(false);
  });
  it("문구: 별도·상계 안 함·심판례·확인 필요를 밝히고 유리·불리·절감 표현이 없다", () => {
    const t = AMENDMENT_RURAL_SURTAX_NOTICE_LEAD + AMENDMENT_RURAL_SURTAX_NOTICE_DETAIL;
    expect(t).toContain("농어촌특별세법 §7①");
    expect(t).toContain("상계하지 않");
    expect(t).toContain("조심 2012서3715");
    expect(t).toContain("확인 필요");
    expect(t).not.toMatch(/유리|불리|절감|절세/);
  });
  it("수정신고·경정청구 두 분기 모두 카드에 배선돼 있다", () => {
    const src = readFileSync("components/calc/results/transfer/AmendmentResultCard.tsx", "utf8");
    expect(src.match(/<AmendmentRuralSurtaxNotice/g)).toHaveLength(2);
  });
});
