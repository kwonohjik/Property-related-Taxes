/**
 * D-01 anchor — 지정 지구 미선언 「결론을 가를 때만」 고지의 반사실 판정이 판정 전체를 재귀 호출하지 않는다.
 *
 * 종전에는 미선언 축(양도 주택·입주권 행·일시적 2주택 명부 행)마다 `checkExemption` 전체를 true·false로 다시 불렀고,
 * 재귀 안에서도 남은 미선언 축마다 다시 두 번씩 불러 호출 수가 `calls(n) = 1 + 2n·calls(n−1)`(계승급)였다.
 * 입주권 행 8개면 판정 메뉴 route 한 번에 약 2.9분이 걸렸다(공개 route 가용성).
 *
 * 반사실 판정이 실제로 비교하는 것은 결론 키(`isExempt|isPartialExempt`)뿐이고, 그 값은 §89② 배제 여부와 본체 판정
 * (`checkExemptionCore`)만으로 정해진다 — 고지 술어를 다시 부를 필요가 없다. 호출 수는 `resolveArticle89Clause2` 호출로 센다
 * (판정 1회당 1회 + 반사실 결론 키 1회당 1회).
 *
 * 시료
 * - 삼송동(4128111100) 지구 한정 원조합원 입주권 행 k개 + 강남 양도 주택(2015-01-01 취득·거주 60개월) · 양도 2022-06-01
 *   (`original-member-right-notice-relevance-s32-4.anchor.test.ts`와 같은 모양)
 * - 매탄동(4111710100) 지구 한정 양도 주택(2019-01-02 취득) + 같은 동 원조합원 입주권 행 k개 · 양도 2021-06-01
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("anchor: fallback")) };
});
vi.mock("@/lib/tax-engine/transfer-tax-89-2-exclusion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-89-2-exclusion")>();
  return { ...actual, resolveArticle89Clause2: vi.fn(actual.resolveArticle89Clause2) };
});

import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { observeCase, type RulingCase } from "../one-house-rulings/harness";

const SAMSONG = "4128111100";
const MAETAN = "4111710100";
const K = 8;
/** 판정 1회 + 축마다 반사실 2회 + 고지 게이트 여유 — 계승급이면 k=8에서 수천만 회다. */
const MAX_CALLS = 64;

const rows = (k: number, regionCode: string, acquisitionDate: string, approval: string, district?: boolean) =>
  Array.from({ length: k }, (_, i) => ({
    id: `r${i}`, type: "redevelopment_right", memberOrigin: "original_house", acquisitionDate, region: "capital",
    regionCode, inDesignatedDistrict: district, managementDisposalApprovalDate: approval,
  }));

function samsong(k: number, district?: boolean): RulingCase {
  return {
    id: "d01-samsong", docNo: "-", docDate: "-", basis: "era", today: "2022-06-01", summary: "d01", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2022-06-01",
      contractTotalPrice: "1000000000",
      presaleRights: rows(k, SAMSONG, "2020-01-01", "2019-06-01", district),
      asset: {
        assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: "1168010100",
        residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
      },
    } as RulingCase["form"],
  };
}

function maetan(k: number, district?: boolean): RulingCase {
  return {
    id: "d01-maetan", docNo: "-", docDate: "-", basis: "era", today: "2021-06-01", summary: "d01", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2021-06-01",
      contractTotalPrice: "1000000000",
      presaleRights: rows(k, MAETAN, "2019-06-01", "2019-03-01", district),
      asset: {
        assetKind: "housing", acquisitionDate: "2019-01-02", regionCode: MAETAN, regionInDesignatedDistrict: district,
        residenceInputMode: "direct", residencePeriodMonthsAsset: "24",
      },
    } as RulingCase["form"],
  };
}

const rightNotices = (und: string[]) => und.filter((id) => id.startsWith("regulated-district-undeclared:"));

beforeEach(() => {
  vi.mocked(resolveArticle89Clause2).mockClear();
});

describe("D-01 — 지구 미선언 반사실 판정 비용", () => {
  for (const [name, mk] of [["삼송동 입주권 행", samsong], ["매탄동 양도 주택 + 입주권 행", maetan]] as const) {
    it(`${name} ${K}개 미선언 — 판정 1회의 §89② 판정 호출이 ${MAX_CALLS}회 이하`, async () => {
      const o = await observeCase(mk(K));
      expect(o.validationErrors).toEqual([]);
      expect(vi.mocked(resolveArticle89Clause2).mock.calls.length).toBeLessThanOrEqual(MAX_CALLS);
    });

    it(`${name} ${K}개 — 미선언·지구 안·지구 밖 결론이 같고, 결론을 가르지 않으니 지구 고지가 없다`, async () => {
      const [none, inside, outside] = [await observeCase(mk(K)), await observeCase(mk(K, true)), await observeCase(mk(K, false))];
      expect([none.isExempt, inside.isExempt, outside.isExempt]).toEqual([false, false, false]);
      expect(rightNotices(none.undetermined)).toEqual([]);
    });
  }
});
