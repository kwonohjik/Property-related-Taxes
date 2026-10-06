/**
 * @vitest-environment jsdom
 *
 * A2 후속 — 분리 토글 **ON → OFF 왕복**이 자산 단위 산정방식을 조용히 바꾸지 않는다 (대칭 강등)
 *
 * 결함: `gbSeparateOnPatch`가 레거시 플래그(감정·매매사례·환산)를 명시 파트 모드로 승격하며 소거하는데,
 *       OFF patch가 플래그를 복원하지 않아 자산 단위 감정 + `fixedAcquisitionPrice`가 실거래가가 되었다(개산공제 소실, 화면 단서는 라디오 하나).
 *
 * 고정 계약:
 *   RT-1 감정·매매사례·환산 — 왕복 후 레거시 3플래그와 ④ payload(`generalBuildingValuation` · 최상위 `acquisitionMethod`·`appraisalValue`·`similarSalesValue`)가 ON 전과 같다. Dialog 없이 즉시 전환
 *   RT-2 혼합(토지 감정 + 건물 실가) — 자산 단위로 표현할 수 없어 실거래가 + Dialog가 「실거래가로 돌아갑니다」를 알린다
 *   RT-3 증축 × 감정 — R9가 자산 단위 감정을 차단하므로 강등하지 않는다(실거래가 + Dialog). 증축 × 환산은 보존
 *   RT-4 금액 칸이 비어 있으면 그대로 비운다 — 파트 금액을 합쳐 지어내지 않는다(자동 안분 fallback 금지)
 *   RT-5 (긍정 짝) 두 파트 모두 실가 — 플래그 전부 false
 *   RT-6 이월과세·상속 단일 원인 — 허용되지 않는 모드는 강등하지 않는다
 */
import { describe, it, expect, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GeneralBuildingAcquisitionCards } from "@/components/calc/transfer/GeneralBuildingAcquisitionCards";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { gbSeparateOffTargetMode } from "@/lib/calc/transfer-tax-gb-toggle-patches";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const TRANSFER_DATE = "2026-02-16";
const SAME = "2015-03-01";

function gb(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: SAME,
    landAcquisitionDate: SAME,
    hasSeperateLandAcquisitionDate: false,
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    actualSalePrice: "2000000000",
    ...over,
  } as AssetForm;
}

/** 상태를 실제로 갖는 하네스 — onChange patch를 누적해 마지막 asset을 꺼낸다. */
let latest: AssetForm;
function Harness({ init }: { init: AssetForm }) {
  const [a, setA] = useState(init);
  useEffect(() => {
    latest = a; // 렌더 중 모듈 변수 대입 금지(react-hooks/globals) — 커밋 후 effect에서 기록한다
  });
  return <GeneralBuildingAcquisitionCards asset={a} onChange={(p) => setA((x) => ({ ...x, ...p }))} transferDate={TRANSFER_DATE} />;
}
const toggle = () => screen.getByRole("switch", { name: /토지·건물 취득일 다름/, hidden: true });

async function body(asset: AssetForm): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI({
      transferDate: TRANSFER_DATE,
      filingDate: "2026-04-30",
      assets: [asset],
      houses: [],
      presaleRights: [],
      contractTotalPrice: "2000000000",
      totalTransferExpense: "0",
      householdHousingCount: "1",
      isOneHousehold: true,
      residencePeriodMonths: "0",
    } as unknown as TransferFormData);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return captured;
}
const flagsOf = (a: AssetForm) => ({
  est: !!a.useEstimatedAcquisition,
  apr: !!a.isAppraisalAcquisition,
  sc: !!a.isSalesCaseAcquisition,
});

/** ON → (OFF) 왕복. Dialog가 뜨면 확정을 누른다 — 뜬 여부를 함께 돌려준다. */
async function roundTrip(init: AssetForm, beforeOff?: () => void): Promise<{ dialogShown: boolean; description: string }> {
  render(<Harness init={init} />);
  fireEvent.click(toggle());
  expect((latest.hasSeperateLandAcquisitionDate)).toBe(true);
  beforeOff?.();
  fireEvent.click(toggle());
  const dialog = screen.queryByTestId("confirm-dialog-confirm");
  const description = dialog ? (document.querySelector('[role="dialog"]')?.textContent ?? "") : "";
  if (dialog) fireEvent.click(dialog);
  expect(latest.hasSeperateLandAcquisitionDate).toBe(false);
  return { dialogShown: !!dialog, description };
}

describe("RT-1 — 단일 산정방식 왕복은 ④ payload까지 ON 전과 같다", () => {
  const CASES: Array<[string, Partial<AssetForm>]> = [
    ["감정가액", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "420000000" }],
    ["매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "430000000" }],
    ["환산취득가", { useEstimatedAcquisition: true }],
  ];
  it.each(CASES)("%s", async (_n, over) => {
    const init = gb(over);
    const before = await body(init);
    const gbBefore = buildGeneralBuildingValuation(init, TRANSFER_DATE);

    const r = await roundTrip(init);
    expect(r.dialogShown, "지울 입력이 없으면 Dialog 없이 즉시").toBe(false);

    expect(flagsOf(latest)).toEqual(flagsOf(init));
    expect(latest.fixedAcquisitionPrice).toBe(init.fixedAcquisitionPrice);
    expect(latest.similarSalesValue).toBe(init.similarSalesValue);
    expect(buildGeneralBuildingValuation(latest, TRANSFER_DATE)).toEqual(gbBefore);
    const after = await body(latest);
    for (const k of ["acquisitionMethod", "appraisalValue", "similarSalesValue", "useEstimatedAcquisition", "generalBuildingValuation"]) {
      expect(after[k], k).toEqual(before[k]);
    }
  });

  it("전제 확인 — 감정 왕복의 ④ 최상위는 appraisal·감정가액을 싣는다(실거래가로 떨어지면 이 단언이 깨진다)", async () => {
    const init = gb({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "420000000" });
    await roundTrip(init);
    const after = await body(latest);
    expect(after.acquisitionMethod).toBe("appraisal");
    expect(after.appraisalValue).toBe(420_000_000);
  });
});

describe("RT-2 — 혼합은 자산 단위로 표현할 수 없다", () => {
  it("토지 감정 + 건물 실가 → 실거래가로 돌아가고 Dialog가 그 사실을 알린다", async () => {
    const r = await roundTrip(gb({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "420000000" }), () => {
      fireEvent.click(screen.getByTestId("gb-building-acq-mode-actual")); // 건물만 실가로 — 혼합
    });
    expect(r.dialogShown).toBe(true);
    expect(r.description).toContain("자산 전체 취득가액 산정 방식은 「실거래가」로 돌아갑니다");
    expect(flagsOf(latest)).toEqual({ est: false, apr: false, sc: false });
  });
});

describe("RT-3 — 증축", () => {
  it("증축 × 감정 — R9가 자산 단위 감정을 차단하므로 강등하지 않는다(실거래가 + Dialog)", async () => {
    const init = gb({ gbHasExtension: true, isAppraisalAcquisition: true, fixedAcquisitionPrice: "420000000" });
    const r = await roundTrip(init);
    expect(r.dialogShown).toBe(true);
    expect(r.description).toContain("「실거래가」로 돌아갑니다");
    expect(flagsOf(latest)).toEqual({ est: false, apr: false, sc: false });
  });

  it("(긍정 짝) 증축 × 환산 — 보존한다", async () => {
    const r = await roundTrip(gb({ gbHasExtension: true, useEstimatedAcquisition: true }));
    expect(r.dialogShown).toBe(false);
    expect(flagsOf(latest)).toEqual({ est: true, apr: false, sc: false });
  });
});

describe("RT-4 — 금액 칸은 지어내지 않는다", () => {
  it("감정 + 자산 단위 금액 없음 → 강등해도 금액은 비어 있다(⑧이 요구) · 파트 금액을 합쳐 넣지 않는다", async () => {
    const init = gb({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "" });
    render(<Harness init={init} />);
    fireEvent.click(toggle());
    fireEvent.change(screen.getByTestId("gb-land-apr-price"), { target: { value: "300000000" } });
    fireEvent.change(screen.getByTestId("gb-building-apr-price"), { target: { value: "120000000" } });
    fireEvent.click(toggle()); // 파트 금액이 있으니 Dialog
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(flagsOf(latest)).toEqual({ est: false, apr: true, sc: false }); // 감정 선택은 보존
    expect(latest.fixedAcquisitionPrice).toBe("");
    expect(latest.landAcquisitionPrice).toBe("");
    expect(latest.buildingAcquisitionPrice).toBe("");
  });
});

describe("RT-5·6 — 긍정 짝과 허용되지 않는 원인", () => {
  it("두 파트 실가 → 플래그 전부 false (ON 중 남은 useEstimated가 되살아나지 않는다)", async () => {
    // ON 직후 환산으로 승격된 두 파트를 모두 실거래가로 바꾼 뒤 OFF
    const r = await roundTrip(gb({ useEstimatedAcquisition: true }), () => {
      fireEvent.click(screen.getByTestId("gb-land-acq-mode-actual"));
      fireEvent.click(screen.getByTestId("gb-building-acq-mode-actual"));
    });
    expect(r.dialogShown).toBe(false); // 두 파트 모두 실가 = 전환 후 자산 단위도 실가 — 잃는 선택이 없어 Dialog 없이 즉시
    expect(flagsOf(latest)).toEqual({ est: false, apr: false, sc: false });
  });

  it("이월과세 — 감정·매매사례는 강등하지 않고, 환산은 보존한다 (gbPartAllowedModes)", () => {
    expect(gbSeparateOffTargetMode({ acquisitionCause: "carryover_gift", landAcqMode: "appraisal", buildingAcqMode: "appraisal" })).toBe("actual");
    expect(gbSeparateOffTargetMode({ acquisitionCause: "carryover_gift", landAcqMode: "estimated", buildingAcqMode: "estimated" })).toBe("estimated");
    expect(gbSeparateOffTargetMode({ acquisitionCause: "inheritance", landAcqMode: "estimated", buildingAcqMode: "estimated" })).toBe("actual");
  });

  it("소유 파트만 본다 — 건물만 소유하면 건물 모드가 자산 단위 모드다 / 소유 파트가 없으면 actual", () => {
    expect(gbSeparateOffTargetMode({ selfOwns: "building_only", landAcqMode: "actual", buildingAcqMode: "appraisal" })).toBe("appraisal");
    expect(gbSeparateOffTargetMode({ selfOwns: "land_only", landAcqMode: "salesCase", buildingAcqMode: "actual" })).toBe("salesCase");
    expect(gbSeparateOffTargetMode({ selfOwns: "both", landAcqMode: "salesCase", buildingAcqMode: "appraisal" })).toBe("actual");
  });
});
