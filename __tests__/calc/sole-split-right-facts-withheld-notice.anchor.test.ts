/**
 * anchor — 축 B 입주권: 첫 지분 = 승계, 둘째 지분 = 원조합원이면 둘째 지분의 §89①4호 판정 선언이 빈 값이라 비과세가 성립하지 않는데
 * 종전에는 고지가 0건이었다(2026-10-21). 사용자 결정: 계산은 불성립 유지 + «확인 필요» 고지(`soleSplitRightFactsWithheldNotice`).
 *
 * 선언 6필드는 판정 메뉴만 받고(`assets[0]`) 계산기에는 편집 위젯이 없다. #2248 복사(`soleSplitRightJudgmentFacts`)는 첫 카드가 승계면
 * 옮기지 않는다 — 첫 카드에는 원조합원 판정 선언이 없다. 복사 여부는 `soleSplitRightFactsSource` 한 곳에서 정하고 고지도 그 결과를 쓴다.
 *
 * 🔴 둘째 카드는 `{ ...a0 }`에서 판정 선언 6필드·저장 자산 종류만 `makeDefaultAsset(2)` 값으로 되돌린다(화면이 만드는 카드).
 *    ⚠️ 둘째 지분의 취득 관련 칸은 a0 값이 그대로 따라온다 — «숨은 칸(지분 카드 ③에서 입력)» 문제는 별 PR이라 fixture가 채운다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { soleSplitRightFactsSource, soleSplitRightJudgmentFacts } from "@/lib/calc/sole-split-right-judgment-facts";
import { soleSplitRightFactsWithheldNotice } from "@/lib/tax-engine/transfer-tax-redevelopment-shared-ownership";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const JUDGMENT_ONLY = [
  "redevExemptionEligibleAtApproval",
  "redevLandHouseholdOwnedBuilding",
  "redevOtherHouseAcquisitionDate",
  "redevOtherHouseDisposalDelayReason",
  "redevPriorHouseHoldingMonths",
  "redevPriorHouseResidenceMonths",
] as const;

const NOTICE = /원조합원\)의 조합원입주권 비과세/;

/** 첫 지분 승계 취득분 입력(실가: 승계취득가 5억 + 추가분담금 1억). 둘째 카드는 원조합원 — 취득일은 인가일(2022-03-01) 전. */
const SUCCESSOR_FIRST = {
  isSuccessorRightToMoveIn: true,
  acquisitionDate: "2023-01-01",
  successorRightAcqPrice: "500000000",
  successorRightAddedContribution: "100000000",
};

function axisB(opts: {
  price?: string;
  primaryOver?: Record<string, unknown>;
  companionOver?: Record<string, unknown>;
  formOver?: Record<string, unknown>;
}): TransferFormData {
  const { price = "1000000000", primaryOver = {}, companionOver = {}, formOver = {} } = opts;
  const f = redevAptForm({
    price,
    share: ["50", "100"],
    count: "0",
    assetOver: {
      assetKind: "right_to_move_in",
      redevSubject: "right",
      redevApprovalDate: "2022-03-01",
      redevExemptionEligibleAtApproval: "yes",
      redevSettlementAmount: "25000000",
      redevPriorHouseHoldingMonths: "60",
      redevPriorHouseResidenceMonths: "36",
      ...primaryOver,
    },
    formOver: { householdRightCount: "1", ...formOver } as never,
  });
  const a0 = f.assets[0] as AssetForm;
  a0.ownershipRemainderThirdParty = "";
  const blank = makeDefaultAsset(2);
  const a1 = {
    ...a0,
    assetId: blank.assetId,
    assetLabel: "자산 2",
    assetKind: blank.assetKind,
    isSuccessorRightToMoveIn: false,
    acquisitionDate: "2008-01-01",
    ...Object.fromEntries(JUDGMENT_ONLY.map((k) => [k, blank[k]])),
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    ownershipRemainderThirdParty: "",
    ...companionOver,
  } as AssetForm;
  return { ...f, assets: [a0, a1] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (r: any) => r.json.data.aggregated.properties as any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aggWarnings = (r: any) => (r.json.data.aggregated.warnings ?? []) as string[];
const hits = (w: string[]) => w.filter((x) => NOTICE.test(x));

describe("첫 지분 승계 + 둘째 지분 원조합원 — 선언 부재 확인 필요 고지", () => {
  it("W1 고지 1건(둘째 지분 라벨) · 둘째 지분은 §89①4호 미적용 · 문구에 법령명+조항호·확인 필요", async () => {
    const r = await runCalc(axisB({ primaryOver: SUCCESSOR_FIRST }));
    expect(r.status).toBe(200);
    const h = hits(aggWarnings(r));
    expect(h).toHaveLength(1);
    expect(h[0]).toContain("[자산 2]");
    expect(h[0]).toContain("「소득세법」 §89①4호");
    expect(h[0]).toContain("확인 필요");
    const [first, second] = props(r);
    expect(first.redevelopmentDetail).toBeUndefined(); // 승계 — §166 경로 아님
    expect(second.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(second.redevelopmentDetail.oneRightHighValueApplied).toBeUndefined();
  });

  it("W2 세액 불변 — 고지는 세액을 바꾸지 않는다(둘째 지분 선언을 직접 주입하면 달라지는 값과 대조)", async () => {
    const r = await runCalc(axisB({ primaryOver: SUCCESSOR_FIRST }));
    const tax = r.json.data.aggregated.totalTax as number;
    // 고지는 표시일 뿐 — 둘째 지분은 §166 일반 경로 과세(결정세액 57,010,000 · 장특 70,000,000), 합계는 고지 추가 전과 같은 값이다.
    expect(tax).toBe(194_106_000);
    expect(props(r)[1].determinedTax).toBe(57_010_000);
    // 대조군: 둘째 지분에 선언을 직접 넣으면(화면에는 입력 경로가 없는 값) 둘째 지분이 비과세가 된다 → 총세액이 줄고 고지도 없다.
    const injected = await runCalc(
      axisB({ primaryOver: SUCCESSOR_FIRST, companionOver: { redevExemptionEligibleAtApproval: "yes" } }),
    );
    expect(props(injected)[1].redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(injected.json.data.aggregated.totalTax).toBeLessThan(tax);
    expect(hits(aggWarnings(injected))).toHaveLength(0);
  });
});

describe("고지가 없는 경우 (부정 짝 — 조건 하나씩)", () => {
  it("N1 첫 카드 원조합원 — 선언이 둘째 지분에 복사되어 비과세, 고지 없음", async () => {
    const r = await runCalc(axisB({ companionOver: { acquisitionDate: "2008-01-01" } }));
    expect(props(r)[1].redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(hits(aggWarnings(r))).toHaveLength(0);
  });

  it("N2 둘 다 승계 — 승계 지분에는 원조합원 선언이 성립하지 않으므로 고지 없음", async () => {
    const r = await runCalc(
      axisB({ primaryOver: SUCCESSOR_FIRST, companionOver: { isSuccessorRightToMoveIn: true, acquisitionDate: "2023-02-01" } }),
    );
    expect(hits(aggWarnings(r))).toHaveLength(0);
  });

  it("N3 단건(지분 분할 아님) — 고지 없음", async () => {
    const f = axisB({ primaryOver: SUCCESSOR_FIRST });
    const r = await runCalc({ ...f, assets: [{ ...f.assets[0], ownershipNumerator: "100", ownershipDenominator: "100" } as AssetForm] });
    expect(r.json.data.aggregated).toBeUndefined(); // 단건 경로 — 축 B 다건 엔진을 타지 않는다
    expect((r.result?.warnings as string[] | undefined ?? []).filter((w) => NOTICE.test(w))).toHaveLength(0);
  });

  it("N4 비과세 후보가 아니면(1세대 아님) 선언을 입력해도 달라지지 않으므로 고지 없음 — 과다 고지 금지", async () => {
    const r = await runCalc(axisB({ primaryOver: SUCCESSOR_FIRST, formOver: { isOneHousehold: false } }));
    expect(hits(aggWarnings(r))).toHaveLength(0);
  });

  it("N5 비과세 후보가 아니면(세대 보유 입주권 2개 — 분양권·입주권 목록에 입주권 추가) 고지 없음", async () => {
    const r = await runCalc(
      axisB({
        primaryOver: SUCCESSOR_FIRST,
        formOver: { presaleRights: [{ id: "p1", type: "redevelopment_right", acquisitionDate: "2021-01-01", region: "capital" }] },
      }),
    );
    expect(hits(aggWarnings(r))).toHaveLength(0);
  });

  it("N6 비과세 후보가 아니면(다른 주택 2채) 고지 없음", async () => {
    const r = await runCalc(axisB({ primaryOver: SUCCESSOR_FIRST, formOver: { householdHousingCount: "2" } }));
    expect(hits(aggWarnings(r))).toHaveLength(0);
  });
});

/** 고지 leaf 단위 — 라우트로 만들기 어려운 조건(지분 표지·선언 값)을 직접 가른다. */
describe("soleSplitRightFactsWithheldNotice — 조건 단위", () => {
  const base = (over: Record<string, unknown> = {}, redevOver: Record<string, unknown> = {}) =>
    ({
      soleSplitAcquisition: true,
      propertyType: "right_to_move_in",
      isSuccessorRightToMoveIn: false,
      isOneHousehold: true,
      householdRightCount: 1,
      householdHousingCount: 0,
      householdNoPresaleRightsConfirmed: true,
      transferDate: new Date("2024-06-01"),
      redevelopment: { subject: "right", approvalDate: new Date("2022-03-01"), ...redevOver },
      ...over,
    }) as unknown as Parameters<typeof soleSplitRightFactsWithheldNotice>[0];
  const successorFirst = { propertyType: "right_to_move_in", isSuccessorRightToMoveIn: true } as const;

  it("L0 기준 시료 — 고지", () => {
    expect(soleSplitRightFactsWithheldNotice(base(), successorFirst)).toMatch(NOTICE);
  });
  it("L1 축 B가 아니면(soleSplitAcquisition 없음) 없음", () => {
    expect(soleSplitRightFactsWithheldNotice(base({ soleSplitAcquisition: undefined }), successorFirst)).toBeUndefined();
  });
  it("L2 첫 지분이 원조합원이면(복사 경로) 없음", () => {
    expect(soleSplitRightFactsWithheldNotice(base(), { propertyType: "right_to_move_in", isSuccessorRightToMoveIn: false })).toBeUndefined();
  });
  it("L3 첫 카드가 입주권이 아니면 없음", () => {
    expect(soleSplitRightFactsWithheldNotice(base(), { propertyType: "redevelopment_apt", isSuccessorRightToMoveIn: true })).toBeUndefined();
  });
  it("L4 이 지분이 승계면 없음", () => {
    expect(soleSplitRightFactsWithheldNotice(base({ isSuccessorRightToMoveIn: true }), successorFirst)).toBeUndefined();
  });
  it("L5 이 지분이 입주권 §166 경로가 아니면(redevelopment 없음 · 다른 자산) 없음", () => {
    expect(soleSplitRightFactsWithheldNotice(base({ redevelopment: undefined }), successorFirst)).toBeUndefined();
    expect(soleSplitRightFactsWithheldNotice(base({ propertyType: "housing" }), successorFirst)).toBeUndefined();
  });
  it("L6 선언이 입력돼 있으면(예·아니오 모두) 없음 — 입력된 사실대로 판정된 것", () => {
    expect(soleSplitRightFactsWithheldNotice(base({}, { exemptionEligibleAtApproval: true }), successorFirst)).toBeUndefined();
    expect(soleSplitRightFactsWithheldNotice(base({}, { exemptionEligibleAtApproval: false }), successorFirst)).toBeUndefined();
  });
  it("L7 선언만으로는 4호가 성립하지 않으면 없음 — 1세대 아님 · 입주권 2개 · 다른 주택 2채 · 비거주자", () => {
    for (const over of [
      { isOneHousehold: false },
      { householdRightCount: 2 },
      { householdHousingCount: 2 },
      { transferorNonResidentAtTransfer: true },
    ]) {
      expect(soleSplitRightFactsWithheldNotice(base(over), successorFirst)).toBeUndefined();
    }
  });
  it("L8 나목 후보(다른 주택 1채) — 취득일도 같은 선언에 속해 비어 있으므로 고지", () => {
    expect(soleSplitRightFactsWithheldNotice(base({ householdHousingCount: 1 }), successorFirst)).toMatch(NOTICE);
  });
  it("L9 토지 출자 입주권도 세대원 건물 소유 선언이 비어 있으므로 고지 (선언 전체가 후보 판정 가정에 들어간다)", () => {
    expect(soleSplitRightFactsWithheldNotice(base({}, { originalAssetType: "land" }), successorFirst)).toMatch(NOTICE);
  });
});

describe("복사 여부 단일 소스 — soleSplitRightFactsSource", () => {
  it("S1 네 갈래", () => {
    expect(soleSplitRightFactsSource({}, { isRightToMoveIn: false })).toBe("not-right");
    expect(soleSplitRightFactsSource({}, { isRightToMoveIn: true, isSuccessorRightToMoveIn: true })).toBe("primary-successor");
    expect(soleSplitRightFactsSource({ isSuccessorRightToMoveIn: true }, { isRightToMoveIn: true })).toBe("share-successor");
    expect(soleSplitRightFactsSource({}, { isRightToMoveIn: true })).toBe("copy");
  });
  it("S2 ④ 복사는 «copy»일 때만 — 첫 카드 승계면 빈 객체(고지 대상과 같은 갈래)", () => {
    const primary = { ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevExemptionEligibleAtApproval: "yes" } as AssetForm;
    const share = { isSuccessorRightToMoveIn: false } as AssetForm;
    expect(soleSplitRightJudgmentFacts(share, primary).redevExemptionEligibleAtApproval).toBe("yes");
    expect(soleSplitRightJudgmentFacts(share, { ...primary, isSuccessorRightToMoveIn: true })).toEqual({});
    expect(soleSplitRightJudgmentFacts({ isSuccessorRightToMoveIn: true }, primary)).toEqual({});
  });
});
