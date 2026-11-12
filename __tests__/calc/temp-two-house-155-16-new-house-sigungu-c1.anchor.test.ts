/**
 * anchor — §155⑯ 「신규 주택 소재지」는 보유 주택 목록의 신규 주택 행 주소로 판정한다 (2026-11-12 리뷰 C-1).
 *
 * 판정 메뉴·계산기는 ⑯ 위젯의 별도 주소 칸(`newHouseSigunguCode`)만 엔진에 넘겼다. 그 칸을 비우면 엔진이 자기선언을 믿어
 * 비연접 신규 주택에도 5년 기한이 적용됐다. 증여세 부담부증여 경로는 이미 소재지 코드에서 파생한다 — 같은 규칙으로 맞춘다.
 *
 * 시료: 종전(양도) 주택 2015-01-01 · 신규 주택(명부 행) 2019-01-01 · 양도 2023-06-01(3년 지남 · 5년 안) · 비조정 · ⑯ 선언 ·
 * 이전지 세종(3611000000) · ⑯ 「신규 주택 소재지」 칸은 비움.
 *   - 명부 행이 경기 이천(세종과 비연접) → 과세. 카드·④·route 모두 같은 결론.
 *   - 명부 행이 세종 → 비과세(양성 짝).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse, judgmentTempTwoHouseVerdict } from "@/lib/calc/one-house-judgment-temp-two-house";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2023-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const SEJONG = "3611000000";
const ICHEON_DONG = "4150025000"; // 경기 이천시 — 세종과 비연접
const SEJONG_DONG = "3611010100";

const judgeForm = (newHouseRegionCode: string) => ({
  isOneHousehold: true,
  isRegulatedArea: false,
  transferDate: "2023-06-01",
  contractTotalPrice: "500000000",
  asset: { assetKind: "housing", acquisitionDate: "2015-01-01" },
  houses: [
    { id: "new", acquisitionOrigin: "general", region: "non_capital", acquisitionDate: "2019-01-01", regionCode: newHouseRegionCode },
  ],
  publicInstitutionRelocation: true,
  relocatedSigunguCode: SEJONG,
  newHouseSigunguCode: "",
});

const card = (code: string) => {
  const f = buildCaseForm(mkCase("2026-11-12", judgeForm(code)));
  return judgmentTempTwoHouseVerdict(f, judgmentDerivedNewHouse(f)) as unknown as { status: string };
};

describe("C-1 — ⑯ 신규 주택 소재지 = 명부 행 주소", () => {
  it("명부 행 이천(비연접) · ⑯ 칸 비움 → ④가 행 주소의 시·군을 싣고 과세 · 카드도 미충족", async () => {
    const r = await observeRaw(mkCase("2026-11-12", judgeForm(ICHEON_DONG)));
    expect((r.body as { temporaryTwoHouse?: Record<string, unknown> }).temporaryTwoHouse).toMatchObject({
      publicInstitutionRelocation: true,
      relocatedSigunguCode: SEJONG,
      newHouseSigunguCode: "4150000000",
    });
    expect(r.j.isExempt).toBe(false);
    expect(card(ICHEON_DONG).status).not.toBe("eligible");
  });

  it("양성 짝: 명부 행 세종 → 비과세 · 카드 충족", async () => {
    const r = await observeRaw(mkCase("2026-11-12", judgeForm(SEJONG_DONG)));
    expect(r.j.isExempt).toBe(true);
    expect(card(SEJONG_DONG).status).toBe("eligible");
  });
});
