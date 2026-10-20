/**
 * 일반건물 파트 카드 leaf(`buildGbPartCards`) — 동반·축 B에 자산 단위 실지 취득가액·필요경비 전달.
 *
 * 계획서: `docs/00-pm/gb-parts-actual-acq-exp.plan.md`
 *
 * 종전에는 단건만 `route.ts`에서 두 값을 넘기고, leaf를 공유하는 동반·축 B는 넘기지 않았다.
 *   · 실가 분기 — 자본적지출·양도비가 없으면 필요경비 NaN → 500, 있으면 분리 OFF 취득가액 0(과대과세)
 *   · 환산 분기(증축) — 원건물 일괄 실가 주입이 없어 입력한 실가가 무시되고 환산으로 계산
 *
 * 폼 → ④ → ⑬ fetch body → ⑫ Zod → ⑭ route 전 구간을 탄다(fetch를 가로채 body를 그대로 route에 넣는다).
 * 세액은 mock 세율표 기준 고정값이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()),
  preloadTaxRates: vi.fn(),
}));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

// ── 픽스처 ────────────────────────────────────────────────────────────
// 토지 100㎡ · 건물 200㎡ · 바닥 50㎡ · 일반주거 · 양도일 2024-03-01
// 취득시 기준시가 토지 1억 · 건물 1억 ⇒ 분리 OFF 일괄 실가 3억은 토지·건물 1.5억씩.
const LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "150000000",
  actualSalePrice: "300000000",
};

/** 분리 OFF · 매매 · 자산 단위 실가 3억 — 결함이 가장 단순하게 드러나는 시료. */
const GB_OFF: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2015-01-01",
  acquisitionCause: "purchase",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  useEstimatedAcquisition: false,
  fixedAcquisitionPrice: "300000000",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000",
  gbZoneType: "general_residential",
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};

/** 증축(2019-06-01 신축) — 원건물은 위 일괄 실가. */
const EXT: Partial<AssetForm> = {
  gbBuildingAcquisitionCause: "purchase",
  gbHasExtension: true,
  gbExtensionDate: "2019-06-01",
  gbExtensionAcquisitionCause: "newConstruction",
  gbExtensionAcquisitionMode: "estimated",
  gbTransferExtensionBuildingStdPrice: "40000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000",
};

const asset = (n: number, ...over: Partial<AssetForm>[]) =>
  Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;

const baseForm = (contract: string) => {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-03-01";
  f.filingDate = "2024-05-31";
  f.contractTotalPrice = contract;
  return f;
};

/** 동반(함께 양도) — 토지 + 일반건물. 양도가액은 자산별 실가 3억·6억. */
function companion(...gb: Partial<AssetForm>[]): TransferFormData {
  const f = baseForm("900000000");
  f.assetSplitMode = "companion" as never;
  f.bundledSaleMode = "actual";
  f.assets = [asset(1, LAND), asset(2, GB_OFF, { actualSalePrice: "600000000" }, ...gb)];
  return f;
}

/** 축 B — 같은 일반건물 50% + 50%. `secondAcq`가 없으면 두 지분 취득일이 같다. */
function axisB(gb: Partial<AssetForm>, secondAcq?: Partial<AssetForm>): TransferFormData {
  const f = baseForm("600000000");
  const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
  f.assets = [asset(1, GB_OFF, gb, half), asset(2, GB_OFF, gb, half, secondAcq ?? {})];
  return f;
}

/** 단건 100% — 축 B 동치의 정본. */
function single(gb: Partial<AssetForm>): TransferFormData {
  const f = baseForm("600000000");
  f.assets = [asset(1, GB_OFF, gb)];
  return f;
}

type Prop = { propertyId: string; acquisitionPrice: number; necessaryExpense: number };

async function run(f: TransferFormData) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  const issues = [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f));
  return {
    status: res.status,
    issues,
    body: body as Record<string, unknown>,
    total: json.data?.aggregated?.totalTax as number | undefined,
    props: (json.data?.aggregated?.properties ?? []) as Prop[],
  };
}

/** 일반건물 파트 카드(토지 1001·건물 3001·증축 3002)만 — 동반의 주 자산 토지 카드는 뺀다. */
const gbCards = (r: Awaited<ReturnType<typeof run>>) =>
  r.props.filter((p) => /#/.test(p.propertyId)).map((p) => [p.acquisitionPrice, p.necessaryExpense]);

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("동반 일반건물 — 자산 단위 실가 취득가액·필요경비", () => {
  it("D 분리 OFF · 경비 없음 — 500이 아니라 취득가액 1.5억 + 1.5억", async () => {
    const r = await run(companion());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[150_000_000, 0], [150_000_000, 0]]);
    expect(r.total).toBe(150_766_000);
  });

  it("E 자본적지출 100만 — 취득가액이 0으로 새지 않는다(종전 262,004,160)", async () => {
    const r = await run(companion({ capitalExpenditure: "1000000" }));
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[150_000_000, 500_000], [150_000_000, 500_000]]);
    expect(r.total).toBe(150_405_200);
  });

  it("E2 예전 필요경비 칸 100만 — 자본적지출과 같은 세액", async () => {
    const r = await run(companion({ directExpenses: "1000000" }));
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[150_000_000, 500_000], [150_000_000, 500_000]]);
    expect(r.total).toBe(150_405_200);
  });

  it("C 분리 ON · 파트 실가 매매 — 파트 값이 그대로", async () => {
    const r = await run(
      companion({
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2008-01-01",
        acquisitionDate: "2023-06-01",
        gbBuildingAcquisitionCause: "purchase",
        fixedAcquisitionPrice: "",
        landAcquisitionPrice: "200000000",
        buildingAcquisitionPrice: "90000000",
      }),
    );
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[200_000_000, 0], [90_000_000, 0]]);
    expect(r.total).toBe(190_003_000);
  });

  it("A 토지·건물 상속 — 500이 아니라 상속 평가액", async () => {
    const r = await run(
      companion({
        hasSeperateLandAcquisitionDate: true,
        landAcquisitionDate: "2008-01-01",
        acquisitionDate: "2023-06-01",
        acquisitionCause: "inheritance",
        decedentAcquisitionDate: "2000-01-01",
        publishedValueAtInheritance: "200000000",
        gbBuildingAcquisitionCause: "inheritance",
        gbBuildingInheritedValue: "90000000",
        gbBuildingDecedentAcquisitionDate: "2000-01-01",
        fixedAcquisitionPrice: "",
      }),
    );
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[200_000_000, 0], [90_000_000, 0]]);
    expect(r.total).toBe(165_726_000);
  });

  it("K1 증축 · 원건물 실가 3억 — 환산으로 떨어지지 않는다(종전 143,916,879 = 환산 시료와 같은 값)", async () => {
    const r = await run(companion(EXT));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[150_000_000, 0], [150_000_000, 0], [40_909_092, 900_000]]);
    expect(r.total).toBe(136_241_680);
  });

  it("K1b 증축 일괄 취득 경비 전용 칸 — 엔진 입력 경비가 아니라 그 칸이 원건물에 안분된다(단건과 같은 우선순위)", async () => {
    const r = await run(companion(EXT, { gbBundledAcquisitionExpenses: "2000000" }));
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[150_000_000, 1_000_000], [150_000_000, 1_000_000], [40_909_092, 900_000]]);
  });

  it("K2 증축 · 원건물 환산 — 종전과 같다(회귀 대조군)", async () => {
    const r = await run(companion(EXT, { fixedAcquisitionPrice: "", useEstimatedAcquisition: true }));
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([[136_363_636, 3_000_000], [136_363_636, 3_000_000], [40_909_092, 900_000]]);
    expect(r.total).toBe(143_916_879);
  });
});

describe("축 B 일반건물 지분 — 지분별 자산 단위 실가 취득가액·필요경비", () => {
  it("④ 지분 페이로드가 지분별 취득가액·필요경비(× 지분율)를 싣는다", async () => {
    const r = await run(axisB({ directExpenses: "1000000" }));
    const shares = r.body.generalBuildingShares as { acquisitionPrice: number; expenses: number }[];
    expect(shares.map((s) => [s.acquisitionPrice, s.expenses])).toEqual([
      [150_000_000, 500_000],
      [150_000_000, 500_000],
    ]);
  });

  it("Y1 분리 ON · 파트 실가 · 경비 없음 — 500이 아니다", async () => {
    const r = await run(
      axisB(
        {
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionDate: "2008-01-01",
          acquisitionDate: "2023-06-01",
          gbBuildingAcquisitionCause: "purchase",
          fixedAcquisitionPrice: "",
          landAcquisitionPrice: "200000000",
          buildingAcquisitionPrice: "90000000",
        },
        { acquisitionDate: "2023-09-01" },
      ),
    );
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual([
      [100_000_000, 0], [45_000_000, 0],
      [100_000_000, 0], [45_000_000, 0],
    ]);
    expect(r.total).toBe(126_269_000);
  });

  it("Y3 분리 OFF + 자본적지출 — 카드 4장 취득가액이 0이 아니다(종전 244,072,620)", async () => {
    const r = await run(axisB({ capitalExpenditure: "1000000" }, { acquisitionDate: "2023-09-01" }));
    expect(r.status).toBe(200);
    expect(gbCards(r)).toEqual(Array(4).fill([75_000_000, 250_000]));
    expect(r.total).toBe(111_063_150);
  });

  it("동치 — 같은 날 취득한 50+50은 단건 100%와 같은 세액(경비 없음 · 예전 필요경비 칸)", async () => {
    for (const gb of [{}, { directExpenses: "1000000" }]) {
      const s = await run(single(gb));
      const b = await run(axisB(gb));
      expect(b.issues).toEqual([]);
      expect(b.status).toBe(200);
      expect(s.status).toBe(200);
      expect(b.total).toBe(s.total);
    }
  });

  it("동치 — 증축 · 원건물 실가도 단건 100%와 같은 세액(종전 73,342,336 ≠ 66,050,895)", async () => {
    const s = await run(single(EXT));
    const b = await run(axisB(EXT));
    expect(b.status).toBe(200);
    expect(s.total).toBe(66_050_895);
    expect(b.total).toBe(66_050_895);
    const s2 = await run(single({ ...EXT, gbBundledAcquisitionExpenses: "2000000" }));
    const b2 = await run(axisB({ ...EXT, gbBundledAcquisitionExpenses: "2000000" }));
    expect(b2.status).toBe(200);
    expect(b2.total).toBe(s2.total);
    expect(b2.total).not.toBe(b.total);
  });
});
