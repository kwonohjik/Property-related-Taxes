/**
 * @vitest-environment jsdom
 *
 * anchor — §89①4호 입주권 양도: **혼인합가(§155⑤) 후 양도하면 혼인 전 배우자 쪽 주택을 「다른 주택」에서 뺀다** (M9).
 * 서면-2015-부동산-1200 · 재산세제과-1410 · 조심-2010-서-1322. route 결론은 평가셋 G055-era·G055-current·E002-era가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | M-1 | leaf | 배우자 쪽 1채만 뺀다 · 기한·「먼저 양도」·혼인 전 보유·구성·보유 쪽 미입력·동거봉양 동시 입력이면 빼지 않는다 |
 * | M-2 | 판정 | 가·나목이 뺀 수로 판정하고 안내를 싣는다 · 혼인일이 없으면 종전 그대로 |
 * | M-3 | ⑤·④ | 입주권 양도 + 다른 주택 1채면 혼인일 칸이 뜨고 본문에 싣는다 · 주택 양도 1주택이면 없다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  oneRightOtherHouseCount,
  resolveRightSaleMarriageMerge,
} from "@/lib/tax-engine/one-house/right-sale-marriage-merge";
import { buildOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const D = (s: string) => new Date(s);
const house = (id: string, acq: string, mergeOrigin?: "seller_side" | "counterpart_side") =>
  ({ id, acquisitionDate: D(acq), ...(mergeOrigin ? { mergeOrigin } : {}) }) as HouseInfo;

/** G055 — A(배우자 쪽, 혼인 전) · C(혼인 후) · 혼인 2018-05-15 · 양도 2026-06-15(10년 연혁) */
const base = {
  marriageMerge: { marriageDate: D("2018-05-15") },
  isFirstTransferredInMerge: true,
  acquisitionDate: D("2012-03-15"),
  transferDate: D("2026-06-15"),
  houses: [house("A", "2010-04-15", "counterpart_side"), house("C", "2024-09-15")],
  householdHousingCount: 2,
} as never as Parameters<typeof resolveRightSaleMarriageMerge>[0] & { householdHousingCount: number };

describe("M-1 leaf", () => {
  it("배우자 쪽 1채를 뺀다", () => {
    expect(resolveRightSaleMarriageMerge(base)).toEqual({ status: "applies", kind: "marriage", excludedHouseIds: ["A"], years: 10 });
    expect(oneRightOtherHouseCount(base)).toBe(1);
  });
  it("빼지 않는 경우", () => {
    const fails = (patch: object) => resolveRightSaleMarriageMerge({ ...base, ...patch })?.status;
    // 2024-11-12 전 양도는 5년 — 혼인 2018-05-15 + 5년 경과
    expect(fails({ transferDate: D("2024-06-15") })).toBe("fails");
    expect(fails({ isFirstTransferredInMerge: false })).toBe("fails");
    expect(fails({ acquisitionDate: D("2019-01-01") })).toBe("fails");
    expect(fails({ houses: [house("C", "2024-09-15")] })).toBe("fails");
    expect(fails({ houses: [house("A", "2010-04-15", "counterpart_side"), house("A2", "2011-04-15", "counterpart_side")] })).toBe("fails");
    expect(fails({ houses: [house("A", "2010-04-15", "counterpart_side"), house("D", "2011-04-15", "seller_side")] })).toBe("fails");
    expect(resolveRightSaleMarriageMerge({ ...base, houses: [house("A", "2010-04-15")] })).toMatchObject({
      status: "fails",
      confirmNotice: expect.stringMatching(/혼인 전 보유자/),
    });
    expect(resolveRightSaleMarriageMerge({ ...base, parentalCareMerge: { mergeDate: D("2019-01-01") } } as never)).toBeNull();
    expect(resolveRightSaleMarriageMerge({ ...base, marriageMerge: undefined })).toBeNull();
    expect(oneRightOtherHouseCount({ ...base, isFirstTransferredInMerge: false })).toBe(2);
  });
});

describe("M-2 판정", () => {
  const input = (patch: object = {}) =>
    ({
      ...base,
      isOneHousehold: true,
      householdRightCount: 1,
      householdNoPresaleRightsConfirmed: true,
      transferPrice: 800_000_000,
      oneRightExemptionFacts: {
        eligibleAtApproval: true,
        otherHouseAcquisitionDate: D("2024-09-15"),
        approvalDate: D("2022-04-15"),
      },
      ...patch,
    }) as never;
  it("나목 성립 + 안내 / 혼인일 없으면 다른 주택 2채로 미성립", () => {
    const v = buildOneRightVerdict(input(), true)!;
    expect(v.clause).toBe("na");
    expect(v.marriageMergeNotice).toMatch(/혼인한 날부터 10년 이내/);
    const none = buildOneRightVerdict(input({ marriageMerge: undefined }), true)!;
    expect(none.clause).toBeNull();
    expect(none.marriageMergeNotice).toBeUndefined();
    expect(none.reasons.join()).toMatch(/다른 주택이 2채/);
  });
  it("미성립 사유도 뺀 수로 말한다 — C 취득 3년 경과면 「다른 주택 2채」가 아니라 나목 기한", () => {
    const late = buildOneRightVerdict(
      input({ oneRightExemptionFacts: { eligibleAtApproval: true, otherHouseAcquisitionDate: D("2020-01-15"), approvalDate: D("2022-04-15") } }),
      true,
    )!;
    expect(late.clause).toBeNull();
    expect(late.reasons.join()).toMatch(/3년을 넘겼습니다/);
  });
});

describe("M-3 ⑤·④ 혼인일 칸", () => {
  const ROSTER = [
    {
      id: "spouse",
      region: "capital",
      acquisitionDate: "2000-05-15",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
      mergeOrigin: "counterpart_side",
    },
  ];
  const form = (assetKind: "housing" | "right_to_move_in"): OneHouseJudgmentFormData =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind,
          acquisitionCause: "purchase",
          acquisitionDate: "1996-04-16",
          ...(assetKind === "right_to_move_in" ? { redevSubject: "right" } : {}),
        },
      ],
      transferDate: "2008-03-27",
      isOneHousehold: true,
      houses: ROSTER,
      presaleRights: [],
      marriageDate: "2007-03-30",
      isFirstTransferredInMerge: true,
    }) as unknown as OneHouseJudgmentFormData;

  it("입주권 양도 + 다른 주택 1채 → 칸이 있고 싣는다", () => {
    render(<Step2 form={form("right_to_move_in")} onChange={() => {}} />);
    expect(screen.getAllByTestId("merge-date-marriage")).toHaveLength(1);
    const body = buildOneHouseExemptionApiBody(form("right_to_move_in")) as Record<string, unknown>;
    expect(body.marriageMerge).toEqual({ marriageDate: "2007-03-30" });
    expect(body.isFirstTransferredInMerge).toBe(true);
  });
  it("주택 양도 + 다른 주택 1채(2주택)는 종전 소유자(일시적 2주택 섹션) 하나만", () => {
    render(<Step2 form={form("housing")} onChange={() => {}} />);
    expect(screen.getAllByTestId("merge-date-marriage")).toHaveLength(1);
  });
  it("입주권 양도 + 명부 없음 → 칸도 본문도 없다", () => {
    const f = { ...form("right_to_move_in"), houses: [] } as unknown as OneHouseJudgmentFormData;
    render(<Step2 form={f} onChange={() => {}} />);
    expect(screen.queryByTestId("merge-date-marriage")).toBeNull();
    expect((buildOneHouseExemptionApiBody(f) as Record<string, unknown>).marriageMerge).toBeUndefined();
  });
});
