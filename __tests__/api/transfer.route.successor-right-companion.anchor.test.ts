/**
 * anchor — **승계조합원 입주권 컴패니언**(함께 양도 / 축 B 지분 둘째 카드)이 주 자산과 같은 §97①1호 가목 분기를 타는가.
 *
 * ## 🔴 결함 (2026-10-20 실측)
 *
 * 승계조합원 입주권은 「조합에 기존건물·부수토지를 제공하고 취득한」 조합원(영 §166①)이 아니라 일반 분기(§97①1호 가목)다.
 * §95② 괄호로 장기보유특별공제가 배제되고, 감정가 모드면 §163⑥ 개산공제가 붙는다.
 * 주 자산 ④(`transfer-tax-api-primary-context.ts`)는 승계 입주권에 `redevelopment` 페이로드를 만들지 않고, 취득가액·§165① 기준시가를
 * 승계 전용 칸에서 읽고, `isSuccessorRightToMoveIn`을 엔진까지 싣는다. **컴패니언 ④(`transfer-tax-api-companion-payload.ts`)는
 * 이 셋이 전부 없었다** — 무조건 §166 서브객체를 만들고, 취득가액은 숨은 `fixedAcquisitionPrice`만, 기준시가는 숨은
 * `standardPriceAtAcq`만 읽었다.
 *
 * | 모드 | 종전 | 정답 |
 * |---|---|---|
 * | 실가 | 400 (숨은 `fixedAcquisitionPrice` 필수) | 주 자산과 같은 값 |
 * | 감정가 | 200 오답 (개산공제 base 0 · §166 3분할) | 주 자산과 같은 값 |
 *
 * ⚠️ 함정: `redevelopment`만 빼면 엔진이 일반 주택으로 읽어 장특 32,000,000이 붙는다(242,979,000 — 과소).
 *    `isSuccessorRightToMoveIn`을 ⑬(payload)·⑫(스키마)·⑭(엔진 input) 세 곳이 함께 실어야 한다.
 *
 * 폼 → ④ 변환(`callTransferTaxAPI`) → route → 엔진 전 구간을 지난다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 승계 입주권 — 실가: 승계취득가 5억 + 추가분담금 1억 = 취득가액 6억. 숨은 `fixedAcquisitionPrice`는 일부러 다른 값(stale)을 둔다. */
const SUCC_ACTUAL: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2020-03-01",
  redevApprovalDate: "2018-05-01",
  successorRightAcqPrice: "500000000",
  successorRightAddedContribution: "100000000",
  fixedAcquisitionPrice: "123000000",
  standardPriceAtAcq: "77000000", // 숨은 일반 칸(stale) — 승계는 §165① 전용 칸을 읽는다
  actualSalePrice: "1000000000",
  standardPriceAtTransfer: "800000000",
  useEstimatedAcquisition: false,
};
/** 감정가 — 감정가액 6억(`fixedAcquisitionPrice`) + §165① 취득시 기준시가 = 납입 4억 + 프리미엄 1억. 숨은 `standardPriceAtAcq`는 stale. */
const SUCC_APPRAISAL: Partial<AssetForm> = {
  ...SUCC_ACTUAL,
  isAppraisalAcquisition: true,
  fixedAcquisitionPrice: "600000000",
  successorRightStdPaidAtAcq: "400000000",
  successorRightStdPremiumAtAcq: "100000000",
};
/** 환산 — 취득시 §165① 5억 · 양도시 §165① 납입 6억 + 프리미엄 2억 = 8억. */
const SUCC_ESTIMATED: Partial<AssetForm> = {
  ...SUCC_ACTUAL,
  standardPriceAtTransfer: "777000000", // 숨은 일반 칸(stale) — 환산 분모는 아래 승계 전용 칸 합(8억)
  useEstimatedAcquisition: true,
  successorRightStdPaidAtAcq: "400000000",
  successorRightStdPremiumAtAcq: "100000000",
  successorRightStdPaidAtTransfer: "600000000",
  successorRightStdPremiumAtTransfer: "200000000",
};
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

function mkForm(assets: Partial<AssetForm>[], extra: Partial<TransferFormData>): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.householdHousingCount = "2";
  form.isOneHousehold = false;
  form.bundledSaleMode = "actual";
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

interface Run {
  /** ④가 만든 컴패니언 body 항목(주 자산이 승계면 비어 있다) — 지점별 payload 단언용. */
  companions: Array<Record<string, unknown>>;
  status: number;
  totalTax?: number;
  props: Array<{ id: string; lthd: number; hasRedevDetail: boolean; acq: number }>;
  stepIssues: string[];
}

async function run(form: TransferFormData): Promise<Run> {
  const stepIssues: string[] = [];
  // 자산 카드 단위 차단만 본다 — 세대 단위 사실 확인(보유 주택·분양권·입주권 명부)은 이 anchor의 대상이 아니다.
  for (let s = 0; s <= 4; s++) {
    stepIssues.push(
      ...collectStepIssues(s, form)
        .filter((x) => x.assetIndex !== undefined)
        .map((x) => `s${s}:a${x.assetIndex}:${x.message}`),
    );
  }
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = await res.json();
  const d = json.data ?? {};
  const companions = (cap.body?.companionAssets as Array<Record<string, unknown>> | undefined) ?? [];
  if (d.aggregated) {
    return {
      companions,
      status: res.status,
      totalTax: d.aggregated.totalTax,
      stepIssues,
      props: d.aggregated.properties.map((p: Record<string, number | string | object | undefined>) => ({
        id: p.propertyId as string,
        lthd: p.longTermHoldingDeduction as number,
        hasRedevDetail: !!p.redevelopmentDetail,
        acq: p.acquisitionPrice as number,
      })),
    };
  }
  const r = d.result ?? {};
  return {
    companions,
    status: res.status,
    totalTax: r.totalTax,
    stepIssues,
    props: [{ id: "single", lthd: r.longTermHoldingDeduction, hasRedevDetail: !!r.redevelopmentDetail, acq: r.acquisitionPrice }],
  };
}

const single = (succ: Partial<AssetForm>) => mkForm([succ], { contractTotalPrice: "1000000000" });
/** 축 B — 같은 입주권을 50/50 지분으로 나눈 두 카드(둘 다 승계). */
const axisB = (succ: Partial<AssetForm>) =>
  mkForm([{ ...succ, ...HALF }, { ...succ, ...HALF }], { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never);
/** 함께 양도 — 주택 + 승계 입주권 (승계가 둘째 = 컴패니언 / 첫째 = 주 자산). */
const housePrimary = (succ: Partial<AssetForm>) =>
  mkForm([HOUSE, succ], { contractTotalPrice: "1600000000", assetSplitMode: "companion" } as never);
const succPrimary = (succ: Partial<AssetForm>) =>
  mkForm([succ, HOUSE], { contractTotalPrice: "1600000000", assetSplitMode: "companion" } as never);

describe("승계조합원 입주권 컴패니언 — 주 자산과 같은 §97①1호 가목 분기 (anchor)", () => {
  describe("실가 모드 (승계 2칸 합 = 취득가액 6억)", () => {
    it("A1 단건 = 146,366,000 (기준선)", async () => {
      const r = await run(single(SUCC_ACTUAL));
      expect(r.status).toBe(200);
      expect(r.stepIssues).toEqual([]);
      expect(r.totalTax).toBe(146_366_000);
      expect(r.props[0].lthd).toBe(0);
      expect(r.props[0].hasRedevDetail).toBe(false);
    });
    it("A2 축 B 50/50 = A1과 같은 146,366,000 (종전 400)", async () => {
      const r = await run(axisB(SUCC_ACTUAL));
      expect(r.stepIssues).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.totalTax).toBe(146_366_000);
      for (const p of r.props) {
        expect(p.lthd).toBe(0);
        expect(p.hasRedevDetail).toBe(false);
      }
      // 취득가액 6억을 50/50 — 숨은 stale 123,000,000이 아니라 승계 2칸 합
      expect(r.props.map((p) => p.acq)).toEqual([300_000_000, 300_000_000]);
      // ⑬ payload — §166 서브객체 없음 · 승계 표지 · 승계 2칸 합(×지분율)
      expect(r.companions).toHaveLength(1);
      expect(r.companions[0].redevelopment).toBeUndefined();
      expect(r.companions[0].isSuccessorRightToMoveIn).toBe(true);
      expect(r.companions[0].fixedAcquisitionPrice).toBe(300_000_000);
    });
    it("B1 주택 주 + 승계 컴패니언 = B2(승계 주 + 주택 컴패니언)와 같은 257,763,000 (종전 400)", async () => {
      const b2 = await run(succPrimary(SUCC_ACTUAL));
      const b1 = await run(housePrimary(SUCC_ACTUAL));
      expect(b2.status).toBe(200);
      expect(b2.totalTax).toBe(257_763_000);
      expect(b1.stepIssues).toEqual([]);
      expect(b1.status).toBe(200);
      expect(b1.totalTax).toBe(257_763_000);
      const succ = b1.props.find((p) => p.id === "a1")!;
      expect(succ.lthd).toBe(0);
      expect(succ.hasRedevDetail).toBe(false);
      expect(succ.acq).toBe(600_000_000);
      expect(b1.companions[0].redevelopment).toBeUndefined();
      expect(b1.companions[0].isSuccessorRightToMoveIn).toBe(true);
      expect(b1.companions[0].fixedAcquisitionPrice).toBe(600_000_000);
    });
  });

  describe("감정가 모드 (감정가액 6억 + §165① 취득시 기준시가 5억 → 개산공제 §163⑥)", () => {
    it("A1 단건 = 144,166,000 (기준선)", async () => {
      const r = await run(single(SUCC_APPRAISAL));
      expect(r.status).toBe(200);
      expect(r.totalTax).toBe(144_166_000);
    });
    it("A2 축 B 50/50 = A1과 같은 144,166,000 (종전 200 오답 145,266,000)", async () => {
      const r = await run(axisB(SUCC_APPRAISAL));
      expect(r.stepIssues).toEqual([]);
      expect(r.status).toBe(200);
      expect(r.totalTax).toBe(144_166_000);
      for (const p of r.props) {
        expect(p.lthd).toBe(0);
        expect(p.hasRedevDetail).toBe(false);
      }
    });
    it("B1 주택 주 + 승계 컴패니언 = B2와 같은 255,453,000 (종전 200 오답 257,763,000)", async () => {
      const b2 = await run(succPrimary(SUCC_APPRAISAL));
      const b1 = await run(housePrimary(SUCC_APPRAISAL));
      expect(b2.status).toBe(200);
      expect(b2.totalTax).toBe(255_453_000);
      expect(b1.stepIssues).toEqual([]);
      expect(b1.status).toBe(200);
      expect(b1.totalTax).toBe(255_453_000);
      const succ = b1.props.find((p) => p.id === "a1")!;
      expect(succ.lthd).toBe(0);
      expect(succ.hasRedevDetail).toBe(false);
      // ⑬ payload — 개산공제 base는 §165① 취득시 기준시가(납입 4억 + 프리미엄 1억), 숨은 일반 칸(7천7백만)이 아니다
      expect(b1.companions[0].redevelopment).toBeUndefined();
      expect(b1.companions[0].standardPriceAtAcquisition).toBe(500_000_000);
      expect(b1.companions[0].acquisitionMethod).toBe("appraisal");
    });
  });

  describe("환산 모드 (§176의2②2호 — 양도시 §165① 기준시가가 환산 분모)", () => {
    it("주 자산 ↔ 컴패니언 ↔ 축 B 세 경로가 같은 값", async () => {
      const a1 = await run(single(SUCC_ESTIMATED));
      const a2 = await run(axisB(SUCC_ESTIMATED));
      const b2 = await run(succPrimary(SUCC_ESTIMATED));
      const b1 = await run(housePrimary(SUCC_ESTIMATED));
      expect(a1.status).toBe(200);
      expect(a1.totalTax).toBe(ESTIMATED_A1);
      expect(a2.stepIssues).toEqual([]);
      expect(a2.status).toBe(200);
      expect(a2.totalTax).toBe(a1.totalTax);
      expect(b2.status).toBe(200);
      expect(b1.stepIssues).toEqual([]);
      expect(b1.status).toBe(200);
      expect(b1.totalTax).toBe(b2.totalTax);
      // ⑬ payload — 환산 분자·분모는 §165① 승계 전용 칸(5억 / 8억), 숨은 일반 칸(7천7백만 / 7억7천7백만)이 아니다
      expect(b1.companions[0].redevelopment).toBeUndefined();
      expect(b1.companions[0].standardPriceAtAcquisition).toBe(500_000_000);
      expect(b1.companions[0].standardPriceAtTransfer).toBe(800_000_000);
      expect(a2.companions[0].standardPriceAtTransfer).toBe(800_000_000);
    });
  });
});

/** 환산 기준선 — 아래 단건 값을 실측 후 고정한다. */
const ESTIMATED_A1 = 133_166_000;
