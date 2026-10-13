/**
 * #17 후속(G2) — F1(`dec17-housing-excess-part-mode.anchor.test.tsx`)의 형제: 별개취득 토글 ON + 토지·건물 취득일 같음 + 파트 방식 라디오가
 * 자산 단위 「취득가액 산정 방식」과 다른 주택인데, 배율 한도 **이내**(배율 초과분 분리 경로 밖)인 경우.
 *
 * 시료는 F1과 같고 토지 면적만 250㎡(수도권 주거 3배 한도 300㎡ 이내)다 — 매매 2012-01-02 · 양도 2026-02-16 · 실가 5억 · 정착면적 100㎡.
 * 양도가 15억(고가주택 — 12억 초과분 과세)과 10억(전액 비과세) 두 시료.
 *
 * ## 결함 (probe 실측 — 수정 전 ⑧은 아래 전부를 통과시켰다)
 * 토글을 켜면 같은 날짜여도 분리 섹션의 토지·건물 라디오가 자산 단위 라디오와 함께 화면에 뜬다. ④는 이 경로에서 라디오 값을 그대로 싣지만,
 * 엔진(`calcSplitGain`)은 비-별개취득에서 취득시 건물 기준시가(④가 이 경로에서 싣지 않는다)가 필요한 조합이면 분리를 포기하고(null) 자산 단위
 * 계산으로 간다. 그래서 파트 라디오는 **양쪽 실가 + 파트 취득가액 입력**일 때만 계산에 닿는다.
 *
 * | 자산 단위 / 라디오(토지·건물) / 파트 취득가액 | 수정 전 (15억 총세액) | 무엇이 반영되나 |
 * |---|---|---|
 * | 실가 / 환산·실가 · 실가·환산 · 환산·환산 · 감정·실가 · 매매사례·실가 / 무관 | 4,801,500 · splitDetail 없음 | 자산 단위 실가 — 라디오 무시 |
 * | 환산 / 실가·실가 / 없음 | 4,329,600 · splitDetail 없음 | 자산 단위 환산 — 라디오 무시 |
 * | 환산 / 실가·실가 / 토지 1억·건물 4억 | 4,801,500 · 분리 | 파트 실가 — **자산 단위 「환산」 무시** |
 * | 환산 / 실가·실가 / 토지 1억만 | **8,844,000 · 건물 취득가액 −1억**(총액 0 − 토지분) | 파트 실가 — 자산 단위 무시 · 음수 취득가액 |
 *
 * 어느 쪽이든 «두 라디오가 다르면» 화면에 보이는 라디오 하나는 계산에 반영되지 않는다(10억 비과세 시료도 같은 입력이 통과했다).
 * ⇒ 사용자 결정(2026-10-13) 「지금처럼 막고 안내」 — F1과 같은 술어(`housingExcessPartModeMismatch`)를 배율 한도와 무관하게 적용해
 *    ⑧이 어긋난 라디오 칸(`landAcqMode`/`buildingAcqMode`, ⑤에 `data-field` 앵커가 이미 있다)으로 막는다.
 * 두 라디오가 같으면 막지 않는다 — 실가·실가 + 파트 취득가액이면 분리 계산(파트 값 반영), 그 밖에는 자산 단위 계산으로 화면과 계산이 같다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  // 250㎡ ≤ 100㎡ × 3 = 300㎡ — 배율 한도 이내
  acquisitionArea: "250",
  transferArea: "250",
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const household = {
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const form = (price: string, over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: price,
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, actualSalePrice: price, ...over }],
  }) as never;

const HIGH = "1500000000";
const LOW = "1000000000";
/** 별개취득 토글 ON + 토지 취득일 = 건물 취득일 */
const SAME_DAY = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02" };
const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" };
const PARTS = { landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "400000000" };
const modeIssue = (issues: { field?: string; message: string }[]) => issues.find((i) => i.message.includes("토지·건물을 같은 날 취득한 주택"));

describe("⑧ — 배율 한도 이내에서도 파트 라디오가 자산 단위 방식과 다르면 그 라디오 칸으로 막는다 (수정 전: ⑧ 통과)", () => {
  it.each([
    ["토지 환산 / 건물 실가", { landAcqMode: "estimated", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지 실가 / 건물 환산", { landAcqMode: "actual", buildingAcqMode: "estimated" }, "buildingAcqMode", "건물 취득가액 방식"],
    ["토지 감정 / 건물 실가", { landAcqMode: "appraisal", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지 매매사례 / 건물 실가", { landAcqMode: "salesCase", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지·건물 모두 환산(자산 단위는 실가)", { landAcqMode: "estimated", buildingAcqMode: "estimated" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지 환산 / 건물 실가 + 파트 취득가액", { landAcqMode: "estimated", buildingAcqMode: "actual", ...PARTS }, "landAcqMode", "토지 취득가액 방식"],
    ["자산 단위 환산 + 토지·건물 모두 실가", { ...EST, landAcqMode: "actual", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    // 수정 전: 분리 계산이 파트 실가로 돌아 자산 단위 「환산」이 무시됐다(4,801,500 — 자산 단위 환산이면 4,329,600)
    ["자산 단위 환산 + 토지·건물 모두 실가 + 파트 취득가액", { ...EST, landAcqMode: "actual", buildingAcqMode: "actual", ...PARTS }, "landAcqMode", "토지 취득가액 방식"],
    // 수정 전: 건물 취득가액 = 총액 0 − 토지분 1억 = −1억 → 8,844,000
    ["자산 단위 환산 + 토지·건물 모두 실가 + 토지 취득가액만", { ...EST, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100000000" }, "landAcqMode", "토지 취득가액 방식"],
  ])("🔑 %s → ⑧ 차단 — 어긋난 라디오 칸 (고가주택 15억 · 전액 비과세 10억 모두)", async (_n, over, field, partLabel) => {
    for (const price of [HIGH, LOW]) {
      const r = await runCalc(form(price, { ...SAME_DAY, ...over }));
      const hit = modeIssue(r.issues);
      expect(hit?.field).toBe(field);
      expect(hit?.message).toContain(partLabel);
      expect(hit?.message).toContain("「취득가액 산정 방식」");
    }
  });

  it("🔑 안내 문구는 배율 초과분 분리를 전제하지 않는다 — 한도 이내 자산에 «배율 초과분»을 말하지 않는다", async () => {
    const r = await runCalc(form(HIGH, { ...SAME_DAY, landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(modeIssue(r.issues)?.message).not.toContain("배율 초과분");
  });
});

describe("대조 — 두 라디오가 같으면 막지 않는다 (화면 = 계산)", () => {
  it.each([
    ["파트 라디오 미선택(\"\" — 자산 단위에서 파생)", HIGH, { landAcqMode: "", buildingAcqMode: "" }, 4_801_500, false],
    ["토지·건물 모두 실가 = 자산 단위 실가", HIGH, { landAcqMode: "actual", buildingAcqMode: "actual" }, 4_801_500, false],
    // 파트 실가 칸이 계산에 닿는 유일한 조합 — 분리 계산(토지 1억·건물 4억)
    ["토지·건물 모두 실가 + 파트 취득가액 = 자산 단위 실가", HIGH, { landAcqMode: "actual", buildingAcqMode: "actual", ...PARTS }, 4_801_500, true],
    ["토지·건물 모두 환산 = 자산 단위 환산", HIGH, { ...EST, landAcqMode: "estimated", buildingAcqMode: "estimated" }, 4_329_600, false],
    ["전액 비과세 10억 · 토지·건물 모두 실가 + 파트 취득가액", LOW, { landAcqMode: "actual", buildingAcqMode: "actual", ...PARTS }, 0, true],
  ])("%s → 통과", async (_n, price, over, totalTax, split) => {
    const r = await runCalc(form(price, { ...SAME_DAY, ...over }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(totalTax);
    expect(!!r.result.splitDetail).toBe(split);
    if (split) {
      expect(r.result.splitDetail.land.acquisitionPrice).toBe(100_000_000);
      expect(r.result.splitDetail.building.acquisitionPrice).toBe(400_000_000);
    }
  });

  it("대조 — 토글 OFF면 파트 라디오가 화면에 없다 → 잔존 파트 방식은 막지 않는다", async () => {
    const r = await runCalc(form(HIGH, { landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(4_801_500);
  });

  it("대조 — 토지 취득일이 다르면(별개취득) 파트 방식이 정본이다 → 이 규칙은 걸리지 않는다", async () => {
    const r = await runCalc(form(HIGH, { ...SAME_DAY, landAcquisitionDate: "2010-01-04", landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(modeIssue(r.issues)).toBeUndefined();
  });
});
