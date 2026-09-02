/**
 * anchor — 환지 의제 필지의 **자산-수준 취득일** 배선 (A15)
 *
 * 코드리뷰 2026-09 A15. `firstParcelAcqDate`(`transfer-tax-api.ts`)가
 * `parcels[0]?.acquisitionDate || form.transferDate`였다. 환지처분 의제 토글을 켜면
 * 필지의 취득일 입력 칸 자체가 사라지고 값은 `""`로 남으므로, 첫 필지가 환지의제이면
 * **취득일 = 양도일**이 되어 서버 Zod refine(`transfer-tax-schema-refines.ts:99-105`)에
 * 걸려 400이 났다.
 *
 * 화면의 자산-수준 「취득일」 칸은 다필지 모드에서도 렌더되고 ⑧이 **필수로 요구**하는데,
 * ④가 그 값을 쓰지 않으므로 **아무리 고쳐도 400이 사라지지 않았다**.
 *
 * 조문: 「소득세법 시행령」 §162①9호(환지처분 취득시기 의제).
 * ⚠️ 저장소 4곳이 이를 §162①**6호**(점유취득시효)로 잘못 인용하고 있다 — 별건(리뷰 §10).
 *
 * 규약: 실효 취득일은 `parcelEffectiveAcquisitionDate` 단일 소스.
 *   익일 가산은 엔진이 한다(`multi-parcel-transfer.ts:222` `addDays(confirmDate, 1)`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { parcelEffectiveAcquisitionDate } from "@/lib/calc/transfer-tax-api-parcels";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

const TRANSFER_DATE = "2024-05-01";

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

function parcel(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    acquisitionDate: "2005-04-10",
    acquisitionMethod: "actual",
    acquisitionPrice: "200,000,000",
    acquisitionArea: "300",
    transferArea: "300",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    expenses: "0",
    capitalExpenditure: "0",
    transferExpense: "0",
    useDayAfterReplotting: false,
    replottingConfirmDate: "",
    useExchangeLandReduction: false,
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    compensationPerSqm: "",
    compensationBasisStdPrice: "",
    areaScenario: "same",
    ...over,
  };
}

/** 환지 의제 필지 — 취득일 칸이 사라지므로 `acquisitionDate`는 빈 문자열이다. */
const replotted = (over = {}) =>
  parcel({ acquisitionDate: "", useDayAfterReplotting: true, replottingConfirmDate: "2003-01-01", ...over });

function parcelForm(parcels: Record<string, unknown>[]) {
  const form = createDefaultTransferFormData();
  form.transferDate = TRANSFER_DATE;
  form.contractTotalPrice = "900,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-04-10",
    parcelMode: true,
    parcels: parcels as never,
  };
  return form;
}

describe("[A15] 실효 취득일 규약 (단일 소스)", () => {
  it("A15-1: 환지 의제 → 확정일을 취득일로 본다 (익일 가산은 엔진 몫)", () => {
    expect(parcelEffectiveAcquisitionDate(replotted())).toBe("2003-01-01");
  });

  it("A15-2: 일반 필지 → 취득일 그대로", () => {
    expect(parcelEffectiveAcquisitionDate(parcel())).toBe("2005-04-10");
  });

  it("A15-3: 확정 불가 조합은 빈 문자열 — 양도일로 대체하지 않는다(자동 fallback 금지)", () => {
    expect(parcelEffectiveAcquisitionDate({ useDayAfterReplotting: true })).toBe("");
    expect(parcelEffectiveAcquisitionDate({})).toBe("");
  });
});

describe("[A15] ④ 자산-수준 취득일 — 첫 필지가 환지의제여도 양도일이 되지 않는다", () => {
  it("A15-4: 시나리오 A(필지1=환지의제, 필지2=일반) → 확정일 · 양도일 아님", async () => {
    const { run, get } = captureBody(parcelForm([replotted(), parcel({ id: "p2" })]));
    await run();
    const body = get() as { acquisitionDate?: string };
    expect(body.acquisitionDate).toBe("2003-01-01");
    expect(body.acquisitionDate).not.toBe(TRANSFER_DATE);
  });

  it("A15-5: 시나리오 C(환지의제 필지 1개) → 확정일 · 양도일 아님", async () => {
    const { run, get } = captureBody(parcelForm([replotted()]));
    await run();
    const body = get() as { acquisitionDate?: string };
    expect(body.acquisitionDate).toBe("2003-01-01");
  });

  it("A15-6(회귀): 시나리오 B(필지1=일반) → 첫 필지 취득일 그대로", async () => {
    const { run, get } = captureBody(parcelForm([parcel(), replotted({ id: "p2" })]));
    await run();
    expect((get() as { acquisitionDate?: string }).acquisitionDate).toBe("2005-04-10");
  });

  it("A15-7: 취득일이 양도일 이전이라는 서버 refine 전제를 ④가 스스로 지킨다", async () => {
    const { run, get } = captureBody(parcelForm([replotted()]));
    await run();
    const body = get() as { acquisitionDate?: string; transferDate?: string };
    expect(String(body.acquisitionDate) < String(body.transferDate)).toBe(true);
  });
});

describe("[A15] ⑧ 확정 불가 조합은 이미 차단된다 (추가 fallback이 불필요한 근거)", () => {
  it("A15-8: 환지 ON + 확정일 없음 → 차단", () => {
    expect(validateStep(0, parcelForm([replotted({ replottingConfirmDate: "" })]))).toMatch(
      /환지처분확정일/,
    );
  });

  it("A15-9: 환지 OFF + 취득일 없음 → 차단", () => {
    expect(validateStep(0, parcelForm([parcel({ acquisitionDate: "" })]))).toMatch(/취득일/);
  });
});
