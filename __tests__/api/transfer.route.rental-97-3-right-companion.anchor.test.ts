/**
 * anchor (G-7 컴패니언) — 함께 양도하는 조합원입주권 × §97의3 (서면-2023-법규재산-2731) 이 주 자산과 같은 값으로 계산되고,
 * 2731 사실관계가 아니면 컴패니언에서도 ⑧·⑫가 막는다.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §10 PR-3 「남은 한계」 실측 (2026-11-14 사용자 요청).
 * 시료: 단건 anchor(`transfer.route.rental-97-3-right-after-auto-cancel.anchor.test.ts`)와 같은 입주권 + 일반 주택 1채(개별 실가 · 함께 양도).
 *   입주권 장특 = 인가 전 2억 → 1억 × 50% + 1억 × 18% = 68,000,000 (§97의3 없이 36,000,000) · 주택 장특 54,000,000
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
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

const RED = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("rental_97_3"),
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", hasVacancyOverGrace: false,
  officialPriceAtStart: "150,000,000", isNationalHousingScale: true, region: "capital",
  rentalContinuesToTransfer: false, rentalEndDate: "2022-01-01", autoCancelled973: true,
  stdPriceAtAcquisition: "100,000,000", stdPriceAtRentalEnd: "250,000,000", stdPriceAtTransfer: "300,000,000", ...over,
});
const RIGHT = (reds: unknown[]) => ({
  assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2013-06-30",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "700000000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2023-03-01", redevOriginalAssetType: "housing", redevRightsValue: "350000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevActualAcquisitionPrice: "150000000",
  reductions: reds,
}) as unknown as Partial<AssetForm>;
const HOUSE = {
  assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000", useEstimatedAcquisition: false,
} as unknown as Partial<AssetForm>;

function mk(assets: Partial<AssetForm>[], single = false): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2024-06-01"; f.filingDate = "2024-08-31";
  f.isOneHousehold = false; f.householdHousingCount = "2"; f.bundledSaleMode = "actual";
  f.contractTotalPrice = String(assets.reduce((s, a) => s + Number((a as Record<string, string>).actualSalePrice), 0));
  Object.assign(f, { householdRightCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, ...(single ? {} : { assetSplitMode: "companion" }) });
  f.assets = assets.map((over, i) => ({ ...(i === 0 ? f.assets[0] : makeDefaultAsset(i + 1)), addressJibun: i === 0 ? f.assets[0].addressJibun : "제주특별자치도 강남구 테스트동 1-1", assetId: `a${i}`, ...over }) as AssetForm);
  return rosterForDeclaredCount(f);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (r: Any): Any[] => r.json?.data?.aggregated?.properties ?? [];
const gate = (r: { issues: { message: string }[] }) => r.issues.filter((i) => i.message.includes("서면-2023-법규재산-2731"));

describe("G-7 컴패니언 입주권 × §97의3 — 계산", () => {
  it("대조군 — §97의3 없이 입주권 장특 36,000,000 · 합계 90,000,000", async () => {
    const r = await runCalc(mk([HOUSE, RIGHT([])]));
    expect(r.status).toBe(200);
    expect(props(r)[1].longTermHoldingDeduction).toBe(36_000_000);
    expect(r.json.data.aggregated.totalLongTermHoldingDeduction).toBe(90_000_000);
  });

  it("🔴 컴패니언 입주권 — ⑧ 통과 · ④ 컴패니언 감면 전송 · 장특 68,000,000 (인가 후 분 0) · 합계 122,000,000", async () => {
    const r = await runCalc(mk([HOUSE, RIGHT([RED()])]));
    expect(JSON.stringify(r.issues)).toBe("[]");
    expect(r.status).toBe(200);
    const comp = ((r.body as Any).companionAssets ?? [])[0];
    expect(comp.assetKind).toBe("right_to_move_in");
    expect(comp.reductions.find((x: Any) => x.type === "rental_97_3")?.stdPriceAtTransfer).toBe(300_000_000);
    const p = props(r)[1];
    expect(p.rental97LthdDetail).toMatchObject({ isEligible: true, overrideRate: 0.5, rentalGainRatio: 0.5 });
    expect(p.longTermHoldingDeduction).toBe(68_000_000);
    expect(p.redevelopmentDetail.preApproval.lthd).toBe(68_000_000);
    expect(p.redevelopmentDetail.settlement.lthd).toBe(0);
    expect(props(r)[0].longTermHoldingDeduction).toBe(54_000_000);
    expect(r.json.data.aggregated.totalLongTermHoldingDeduction).toBe(122_000_000);
  });

  it("입주권이 주 자산이어도 같은 값 — 위치 대칭", async () => {
    const r = await runCalc(mk([RIGHT([RED()]), HOUSE]));
    expect(r.status).toBe(200);
    expect(props(r)[0].longTermHoldingDeduction).toBe(68_000_000);
    expect(r.json.data.aggregated.totalLongTermHoldingDeduction).toBe(122_000_000);
  });
});

describe("G-7 컴패니언 입주권 × §97의3 — 2731 사실관계가 아니면 막는다", () => {
  it.each([
    ["자진말소(자동말소 OFF)", RIGHT([RED({ autoCancelled973: false })]), "자동말소"],
    ["말소일 2023-06-01 > 인가일", RIGHT([RED({ rentalEndDate: "2023-06-01" })]), "관리처분계획 인가일(2023-03-01) 뒤"],
    ["D 빈칸(자산 양도시 기준시가 4억만)", { ...RIGHT([RED({ stdPriceAtTransfer: "" })]), standardPriceAtTransfer: "400000000" } as Partial<AssetForm>, "관리처분계획 인가일 당시 기준시가"],
    ["승계 입주권", { ...RIGHT([RED()]), isSuccessorRightToMoveIn: true, fixedAcquisitionPrice: "300000000", acquisitionDate: "2023-05-01" } as Partial<AssetForm>, "승계취득"],
  ])("%s → ⑧ 차단 · ⑫ 400", async (_label, right, phrase) => {
    const r = await runCalc(mk([HOUSE, right]));
    expect(gate(r)[0]?.message).toContain(phrase);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("companionAssets.0.reductions.0.type");
  });

  it("직접 API — 컴패니언 승계 플래그만 바꿔도 ⑫가 승계 사유로 막는다(⑫ 컴패니언 배관이 자산 사실을 읽는다)", async () => {
    const body = (await captureBody(mk([HOUSE, RIGHT([RED()])]))) as Any;
    body.companionAssets[0].isSuccessorRightToMoveIn = true;
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("승계취득한 입주권은 대상이 아닙니다");
  });
});
