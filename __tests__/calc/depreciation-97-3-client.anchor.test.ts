/**
 * anchor — §97③ 감가상각비 클라이언트 축 (⑤ 게이트 · ⑥ 사이드바 · ⑧ validate · ④ API 변환)
 *
 * 계획서: `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §3.2·§4
 *
 * 입력 가능 범위의 단일 술어(`depreciation-scope.ts`)를 ⑤ 입력 게이트와 ⑧ validate가 함께 쓴다.
 * 받을 수 없는 구조에서는 값이 남아 있어도 **차단**한다(조용히 계산에서 빠지는 것을 막는다).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { depreciationSupport } from "@/lib/calc/depreciation-scope";
import { validateDepreciation } from "@/lib/calc/transfer-tax-validate-depreciation";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-09-10",
    actualSalePrice: "500000000",
    fixedAcquisitionPrice: "300000000",
    addressJibun: "서울 강남구 테스트동 1-1",
    ...over,
  }) as AssetForm;

const formOf = (a: AssetForm): TransferFormData =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: "2026-06-03",
    filingDate: "2026-08-31",
    contractTotalPrice: "500000000",
    totalTransferExpense: "0",
    assets: [a],
  }) as unknown as TransferFormData;

// ── ⑤·⑧ 단일 술어 ──────────────────────────────────────────────────
describe("C0-1 depreciationSupport — 입력 가능 범위", () => {
  it("🔴 건물이 있는 자산 종류는 열린다", () => {
    for (const assetKind of ["housing", "building", "commercial_building"] as const) {
      expect(depreciationSupport(asset({ assetKind })).status, assetKind).toBe("ok");
    }
  });

  it("🔴 일반건물(토지+건물 일괄)은 건물분으로 열린다 — 토지·건물 분리 취득이어도 같은 칸", () => {
    expect(depreciationSupport(asset({ assetKind: "general_building" })).status).toBe("ok");
    expect(
      depreciationSupport(
        asset({ assetKind: "general_building", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2018-01-01" }),
      ).status,
    ).toBe("ok");
  });

  it("건물이 없는 자산(토지·분양권·입주권·재개발)은 해당 없음 — 칸도 고지도 없다", () => {
    for (const assetKind of ["land", "presale_right", "right_to_move_in", "redevelopment_apt"] as const) {
      expect(depreciationSupport(asset({ assetKind })).status, assetKind).toBe("not_applicable");
    }
  });

  it("🔴 받을 수 없는 구조는 unsupported + 이유 (조용히 숨기지 않는다)", () => {
    const cases: [string, Partial<AssetForm>][] = [
      ["부담부증여(전이)", { transferType: "burdened_gift" }],
      ["부담부증여(구)", { acquisitionCause: "burdened_gift" }],
      ["이월과세", { acquisitionCause: "carryover_gift" }],
      ["겸용주택", { assetKind: "housing", isMixedUseHouse: true }],
      ["다필지", { parcelMode: true }],
      ["PHD", { usePreHousingDisclosure: true }],
      ["토지·건물 별개 취득", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2018-01-01" }],
      ["일부 양도", { areaScenario: "partial" }],
      ["일반건물 부담부증여", { assetKind: "general_building", transferType: "burdened_gift" }],
      ["일반건물 이월과세(자산)", { assetKind: "general_building", acquisitionCause: "carryover_gift" }],
      ["일반건물 이월과세(건물 파트)", { assetKind: "general_building", gbBuildingAcquisitionCause: "carryover_gift" }],
    ];
    for (const [name, over] of cases) {
      const s = depreciationSupport(asset(over));
      expect(s.status, name).toBe("unsupported");
      if (s.status === "unsupported") expect(s.reason.length, name).toBeGreaterThan(10);
    }
  });
});

describe("C0-2 validateDepreciation — ⑧", () => {
  it("긍정 짝 — 0·빈 값은 어떤 구조에서도 통과", () => {
    expect(validateDepreciation(asset({ depreciationAmount: "0" }), "자산")).toBeNull();
    expect(validateDepreciation(asset({ depreciationAmount: "" }), "자산")).toBeNull();
    expect(validateDepreciation(asset({ assetKind: "land", depreciationAmount: "0" }), "자산")).toBeNull();
  });

  it("열린 구조 + 정상 값은 통과", () => {
    expect(validateDepreciation(asset({ depreciationAmount: "40000000" }), "자산")).toBeNull();
  });

  it("🔴 건물이 없는 자산에 남은 값은 막지 않는다 — 칸도 안내도 없는 상태에서 막으면 막다른 길(자산 종류를 바꾼 stale 값)", () => {
    expect(validateDepreciation(asset({ assetKind: "land", depreciationAmount: "1000" }), "자산")).toBeNull();
    expect(validateDepreciation(asset({ assetKind: "presale_right", depreciationAmount: "1000" }), "자산")).toBeNull();
  });

  it("🔴 받을 수 없는 구조에 값이 남아 있으면 차단", () => {
    const m = validateDepreciation(asset({ acquisitionCause: "carryover_gift", depreciationAmount: "1000" }), "자산");
    expect(m).toContain("이월과세");
    expect(m).toContain("0으로 지우세요");
  });

  it("🔴 매매 실가에서 취득가액보다 크면 차단", () => {
    const m = validateDepreciation(asset({ depreciationAmount: "300000001" }), "자산");
    expect(m).toContain("취득가액");
    expect(validateDepreciation(asset({ depreciationAmount: "300000000" }), "자산")).toBeNull();
  });

  it("일반건물은 건물분 취득가액을 알 수 없어 한도를 보지 않는다(엔진이 원건물 카드 취득가액까지로 절삭)", () => {
    expect(
      validateDepreciation(asset({ assetKind: "general_building", depreciationAmount: "999999999" }), "자산"),
    ).toBeNull();
  });

  it("환산 모드는 취득가액을 알 수 없어 한도를 보지 않는다(엔진이 절삭)", () => {
    expect(
      validateDepreciation(asset({ useEstimatedAcquisition: true, depreciationAmount: "999999999" }), "자산"),
    ).toBeNull();
  });

  it("validateAssetEntry가 이 검증을 호출한다 (자산 단계 차단)", () => {
    const a = asset({ assetKind: "building", acquisitionCause: "carryover_gift", depreciationAmount: "5000" });
    const msg = validateAssetEntry(a, 0, formOf(a));
    // 이월과세는 취득 검증이 먼저 막을 수 있다 — 어느 쪽이든 차단된다는 점만 고정한다.
    expect(msg).not.toBeNull();
    const ok = asset({ depreciationAmount: "300000001" });
    expect(validateAssetEntry(ok, 0, formOf(ok))).toContain("취득가액");
  });
});

// ── ④ API 변환 ────────────────────────────────────────────────────
describe("C0-3 ④ 전송 — 단건 body", () => {
  function capture() {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        captured.body = JSON.parse(String(init?.body));
        return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
      }),
    );
    return captured;
  }

  it("🔴 값이 있으면 depreciationAmount를 싣는다", async () => {
    const cap = capture();
    await callTransferTaxAPI(formOf(asset({ depreciationAmount: "40000000" })));
    expect(cap.body?.depreciationAmount).toBe(40_000_000);
  });

  it("긍정 짝 — 0·미입력이면 키를 보내지 않는다(종전과 같은 body)", async () => {
    const cap = capture();
    await callTransferTaxAPI(formOf(asset({ depreciationAmount: "0" })));
    expect(cap.body?.depreciationAmount).toBeUndefined();
  });

  it("🔴 건물이 없는 자산·받을 수 없는 구조의 stale 값은 보내지 않는다 (엔진이 토지 취득가액에서 빼면 안 된다)", async () => {
    for (const over of [
      { assetKind: "land" as const },
      { acquisitionCause: "carryover_gift" as const },
      { areaScenario: "partial" as const },
    ]) {
      const cap = capture();
      await callTransferTaxAPI(formOf(asset({ ...over, depreciationAmount: "40000000" })));
      expect(cap.body?.depreciationAmount, JSON.stringify(over)).toBeUndefined();
    }
  });

  it("지분 모드 — 100% 기준 입력 × 지분율 (취득가액·자본적지출과 같은 규칙)", async () => {
    const cap = capture();
    await callTransferTaxAPI(
      formOf(
        asset({
          ownershipNumerator: "50",
          ownershipDenominator: "100",
          ownershipRemainderThirdParty: "yes",
          depreciationAmount: "40000000",
        }),
      ),
    );
    expect(cap.body?.depreciationAmount).toBe(20_000_000);
  });
});

describe("C0-4 ④ 전송 — 다건(multi) payload", () => {
  it("🔴 다건도 같은 값을 싣는다 (⑭ 키 열거와 짝)", () => {
    const p = buildPropertyPayload(formOf(asset({ depreciationAmount: "40000000" })));
    expect(p.depreciationAmount).toBe(40_000_000);
  });

  it("긍정 짝 — 0이면 undefined", () => {
    const p = buildPropertyPayload(formOf(asset({ depreciationAmount: "0" })));
    expect(p.depreciationAmount).toBeUndefined();
  });

  it("🔴 건물이 없는 자산의 stale 값은 다건에서도 보내지 않는다", () => {
    const p = buildPropertyPayload(formOf(asset({ assetKind: "land", depreciationAmount: "40000000" })));
    expect(p.depreciationAmount).toBeUndefined();
  });
});

// ── ⑥ 사이드바 ────────────────────────────────────────────────────
describe("C0-5 ⑥ 사이드바 — 취득가액은 공제 후 값", () => {
  const rowOf = (a: AssetForm) =>
    computeTransferPerAssetSummary(formOf(a), { mode: "single", result: null } as never).rows[0];

  it("🔴 실가 300,000,000 − 감가상각비 40,000,000 = 260,000,000", () => {
    expect(rowOf(asset({ depreciationAmount: "40000000" })).acqPrice).toBe(260_000_000);
  });

  it("긍정 짝 — 감가상각비 없으면 종전 값", () => {
    expect(rowOf(asset()).acqPrice).toBe(300_000_000);
  });

  it("받을 수 없는 구조(이월과세)의 stale 값은 빼지 않는다 — 엔진도 공제하지 않는다", () => {
    const row = rowOf(asset({ acquisitionCause: "carryover_gift", depreciationAmount: "40000000" }));
    expect(row.acqPrice).not.toBe(260_000_000);
  });
});
