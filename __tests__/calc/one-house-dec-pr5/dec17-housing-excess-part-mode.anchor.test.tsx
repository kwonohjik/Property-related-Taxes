/**
 * #17 후속(F1) — 별개취득 토글 ON + 토지·건물 취득일 같음 + 파트 방식 라디오가 자산 단위 방식과 다른 주택의 배율 초과분 분리.
 *
 * 시료는 `dec17-housing-excess-b2.anchor.test.ts`와 같다(매매 2012-01-02 · 양도 2026-02-16 · 양도가 10억 · 실가 5억 · 토지 500㎡ · 정착면적 100㎡ ·
 * 수도권 주거 → 초과 200㎡).
 *
 * ## 결함
 * 토글을 켜면 같은 날짜여도 분리 섹션(「취득가액 산정 방식 — 토지·건물 독립 선택」)의 토지·건물 라디오가 화면에 뜬다. 바로 위에는 자산 단위
 * 「취득가액 산정 방식」 라디오도 그대로 있다. 배율 초과분 분리 경로(#17-4)에서 ④는 두 파트 모두 **자산 단위 방식**으로 싣는다
 * (`deriveLegacyPartAcqMode`) → 파트 라디오에서 「환산」을 골라도 계산은 실가로 나와(9,296,570) 화면에서 고른 값이 반영되지 않았다(#2146 보고).
 *
 * ## 파트 방식을 그대로 실으면 (probe 실측 — ④ payload의 두 모드만 라디오 값으로 바꿔 route에 보냄)
 * | 라디오(토지/건물) | route |
 * |---|---|
 * | 환산/실가 · 실가/환산 · 환산/환산 | 400 (양도시 개별주택가격 요구 — ④는 자산 단위 환산일 때만 싣는다) |
 * | 감정/실가 · 매매사례/실가 | 200 · 8,905,549 (토지분 취득가액 285,714,285 = 실가 총액 5억의 기준시가 안분 몫을 감정·매매사례로 부르고 개산공제만 더한다) |
 *
 * 같은 날 함께 산 주택의 이 경로는 총액 하나를 기준시가 비율로 나누는 계산이라, 파트별로 다른 방식을 고른 입력을 의미 있게 처리하지 못한다.
 * ⇒ ⑧이 어긋난 라디오 칸(`landAcqMode`/`buildingAcqMode`)으로 막는다. 고칠 칸(파트 라디오)이 화면에 있고, ⑤가 그 칸에 이동 앵커를 단다.
 * ④는 그대로 자산 단위 방식을 싣는다(⑧ 통과 ⇒ 두 값이 같다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  actualSalePrice: "1000000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const household = {
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const single = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, ...over }],
  }) as never;

/** 별개취득 토글 ON + 토지 취득일 = 건물 취득일 */
const SAME_DAY = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-01-02" };
const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" };
const modeIssue = (issues: { field?: string; message: string }[]) => issues.find((i) => i.message.includes("토지·건물을 같은 날 취득한 주택"));

describe("⑤ 재현 — 토글 ON + 같은 날짜 + 배율 초과면 자산 단위 라디오와 파트 라디오가 함께 보인다", () => {
  function Harness({ init }: { init: Record<string, unknown> }) {
    const [asset, setAsset] = useState<AssetForm>({ ...makeDefaultAsset(1), ...HOUSE, ...SAME_DAY, ...init } as unknown as AssetForm);
    const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
    return (
      <CompanionAcqPurchaseBlock
        acquisitionDate={asset.acquisitionDate}
        onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
        useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
        onUseEstimatedChange={() => {}}
        fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
        onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
        standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
        onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
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
        asset={asset}
        onAssetChange={patch}
      />
    );
  }
  const checked = (name: RegExp) =>
    (Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find((r) => name.test(r.name) && r.checked)?.value);

  it("자산 단위 「취득가액 산정 방식」= 실거래가, 토지 라디오 = 환산 — 둘 다 화면에 있다", () => {
    render(<Harness init={{ landAcqMode: "estimated", buildingAcqMode: "actual" }} />);
    expect(checked(/^acqBasisMode$/)).toBe("actual");
    expect(screen.getByTestId("part-acq-mode-land")).toBeTruthy();
    expect(checked(/^landAcqMode-/)).toBe("estimated");
    expect(checked(/^buildingAcqMode-/)).toBe("actual");
  });

  it("🔑 ⑧ 이동 앵커 — 파트 라디오 칸에 `data-field`(landAcqMode·buildingAcqMode)가 있다 (수정 전: 없음 → 오류를 눌러도 자산 카드로 후퇴)", () => {
    render(<Harness init={{ landAcqMode: "estimated", buildingAcqMode: "actual" }} />);
    expect(screen.getByTestId("part-acq-mode-land").getAttribute("data-field")).toBe("landAcqMode");
    expect(screen.getByTestId("part-acq-mode-building").getAttribute("data-field")).toBe("buildingAcqMode");
  });
});

describe("⑧ — 파트 라디오가 자산 단위 방식과 다르면 그 라디오 칸으로 막는다 (수정 전: ⑧ 통과 · 라디오 무시하고 실가 9,296,570)", () => {
  it.each([
    ["토지 환산 / 건물 실가", { landAcqMode: "estimated", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지 실가 / 건물 환산", { landAcqMode: "actual", buildingAcqMode: "estimated" }, "buildingAcqMode", "건물 취득가액 방식"],
    ["토지 감정 / 건물 실가", { landAcqMode: "appraisal", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지 매매사례 / 건물 실가", { landAcqMode: "salesCase", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
    ["토지·건물 모두 환산(자산 단위는 실가)", { landAcqMode: "estimated", buildingAcqMode: "estimated" }, "landAcqMode", "토지 취득가액 방식"],
    ["자산 단위 환산 + 토지·건물 모두 실가", { ...EST, landAcqMode: "actual", buildingAcqMode: "actual" }, "landAcqMode", "토지 취득가액 방식"],
  ])("🔑 %s → ⑧ 차단 — 어긋난 라디오 칸", async (_n, over, field, partLabel) => {
    const r = await runCalc(single({ ...SAME_DAY, ...over }));
    const hit = modeIssue(r.issues);
    expect(hit?.field).toBe(field);
    expect(hit?.message).toContain(partLabel);
    expect(hit?.message).toContain("「취득가액 산정 방식」");
    // ④는 자산 단위 방식을 싣는다(⑧이 막으므로 화면값과 다른 계산이 결과로 나가지 않는다)
    expect(r.body.landAcqMode).toBe(r.body.buildingAcqMode);
  });

  it.each([
    ["파트 라디오 미선택(\"\" — 자산 단위에서 파생)", { landAcqMode: "", buildingAcqMode: "" }, 9_296_570],
    ["토지·건물 모두 실가 = 자산 단위 실가", { landAcqMode: "actual", buildingAcqMode: "actual" }, 9_296_570],
    ["토지·건물 모두 환산 = 자산 단위 환산", { ...EST, landAcqMode: "estimated", buildingAcqMode: "estimated" }, 14_336_406],
  ])("대조 — %s → 막지 않고 분리 계산", async (_n, over, totalTax) => {
    const r = await runCalc(single({ ...SAME_DAY, ...over }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.splitDetail?.nonBusinessLandPart?.excessArea).toBe(200);
    expect(r.result.totalTax).toBe(totalTax);
  });

  it("대조 — 토글 OFF면 파트 라디오가 화면에 없다 → 잔존 파트 방식은 막지 않는다(#17-4 그대로 9,296,570)", async () => {
    const r = await runCalc(single({ landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(modeIssue(r.issues)).toBeUndefined();
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(9_296_570);
  });

  it("대조 — 토지 취득일이 다르면(별개취득) 파트 방식이 정본이다 → 이 규칙은 걸리지 않는다", async () => {
    const r = await runCalc(single({ ...SAME_DAY, landAcquisitionDate: "2010-01-04", landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(modeIssue(r.issues)).toBeUndefined();
  });

  it("대조 — 배율 한도 이내(분리 경로 밖)면 이 규칙은 걸리지 않는다", async () => {
    const r = await runCalc(single({ ...SAME_DAY, acquisitionArea: "250", transferArea: "250", landAcqMode: "estimated", buildingAcqMode: "actual" }));
    expect(modeIssue(r.issues)).toBeUndefined();
  });
});
