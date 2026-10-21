/**
 * anchor — **원조합원 입주권·완공APT가 컴패니언일 때 취득가액은 §166 칸에서 온다** (2026-10-21).
 *
 * ## 결함
 * 원조합원(`right_to_move_in` 비승계 · `redevelopment_apt` + `redevIsSuccessorMember !== "yes"`)은
 * 상단 「취득가액」 칸이 화면에 없다(`CompanionAcqPurchaseBlock` 게이트). 취득가액은 §166 섹션의
 * `redevActualAcquisitionPrice`다. 주 자산 ④는 그 칸을 읽는데 컴패니언 ④(`fixedAcquisitionPriceRaw`)는
 * 숨은 `fixedAcquisitionPrice`를 읽었다 ⇒ 비어 있으면 ⑧ 통과인데 route 400, 옛 값이 남으면 200 오답.
 *
 * ## 이 파일이 지키는 것
 * 모든 fixture가 **숨은 `fixedAcquisitionPrice`를 비운 화면 모양**이다(종전 fixture는 이 칸을 채워 결함을 가렸다).
 * 옛 값(1원·999,999,999)이 남아 있어도 결과가 같아야 한다(옛 값 무시).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 원조합원 입주권 — 화면 입력 칸만. 숨은 일반 취득가액 칸(`fixedAcquisitionPrice`)은 빈 값. */
const ORIG_RIGHT: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: false,
  redevSubject: "right",
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "",
  actualSalePrice: "1000000000",
  standardPriceAtTransfer: "800000000",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2016-06-01",
  redevOriginalAssetType: "housing",
  redevRightsValue: "900000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "400000000",
  redevExemptionEligibleAtApproval: "yes",
  redevPriorHouseHoldingMonths: "60",
  redevPriorHouseResidenceMonths: "36",
} as Partial<AssetForm>;
/** 원조합원 완공APT — 입주권 fixture에서 자산 종류·대상만 바꾼다(판정 선언은 입주권 전용). */
const ORIG_APT: Partial<AssetForm> = {
  ...ORIG_RIGHT,
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  redevIsSuccessorMember: "no",
  redevExemptionEligibleAtApproval: "",
} as Partial<AssetForm>;
const HOUSE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000",
  useEstimatedAcquisition: false,
};
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const COMPANION_FORM = {
  contractTotalPrice: "1600000000",
  assetSplitMode: "companion",
  householdHousingCount: "1",
  isOneHousehold: false,
} as unknown as Partial<TransferFormData>;

function mkForm(assets: Partial<AssetForm>[], extra: Partial<TransferFormData>): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.filingDate = "2024-08-31";
  form.householdHousingCount = "0";
  form.isOneHousehold = true;
  form.bundledSaleMode = "actual";
  Object.assign(form, {
    householdRightCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "60",
  });
  form.assets = assets.map(
    (over, i) =>
      ({
        ...(i === 0 ? form.assets[0] : makeDefaultAsset(i + 1)),
        addressJibun: i === 0 ? form.assets[0].addressJibun : "서울 강남구 테스트동 1-1",
        assetId: `a${i}`,
        ...over,
      }) as AssetForm,
  );
  Object.assign(form, extra);
  return form;
}

/** 축 B 둘째 카드 = 화면이 만드는 카드(makeDefaultAsset + ③ 이하 입력). 판정 선언·승계 표지는 미입력. */
function axisBCard2(over: Partial<AssetForm> = {}): Partial<AssetForm> {
  const blank = makeDefaultAsset(2);
  return {
    assetKind: blank.assetKind,
    isSuccessorRightToMoveIn: blank.isSuccessorRightToMoveIn,
    acquisitionCause: "purchase",
    acquisitionDate: "2008-01-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2016-06-01",
    redevOriginalAssetType: "housing",
    redevRightsValue: "900000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "50000000",
    redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "400000000",
    ...HALF,
    ...over,
  } as Partial<AssetForm>;
}

type Prop = { propertyId: string; acquisitionPrice: number; determinedTax: number; redevelopmentDetail?: unknown };
async function calc(form: TransferFormData) {
  const r = await runCalc(form);
  const agg = r.json?.data?.aggregated as { totalTax: number; properties: Prop[] } | undefined;
  const single = r.result as { totalTax: number; acquisitionPrice: number } | undefined;
  return {
    status: r.status,
    issues: r.issues,
    body: r.body as { companionAssets?: { fixedAcquisitionPrice?: number }[] },
    totalTax: agg?.totalTax ?? single?.totalTax,
    props: agg?.properties ?? [],
  };
}
const redevProp = (props: Prop[]) => props.find((p) => p.redevelopmentDetail !== undefined);

describe("원조합원 입주권 컴패니언 — 취득가액은 §166 칸 (숨은 fixedAcquisitionPrice 무시)", () => {
  // S3 — 순서를 바꾼 기준: 원조합원 입주권이 주 자산이면 주 자산 ④가 §166 칸을 읽는다
  const S3 = () => calc(mkForm([ORIG_RIGHT, HOUSE], COMPANION_FORM));

  it("OC-1 주택 주 + 원조합원 입주권 컴패니언: ⑧ 통과 · route 200 · ④ 취득가액 4억 · 표시 취득가액 5억(§166 역산) · 순서를 바꾼 값과 같다", async () => {
    const ref = await S3();
    expect(ref.status).toBe(200);
    expect(ref.totalTax).toBe(267_003_000);

    const r = await calc(mkForm([HOUSE, ORIG_RIGHT], COMPANION_FORM));
    expect(r.issues.map((i) => i.message)).toEqual([]);
    expect(r.body.companionAssets?.[0]?.fixedAcquisitionPrice).toBe(400_000_000);
    expect(r.status).toBe(200);
    // 표시 취득가액은 단건 신고서와 같은 §166 역산(종전 취득가 400,000,000 + 납부 청산금 100,000,000) —
    // `transfer.route.redev-aggregate-display-acquisition.anchor` RA-4. 입력이 §166 칸에서 오는지는 위 ④ 단언이 지킨다.
    expect(redevProp(r.props)?.acquisitionPrice).toBe(500_000_000);
    expect(r.totalTax).toBe(ref.totalTax);
  });

  it.each(["1", "999999999"])("OC-2 숨은 fixedAcquisitionPrice에 옛 값 %s이 남아 있어도 결과가 같다", async (stale) => {
    const r = await calc(mkForm([HOUSE, { ...ORIG_RIGHT, fixedAcquisitionPrice: stale }], COMPANION_FORM));
    expect(r.status).toBe(200);
    expect(r.body.companionAssets?.[0]?.fixedAcquisitionPrice).toBe(400_000_000);
    expect(r.totalTax).toBe(267_003_000);
  });

  it("OC-3 원조합원 완공APT 컴패니언: 표시 취득가액 5억(§166 역산 — 종전 4억 + 청산금 1억) · 순서를 바꾼 값과 같다 · 옛 값 무시", async () => {
    const ref = await calc(mkForm([ORIG_APT, HOUSE], { ...COMPANION_FORM, householdHousingCount: "2" }));
    expect(ref.status).toBe(200);

    const form = (stale: string) =>
      mkForm([HOUSE, { ...ORIG_APT, fixedAcquisitionPrice: stale }], { ...COMPANION_FORM, householdHousingCount: "2" });
    const r = await calc(form(""));
    expect(r.issues.map((i) => i.message)).toEqual([]);
    expect(r.status).toBe(200);
    expect(redevProp(r.props)?.acquisitionPrice).toBe(500_000_000);
    expect(r.totalTax).toBe(ref.totalTax);
    expect((await calc(form("1"))).totalTax).toBe(ref.totalTax);
    expect((await calc(form("999999999"))).totalTax).toBe(ref.totalTax);
  });

  it("OC-4 축 B 원조합원 50/50 화면 모양: 둘째 카드도 200 · 카드마다 표시 취득가액 2.5억(§166 역산 — 종전 2억 + 청산금 5천만) · 단건 100%와 세액이 같다", async () => {
    const single = await calc(mkForm([ORIG_RIGHT], { contractTotalPrice: "1000000000" } as never));
    expect(single.status).toBe(200);
    expect(single.totalTax).toBe(0);

    const axisB = (stale: string) =>
      mkForm(
        [{ ...ORIG_RIGHT, ...HALF, redevSettlementAmount: "50000000" }, axisBCard2({ fixedAcquisitionPrice: stale })],
        { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never,
      );
    const r = await calc(axisB(""));
    expect(r.issues.map((i) => i.message)).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.props.map((p) => p.acquisitionPrice)).toEqual([250_000_000, 250_000_000]);
    expect(r.totalTax).toBe(single.totalTax);
    const stale = await calc(axisB("1"));
    expect(stale.status).toBe(200);
    expect(stale.totalTax).toBe(single.totalTax);
  });

  it("OC-5 승계조합원 완공APT 컴패니언은 종전대로 숨은 칸이 아니라 상단 fixedAcquisitionPrice를 읽는다", async () => {
    const SUCC_APT: Partial<AssetForm> = {
      ...ORIG_APT,
      redevIsSuccessorMember: "yes",
      fixedAcquisitionPrice: "450000000",
      redevActualAcquisitionPrice: "1",
    };
    const r = await calc(mkForm([HOUSE, SUCC_APT], { ...COMPANION_FORM, householdHousingCount: "2" }));
    expect(r.body.companionAssets?.[0]?.fixedAcquisitionPrice).toBe(450_000_000);
  });
});

describe("원조합원 입주권 컴패니언 × 환산(§166③) — ⑧ 통과 ↔ ⑩ 400 모순 없음", () => {
  const EST: Partial<AssetForm> = {
    ...ORIG_RIGHT,
    useEstimatedAcquisition: true,
    redevActualAcquisitionPrice: "",
    redevManagementDisposalHousingPrice: "300000000",
    redevAcquisitionHousingPrice: "100000000",
  } as Partial<AssetForm>;

  it("OE-1 환산 컴패니언도 200 · 순서를 바꾼 값과 같다 (숨은 기준시가 칸을 요구하지 않는다)", async () => {
    const ref = await calc(mkForm([EST, HOUSE], COMPANION_FORM));
    expect(ref.status).toBe(200);
    const r = await calc(mkForm([HOUSE, { ...EST, standardPriceAtTransfer: "" }], COMPANION_FORM));
    expect(r.issues.map((i) => i.message)).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(ref.totalTax);
  });
});
