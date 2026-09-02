/**
 * anchor — §163⑨ 「② 완비 + ① 미입력」 조합이 payload를 잃지 않는다 (A03)
 *
 * 코드리뷰 2026-09 A03 · **실측 상가 최대 124,740,000원 과대**.
 *
 * post-deemed 분기의 `if (reportedRaw <= 0) return {};`가 ①(상속세 신고가액)이 비면
 * `inheritedAcquisition` payload를 **통째로 버렸다**. ②의 엔진 주입은 전부
 * `resolveInheritedAcquisitionInput` 안에 있고 그 함수는 `runInheritedAcquisitionStep`
 * (`if (!rawInput.inheritedAcquisition) return null;`)을 통과해야 실행되므로,
 * §164⑥ 8필드를 다 채워도 **비교 자체가 일어나지 않고** 취득가액이 0이 된다.
 *
 * 조문 — 「소득세법 시행령」 §163⑨:
 *   1호 「… 평가한 가액과 **제164조제4항의 규정에 의한 가액중 많은 금액**」
 *   2호 「… 평가한 가액과 **제164조제5항 내지 제7항의 규정에 의한 가액중 많은 금액**」
 * ⇒ ②만 있어도 비교 대상이다. 엔진은 `reportedValue: 0`에서 `max(0, ②) = ②`를 채택한다.
 *
 * ⑧은 이 조합을 **의도적으로 통과**시킨다 —
 *   `transfer-tax-validate-commercial-asset.ts:53` 「①만 요구하면 **②를 다 채운 사용자가 막힌다**」
 *   `transfer-tax-validate-clause-a.ts:116` 「②도 가목이다」
 * 그래서 ④가 버리면 화면·검증 어디에도 신호가 없는 **침묵 소실**이 된다. 게다가 입력 카드는
 * 「N개 항목을 모두 입력한 경우에만 비교합니다」라고 화면에서 약속한다.
 *
 * ⚠️ **상속 전용**이다. 증여도 같은 줄을 타지만 ⑧이 step 0에서 차단하므로
 *    게이트를 증여까지 넓히면 불필요한 회귀가 난다(A03-6이 그 경계를 고정한다).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

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

function baseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2023-02-16";
  form.contractTotalPrice = "2,000,000,000";
  form.householdHousingCount = "1";
  return form;
}

/** 상속 상가 — §164⑥ 8필드 완비. ①(`publishedValueAtInheritance`)만 케이스별로 조절. */
function commercialForm(over: Record<string, unknown> = {}) {
  const form = baseForm();
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: "2002-06-01",
    inheritanceStartDate: "2002-06-01", // 상가 최초고시(2005-01-01) 前
    publishedValueAtInheritance: "", // ① 공란
    inheritanceValuationMethod: "supplementary",
    cbExclusiveArea: "100",
    cbSharedArea: "50",
    cbLandArea: "80",
    cbUnitPriceAtFirstOrAcq: "3,000,000",
    cbLandPricePerSqmAtAcq: "1,500,000",
    cbLandPricePerSqmAtFirst: "2,000,000",
    cbBuildingStdPriceAtAcq: "500,000",
    cbBuildingStdPriceAtFirst: "700,000",
    ...over,
  };
  return form;
}

/** 상속 토지 — §164④ 5필드 완비. */
function landForm(over: Record<string, unknown> = {}) {
  const form = baseForm();
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "1988-05-01",
    inheritanceStartDate: "1988-05-01",
    publishedValueAtInheritance: "",
    inheritanceValuationMethod: "supplementary",
    acquisitionArea: "300",
    pre1990GradeMode: "value",
    pre1990Grade_current: "218",
    pre1990Grade_prev: "218",
    pre1990Grade_atAcq: "218",
    pre1990PricePerSqm_1990: "500,000",
    ...over,
  };
  return form;
}

const inh = (b: unknown) => (b as { inheritedAcquisition?: Record<string, unknown> }).inheritedAcquisition;

describe("[A03] 상가 §164⑥ — ② 완비 + ① 미입력", () => {
  it("A03-1: payload가 전송된다 (종전에는 통째로 버려졌다)", async () => {
    const { run, get } = captureBody(commercialForm());
    await run();
    expect(inh(get())).toBeDefined();
  });

  it("A03-2: reportedValue 0 + reportedMethod가 함께 실린다 (legacyFallback 면적곱 회피)", async () => {
    const { run, get } = captureBody(commercialForm());
    await run();
    const p = inh(get())!;
    expect(p.reportedValue).toBe(0);
    expect(p.reportedMethod).toBeTruthy();
  });

  it("A03-3(회귀): ①이 있으면 종전대로 그 값이 실린다", async () => {
    const { run, get } = captureBody(commercialForm({ publishedValueAtInheritance: "300,000,000" }));
    await run();
    expect(inh(get())!.reportedValue).toBe(300_000_000);
  });

  it("A03-4(회귀): ①도 ②도 없으면 종전대로 payload를 보내지 않는다", async () => {
    const { run, get } = captureBody(commercialForm({ cbUnitPriceAtFirstOrAcq: "", cbLandPricePerSqmAtAcq: "" }));
    await run();
    expect(inh(get())).toBeUndefined();
  });
});

describe("[A03] 토지 §164④ — ② 완비 + ① 미입력", () => {
  it("A03-5: payload가 전송된다", async () => {
    const { run, get } = captureBody(landForm());
    await run();
    expect(inh(get())).toBeDefined();
  });
});

describe("[A03] 경계 — 상속 전용", () => {
  it("A03-6: 증여는 종전대로 payload를 보내지 않는다 (⑧이 step 0에서 차단하는 축)", async () => {
    const { run, get } = captureBody(
      commercialForm({ acquisitionCause: "gift", inheritanceStartDate: "", fixedAcquisitionPrice: "" }),
    );
    await run();
    expect(inh(get())).toBeUndefined();
  });
});
