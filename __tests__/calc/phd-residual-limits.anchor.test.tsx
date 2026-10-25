/**
 * anchor — PHD 남은 한계 3건 (계획서 docs/00-pm/phd-residual-limits-fix.plan.md · Q-1 (a) · Q-2 (a) · Q-3 (b))
 *   L-1 보조 카드 §164⑤ 준용 확인 — 건물 기준시가(취득·최초 고시 시점)·최초 고시일을 고치면 같은 patch에서 확인을 푼다(보조 모드만)
 *   L-2 서버 Zod 메시지 — 겸용은 개별주택가격·§164⑦, 일반은 두 가격·두 조문을 함께 적는다(주택 종류는 전송되지 않는다)
 *   L-3 이월과세 «공동주택 최초고시 전 취득»(APD) — 공동주택으로 본다(`isPhdApartment`) · 패널 라디오 숨김 · PHD는 라디오를 따른다
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { PreHousingDisclosureSection } from "@/components/calc/transfer/PreHousingDisclosureSection";
import { CarryoverEstimationSection } from "@/components/calc/transfer/CarryoverEstimationSection";
import { isPhdApartment } from "@/lib/calc/phd-housing-term";
import { validateCarryoverAsset } from "@/lib/calc/transfer-tax-validate-carryover-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { radioValues, checkedRadioValue } from "../components/_helpers/radio-values";
import { PHD_ELEVEN, PHD_TRANSFER_DATE, captureSingleBody, phdForm, runPhdCell } from "./_phd-non-estimated-fixture";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const TD = PHD_TRANSFER_DATE;
const text = () => document.body.textContent ?? "";
const housing = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", addressJibun: "서울 테스트동 1", ...over }) as AssetForm;

// ─── L-1 ─────────────────────────────────────────────────────────

/** 1995 취득(2000년 이전 — 확인란이 보인다) · 2005 최초 공시 · 확인 켜짐 */
const OLD: Partial<AssetForm> = {
  acquisitionDate: "1995-03-01",
  phdFirstDisclosureDate: "2005-04-30",
  phdBuildingStdPriceAtAcq: "20000000",
  phdBuildingStdPriceAtFirst: "25000000",
  phdAssistBuildingStdBy164_5: true,
};
const input = (container: HTMLElement, field: string) =>
  (container.querySelector(`input[data-field="${field}"]`) ?? container.querySelector(`[data-field="${field}"] input`)) as HTMLInputElement;
const yearOf = (container: HTMLElement) =>
  container.querySelector('[data-field="phdFirstDisclosureDate"] input[aria-label="연도"]') as HTMLInputElement;

function renderPanel(mode: "assist" | "phd", over: Partial<AssetForm> = {}) {
  const patches: Partial<AssetForm>[] = [];
  const { container } = render(
    <PreHousingDisclosureSection mode={mode} asset={housing({ ...OLD, ...over })} transferDate={TD} onChange={(p) => patches.push(p)} />,
  );
  return { container, patches };
}

describe("L-1 §164⑤ 준용 확인 — 칸을 고치면 푼다 (Q-1 a)", () => {
  it("마운트·포커스 이동만으로는 onChange가 불리지 않는다 (V-1)", () => {
    const { container, patches } = renderPanel("assist");
    const el = input(container, "phdBuildingStdPriceAtAcq");
    fireEvent.focus(el);
    fireEvent.blur(el);
    expect(patches).toEqual([]);
  });
  it.each([
    ["취득시 건물 기준시가", "phdBuildingStdPriceAtAcq", "21000000"],
    ["최초 고시 시점 건물 기준시가", "phdBuildingStdPriceAtFirst", "26000000"],
  ] as const)("보조 · 확인 켜짐 · %s 수정 → 같은 patch에 확인 해제", (_n, field, v) => {
    const { container, patches } = renderPanel("assist");
    fireEvent.change(input(container, field), { target: { value: v } });
    expect(patches).toEqual([{ [field]: v, phdAssistBuildingStdBy164_5: false }]);
  });
  it("보조 · 확인 켜짐 · 최초 고시일 수정 → 같은 patch에 확인 해제", () => {
    const { container, patches } = renderPanel("assist");
    fireEvent.change(yearOf(container), { target: { value: "2004" } });
    expect(patches).toEqual([{ phdFirstDisclosureDate: "2004-04-30", phdAssistBuildingStdBy164_5: false }]);
  });
  it("보조 · 확인 꺼짐 → 값만 바꾼다 (상가 buildAcqBuildingStdEditPatch와 같은 꼴)", () => {
    const { container, patches } = renderPanel("assist", { phdAssistBuildingStdBy164_5: false });
    fireEvent.change(input(container, "phdBuildingStdPriceAtAcq"), { target: { value: "21000000" } });
    expect(patches).toEqual([{ phdBuildingStdPriceAtAcq: "21000000" }]);
  });
  it("환산(phd) 모드 → 확인 필드를 건드리지 않는다 (patch 종전 그대로)", () => {
    const { container, patches } = renderPanel("phd", { useEstimatedAcquisition: true });
    fireEvent.change(input(container, "phdBuildingStdPriceAtAcq"), { target: { value: "21000000" } });
    fireEvent.change(yearOf(container), { target: { value: "2004" } });
    expect(patches).toEqual([{ phdBuildingStdPriceAtAcq: "21000000" }, { phdFirstDisclosureDate: "2004-04-30" }]);
  });
  it("칩 설명이 다시 확인해야 하는 경우를 알린다", () => {
    renderPanel("assist");
    expect(text()).toContain("확인해야 계산해 채우기 버튼이 켜집니다 · 건물 기준시가나 최초 고시일을 바꾸면 다시 확인합니다");
  });
});

// ─── L-2 ─────────────────────────────────────────────────────────

const NOT_ELIGIBLE_PREFIX = "취득일(이월과세는 증여자 취득일, 의제취득일 1985-01-01 반영)이 최초 고시일 이후 — ";
async function post(body: Record<string, unknown>): Promise<{ status: number; msg: string }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body }),
    }),
  );
  return { status: res.status, msg: JSON.stringify(await res.json()) };
}

/** 겸용 Case A(4부분) — `mixed-use-phd-fourpart-share.anchor.test.ts`와 같은 입력 */
const MIXED: Record<string, unknown> = {
  assetKind: "housing",
  isMixedUseHouse: true,
  hasPartialUsageChange: true,
  partialChangeDirection: "house_to_commercial",
  partialChangeDate: "2018-06-01",
  useEstimatedAcquisition: true,
  acquisitionDate: "2010-06-15",
  residentialFloorArea: "120",
  nonResidentialFloorArea: "80",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "872000000",
  phdBuildingStdPriceAtAcq: "100000000",
  phdBuildingStdPriceAtFirst: "150000000",
  phdBuildingStdPriceAtTransfer: "200000000",
  mixedAcqCommercialBuildingPrice: "50000000",
  phdCommercialBuildingStdPriceAtFirst: "60000000",
  mixedTransferCommercialBuildingPrice: "70000000",
  phdLandPricePerSqmAtAcq: "2000000",
  phdLandPricePerSqmAtFirst: "2500000",
  phdLandPricePerSqmAtTransfer: "3000000",
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2015-01-01",
  phdFirstDisclosureHousingPrice: "300000000",
};
function mixedForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", ...MIXED }],
    transferDate: "2025-05-01",
    filingDate: "2025-07-31",
    contractTotalPrice: "1500000000",
    householdHousingCount: "2",
  } as unknown as TransferFormData;
}

describe("L-2 서버 메시지 — 경로로 가른다 (Q-2 a)", () => {
  it("일반 주택 — 두 가격·두 조문을 함께 적고 «주택공시가격 … (§164⑦)» 단정이 없다", async () => {
    const body = await captureSingleBody(phdForm({ useEstimatedAcquisition: true, usePreHousingDisclosure: true, ...PHD_ELEVEN }));
    const phd = body.preHousingDisclosure as Record<string, unknown>;
    expect(phd).toBeDefined();
    phd.firstDisclosureDate = "2001-01-01"; // 취득 2003-01-10 ≥ 최초 고시 → 적용 불가
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.msg).toContain(
      NOT_ELIGIBLE_PREFIX +
        "취득당시 개별주택가격 또는 공동주택가격(국세청장이 고시한 기준시가 포함)이 고시되어 있어 3-시점 환산(단독·다가구 §164⑦ · 공동주택 §164⑥·⑦) 대상이 아닙니다",
    );
    expect(r.msg).not.toContain("취득당시 주택공시가격이 고시되어 있어");
  });
  it("겸용주택 — 공동주택이 없으므로 개별주택가격 · §164⑦", async () => {
    const body = await captureSingleBody(mixedForm());
    const phd = (body.mixedUse as Record<string, Record<string, unknown>>)?.preHousingDisclosure;
    expect(phd).toBeDefined();
    phd.firstDisclosureDate = "2005-01-01"; // 취득 2010-06-15 ≥ 최초 고시 → 적용 불가
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.msg).toContain(NOT_ELIGIBLE_PREFIX + "취득당시 개별주택가격이 고시되어 있어 3-시점 환산(§164⑦) 대상이 아닙니다");
    expect(r.msg).not.toContain("§164⑥");
  });
});

// ─── L-3 ─────────────────────────────────────────────────────────

const carryover = (mode: "phd" | "apd" | "general", over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm =>
  housing({
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2020-01-01",
    phdFirstDisclosureDate: "2015-04-30",
    phdHousingType: "individual",
    carryover: {
      ...(makeDefaultAsset(1).carryover as object),
      giftRegistryDate: "2020-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      useEstimatedAcquisition: true,
      estimationMode: mode,
      ...co,
    } as AssetForm["carryover"],
    ...over,
  });
function renderCarryover(a: AssetForm) {
  return render(
    <CarryoverEstimationSection asset={a} carryover={a.carryover!} transferDate={TD} onCarryoverChange={() => {}} onAssetChange={() => {}} />,
  );
}

describe("L-3 이월과세 APD = 공동주택 (Q-3 b)", () => {
  it("isPhdApartment — APD면 라디오 값과 무관하게 true", () => {
    expect(isPhdApartment(carryover("apd"))).toBe(true);
    expect(isPhdApartment(carryover("apd", { phdHousingType: "apartment" }))).toBe(true);
  });
  it("isPhdApartment — PHD·일반 환산·환산 미사용은 종전대로 라디오를 따른다", () => {
    expect(isPhdApartment(carryover("phd"))).toBe(false);
    expect(isPhdApartment(carryover("phd", { phdHousingType: "apartment" }))).toBe(true);
    expect(isPhdApartment(carryover("general"))).toBe(false);
    expect(isPhdApartment(carryover("apd", {}, { useEstimatedAcquisition: false }))).toBe(false);
    expect(isPhdApartment(housing({ phdHousingType: "apartment" }))).toBe(true);
    expect(isPhdApartment(housing({ phdHousingType: "individual" }))).toBe(false);
    expect(isPhdApartment(undefined)).toBe(false);
  });
  it("APD 패널 — 주택 종류 라디오가 없고, 배지·라벨이 공동주택", () => {
    const { container } = renderCarryover(carryover("apd"));
    expect(checkedRadioValue(container, "carryoverEstimationMode")).toBe("apd");
    expect(radioValues(container, "housingType")).toEqual([]);
    expect(text()).toContain("소득세법 시행령 §164⑥·⑦");
    expect(text()).not.toContain("소득세법 시행령 §164 ⑦");
    expect(text()).toContain("최초 고시 가격(국세청장 고시 기준시가 또는 공동주택가격)");
    expect(text()).not.toContain("최초 고시 개별주택가격");
  });
  it.each([
    ["individual", "소득세법 시행령 §164 ⑦"],
    ["apartment", "소득세법 시행령 §164⑥·⑦"],
  ] as const)("PHD 패널 — 라디오가 남고 %s 를 따른다", (t, badge) => {
    const { container } = renderCarryover(carryover("phd", { phdHousingType: t }));
    expect(radioValues(container, "housingType")).toEqual(["individual", "apartment"]);
    expect(checkedRadioValue(container, "housingType")).toBe(t);
    expect(text()).toContain(badge);
  });
  const v = (a: AssetForm) => String(validateCarryoverAsset(a, "자산1", TD, { isNonPrimaryAsset: false }));
  it("⑧ PHD 필수 칸 문장 — 라디오를 따른다(단독은 종전 바이트 그대로)", () => {
    expect(v(carryover("phd", { phdFirstDisclosureHousingPrice: "" }))).toBe("자산1: 최초 고시 개별주택가격을 입력하세요.");
    expect(v(carryover("phd", { phdHousingType: "apartment", phdFirstDisclosureHousingPrice: "" }))).toBe("자산1: 최초 고시 공동주택가격을 입력하세요.");
    const noTransfer = { phdFirstDisclosureHousingPrice: "100000000", phdTransferHousingPrice: "", standardPriceAtTransfer: "" };
    expect(v(carryover("phd", noTransfer))).toBe("자산1: 양도시 개별주택가격을 입력하세요.");
    expect(v(carryover("phd", { ...noTransfer, phdHousingType: "apartment" }))).toBe("자산1: 양도시 공동주택가격을 입력하세요.");
  });
  it("⑧ APD 필수 칸 문장 — 종전 그대로", () => {
    expect(v(carryover("apd", { phdFirstDisclosureHousingPrice: "" }))).toBe("자산1: 최초공시 공동주택가격을 입력하세요.");
  });
});

describe("L-3 결과 화면 — 이월과세는 PHD 상세를 내지 않는다(이름이 갈릴 곳이 없다)", () => {
  // 실측(2026-10-26): 이월과세 결과는 `carryoverTaxationDetail`만 있고 `preHousingDisclosureDetail`이 없다 — PHD 머리글·«환산 …가격» 이름이 화면·PDF에 나오지 않는다.
  // 엔진이 나중에 이월과세에도 PHD 상세를 내면 여기서 깨진다 — 그때 이름은 `isPhdApartment`(APD = 공동주택)를 따라야 한다.
  it.each(["phd", "apd"] as const)("%s — 계산되고(200), PHD 상세·주택가격 이름이 없다", async (mode) => {
    const form = phdForm({
      ...PHD_ELEVEN,
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2020-01-01",
      carryover: {
        ...(makeDefaultAsset(1).carryover as object),
        giftRegistryDate: "2020-01-01",
        donorAcquisitionDate: "2003-01-10",
        donorRelation: "spouse",
        giftDateValuation: "300000000",
        useEstimatedAcquisition: true,
        estimationMode: mode,
      } as AssetForm["carryover"],
    });
    const row = await runPhdCell("single", mode, form);
    expect(row.status, row.fieldErrors).toBe(200);
    expect(row.phdKey, "④가 preHousingDisclosure를 싣는다").toBe(true);
    const result = (row.json as { data: { result: Record<string, unknown> } }).data.result;
    expect(result.carryoverTaxationDetail).toBeDefined();
    expect(result.preHousingDisclosureDetail).toBeUndefined();
    render(<TransferTaxResultView result={result as never} formData={form} onReset={() => {}} onBack={() => {}} />);
    expect(document.body.querySelector('[data-print-section="phd"]')).toBeNull();
    expect(text()).not.toMatch(/환산 (개별|공동)주택가격/);
  });
});
