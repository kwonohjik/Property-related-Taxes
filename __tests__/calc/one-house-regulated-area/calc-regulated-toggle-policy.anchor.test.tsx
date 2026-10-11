/**
 * @vitest-environment jsdom
 *
 * 결정 #5(G7-6, 권고 A + 하위 1 가·2 가) — 계산기에서 주소(법정동코드)가 있으면 조정대상지역 토글을 숨기고 자동 판정만 보인다.
 *
 * - 하위 1 가: ④가 저장된 토글 대신 **주소 판정값**을 싣는다 — 명부 없이 주택 수만 넣던 옛 기록(중과가 토글 저장값을 읽는 경로)에서
 *   화면에 없는 값이 세액을 정하지 않는다.
 * - 하위 2 가: 「소재지를 지우면 직접 선택」 안내는 신뢰도 낮음에서만(판정 메뉴와 같은 규약).
 * - 코드가 없으면(주소 문자열만) 토글을 그대로 둔다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { captureBody, runCalc } from "../_one-house-pr3a-calc-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2026-06-01")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
  // 자동 판별 훅의 fetch — 응답이 오지 않는 상태로 둔다(카드·토글 렌더만 본다)
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GANGNAM = "1168010100"; // 취득(2018)·양도(2021) 모두 조정대상지역
const YANGPYEONG = "4183010100"; // 경기 양평군 — 2018·2021 모두 미지정(수록 시도 내 미매칭 = high)
const JEJU = "5011010100"; // 데이터 미수록 — 신뢰도 낮음

function cform(over: { regionCode?: string; acq?: string; transfer?: string; storedTransfer?: boolean; storedAcq?: boolean; houseCount?: string }): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: over.transfer ?? "2021-06-01",
    isOneHousehold: true,
    contractTotalPrice: "900000000",
    householdHousingCount: over.houseCount ?? "1",
    householdNoOtherHousesConfirmed: over.houseCount === undefined,
    isRegulatedArea: over.storedTransfer ?? false,
    wasRegulatedAtAcquisition: over.storedAcq ?? false,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: over.acq ?? "2018-06-01",
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "500000000",
    addressJibun: "테스트 주소 1",
    ...(over.regionCode !== undefined ? { regionCode: over.regionCode } : {}),
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
  });
  return f;
}

const ACQ_SWITCH = /취득일 기준 조정대상지역/;
const TRANSFER_SWITCH = /양도일 기준 조정대상지역/;

describe("#5 ⑤ 화면 — 주소(법정동코드)가 있으면 토글 대신 자동 판정 카드", () => {
  it("강남 코드: 취득일·양도일 두 토글이 없고 자동 판정 카드가 뜬다", () => {
    render(<Step4 form={cform({ regionCode: GANGNAM, houseCount: "2" })} onChange={() => {}} />);
    expect(screen.queryAllByRole("switch", { name: ACQ_SWITCH })).toHaveLength(0);
    expect(screen.queryAllByRole("switch", { name: TRANSFER_SWITCH })).toHaveLength(0);
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toContain("취득일 기준 조정대상지역 해당");
    expect(screen.getByTestId("transfer-regulated-transfer-auto").textContent).toContain("양도일 기준 조정대상지역 해당");
  });

  it("긍정 짝 — 코드가 없으면 두 토글이 그대로 있고 자동 판정 카드는 없다", () => {
    render(<Step4 form={cform({ houseCount: "2" })} onChange={() => {}} />);
    expect(screen.getAllByRole("switch", { name: ACQ_SWITCH }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("switch", { name: TRANSFER_SWITCH }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("transfer-regulated-acquisition-auto")).toBeNull();
    expect(screen.queryByTestId("transfer-regulated-transfer-auto")).toBeNull();
  });

  it("경기 양평군(비조정): 카드가 「미해당」 — 저장된 토글 true와 무관", () => {
    render(<Step4 form={cform({ regionCode: YANGPYEONG, houseCount: "2", storedAcq: true, storedTransfer: true })} onChange={() => {}} />);
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toContain("미해당");
    expect(screen.getByTestId("transfer-regulated-transfer-auto").textContent).toContain("미해당");
    // 양도일이 비조정이면 「양도일 현재 조정대상지역」 중과 검토 안내도 뜨지 않는다(저장값 true를 읽지 않는다)
    expect(document.body.textContent).not.toContain("중과세 적용 여부를 검토하세요");
  });

  it("동일세대 상속: 카드의 기준일이 엔진과 같다 — 동일세대 보유 개시일(2016, 지정 전)이면 취득일(2018, 지정)과 달리 「미해당」", () => {
    const f = cform({ regionCode: GANGNAM, houseCount: "2", acq: "2018-06-01" });
    Object.assign(f.assets[0], {
      acquisitionCause: "inheritance",
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: "2016-01-01",
    });
    render(<Step4 form={f} onChange={() => {}} />);
    const card = screen.getByTestId("transfer-regulated-acquisition-auto").textContent ?? "";
    expect(card).toContain("동일세대 보유 개시일 기준 조정대상지역 미해당");
    cleanup();
    // 긍정 짝 — 동일세대 상속이 아니면(취득 원인 매매) 같은 입력이 취득일(2018) 기준으로 「해당」
    const g = cform({ regionCode: GANGNAM, houseCount: "2", acq: "2018-06-01" });
    Object.assign(g.assets[0], { decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "2016-01-01" });
    render(<Step4 form={g} onChange={() => {}} />);
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toContain("취득일 기준 조정대상지역 해당");
  });

  it("하위 2 가 — 「소재지를 지우면 직접 선택」 안내는 신뢰도 낮음(미수록 시도)에서만", () => {
    render(<Step4 form={cform({ regionCode: JEJU, houseCount: "2" })} onChange={() => {}} />);
    expect(document.body.textContent).toContain("소재지를 지우세요"); // 자동 판정 카드의 정정 안내
    cleanup();
    render(<Step4 form={cform({ regionCode: GANGNAM, houseCount: "2" })} onChange={() => {}} />);
    expect(document.body.textContent).not.toContain("소재지를 지우세요");
    expect(document.body.textContent).not.toContain("아래 체크박스를 수동 확인하세요");
  });
});

describe("#4 조건 — 다산동 취득자의 §154①5호(공고 전 계약 + 무주택) 단서 입력란이 계산기 화면에 뜬다", () => {
  it("다산동 코드 · 2019-12-01 취득 · 1주택 → 「조정 공고 전 계약 (5호)」 사유 선택지가 노출된다(소재지와 무관한 게이트)", () => {
    const f = cform({ regionCode: "4136011200", acq: "2019-12-01", transfer: "2024-03-15" });
    render(<Step4 form={f} onChange={() => {}} />);
    expect(screen.getByTestId("proviso-reason-pre_contract")).toBeTruthy();
    // 같은 화면의 취득일 기준 자동 판정은 「해당」(다산동 누락 보정 후) — 그래서 이 단서 입력란이 의미가 있다
    expect(screen.getByTestId("transfer-regulated-acquisition-auto").textContent).toContain("해당");
  });
});

describe("#5 하위 1 가 — ④가 주소 판정값을 싣는다", () => {
  it("계산기 ④: 강남 코드 + 저장 토글 false/false → 본문은 true/true", async () => {
    const body = await captureBody(cform({ regionCode: GANGNAM, storedTransfer: false, storedAcq: false }));
    expect(body.isRegulatedArea).toBe(true);
    expect(body.wasRegulatedAtAcquisition).toBe(true);
  });

  it("계산기 ④: 경기 양평군 코드 + 저장 토글 true/true → 본문은 false/false", async () => {
    const body = await captureBody(cform({ regionCode: YANGPYEONG, storedTransfer: true, storedAcq: true }));
    expect(body.isRegulatedArea).toBe(false);
    expect(body.wasRegulatedAtAcquisition).toBe(false);
  });

  it("긍정 짝 — 코드가 없으면 저장 토글을 그대로 싣는다", async () => {
    const on = await captureBody(cform({ storedTransfer: true, storedAcq: true }));
    expect([on.isRegulatedArea, on.wasRegulatedAtAcquisition]).toEqual([true, true]);
    const off = await captureBody(cform({ storedTransfer: false, storedAcq: false }));
    expect([off.isRegulatedArea, off.wasRegulatedAtAcquisition]).toEqual([false, false]);
  });

  it("세액 — 명부 없는 옛 기록(세대 2주택 선언): 저장 토글이 주소와 반대여도 세액이 같다(종전엔 토글이 중과를 갈랐다)", async () => {
    const base = { regionCode: GANGNAM, houseCount: "2", acq: "2018-06-01", transfer: "2021-06-01" } as const;
    const asStored0 = await runCalc(cform({ ...base, storedTransfer: false, storedAcq: false }));
    const asStored1 = await runCalc(cform({ ...base, storedTransfer: true, storedAcq: true }));
    expect(asStored0.status).toBe(200);
    expect(asStored0.totalTax).toBe(asStored1.totalTax);
    expect(asStored0.totalTax).toBeGreaterThan(0);
  });

  it("판정 메뉴 ④: 주소 판정값(강남 true / 인천 false)을 싣는다", () => {
    const body = (regionCode: string, stored: boolean) => {
      const f = createInitialOneHouseJudgmentForm();
      return buildOneHouseExemptionApiBody({
        ...f,
        transferDate: "2021-06-01",
        isRegulatedArea: stored,
        wasRegulatedAtAcquisition: stored,
        assets: [
          migrateAsset({ ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-06-01", regionCode, residenceInputMode: "direct", residencePeriods: [] }),
        ],
      } as typeof f);
    };
    const g = body(GANGNAM, false);
    expect([g.isRegulatedArea, g.wasRegulatedAtAcquisition]).toEqual([true, true]);
    const i = body(YANGPYEONG, true);
    expect([i.isRegulatedArea, i.wasRegulatedAtAcquisition]).toEqual([false, false]);
  });

  it("다건 ④(buildPropertyPayload): 단건과 같은 값", () => {
    const g = buildPropertyPayload(cform({ regionCode: GANGNAM, storedTransfer: false, storedAcq: false })) as Record<string, unknown>;
    expect([g.isRegulatedArea, g.wasRegulatedAtAcquisition]).toEqual([true, true]);
    const i = buildPropertyPayload(cform({ regionCode: YANGPYEONG, storedTransfer: true, storedAcq: true })) as Record<string, unknown>;
    expect([i.isRegulatedArea, i.wasRegulatedAtAcquisition]).toEqual([false, false]);
  });
});
