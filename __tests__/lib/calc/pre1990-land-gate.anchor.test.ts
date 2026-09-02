/**
 * anchor — pre1990 토지등급 환산(§164④) 게이트의 **기간 요건**
 *
 * 코드리뷰 2026-09 A09. 종전에는 같은 술어가 4곳에 복제돼 있었고 **④에만 기간 요건이 빠져**
 * 있었다(다건은 post-1985 증여 가드조차 없었다).
 *
 * `pre1990Enabled`는 「환산 클릭 시 set되는 uncleaable 래치」(`CompanionAcqPurchaseBlock:92`)라
 * 취득일을 1990.8.30. 이후로 정정하고 실거래가로 전환해도 **stale true로 남는다**. 게이트가
 * 그대로 서면 `acquisitionPrice`·`expenses`가 0으로 송신되고 엔진 STEP 0.4가 환산을 강제한다
 * ⇒ 실측 61,409,855 ~ 178,196,271원 과대(등급 입력 종속).
 *
 * 조문: 「소득세법 시행령」 §164④ 본문 첫 구절 —
 *   「**1990년 8월 30일 개별공시지가가 고시되기 전에 취득한 토지**의 취득당시의 기준시가는 …」
 *
 * ⚠️ 이 anchor가 없으면 기간 요건을 되돌려도 red가 나지 않는다(리뷰 시점 mutation probe 3회
 *    336/3,334 · 274/2,756 · 1,213/13,882 전부 반응 0건).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { hasPre1990LandEstimation } from "@/lib/calc/transfer-pre1990-land-gate";
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

/** 토지 + pre1990 등급 입력 완비 + 래치 ON. 취득일·취득원인만 케이스별로 갈아끼운다. */
function landForm(over: Record<string, unknown> = {}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-05-01";
  form.contractTotalPrice = "900,000,000";
  form.householdHousingCount = "1";
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "land",
    acquisitionDate: "1988-05-01",
    useEstimatedAcquisition: true,
    pre1990Enabled: true,
    pre1990GradeMode: "value",
    pre1990Grade_current: "218",
    pre1990Grade_prev: "218",
    pre1990Grade_atAcq: "218",
    pre1990PricePerSqm_1990: "500,000",
    acquisitionArea: "100",
    standardPriceAtAcq: "50,000,000",
    standardPriceAtTransfer: "150,000,000",
    ...over,
  };
  return form;
}

describe("[A09] pre1990 §164④ 게이트 — 기간 요건 (술어 단위)", () => {
  it("A09-1: 취득일 1990-08-29 → 게이트 ON (경계 직전)", () => {
    expect(hasPre1990LandEstimation(landForm({ acquisitionDate: "1990-08-29" }).assets[0])).toBe(true);
  });

  it("A09-2: 취득일 1990-08-30 → 게이트 OFF (고시일 당일은 개별공시지가가 있다)", () => {
    expect(hasPre1990LandEstimation(landForm({ acquisitionDate: "1990-08-30" }).assets[0])).toBe(false);
  });

  it("A09-3: 취득일을 2005년으로 정정해도 stale 래치가 남는다 → 게이트 OFF", () => {
    expect(hasPre1990LandEstimation(landForm({ acquisitionDate: "2005-06-01" }).assets[0])).toBe(false);
  });

  it("A09-4: 상속은 **상속개시일**이 기준 — raw 취득일이 1990 이후여도 과차단하지 않는다", () => {
    const asset = landForm({
      acquisitionCause: "inheritance",
      acquisitionDate: "2005-06-01",
      inheritanceStartDate: "1988-05-01",
    }).assets[0];
    expect(hasPre1990LandEstimation(asset)).toBe(true);
  });

  it("A09-5(회귀): post-1985 증여 배제는 그대로 유지된다", () => {
    const asset = landForm({ acquisitionCause: "gift", acquisitionDate: "1987-05-01" }).assets[0];
    expect(hasPre1990LandEstimation(asset)).toBe(false);
  });

  it("A09-6(회귀): pre-1985 증여는 통과한다", () => {
    const asset = landForm({ acquisitionCause: "gift", acquisitionDate: "1980-03-01" }).assets[0];
    expect(hasPre1990LandEstimation(asset)).toBe(true);
  });

  it("A09-7: 토지가 아니면 게이트 OFF", () => {
    expect(hasPre1990LandEstimation(landForm({ assetKind: "housing" }).assets[0])).toBe(false);
  });
});

describe("[A09] ④ 단건 — stale 래치가 환산 모드를 강제하지 않는다", () => {
  it("A09-8: 1990.8.30. 이전 취득 → pre1990Land 전송 + 환산 override (회귀 대조군)", async () => {
    const { run, get } = captureBody(landForm());
    await run();
    const body = get()! as { pre1990Land?: unknown; acquisitionPrice?: number };
    expect(body.pre1990Land).toBeDefined();
    // 환산 모드이므로 취득가액은 0으로 송신되고 엔진이 환산한다
    expect(body.acquisitionPrice).toBe(0);
  });

  it("A09-9: 취득일 2005년 + stale 래치 + 실거래가 → pre1990Land 미전송 · 취득가액 보존", async () => {
    const form = landForm({
      acquisitionDate: "2005-06-01",
      useEstimatedAcquisition: false,
      fixedAcquisitionPrice: "600,000,000",
    });
    const { run, get } = captureBody(form);
    await run();
    const body = get()! as { pre1990Land?: unknown; acquisitionPrice?: number };
    expect(body.pre1990Land).toBeUndefined();
    expect(body.acquisitionPrice).toBe(600_000_000);
  });
});

describe("[A09] ⑬ 다건 — 단건과 같은 게이트 (종전엔 가드가 더 약했다)", () => {
  it("A09-10: 1990.8.30. 이전 취득 → pre1990Land 구성 (회귀 대조군)", () => {
    const payload = buildPropertyPayload(landForm()) as Record<string, unknown>;
    expect(payload.pre1990Land).toBeDefined();
  });

  it("A09-11: 취득일 2005년 + stale 래치 → pre1990Land 미구성", () => {
    const payload = buildPropertyPayload(
      landForm({ acquisitionDate: "2005-06-01" }),
    ) as Record<string, unknown>;
    expect(payload.pre1990Land).toBeUndefined();
  });

  it("A09-12: post-1985 증여 배제 — 종전 다건에는 이 가드가 없었다", () => {
    const payload = buildPropertyPayload(
      landForm({ acquisitionCause: "gift", acquisitionDate: "1987-05-01" }),
    ) as Record<string, unknown>;
    expect(payload.pre1990Land).toBeUndefined();
  });
});
