/**
 * anchor (G-7) — 자동말소 뒤 관리처분계획 인가로 입주권이 된 원조합원 입주권 × §97의3 이
 * 화면 → ⑧ → ④ → ⑫ → ⑭ → 엔진까지 간다. 그 밖의 입주권 × §97의3 조합은 ⑧·⑫가 막는다.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §5 R-1~R-5 (Q-5 a · Q-6 a 권장안, 사용자 결정 2026-11-14).
 * 근거: 서면-2023-법규재산-2731 · 소득세법 §95② 괄호(인가 전 차익만 — 엔진 PR-2 #3351).
 *
 * 시료(§3 G-7): 취득 2013-06-30 1.5억 · 장기 등록·임대 2014-01-01 · 자동말소 2022-01-01 · 인가 2023-03-01 · 권리가액 3.5억
 * · 양도 2024-06-01 7억 · 기준시가 E 취득 1억 / C 개시 1.5억 / B 말소 2.5억 / D 인가일 3억 → 임대분 비율 1/2.
 *   장특 = 인가 전 2억 → 1억 × 50%(8년) + 1억 × 18% = 68,000,000 (§97의3 없이는 36,000,000)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc, captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const RED = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", hasVacancyOverGrace: false,
  // 화면의 「임대개시일 당시 기준시가」 — 가액요건(6억 이하)과 안분 산식 C를 겸한다(④ officialPriceAtStart)
  officialPriceAtStart: "150,000,000", isNationalHousingScale: true, region: "capital",
  rentalContinuesToTransfer: false, rentalEndDate: "2022-01-01", autoCancelled973: true,
  stdPriceAtAcquisition: "100,000,000", stdPriceAtRentalEnd: "250,000,000", stdPriceAtTransfer: "300,000,000",
  ...over,
});

function form(redOver: Record<string, unknown> = {}, assetOver: Record<string, unknown> = {}, withReduction = true): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2024-06-01";
  f.filingDate = "2024-08-31";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.contractTotalPrice = "700000000";
  Object.assign(f, { householdRightCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true });
  f.assets = [{
    ...f.assets[0],
    assetId: "a0",
    assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2013-06-30",
    useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "700000000",
    redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2023-03-01", redevOriginalAssetType: "housing", redevRightsValue: "350000000",
    redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevActualAcquisitionPrice: "150000000",
    reductions: withReduction ? [RED(redOver)] : [],
    ...assetOver,
  } as unknown as AssetForm];
  return rosterForDeclaredCount(f);
}

const gateIssues = (r: { issues: { message: string }[] }) => r.issues.filter((i) => i.message.includes("서면-2023-법규재산-2731"));

describe("G-7 입주권 × §97의3 — 화면 → 엔진 관통", () => {
  it("대조군 — §97의3 없이 장특 36,000,000", async () => {
    const r = await runCalc(form({}, {}, false));
    expect(r.status).toBe(200);
    expect(r.result.longTermHoldingDeduction).toBe(36_000_000);
  });

  it("R-1 🔴 2731 사실관계 → ⑧ 통과 · ④ 감면 전송 · 엔진 적격 · 장특 68,000,000 (인가 후 분 0)", async () => {
    const r = await runCalc(form());
    expect(JSON.stringify(r.issues)).toBe("[]");
    expect(r.status).toBe(200);
    const red = ((r.body as Any).reductions ?? []).find((x: Any) => x.type === "rental_97_3");
    expect(red?.autoCancelled973).toBe(true);
    expect(red?.stdPriceAtTransfer).toBe(300_000_000);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(true);
    expect(r.result.rental97LthdDetail?.rentalGainRatio).toBe(0.5);
    expect(r.result.longTermHoldingDeduction).toBe(68_000_000);
    expect(r.result.redevelopmentDetail?.settlement?.lthd).toBe(0);
  });

  it("R-2 말소일 2023-06-01(인가 뒤) → ⑧ 차단 · ⑫ 400", async () => {
    const f = form({ rentalEndDate: "2023-06-01" });
    const r = await runCalc(f);
    expect(gateIssues(r)[0]?.message).toContain("관리처분계획 인가일(2023-03-01) 뒤");
    expect(r.status).toBe(400);
  });

  it("R-3 자동말소 OFF(자진말소) → ⑧ 차단 · ⑫ 400", async () => {
    const r = await runCalc(form({ autoCancelled973: false }));
    expect(gateIssues(r)[0]?.message).toContain("자동말소");
    expect(r.status).toBe(400);
  });

  it("R-3′ 양도일까지 계속 임대 → ⑧ 차단 · ⑫ 400", async () => {
    const r = await runCalc(form({ rentalContinuesToTransfer: true, rentalEndDate: "", autoCancelled973: false }));
    expect(gateIssues(r).length).toBeGreaterThan(0);
    expect(r.status).toBe(400);
  });

  it("R-4 승계 입주권 → ⑧ 차단 · ⑫ 400", async () => {
    const r = await runCalc(form({}, { isSuccessorRightToMoveIn: true, fixedAcquisitionPrice: "300000000", acquisitionDate: "2023-05-01" }));
    expect(gateIssues(r)[0]?.message).toContain("승계취득");
    expect(r.status).toBe(400);
  });

  it("R-4′ 종전 자산 토지 → ⑧ 차단", async () => {
    const r = await runCalc(form({}, { redevOriginalAssetType: "land" }));
    expect(gateIssues(r)[0]?.message).toContain("종전 자산이 토지");
  });

  it("R-6′ D(인가일 기준시가) 빈칸 → ⑧ 차단 · ⑫ 400 (자산 카드 양도일 값으로 폴백하지 않는다 · Q-6 a)", async () => {
    const r = await runCalc(form({ stdPriceAtTransfer: "" }, { standardPriceAtTransfer: "400000000" }));
    expect(gateIssues(r)[0]?.message).toContain("관리처분계획 인가일 당시 기준시가");
    expect(r.status).toBe(400);
  });

  it("R-5 입주권 × §97의4·§97의5는 지금처럼 「주택 양도에만」으로 막힌다", async () => {
    for (const type of ["rental_97_4", "rental_97_5"] as const) {
      const f = form();
      (f.assets[0] as Any).reductions = [{ ...getReductionDefault(type) }];
      const r = await runCalc(f);
      expect(r.issues.some((i) => i.message.includes("주택 양도에만 적용"))).toBe(true);
      expect(r.status).toBe(400);
    }
  });

  it("직접 API — 승계 입주권 플래그만 바꿔도 ⑫가 막는다(⑧ 우회)", async () => {
    const body = (await captureBody(form())) as Any;
    body.isSuccessorRightToMoveIn = true;
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("서면-2023-법규재산-2731");
  });
});
