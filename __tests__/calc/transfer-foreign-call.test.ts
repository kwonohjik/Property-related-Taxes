/**
 * ④ 국외 부동산 계산 호출(`callForeignRealEstateAPI`) — 실제 route를 fetch 뒤에 붙여 폼 → body → Zod → 엔진 → 결과 래핑까지.
 *
 * - K-1 교재 사례: 양도소득금액 437,000,000 · 과세표준 434,500,000 · 산출세액 147,860,000 · 지방소득세 14,786,000
 * - 응답에 mode가 없으므로 `{ mode: "foreign", result }`로 감싼다
 * - 400 fieldErrors(점 표기) → U1 입력칸 `data-field` 앵커 이슈
 * - 차손 혼재 → 통산하지 않고 계산(FOREIGN_LOSS_NOT_NETTED)
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  shouldBypassRateLimit: vi.fn(),
}));
vi.mock("@/lib/api/rate-limit", () => rateLimitMock);
rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 });
rateLimitMock.getClientIp.mockReturnValue("127.0.0.1");
rateLimitMock.shouldBypassRateLimit.mockReturnValue(false);

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/foreign/route";
import { FOREIGN_API_PATH, ForeignCalcError, callForeignRealEstateAPI } from "@/lib/calc/transfer-foreign-call";
import { buildForeignRealEstateBody } from "@/lib/calc/transfer-foreign-body";
import { foreignFieldErrorsToIssues } from "@/lib/calc/transfer-tax-validate-foreign";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { foreignForm, gainAsset2, k1Asset } from "./_foreign-form-fixture";

/** 브라우저 fetch 대신 route 핸들러를 직접 부른다 — 전송 body·응답은 실제와 같다 */
function routeFetch() {
  const calls: { url: string; body: unknown }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(input), body });
    return POST(
      new NextRequest(`http://localhost${String(input)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    );
  });
  return { calls, spy };
}

afterEach(() => vi.restoreAllMocks());

describe("callForeignRealEstateAPI — K-1 교재 사례", () => {
  it("국외 전용 경로로 POST하고 mode:\"foreign\"으로 감싼다 · 숫자는 교재와 같다", async () => {
    const { calls } = routeFetch();
    const form = foreignForm({ foreignResidenceYears: "5" });
    const res = await callForeignRealEstateAPI(form);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(FOREIGN_API_PATH);
    // 전송 body = 순수 빌더 body(⑧이 refine을 돌리는 것과 같은 함수)
    expect(calls[0].body).toEqual(JSON.parse(JSON.stringify(buildForeignRealEstateBody(form).body)));
    expect(res.mode).toBe("foreign");
    const r = res.result;
    expect(r.incomeAmountTotal).toBe(437_000_000);
    expect(r.taxBase).toBe(434_500_000);
    expect(r.calculatedTax).toBe(147_860_000);
    expect(r.localIncomeTax).toBe(14_786_000);
  });

  it("국외 폼이 아니면 호출하지 않는다", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(callForeignRealEstateAPI(createDefaultTransferFormData())).rejects.toThrow("국외자산 폼이 아닙니다");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("400 fieldErrors → U1 입력칸 앵커", () => {
  it("서버가 환율 0을 막으면 그 자산 카드의 «양도일 기준환율» 칸으로 되돌린다", async () => {
    routeFetch();
    // ⑧을 통과하지 않는 폼을 일부러 보낸다 — 서버 오류 경로 자체를 검증
    const form = foreignForm({}, [k1Asset({ transferRate: "0" })]);
    const err = await callForeignRealEstateAPI(form).catch((e) => e);
    expect(err).toBeInstanceOf(ForeignCalcError);
    const issue = (err as ForeignCalcError).issues.find((i) => i.field === "foreignAsset.transferRate");
    expect(issue).toBeDefined();
    expect(issue?.assetIndex).toBe(0);
    expect(issue?.message).toContain("국외자산 1");
  });

  it("자본적지출 행·외국납부세액 행·거주 연수의 경로도 칸으로 되돌린다", () => {
    const issues = foreignFieldErrorsToIssues(
      {
        "assets.0.capitalExpenditures.1.exchangeRate": ["assets[0].capitalExpenditures[1].exchangeRate: 환율은 0보다 커야 합니다"],
        "foreignTax.items.0.exchangeRate": ["foreignTax.items[0].exchangeRate: 환율은 0보다 커야 합니다"],
        domesticResidenceYears: ["domesticResidenceYears: 정수여야 합니다"],
      },
      [{ assetIndex: 1, rowIndex: 0 }],
    );
    expect(issues.map((i) => i.field)).toEqual([
      "foreignAsset.capitalRows.1.rate",
      "foreignTaxRow.1.0.rate",
      "foreignResidenceYears",
    ]);
    expect(issues[0].assetIndex).toBe(0);
    expect(issues[1].assetIndex).toBeUndefined(); // 외국납부세액 행은 카드 밖
  });

  it("같은 칸의 중복 오류는 1건만 올린다", () => {
    const issues = foreignFieldErrorsToIssues(
      { "assets.0.transfer.exchangeRate": ["a: 첫째", "a: 둘째"] },
      [],
    );
    expect(issues).toHaveLength(1);
  });

  it("칸으로 되돌릴 수 없는 경로(_root)는 이슈로 남되 앵커는 없다 — 조용히 버리지 않는다", () => {
    const issues = foreignFieldErrorsToIssues({ _root: ["확인할 입력이 있습니다"] }, []);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBeUndefined();
  });
});

describe("양도차손 자산 + 양도차익 자산 — 통산하지 않고 계산(확인 필요 코드)", () => {
  it("차단하지 않고 결과를 돌려준다 — 차손 −160,000,000은 0으로 보고 차익 125,000,000만 과세", async () => {
    routeFetch();
    // 차손: 양도 $100,000@1,000 = 100,000,000 < 취득 $200,000@1,300 = 260,000,000 (양도 7/10) · 차익 gainAsset2: 240,000,000 − 115,000,000 = 125,000,000 (양도 3/5)
    const loss = k1Asset({ transferAmount: "100000", transferRate: "1000", costRows: [], acquisitionAmount: "200000" });
    const res = await callForeignRealEstateAPI(foreignForm({}, [loss, gainAsset2()]));
    const r = res.result;
    expect(r.rows.map((x) => x.capitalGain)).toEqual([-160_000_000, 125_000_000]);
    expect(r.incomeAmountTotal).toBe(125_000_000);
    expect(r.taxBase).toBe(122_500_000); // 통산하면 0
    expect(r.calculatedTax).toBe(27_435_000); // 122,500,000 × 35% − 15,440,000
    expect(r.localIncomeTax).toBe(2_743_500);
    expect(r.rows.map((x) => x.basicDeductionAllocated)).toEqual([0, 2_500_000]);
    expect(r.confirmationNeeded).toContain("FOREIGN_LOSS_NOT_NETTED");
  });

  it("fieldErrors 없는 500은 서버 메시지를 그대로 보인다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다" } }), { status: 500 }));
    const err = (await callForeignRealEstateAPI(foreignForm()).catch((e) => e)) as ForeignCalcError;
    expect(err.message).toBe("계산 중 오류가 발생했습니다");
    expect(err.issues).toEqual([]);
  });
});
