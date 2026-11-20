/**
 * D-42 anchor — 공동상속 소수지분(§155③)은 §156의2⑦1호 「상속받은 주택」이 아니다(결정 Q-16 (A)).
 *
 * 종전에는 소수지분도 ⑦1호로 세어 ⑦ 후단(「상속개시 당시 보유한 주택」 한정)을 걸었다. 그래서 상속 뒤 산 일반주택 + 소수지분 +
 * 승계 입주권 세대가 과세로 확정됐다(소수지분 행만 빼면 §156의2③ 비과세). 「소득세법 시행령」 §155③은 「해당 공동상속주택은
 * 해당 거주자의 주택으로 보지 아니한다」에 보유 시점 괄호가 없고, ⑦에는 공동상속주택 호가 없다. 부동산거래관리과-128(2010)은 같은 모양에
 * §155③·§156의2③④를 직접 적용했다. 2013년 ⑦ 후단 신설 뒤 정면 해석은 없어, 반대 독법이면 결론이 갈릴 때만 확인 필요를 단다.
 *
 * 시료(리뷰 D-42): 일반주택 2018-01-15 · 거주 30개월 + 소수지분 2015-03-01 상속(별도세대) + 승계 입주권 2023-03-15, 2024-06-14 8억 양도.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { buildCaseForm, observeCase, type RulingCase } from "./one-house-rulings/harness";
import { handoff, runCalc, withToday } from "./one-house-pr6b/_helpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

function menu(share: { largest: boolean } | null, inheritedDate = "2015-03-01"): RulingCase {
  return {
    id: "d42", docNo: "-", docDate: "-", basis: "current", today: "2024-06-14", summary: "d42", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2024-06-14",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2018-01-15", residenceInputMode: "direct", residencePeriodMonthsAsset: "30" },
      houses: share
        ? [
            {
              id: "co",
              acquisitionDate: inheritedDate,
              region: "non_capital",
              isInherited: true,
              inheritedDate,
              isCoInherited: true,
              isLargestCoInheritedShareholder: share.largest,
              decedentSameHouseholdAtInheritance: false,
              decedentHouseholdSeparate: true,
              acquisitionOrigin: "general",
            },
          ]
        : [],
      presaleRights: [{ id: "r", type: "redevelopment_right", acquisitionDate: "2023-03-15", region: "non_capital", memberOrigin: "successor" }],
    } as RulingCase["form"],
  };
}

const reading = (und: string[]) => und.filter((id) => id.startsWith("89-2-reading:"));

describe("D-42 · Q-16 (A) — 공동상속 소수지분은 ⑦을 거치지 않고 §156의2③④를 직접 적용", () => {
  it("대조 — 소수지분 행이 없으면 §156의2③ 비과세", async () => {
    const o = await observeCase(menu(null));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(reading(o.undetermined)).toEqual([]);
  });

  it("소수지분 + 상속 뒤 산 일반주택 — 비과세(수정 전 과세) · 반대 독법이면 결론이 갈려 확인 필요", async () => {
    const o = await observeCase(menu({ largest: false }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(reading(o.undetermined)).toHaveLength(1);
  });

  it("소수지분 + 상속 전부터 보유한 일반주택 — 비과세 · 독법이 결론을 가르지 않아 고지 없음", async () => {
    const o = await observeCase(menu({ largest: false }, "2019-03-01"));
    expect(o.isExempt).toBe(true);
    expect(reading(o.undetermined)).toEqual([]);
  });
});

describe("D-42 계산기 — 판정 메뉴에서 넘긴 같은 사실", () => {
  it("비과세 + 같은 확인 필요 경고(공동상속주택 소수지분 독법)", async () => {
    const c = menu({ largest: false });
    const k = await withToday(c.today, async () => {
      const t = handoff(buildCaseForm(c));
      t.assets[0] = { ...t.assets[0], fixedAcquisitionPrice: "300000000" };
      return runCalc(t);
    });
    expect(k.status).toBe(200);
    expect(k.result.isExempt).toBe(true);
    expect((k.result.warnings ?? []).filter((w: string) => w.includes("공동상속주택 소수지분"))).toHaveLength(1);
  });
});
