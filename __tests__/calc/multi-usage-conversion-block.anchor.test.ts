/**
 * anchor: 다건에서 비주택→주택 용도변경(§95⑤·⑥ · 영 §154⑤ 단서)은 **차단하지 않고** 단건과 같은 세액을 낸다
 * (G2-4, 2026-10-11 — 2026-09-05 Q26 차단을 뒤집음)
 *
 * ## 종전
 *
 * Q26이 `validateMultiSupportedMode`에서 이 모드를 막은 사유는 다건 ④⑬이 `nonHousingToHousingConversion` 키와
 * §95⑤2호 거주월수 클램프를 만들지 않아 세액이 조용히 달라진다는 배관 미비였다. 이 파일은 그 차단을 고정하면서
 * 「다건 지원을 여는 작업은 ④⑬⑭에 클램프까지 옮겨야 한다 — 그때 이 케이스를 뒤집을 것」이라 적었다.
 *
 * ## 지금
 *
 * 배선은 `4ad9baefb`(2026-09-11)에서 끝났다 — ④⑬ `multi-transfer-tax-api.ts`(키 + 클램프) · ⑭ `multi/route.ts`.
 * ⑫ `MULTI_REJECT_RULES`는 이 키를 거부하지 않는다. 차단만 남아 용도변경 주택을 판 해에 다른 양도도 있는
 * 사용자가 앱 안에서 연간 합산 세액을 얻을 길이 없는 막다른 길이었다(안내 문구의 「단건 계산기」는 다른 날
 * 양도분을 합산하지 못한다). 그래서 차단을 풀고, 같은 사실의 **단건 route 결과와 parity**로 고정한다.
 *
 * 배선(1건)은 `__tests__/lib/calc/multi-usage-conversion-plumbing.anchor.test.ts`가 따로 고정한다.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { validateMultiSupportedMode, validateMultiSettings, isPropertyReady } from "../../lib/calc/multi-transfer-tax-validate";
import { validateStep } from "../../lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "../../lib/stores/calc-wizard-store";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

function formWith(assetOverrides: Partial<AssetForm>): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2024-08-01",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionDate: "2015-03-01",
        ...assetOverrides,
      } as AssetForm,
    ],
  };
}

/** 2015 취득 주택 — 전환일(`conv`) 이후만 주거용, 거주는 전환일부터. `on=false`면 토글 OFF 대조. */
function conversionForm(price: string, conv: string, on = true, td = "2026-06-01"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: td, isOneHousehold: true, contractTotalPrice: price, householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: true, residencePeriodMonths: "0", householdHousingCount: "1",
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-10", actualSalePrice: price,
    fixedAcquisitionPrice: "500000000", addressJibun: "테스트 1", regionCode: "4113510300",
    hasNonHousingConversion: on, residentialUseStartDate: on ? conv : "",
    residenceInputMode: "interval", residencePeriods: [{ moveInDate: conv, moveOutDate: "2026-05-01" }],
  });
  return f;
}

/** 다른 날 양도하는 과세 일반 주택(연간 합산 사용자) — 용도변경과 무관한 대조 자산. */
function plainHouse(td: string): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: td, isOneHousehold: false, contractTotalPrice: "700000000", householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: true, residencePeriodMonths: "0",
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2019-03-02", actualSalePrice: "700000000",
    fixedAcquisitionPrice: "400000000", addressJibun: "테스트 2", regionCode: "4113510300",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  });
  return f;
}

const item = (form: TransferFormData, i = 1) => ({ propertyId: `p${i}`, propertyLabel: `p${i}`, form, completionPercent: 100 }) as never;
const settings = (forms: TransferFormData[]) =>
  ({ taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER", properties: forms.map((f, i) => item(f, i + 1)) }) as never;
const useRates = (td: string) => vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(td)) as never);

describe("validateMultiSupportedMode — 용도변경(§95⑤·⑥)", () => {
  it("🔑 용도변경 ON + 주거용 사용 개시일 → 차단하지 않는다 (배선이 끝났다 — G2-4)", () => {
    expect(
      validateMultiSupportedMode(formWith({ hasNonHousingConversion: true, residentialUseStartDate: "2020-06-01" })),
    ).toBeNull();
  });

  it("대조군 — 토글 OFF 일반 주택도 차단하지 않는다", () => {
    expect(validateMultiSupportedMode(formWith({}))).toBeNull();
  });

  it("⑧ 전 경로가 통과한다 — 건별 단계·isPropertyReady·validateMultiSettings (막다른 길 해소)", () => {
    const f = conversionForm("2000000000", "2022-01-01");
    expect([0, 1, 2].map((s) => validateStep(s, f))).toEqual([null, null, null]);
    expect(isPropertyReady(item(f))).toBe(true);
    expect(validateMultiSettings(settings([f]))).toBeNull();
  });

  it("긍정 짝 — 이 해제는 용도변경만이다: 같은 화면의 다른 차단(재개발)은 그대로 막는다", () => {
    const reason = validateMultiSupportedMode(formWith({ assetKind: "redevelopment_apt" }));
    expect(reason).toContain("재개발");
  });
});

describe("다건 route = 단건 route — 용도변경 자산 (G2-4 parity)", () => {
  const CASES: [string, string, string][] = [
    ["A 9억 · 2024-01-01 전환(과세)", "900000000", "2024-01-01"],
    ["B 9억 · 2022-01-01 전환(비과세)", "900000000", "2022-01-01"],
    ["C 20억 · 2022-01-01 전환(12억 초과)", "2000000000", "2022-01-01"],
  ];
  for (const [name, price, conv] of CASES) {
    it(`${name}: 다건 [status, isExempt, totalTax] = 단건`, async () => {
      useRates("2026-06-01");
      const f = conversionForm(price, conv);
      const s = await runSingle(f);
      const m = await postMulti(await buildMultiBody([f]));
      expect(s.status).toBe(200);
      expect([m.status, m.props[0]?.isExempt, m.totalTax]).toEqual([s.status, s.isExempt, s.totalTax]);
    });
  }

  it("구별력 — 용도변경 키가 실제로 결론을 가른다(C): 키를 지우면 다건 세액이 단건과 달라진다", async () => {
    useRates("2026-06-01");
    const f = conversionForm("2000000000", "2022-01-01");
    const s = await runSingle(f);
    const body = await buildMultiBody([f]);
    const props = body.properties as Record<string, unknown>[];
    expect(props[0].nonHousingToHousingConversion).toBeDefined();
    const stripped = await postMulti({ ...body, properties: [{ ...props[0], nonHousingToHousingConversion: undefined }] });
    expect(stripped.totalTax).not.toBe(s.totalTax);
  });

  it("2건 합산(용도변경 주택 + 다른 날 일반 주택): 용도변경 주택 행의 장특공제·양도차익이 단건과 같다", async () => {
    useRates("2026-06-01");
    const conv = conversionForm("2000000000", "2022-01-01");
    const s = await runSingle(conv);
    const m = await postMulti(await buildMultiBody([conv, plainHouse("2026-09-01")]));
    expect(m.status).toBe(200);
    const row = m.props[0] as Record<string, unknown>;
    const r = s.r as Record<string, unknown>;
    expect(r.longTermHoldingDeduction as number).toBeGreaterThan(0); // 비교가 0=0이 아니게
    expect(row.longTermHoldingDeduction).toBe(r.longTermHoldingDeduction);
    expect(row.transferGain).toBe(r.transferGain);
    expect(row.isExempt).toBe(s.isExempt);
  });

  it("대조 — 토글 OFF면 용도변경 키를 싣지 않고 단건 = 다건", async () => {
    useRates("2026-06-01");
    const f = conversionForm("2000000000", "2022-01-01", false);
    const s = await runSingle(f);
    const body = await buildMultiBody([f]);
    expect((body.properties as Record<string, unknown>[])[0].nonHousingToHousingConversion).toBeUndefined();
    const m = await postMulti(body);
    expect([m.status, m.totalTax]).toEqual([s.status, s.totalTax]);
  });
});
