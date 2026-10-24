/**
 * anchor — «취득시 기준시가» 칸 중복 렌더 제거 (PHD × 비환산 PR-2 후속, 계획서 §9.3)
 *
 * 증상: 주택·건물 + 감정가액·매매사례가액 + 「토지·건물 분리」(같은 취득일)에서 `[data-field="standardPriceAtAcq"]` 가 2개 —
 *   `CompanionAcqAmountSection`(감정 칸)·`SalesCaseSection`(매매사례 칸)과 `CompanionAcqStdPriceSection`(분리 입력 블록)이 함께 그렸다.
 * 처리: 분리 입력 블록 쪽 칸을 남긴다(㎡당 단가·면적·공시가격 조회·소유자 분리 칸 등 그쪽에만 있는 입력 보존) + 개산공제 기준액 hint 합침 +
 *   «환산 개별주택가격 계산해 채우기» 보조 카드는 남는 칸 곁에 1개.
 *
 *   G1 격자 골든 — 종류 × 방식 × 분리(OFF / ON 같은 날 / ON 다른 날): 칸 수 (수정 전 실측에서 중복 4칸만 2→1, 나머지 32칸 불변)
 *   G2 불변식 — 종류 5 × 방식 4 × 분리 3 × 소유 2 × PHD 플래그 2: 칸 ≤ 1 · 보조 카드 ≤ 1
 *   G3 보존 — 남는 칸에 합쳐진 hint · 보조 카드 위치 · 그쪽에만 있던 입력 · 접힌 쪽의 다른 입력(감정가액·매매사례가액·면적·자동조회)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { LUMP_SUM_DEDUCTION_BASE_HINT, PRE_DISCLOSURE_STD_PRICE_HINT } from "@/components/calc/transfer/pre-disclosure-std-hint";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-03-01";
const SEVEN: Partial<AssetForm> = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdBuildingStdPriceAtFirst: "61000000",
  acquisitionArea: "100",
};
const METHOD = {
  actual: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  est: { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  app: { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false },
  sales: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: true },
} as const;
type MethodId = keyof typeof METHOD;
type SplitId = "off" | "same" | "diff";
const splitOf = (sp: SplitId): Partial<AssetForm> =>
  sp === "off" ? {} : { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: sp === "same" ? "2003-01-10" : "2002-01-10" };

function Harness({ init, nonPrimary = false, blockProps = {} }: { init: Partial<AssetForm>; nonPrimary?: boolean; blockProps?: Record<string, unknown> }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    addressJibun: "서울 테스트동 1",
    fixedAcquisitionPrice: "300000000",
    similarSalesValue: "300000000",
    standardPriceAtAcq: "",
    standardPriceAtTransfer: "400000000",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
    <>
      <span data-testid="probe" data-std={asset.standardPriceAtAcq ?? ""} data-first-price={asset.phdFirstDisclosureHousingPrice} data-flag={String(asset.usePreHousingDisclosure)} />
      <CompanionAcqPurchaseBlock
        acquisitionDate={asset.acquisitionDate}
        onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
        useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
        onUseEstimatedChange={(v) => patch({ useEstimatedAcquisition: v })}
        isAppraisalAcquisition={!!asset.isAppraisalAcquisition}
        isSalesCaseAcquisition={!!asset.isSalesCaseAcquisition}
        fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
        onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
        similarSalesValue={asset.similarSalesValue ?? ""}
        onSimilarSalesValueChange={(v) => patch({ similarSalesValue: v })}
        standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
        onStandardPriceAtAcqChange={(v) => {
          patch({ standardPriceAtAcq: v });
        }}
        standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
        onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
        assetKind={asset.assetKind}
        transferDate={TD}
        jibun={asset.addressJibun}
        acquisitionArea={asset.acquisitionArea}
        onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
        hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
        onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
        landAcquisitionDate={asset.landAcquisitionDate}
        onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
        selfOwns={asset.selfOwns ?? "both"}
        onSelfOwnsChange={(v) => patch({ selfOwns: v })}
        isNonPrimaryAsset={nonPrimary}
        asset={asset}
        onAssetChange={patch}
        {...blockProps}
      />
    </>
  );
}

const stdCount = () => document.querySelectorAll('[data-field="standardPriceAtAcq"]').length;
const fillCount = () => screen.queryAllByTestId("phd-fill-assist").length;
const count = (field: string) => document.querySelectorAll(`[data-field="${field}"]`).length;
const mount = (kind: string, m: MethodId, sp: SplitId, extra: Partial<AssetForm> = {}, blockProps: Record<string, unknown> = {}) =>
  render(<Harness init={{ ...SEVEN, ...METHOD[m], assetKind: kind as AssetForm["assetKind"], ...splitOf(sp), ...extra }} blockProps={blockProps} />);

/** 수정 전 실측(2026-10-24, 같은 하네스): 종류 × 방식 × 분리 → 칸 수. housing·building 의 app/sales × same 만 2 였다(아래 ★). */
const GOLDEN: Record<string, [number, number, number]> = {
  // [off, same, diff]
  "housing/actual": [0, 1, 0],
  "housing/est": [0, 0, 0],
  "housing/app": [1, 1, 0], // ★ same 은 2 → 1
  "housing/sales": [1, 1, 0], // ★ same 은 2 → 1
  "building/actual": [0, 1, 0],
  "building/est": [1, 1, 0],
  "building/app": [1, 1, 0], // ★ same 은 2 → 1
  "building/sales": [1, 1, 0], // ★ same 은 2 → 1
  "land/actual": [0, 0, 0],
  "land/est": [1, 1, 1],
  "land/app": [1, 1, 1],
  "land/sales": [1, 1, 1],
};

describe("G1 격자 골든 — 종류 × 방식 × 분리", () => {
  for (const [key, row] of Object.entries(GOLDEN)) {
    const [kind, m] = key.split("/") as [string, MethodId];
    (["off", "same", "diff"] as const).forEach((sp, i) => {
      it(`${key} · 분리=${sp} → 취득시 기준시가 칸 ${row[i]}개`, () => {
        mount(kind, m, sp);
        expect(stdCount()).toBe(row[i]);
      });
    });
  }
});

describe("G1b 칸이 0개가 되지 않는다 — 분리 입력 블록의 칸이 닫힌 상태(양 파트 실거래가)", () => {
  // 파트 라디오를 둘 다 실거래가로 고르고 두 파트 취득가액을 직접 입력하면 취득시 기준시가는 계산에 쓰이지 않아 분리 입력 블록의 칸이 닫힌다(`acqStdPriceRequired` false).
  // 자산 전체 감정·매매사례 칸이 종전대로 남아야 한다 — 부모가 «저쪽이 맡는다»를 알리는 조건에 이 술어가 빠지면 두 칸이 모두 사라진다.
  it.each(["app", "sales"] as const)("주택 %s · 양 파트 실거래가 · 같은 날 분리 → 칸 1개(자산 전체 칸)", (m) => {
    mount("housing", m, "same", { landAcqMode: "actual", buildingAcqMode: "actual" }, { landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "200000000" });
    expect(stdCount()).toBe(1);
    expect(screen.queryAllByText("취득시 기준시가 (원) — 개산공제 기준액")).toHaveLength(1);
  });
});

describe("G2 불변식 — 칸 ≤ 1 · 보조 카드 ≤ 1", () => {
  const KINDS = ["housing", "building", "land", "general_building", "commercial_building"];
  for (const kind of KINDS) {
    for (const m of Object.keys(METHOD) as MethodId[]) {
      for (const sp of ["off", "same", "diff"] as const) {
        for (const own of ["both", "land_only"] as const) {
          for (const flag of [false, true]) {
            it(`${kind}/${m}/${sp}/${own}/phd=${flag}`, () => {
              mount(kind, m, sp, { selfOwns: own, usePreHousingDisclosure: flag });
              expect(stdCount()).toBeLessThanOrEqual(1);
              expect(fillCount()).toBeLessThanOrEqual(1);
            });
          }
        }
      }
    }
  }
});

describe("G3 보존 — 합쳐진 칸", () => {
  const std = () => document.querySelector('[data-field="standardPriceAtAcq"]') as HTMLElement;
  const text = () => document.body.textContent ?? "";
  /** 「취득시 기준시가 (원) *」 블록 — StdPriceSection 이 라벨(필수 표식)·칸·보조 카드·소유자 분리 칸을 한 덩어리로 그린다 */
  const block = () => {
    let el: HTMLElement | null = std();
    while (el && !el.querySelector('[data-testid="acq-std-required-mark"]')) el = el.parentElement;
    return el as HTMLElement;
  };
  const occurrences = (needle: string) => text().split(needle).length - 1;

  it.each(["app", "sales"] as const)("주택 %s × 분리(같은 날): 개산공제 기준액 hint + 안분 hint + 환산 개별주택가격 hint 가 남는 칸 하나에 모두 있다", (m) => {
    mount("housing", m, "same");
    expect(occurrences(LUMP_SUM_DEDUCTION_BASE_HINT)).toBe(1);
    expect(occurrences("토지·건물 안분 비율 산정 기준 (§166⑥)")).toBe(1);
    expect(occurrences(PRE_DISCLOSURE_STD_PRICE_HINT)).toBe(1);
    expect(text()).not.toContain("추정");
  });

  it.each(["app", "sales"] as const)("주택 %s × 분리(같은 날): 보조 카드는 남는 칸 바로 곁(같은 블록)에 1개", (m) => {
    mount("housing", m, "same");
    expect(block().contains(screen.getByTestId("phd-fill-assist"))).toBe(true);
  });

  it.each(["app", "sales"] as const)("건물 %s × 분리(같은 날): ㎡당 단가·면적 입력(남는 칸에만 있던 입력)이 살아 있다", (m) => {
    mount("building", m, "same");
    expect(screen.queryAllByText("㎡당 단가 (원/㎡)")).toHaveLength(1);
    expect(count("acquisitionArea")).toBe(1);
    expect(occurrences(LUMP_SUM_DEDUCTION_BASE_HINT)).toBe(1);
  });

  it("주택 감정 × 분리(같은 날): 공시가격 조회 버튼(남는 칸 쪽 위젯)이 그 블록에 살아 있다", () => {
    const lookups = () => Array.from(block().querySelectorAll("button")).filter((b) => b.textContent === "공시가격 조회").length;
    mount("housing", "actual", "same"); // 종전에도 이 블록 하나만 그려지던 경로 — 기준
    const baseline = lookups();
    expect(baseline).toBeGreaterThan(0);
    cleanup();
    mount("housing", "app", "same");
    expect(lookups()).toBe(baseline);
  });

  it("소유자 분리(토지만) 주택 감정 × 분리(같은 날): 취득시 토지 공시지가 칸이 1개 — 칸이 늘거나 줄지 않는다", () => {
    mount("housing", "app", "same", { selfOwns: "land_only" });
    expect(count("standardPricePerSqmAtAcq")).toBe(1);
    expect(stdCount()).toBe(1);
  });

  it("접힌 쪽의 다른 입력은 그대로 — 감정가액 칸 1개", () => {
    mount("housing", "app", "same");
    expect(count("fixedAcquisitionPrice")).toBe(1);
  });

  it("접힌 쪽의 다른 입력은 그대로 — 매매사례가액 칸·취득 당시 면적·RTMS 자동조회 버튼", () => {
    mount("housing", "sales", "same");
    expect(count("similarSalesValue")).toBe(1);
    expect(screen.queryAllByTestId("sales-case-acq-area")).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "실거래가 자동조회 (RTMS)" })).toHaveLength(1);
  });

  it("분리 OFF(비분리) 감정·매매사례는 종전 그대로 — 라벨에 «개산공제 기준액», 칸은 AmountSection/SalesCaseSection 쪽 1개", () => {
    mount("housing", "app", "off");
    expect(screen.queryAllByText("취득시 기준시가 (원) — 개산공제 기준액")).toHaveLength(1);
    expect(fillCount()).toBe(1);
    cleanup();
    mount("housing", "sales", "off");
    expect(screen.queryAllByText("취득시 기준시가 (원) — 개산공제 기준액")).toHaveLength(1);
    expect(fillCount()).toBe(1);
  });

  it("실거래가 × 분리(같은 날)은 종전 그대로 — 안분 base 칸 1개 + 보조 카드 1개, 개산공제 hint 는 붙지 않는다", () => {
    mount("housing", "actual", "same");
    expect(stdCount()).toBe(1);
    expect(fillCount()).toBe(1);
    expect(occurrences(LUMP_SUM_DEDUCTION_BASE_HINT)).toBe(0);
  });
});
