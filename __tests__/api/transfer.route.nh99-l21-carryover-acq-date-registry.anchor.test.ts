/**
 * route anchor — 이월과세(`carryover_gift`) 자산의 취득일 = 증여 등기접수일 (레인 L21 · 사용자 결정 2026-11-08).
 *
 * 화면에 취득일 칸이 없는 이월과세 자산에 매매 때 입력한 옛 `acquisitionDate`가 남아 있으면, 종전 leaf(`carryoverAcquisitionDateFallback`)는
 * `acquisitionDate || 등기접수일`이라 잔재가 이겼다. 재개발 원조합원 이월과세에서 잔재가 인가 전이고 등기접수일이 인가 뒤이면 ⑧·⑫를 모두 통과해
 * 원조합원 산식으로 200 390,819,000(완공 APT)·443,998,500(입주권)이 나왔다. 이제 leaf가 등기접수일만 읽는다(읽는 쪽 정규화).
 *
 * 모든 셀에서 ⑧(`collectStepIssues`)과 ⑫(route 응답)를 같이 단언한다 — ⑧ 통과 ⇔ ⑫ 통과. 세율: route 폴백(`makeMockRates`).
 * 법령: 소득세법 시행령 §162①5호 «상속 또는 증여에 의하여 취득한 자산에 대하여는 그 상속이 개시된 날 또는 증여를 받은 날» — 등기접수일로 본다는 것은 사용자 결정.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc, postTransfer, houseRow } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { carryoverAcquisitionDateFallback, primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const ORIG_APT = {
  assetKind: "redevelopment_apt", isSuccessorRightToMoveIn: false, redevSubject: "apt", redevIsSuccessorMember: "no", acquisitionCause: "purchase", acquisitionDate: "2008-01-01",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2016-06-01", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "0", redevActualAcquisitionPrice: "400000000",
  redevExemptionEligibleAtApproval: "", redevPriorHouseHoldingMonths: "60", redevPriorHouseResidenceMonths: "36",
} as unknown as Partial<AssetForm>;
const HOUSE = {
  assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000",
  standardPriceAtTransfer: "400000000", useEstimatedAcquisition: false,
} as unknown as Partial<AssetForm>;
const CAR = (giftRegistryDate: string) => ({
  giftRegistryDate, donorAcquisitionDate: "2000-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
  estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "2000-01-01",
  donorRelation: "spouse",
});

function mkForm(assets: Partial<AssetForm>[], extra: Record<string, unknown> = {}): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.filingDate = "2024-08-31";
  form.householdHousingCount = "0";
  form.isOneHousehold = true;
  form.bundledSaleMode = "actual";
  Object.assign(form, { householdRightCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "60" });
  form.assets = assets.map(
    (over, i) =>
      ({
        ...(i === 0 ? form.assets[0] : makeDefaultAsset(i + 1)),
        addressJibun: i === 0 ? form.assets[0].addressJibun : "제주특별자치도 강남구 테스트동 1-1",
        assetId: `a${i}`,
        ...over,
      }) as AssetForm,
  );
  if (assets.length > 1) Object.assign(form, { contractTotalPrice: "1600000000", assetSplitMode: "companion", householdHousingCount: "1", isOneHousehold: false });
  Object.assign(form, extra);
  return rosterForDeclaredCount(form);
}

type Pos = "main" | "companion";
const asset = (kind: "apt" | "right" | "house", acquisitionDate: string, giftRegistryDate: string): Partial<AssetForm> => {
  const base = kind === "house" ? HOUSE : kind === "apt" ? ORIG_APT : { ...ORIG_APT, assetKind: "right_to_move_in", redevSubject: "right" };
  return { ...base, acquisitionCause: "carryover_gift", acquisitionDate, fixedAcquisitionPrice: "", acquisitionPrice: "100000000", carryover: CAR(giftRegistryDate) } as unknown as Partial<AssetForm>;
};
const place = (a: Partial<AssetForm>, pos: Pos, kind: string) =>
  mkForm(pos === "main" ? [a, HOUSE] : [HOUSE, a], kind === "house" ? { contractTotalPrice: "1200000000" } : {});
const wireAcq = (body: unknown, pos: Pos) =>
  pos === "main" ? (body as { acquisitionDate?: string }).acquisitionDate : (body as { companionAssets?: { acquisitionDate?: string }[] }).companionAssets?.[0]?.acquisitionDate;
const approvalPath = (pos: Pos) => (pos === "main" ? "redevelopment.approvalDate" : "companionAssets.0.redevelopment.approvalDate");
const totalOf = (r: { json?: { data?: { aggregated?: { totalTax: number } } } }) => r.json?.data?.aggregated?.totalTax;

/** 측정값 — 인가(2016-06-01) 전 등기접수일(2012-03-01) 총세액. 수정 전 잔재가 이겼을 때 2017 등기접수일은 390,819,000 / 443,998,500이었다. */
const REDEV_TAX = { apt: { gift2012: 353_859_000, gift2017: 390_819_000 }, right: { gift2012: 412_995_000, gift2017: 443_998_500 } } as const;

for (const pos of ["main", "companion"] as const) {
  for (const kind of ["apt", "right"] as const) {
    describe(`재개발 원조합원 이월과세 ${kind === "apt" ? "완공 APT" : "입주권"} · ${pos === "main" ? "주 자산" : "함께 양도"} — 취득일 = 등기접수일 (잔재 무시)`, () => {
      const order = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => /인가일은 취득일 이후여야 합니다/.test(i.message));
      it("잔재 없음 · 등기접수일 인가 전(2012-03-01) → ⑧·⑫ 통과 · 와이어 = 등기접수일", async () => {
        const r = await runCalc(place(asset(kind, "", "2012-03-01"), pos, kind));
        expect(wireAcq(r.body, pos)).toBe("2012-03-01");
        expect(r.issues).toEqual([]);
        expect(r.status).toBe(200);
        expect(totalOf(r)).toBe(REDEV_TAX[kind].gift2012);
      });
      it("잔재 없음 · 등기접수일 인가 뒤(2017-03-01) → ⑧ 차단 1건 · ⑫ 400", async () => {
        const r = await runCalc(place(asset(kind, "", "2017-03-01"), pos, kind));
        expect(wireAcq(r.body, pos)).toBe("2017-03-01");
        expect(order(r)).toHaveLength(1);
        expect(r.status).toBe(400);
        expect(Object.keys(r.json?.error?.fieldErrors ?? {})).toContain(approvalPath(pos));
      });
      it("🔑 잔재 인가 전(2012-03-01) · 등기접수일 인가 뒤(2017-03-01) → ⑧ 차단 · ⑫ 400 (수정 전 둘 다 통과해 원조합원 산식 200이었다)", async () => {
        const r = await runCalc(place(asset(kind, "2012-03-01", "2017-03-01"), pos, kind));
        expect(wireAcq(r.body, pos)).toBe("2017-03-01");
        expect(order(r)).toHaveLength(1);
        expect(r.status).toBe(400);
        expect(Object.keys(r.json?.error?.fieldErrors ?? {})).toContain(approvalPath(pos));
        expect(totalOf(r)).toBeUndefined();
      });
      it("🔑 잔재 인가 뒤(2017-03-01) · 등기접수일 인가 전(2012-03-01) → ⑧·⑫ 통과 (수정 전 둘 다 차단)", async () => {
        const r = await runCalc(place(asset(kind, "2017-03-01", "2012-03-01"), pos, kind));
        expect(wireAcq(r.body, pos)).toBe("2012-03-01");
        expect(r.issues).toEqual([]);
        expect(r.status).toBe(200);
        expect(totalOf(r)).toBe(REDEV_TAX[kind].gift2012);
      });
      it("잔재 = 등기접수일 → 변화 없음: ⑧·⑫ 통과", async () => {
        const r = await runCalc(place(asset(kind, "2012-03-01", "2012-03-01"), pos, kind));
        expect(r.issues).toEqual([]);
        expect(r.status).toBe(200);
        expect(totalOf(r)).toBe(REDEV_TAX[kind].gift2012);
      });
      it("등기접수일 비움 + 잔재(2012-03-01) → 잔재로 대신 채우지 않는다: 와이어 취득일 비어 있음 · ⑧ 차단(등기접수일 입력) · ⑫ 400", async () => {
        const r = await runCalc(place(asset(kind, "2012-03-01", ""), pos, kind));
        expect(wireAcq(r.body, pos) || "").toBe("");
        expect(r.issues.some((i) => i.field === "carryover.giftRegistryDate")).toBe(true);
        expect(r.status).toBe(400);
      });
    });
  }
}

describe("⑫ — API 직접 호출에서 와이어 acquisitionDate ≠ carryoverTaxation.giftRegistryDate (재개발 인가 순서는 등기접수일 기준)", () => {
  for (const pos of ["main", "companion"] as const) {
    const post = async (gift: string, wireAcqValue: string) => {
      const r = await runCalc(place(asset("apt", "", gift), pos, "apt"));
      const body = JSON.parse(JSON.stringify(r.body));
      if (pos === "main") body.acquisitionDate = wireAcqValue;
      else body.companionAssets[0].acquisitionDate = wireAcqValue;
      return postTransfer(body);
    };
    it(`${pos} · 등기접수일 인가 전(2012) + 와이어 취득일 인가 뒤(2017/2022) → 200 ${REDEV_TAX.apt.gift2012.toLocaleString()} (수정 전 400)`, async () => {
      for (const w of ["2017-03-01", "2022-01-01"]) {
        const p = await post("2012-03-01", w);
        expect(p.status).toBe(200);
        expect(totalOf(p)).toBe(REDEV_TAX.apt.gift2012);
      }
    });
    it(`${pos} · 등기접수일 인가 뒤(2017) + 와이어 취득일 인가 전(2005/2012) → 400 ${approvalPath(pos)} (수정 전 200 ${REDEV_TAX.apt.gift2017.toLocaleString()})`, async () => {
      for (const w of ["2005-01-01", "2012-03-01"]) {
        const p = await post("2017-03-01", w);
        expect(p.status).toBe(400);
        expect(Object.keys(p.json?.error?.fieldErrors ?? {})).toContain(approvalPath(pos));
      }
    });
    it(`${pos} · 엔진 세액은 와이어 취득일이 아니라 등기접수일을 읽는다 — 와이어 2005·2012 어느 쪽이든 등기접수일 2012면 같은 세액`, async () => {
      const a = await post("2012-03-01", "2005-01-01");
      const b = await post("2012-03-01", "2012-03-01");
      expect(totalOf(a)).toBe(REDEV_TAX.apt.gift2012);
      expect(totalOf(b)).toBe(REDEV_TAX.apt.gift2012);
    });
    it(`${pos} · 비재개발 이월과세 주택은 와이어 취득일을 바꿔도 세액 불변 248,523,000 (엔진이 등기접수일을 읽음)`, async () => {
      const f = () => (pos === "main" ? mkForm([asset("house", "", "2012-03-01"), HOUSE], { contractTotalPrice: "1200000000" }) : mkForm([HOUSE, asset("house", "", "2012-03-01")], { contractTotalPrice: "1200000000" }));
      const r = await runCalc(f());
      for (const w of ["2005-01-01", "2017-03-01", "2022-01-01"]) {
        const body = JSON.parse(JSON.stringify(r.body));
        if (pos === "main") body.acquisitionDate = w;
        else body.companionAssets[0].acquisitionDate = w;
        const p = await postTransfer(body);
        expect(p.status).toBe(200);
        expect(totalOf(p)).toBe(248_523_000);
      }
    });
  }
});

describe("일반 주택 이월과세 — 잔재 ≠ 등기접수일: 와이어·명부 양도 행 = 등기접수일, 세액 불변", () => {
  const cells: [string, string, string, number][] = [
    ["잔재 2010 · 등기 2019", "2010-01-01", "2019-03-01", 280_863_000],
    ["잔재 2019 · 등기 2010", "2019-03-01", "2010-01-01", 239_283_000],
  ];
  for (const [name, acq, gift, tax] of cells) {
    for (const pos of ["main", "companion"] as const) {
      it(`${name} · ${pos} → 와이어 취득일 = 등기접수일 · ⑧·⑫ 통과 · 세액 ${tax.toLocaleString()} (수정 전과 동일)`, async () => {
        const r = await runCalc(place(asset("house", acq, gift), pos, "house"));
        expect(wireAcq(r.body, pos)).toBe(gift);
        expect(r.issues).toEqual([]);
        expect(r.status).toBe(200);
        expect(totalOf(r)).toBe(tax);
      });
    }
    it(`${name} · 보유 주택 명부(h1 2016-01-01) → 양도 행 취득일 = 등기접수일 · 세액 불변`, async () => {
      const form = mkForm([asset("house", acq, gift)], {
        contractTotalPrice: "600000000", assetSplitMode: undefined, houses: [houseRow("h1", "2016-01-01")], householdHousingCount: "2", isOneHousehold: true,
      });
      const r = await runCalc(form);
      const sel = (r.body as { houses?: { id: string; acquisitionDate: string }[] }).houses?.find((h) => h.id === "selling");
      expect(sel?.acquisitionDate).toBe(gift);
      expect((r.body as { acquisitionDate?: string }).acquisitionDate).toBe(gift);
      expect(r.status).toBe(200);
    });
  }
  it("등기접수일 비움 + 잔재 → ⑧ 차단(증여 등기접수일 입력) · ⑫ 400 — 잔재로 채우지 않는다", async () => {
    const r = await runCalc(place(asset("house", "2012-03-01", ""), "main", "house"));
    expect(r.issues.some((i) => i.field === "carryover.giftRegistryDate")).toBe(true);
    expect(r.status).toBe(400);
  });
});

describe("leaf — 이월과세 취득일 규칙 (주 자산·컴패니언·분리·⑧·명부·§155①이 같은 leaf를 읽는다)", () => {
  const mk = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift", carryover: CAR("2012-03-01"), ...over }) as unknown as AssetForm;
  it("비-일반건물: 잔재가 있어도 등기접수일", () => {
    for (const kind of ["housing", "land", "building", "right_to_move_in", "presale_right", "commercial_building", "redevelopment_apt"]) {
      const a = mk({ assetKind: kind, acquisitionDate: "2020-05-05" });
      expect(carryoverAcquisitionDateFallback(a)).toBe("2012-03-01");
      expect(primaryAcquisitionDateOf(a)).toBe("2012-03-01");
    }
  });
  it("등기접수일 비면 \"\" (잔재로 대신 채우지 않는다)", () => {
    expect(carryoverAcquisitionDateFallback(mk({ acquisitionDate: "2020-05-05", carryover: CAR("") }))).toBe("");
  });
  it("비이월과세는 그대로 acquisitionDate", () => {
    expect(primaryAcquisitionDateOf(mk({ acquisitionCause: "purchase", acquisitionDate: "2020-05-05" }))).toBe("2020-05-05");
  });
  it("일반건물은 종전 동작 유지(분리 ON이면 «건물 취득일» 칸이 화면에 있다) — 별건", () => {
    const gb = mk({ assetKind: "general_building", acquisitionDate: "2020-05-05", hasSeperateLandAcquisitionDate: true });
    expect(carryoverAcquisitionDateFallback(gb)).toBe("2020-05-05");
    expect(carryoverAcquisitionDateFallback(mk({ assetKind: "general_building", acquisitionDate: "" }))).toBe("2012-03-01");
  });
});
