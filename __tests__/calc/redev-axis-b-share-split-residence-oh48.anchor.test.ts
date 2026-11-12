/**
 * OH-48 — 재개발 완공APT 축 B: 첫 지분 카드가 분리 거주(종전·신축주택 거주개월)를 쓰는데 둘째 지분 카드 칸이 비면 ⑧이 막는다.
 *
 * ## 결함 (실측 2026-11-12 · 모의 세율)
 *
 * 첫 카드 분리 입력은 Step4 거주를 대신한다(⑤가 Step4 칸을 숨긴다). 둘째 카드 칸이 비면 서버가 그 지분에 숨은 Step4 값을
 * 승계했다 — 50/50 · 종전 60 + 신축 24개월:
 *
 * | 둘째 카드 | 숨은 Step4 | 둘째 지분 장특공제 | 결정세액 |
 * |---|---|---|---|
 * | 같은 값 입력(오라클) | 빈칸 | 181,236,362 | 54,170,364 |
 * | 빈칸 | 빈칸 | 79,418,181 | 92,861,272 |
 * | 빈칸 | 84개월 | 173,381,817 | 57,155,091 |
 *
 * 완공APT 분리 거주는 지분 카드마다 편집하는 칸이라 자동 승계하지 않고 입력을 요구한다(사용자 결정 a).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { SHARE_SPLIT_RESIDENCE_MISSING_MESSAGE, shareSplitResidenceMissingField } from "@/lib/calc/axis-b-share-residence";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { redevAptForm, runCalc } from "./_helpers/redev-one-house-route";

const SPLIT = { redevPriorHouseResidenceMonths: "60", redevNewHouseResidenceMonths: "24" };

function form(opts: { primary?: Record<string, unknown>; second?: Record<string, unknown>; formOver?: Partial<TransferFormData> } = {}): TransferFormData {
  const f = redevAptForm({ share: ["50", "100"], assetOver: { ...SPLIT, residencePeriods: [], residenceInputMode: "direct", residencePeriodMonthsAsset: "", ...opts.primary } });
  const p = f.assets[0];
  const s2 = { ...p, assetId: "share2", assetLabel: "지분2", redevPriorHouseResidenceMonths: "", redevNewHouseResidenceMonths: "", ...opts.second };
  return { ...f, assetSplitMode: "fractional", residencePeriodMonths: "", assets: [p, s2], ...opts.formOver } as TransferFormData;
}

const shareIssue = (f: TransferFormData) =>
  collectStepIssues(0, f).find((i) => i.message.includes(SHARE_SPLIT_RESIDENCE_MISSING_MESSAGE));

describe("OH-48 — 축 B 완공APT 지분 카드 분리 거주", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("🔴 첫 카드 분리 입력 + 둘째 카드 빈칸 → 둘째 카드 종전주택 거주 칸에서 차단", () => {
    const issue = shareIssue(form());
    expect(issue).toMatchObject({ step: 0, assetIndex: 1, field: "redevPriorResidenceStartDate" });
    expect(issue?.message).toBe(`자산 2: ${SHARE_SPLIT_RESIDENCE_MISSING_MESSAGE}`);
  });

  it("둘째 카드에 신축주택 거주만 있어도 통과(분리 입력 하나라도 있으면 분리 입력)", () => {
    expect(shareIssue(form({ second: { redevNewHouseResidenceMonths: "24" } }))).toBeUndefined();
  });

  it("토지만 출자한 지분 → 신축주택 거주 칸을 가리킨다(종전주택 칸은 화면에 없다 · leaf — 이 카드는 준공일 등 다른 ⑧이 먼저 걸린다)", () => {
    const f = form({ second: { redevOriginalAssetType: "land" } });
    expect(shareSplitResidenceMissingField(f.assets[1], f.assets[0], f)).toBe("redevNewResidenceStartDate");
    const filled = form({ second: { redevOriginalAssetType: "land", redevNewHouseResidenceMonths: "24" } });
    expect(shareSplitResidenceMissingField(filled.assets[1], filled.assets[0], filled)).toBeNull();
  });

  it("막지 않는 경우(leaf) — 첫 카드가 분리 입력을 안 씀 · 1세대1주택 축 밖(섹션 숨김) · 둘째 지분이 승계조합원(섹션 없음) · 늦게 취득한 지분", () => {
    const missing = (f: TransferFormData) => shareSplitResidenceMissingField(f.assets[1], f.assets[0], f);
    expect(missing(form())).toBe("redevPriorResidenceStartDate"); // 기준선 — 아래 넷은 이 한 조건만 바꾼다
    expect(missing(form({ primary: { redevPriorHouseResidenceMonths: "", redevNewHouseResidenceMonths: "" } }))).toBeNull();
    expect(missing(form({ formOver: { isOneHousehold: false } }))).toBeNull();
    expect(missing(form({ second: { redevIsSuccessorMember: "yes" } }))).toBeNull();
    // 첫 카드보다 늦게 취득한 지분 — 칸이 날짜뿐이라 «거주 없음»을 넣을 수 없어 막지 않는다(서버 승계 · 남은 한계)
    expect(missing(form({ second: { acquisitionDate: "2012-01-01" } }))).toBeNull();
  });

  it("오라클 — 둘째 카드에 같은 값을 넣으면 두 지분 장특공제가 같다(181,236,362) · 결정세액 54,170,364", async () => {
    const r = await runCalc(form({ second: SPLIT }));
    expect(r.issues.map((i) => i.message)).toEqual([]);
    expect(r.status).toBe(200);
    const agg = r.json.data.aggregated;
    expect(agg.properties.map((p: { longTermHoldingDeduction: number }) => p.longTermHoldingDeduction)).toEqual([181_236_362, 181_236_362]);
    expect(agg.determinedTax).toBe(54_170_364);
  });
});
