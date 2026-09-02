/**
 * anchor — pre1990 §164④ 환산의 **일부양도(partial) 면적 축** (A01)
 *
 * 코드리뷰 2026-09 A01 · **실측 154,704,000원 과소(전액 소멸)**.
 *
 * `buildPre1990LandPayload`만 raw `acquisitionArea`(취득 전체면적)를 썼다. 같은 저장소의
 * 형제 두 경로는 이미 `resolveAcqAreaForStdPrice`를 경유한다:
 *   · 최상위 `transfer-tax-api.ts:483`  · 다필지 `transfer-tax-api-parcels.ts:68`
 *
 * 양도시 기준시가는 `StandardPriceInput`이 **양도면적** 기준으로 산출하므로
 * (`CompanionAcqPurchaseBlock.tsx:646` 취득시 `area={acquisitionArea}` ↔ `:668` 양도시
 * `area={transferArea}`), 분자만 (취득면적/양도면적)배 부풀려진다. 300/100 케이스에서는
 * 환산비율이 정확히 1.0이 되어 **환산취득가 = 양도가액 → 양도차익 0**이 된다.
 *
 * 조문: 「소득세법 시행령」 §176의2②2호(환산 산식) · §164④(1990.8.30. 前 취득 토지 기준시가)
 * · 「소득세법」 §114⑦(추계 대상 = **해당 양도자산**).
 *
 * ⚠️ 이 anchor가 없으면 되돌려도 red가 나지 않는다 — `pre1990`을 언급하는 테스트·spec
 *    30파일 중 `areaScenario`/`transferArea`를 한 글자라도 포함한 파일이 **0건**이었다
 *    (리뷰 시점 뮤테이션 3회 독립 90/1,015 · 750/7,712 · 757/7,807 전부 반응 0).
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

/** 1988년 취득 토지 · 환산 · pre1990 등급 완비. 면적 축만 케이스별로 갈아끼운다. */
function pre1990Form(over: Record<string, unknown> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2023-05-01";
  form.contractTotalPrice = "900,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "1988-05-01",
    useEstimatedAcquisition: true,
    pre1990Enabled: true,
    pre1990GradeMode: "value",
    pre1990Grade_current: "218",
    pre1990Grade_prev: "218",
    pre1990Grade_atAcq: "218",
    pre1990PricePerSqm_1990: "500,000",
    acquisitionArea: "300",
    transferArea: "300",
    areaScenario: "same",
    ...over,
  };
  return form;
}

const partial = (o = {}) => pre1990Form({ areaScenario: "partial", transferArea: "100", ...o });

describe("[A01] pre1990 §164④ payload 면적", () => {
  it("A01-1: 전부양도(same) → 취득 전체면적 (회귀 대조군)", async () => {
    const { run, get } = captureBody(pre1990Form());
    await run();
    const body = get() as { pre1990Land?: { areaSqm?: number } };
    expect(body.pre1990Land?.areaSqm).toBe(300);
  });

  it("A01-2: 일부양도(partial) → **양도분 면적**을 쓴다", async () => {
    const { run, get } = captureBody(partial());
    await run();
    const body = get() as { pre1990Land?: { areaSqm?: number } };
    expect(body.pre1990Land?.areaSqm).toBe(100);
  });

  it("A01-3: 같은 payload 안에서 자기모순이 없다 — pre1990 면적 = 최상위 취득면적", async () => {
    const { run, get } = captureBody(partial());
    await run();
    const body = get() as { pre1990Land?: { areaSqm?: number }; acquisitionArea?: number };
    // 종전에는 pre1990Land.areaSqm=300 vs acquisitionArea=100으로 갈렸다.
    expect(body.pre1990Land?.areaSqm).toBe(body.acquisitionArea);
  });

  it("A01-4: 양도면적 미입력(입력 중)이면 전체 면적으로 떨어진다 — 경로가 조용히 비활성되지 않는다", async () => {
    const { run, get } = captureBody(partial({ transferArea: "" }));
    await run();
    const body = get() as { pre1990Land?: { areaSqm?: number } };
    expect(body.pre1990Land?.areaSqm).toBe(300);
  });

  it("A01-5: 환지(reduction) 시나리오는 취득면적 그대로 — 이중 안분 없음", async () => {
    const { run, get } = captureBody(pre1990Form({ areaScenario: "reduction", transferArea: "100" }));
    await run();
    const body = get() as { pre1990Land?: { areaSqm?: number } };
    expect(body.pre1990Land?.areaSqm).toBe(300);
  });
});
