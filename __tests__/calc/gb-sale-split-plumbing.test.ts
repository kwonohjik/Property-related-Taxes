/**
 * anchor — 일반건물 구분양도 **배관** (Phase 2-D · ④⑧⑫⑭)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §6 · §16
 *
 * ## 무엇을 잡는가
 *
 * 엔진 anchor(G-1~G-6)는 `GeneralBuildingInput`을 직접 만들어 넣는다. 그래서 **폼에서 그
 * input까지 값이 실제로 도달하는지**는 검증하지 못한다 — ⑫ Zod가 스키마에 없는 키를 조용히
 * 버리면(strip) 기능은 없는 것과 같다(메모리 `feedback_api_zod_schema_sync`).
 *
 * ⇒ 폼 → **④ `buildGeneralBuildingValuation`** → **⑫ `generalBuildingValuationSchema`** →
 *   엔진까지 한 번에 통과시킨다.
 *
 * ⚠️ ⑭는 `general-building-route-helper.ts:243-246`이 `{ ...gbv, isSelfBuilt }`로 **스프레드**해
 *    `buildGeneralBuildingAssetCards`에 넘기므로 명시 나열이 없다 — Zod를 통과하면 엔진에 닿는다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { generalBuildingValuationSchema } from "@/lib/api/transfer-tax-building-schemas";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 사례 31 기반 — 안분값 토지 904,725,192 / 건물 20,274,808 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "1999-05-24",
    actualSalePrice: "925,000,000",
    useEstimatedAcquisition: true,
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10,830,000",
    gbTransferBuildingValue: "20,629,440",
    gbAcqLandPricePerSqm: "2,800,000",
    gbAcqBuildingValue: "28,144,700",
    gbBuildingAcquisitionCause: "purchase",
    gbZoneType: "commercial",
    gbIsMetropolitan: true,
    ...over,
  } as AssetForm;
}

const SPLIT = {
  saleSplitMode: "actual" as const,
  landTransferPrice: "900,000,000",
  buildingTransferPrice: "25,000,000",
};

const payloadOf = (a: AssetForm) => buildGeneralBuildingValuation(a) as Record<string, unknown>;

/** ⑫ Zod → 엔진까지 실제로 통과시킨다 (캐스팅으로 건너뛰면 그 구간이 검증에서 빠진다) */
function throughSchemaToEngine(payload: Record<string, unknown>) {
  const parsed = generalBuildingValuationSchema.parse(payload);
  return buildGeneralBuildingAssetCards({
    ...parsed,
    totalTransferPrice: 925_000_000,
    transferDate: new Date("2023-02-19"),
    acquisitionDate: new Date("1999-05-24"),
  } as Parameters<typeof buildGeneralBuildingAssetCards>[0]);
}

describe("④ — 구분양도 게이트", () => {
  it("구분양도면 3필드를 전송한다", () => {
    const p = payloadOf(asset({ ...SPLIT, saleSplitExemption: "other_law" } as Partial<AssetForm>));
    expect(p.landTransferPrice).toBe(900_000_000);
    expect(p.buildingTransferPrice).toBe(25_000_000);
    expect(p.saleSplitExemption).toBe("other_law");
  });

  it("일괄양도로 되돌리면 전송하지 않는다 — 잔존 입력값이 새어나가지 않는다", () => {
    const p = payloadOf(asset({ ...SPLIT, saleSplitMode: "apportioned" }));
    expect(p.landTransferPrice).toBeUndefined();
    expect(p.buildingTransferPrice).toBeUndefined();
  });

  it("🔴 `saleSplitMode` 자체는 전송하지 않는다 — 엔진이 읽지 않는 플래그다 (Q-7)", () => {
    expect(payloadOf(asset(SPLIT)).saleSplitMode).toBeUndefined();
  });
});

describe("⑫⑭ — Zod가 버리지 않고 엔진에 닿는다", () => {
  it("🔴 Zod가 3필드를 strip하지 않는다", () => {
    const parsed = generalBuildingValuationSchema.parse(
      payloadOf(asset({ ...SPLIT, saleSplitExemption: "other_law" } as Partial<AssetForm>)),
    );
    expect(parsed.landTransferPrice).toBe(900_000_000);
    expect(parsed.buildingTransferPrice).toBe(25_000_000);
    expect(parsed.saleSplitExemption).toBe("other_law");
  });

  it("🔴 엔진 계산 결과가 구분값을 쓴다 (범위 안이라 그대로 적용)", () => {
    const out = throughSchemaToEngine(payloadOf(asset(SPLIT)));
    expect(out.allocation.land).toBe(900_000_000);
    expect(out.allocation.building).toBe(25_000_000);
    expect(out.saleSplitJudgment?.deemedUnclear).toBe(false);
  });

  it("일괄양도는 종전 안분값 그대로다 (회귀 0)", () => {
    const out = throughSchemaToEngine(payloadOf(asset()));
    expect(out.allocation.land).toBe(904_725_192);
    expect(out.allocation.building).toBe(20_274_808);
    expect(out.saleSplitJudgment).toBeUndefined();
  });

  it("30% 초과 구분값은 엔진이 안분으로 되돌린다 (§100③이 배관 끝까지 살아 있다)", () => {
    const out = throughSchemaToEngine(
      payloadOf(asset({ ...SPLIT, landTransferPrice: "825,000,000", buildingTransferPrice: "100,000,000" })),
    );
    expect(out.allocation.land).toBe(904_725_192);
    expect(out.saleSplitJudgment?.deemedUnclear).toBe(true);
  });
});

describe("④⑫ — 감정평가가액 축", () => {
  const APPRAISAL = {
    landAppraisalAtTransfer: "400,000,000",
    buildingAppraisalAtTransfer: "525,000,000",
    appraisalDateAtTransfer: "2022-06-01",
  } as Partial<AssetForm>;

  it("🔴 모드와 무관하게 전송한다 — 일괄양도의 안분 basis이기도 하다", () => {
    const p = payloadOf(asset(APPRAISAL)); // saleSplitMode 기본값(일괄)
    expect(p.landAppraisalAtTransfer).toBe(400_000_000);
    expect(p.buildingAppraisalAtTransfer).toBe(525_000_000);
    expect(p.appraisalDateAtTransfer).toBe("2022-06-01");
  });

  it("Zod가 3필드를 strip하지 않는다", () => {
    const parsed = generalBuildingValuationSchema.parse(payloadOf(asset(APPRAISAL)));
    expect(parsed.landAppraisalAtTransfer).toBe(400_000_000);
    expect(parsed.appraisalDateAtTransfer).toBe("2022-06-01");
  });

  it("감정 입력이 없으면 payload에도 없다 — 빈 값을 지어내지 않는다", () => {
    const p = payloadOf(asset());
    expect(p.landAppraisalAtTransfer).toBeUndefined();
    expect(p.appraisalDateAtTransfer).toBeUndefined();
  });
});

describe("⑧ — validate 차단 규칙", () => {
  const v = (a: AssetForm) => validateGeneralBuildingAsset(a, "자산 1");

  it("정상 조합은 통과한다", () => {
    expect(v(asset(SPLIT))).toBeNull();
  });

  /**
   * 🔴 합계 검증은 **validate가 하지 않는다** — 이 함수는 자산 하나만 받는데 단건 일반건물의
   *    총 양도가액은 폼-전역 `contractTotalPrice`에서 온다(`transfer-tax-api.ts:232-238`).
   *    `asset.actualSalePrice`로 검증하면 엉뚱한 값과 비교하게 되므로 엔진이 담당한다.
   */
  it("합이 총액과 달라도 validate는 통과한다 — 총액을 모르기 때문이다", () => {
    expect(v(asset({ ...SPLIT, buildingTransferPrice: "30,000,000" }))).toBeNull();
  });

  it("🔴 대신 엔진이 차단한다 — 합계가 어긋난 채 계산되면 조용한 오답이다", () => {
    expect(() =>
      throughSchemaToEngine(payloadOf(asset({ ...SPLIT, buildingTransferPrice: "30,000,000" }))),
    ).toThrow(/총 양도가액.*과 다릅니다/);
  });

  it("한쪽만 입력하면 합계 검증을 걸지 않는다 — 나머지는 도출된다(S-8)", () => {
    expect(v(asset({ saleSplitMode: "actual", landTransferPrice: "900,000,000" }))).toBeNull();
  });

  /**
   * ⚠️ 증축 필수 필드를 **다 채운 뒤** 검증한다. 비워 두면 「증축일을 입력하세요」가 먼저 걸려
   *    이 규칙에 도달조차 못 하는데, 메시지에 「증축」이 들어 있어 `toContain("증축")`이
   *    **거짓 통과**한다(2026-08-06 실측 — 처음 작성이 그랬다).
   */
  const EXTENSION_FILLED = {
    gbHasExtension: true,
    gbExtensionDate: "2010-05-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "5,000,000",
    gbAcquisitionExtensionBuildingStdPrice: "4,000,000",
  } as Partial<AssetForm>;

  /**
   * 🔴 **증축 차단은 Q-4 확정으로 해제됐다**(2026-08-06). 건물 구분값을 본체·증축에
   *    **양도 당시 기준시가 비율**로 나눈다 — 그 외의 방법이 없다는 것이 확정 사항이다.
   */
  it("증축 + 구분 기재는 이제 통과한다 (Q-4)", () => {
    expect(v(asset({ ...SPLIT, ...EXTENSION_FILLED }))).toBeNull();
  });

  it("증축이라도 일괄양도면 당연히 통과한다", () => {
    expect(v(asset({ ...EXTENSION_FILLED, saleSplitMode: "apportioned" }))).toBeNull();
  });

  it("🔴 증축 + **감정평가가액**은 차단한다 — 건물을 다시 나눌 근거가 감정에는 없다", () => {
    const msg = v(
      asset({
        ...SPLIT,
        ...EXTENSION_FILLED,
        landAppraisalAtTransfer: "400,000,000",
        buildingAppraisalAtTransfer: "525,000,000",
      }),
    );
    expect(msg).toContain("감정평가가액으로 안분할 수 없습니다");
  });

  it("부담부증여 조합은 차단한다 (S-11)", () => {
    const msg = v(asset({ ...SPLIT, transferType: "burdened_gift" } as Partial<AssetForm>));
    expect(msg).toBeTruthy();
  });

  it("§166⑧ 예외를 켜고 근거를 비우면 차단한다 (R-5)", () => {
    expect(v(asset({ ...SPLIT, saleSplitExemption: "other_law" } as Partial<AssetForm>))).toContain(
      "근거를 입력하세요",
    );
  });

  it("근거를 채우면 통과한다", () => {
    expect(
      v(asset({ ...SPLIT, saleSplitExemption: "other_law", saleSplitExemptionNote: "계약서 특약" } as Partial<AssetForm>)),
    ).toBeNull();
  });

  it("🔴 감정일자를 비워도 통과한다 — 시기 요건을 검증하지 않는다 (Q-9)", () => {
    expect(
      v(asset({ landAppraisalAtTransfer: "400,000,000", buildingAppraisalAtTransfer: "525,000,000" })),
    ).toBeNull();
  });

  it("한쪽 가액만 넣으면 차단한다", () => {
    const msg = v(asset({ landAppraisalAtTransfer: "400,000,000", appraisalDateAtTransfer: "2022-06-01" }));
    expect(msg).toContain("양쪽 모두");
  });

  it("감정 3필드를 다 채우면 통과한다", () => {
    expect(
      v(
        asset({
          landAppraisalAtTransfer: "400,000,000",
          buildingAppraisalAtTransfer: "525,000,000",
          appraisalDateAtTransfer: "2022-06-01",
        }),
      ),
    ).toBeNull();
  });

  it("일괄양도로 되돌리면 예외 근거를 비워도 통과한다 — 전송되지 않으므로", () => {
    expect(
      v(asset({ ...SPLIT, saleSplitMode: "apportioned", saleSplitExemption: "other_law" } as Partial<AssetForm>)),
    ).toBeNull();
  });
});
