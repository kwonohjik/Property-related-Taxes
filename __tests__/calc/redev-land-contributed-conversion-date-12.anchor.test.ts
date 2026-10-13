/**
 * #12 ④⑫⑭ — 입주권 전환일 = 관리처분계획 인가일 (사용자 정정 2026-10-13).
 *
 * 원조합원(토지·건물 출자자)에게는 분양계약일이라는 개념이 없다 — 인가일에 보유 부동산이 입주권으로 바뀐다.
 * 종전의 「조합원 분양계약일」 입력(`redevRightContractDate` → `rightContractDate`)을 없앴으므로, 이 파일은
 * **그 입력이 어느 층에서도 다시 나타나지 않는 것**과 인가일만으로 면제 판정이 route 끝까지 가는 것을 고정한다.
 * 판정 자체(P1~P4)는 엔진 anchor `land-contributed-apt-residence-basis-12`가 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, postTransfer } from "./_helpers/redev-one-house-route";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** P1 — 대전 유성 · 토지 2005-01-01 출자 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 2024-06-01 · 거주 0개월 */
const P1 = (over: Record<string, unknown> = {}) => ({
  acquisitionDate: "2005-01-01",
  regionCode: "3020000000",
  residenceInputMode: "direct",
  residencePeriods: [],
  redevOriginalAssetType: "land",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: "2021-02-15",
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  ...over,
});
const form = (over: Record<string, unknown> = {}) =>
  redevAptForm({ count: "1", price: "1000000000", assetOver: P1(over), formOver: { residencePeriodMonths: "0" } as never });
const asset = (over: Record<string, unknown> = {}) => form(over).assets[0] as AssetForm;

describe("#12 ④ — payload", () => {
  it("분양계약일 키를 만들지 않는다 — 어느 축에서도", () => {
    for (const o of [{}, { redevOriginalAssetType: "housing" }, { redevIsSuccessorMember: "yes" }, { assetKind: "right_to_move_in", redevSubject: "right" }]) {
      expect("rightContractDate" in buildRedevelopmentPayload(asset({ redevRightContractDate: "2020-01-10", ...o }))).toBe(false);
    }
  });
});

describe("#12 ⑧ — validate", () => {
  it("저장 이력에 남은 분양계약일(구 입력)은 검증에 쓰이지 않는다 — 사용승인일보다 늦어도 막지 않는다", () => {
    expect(validateRedevelopmentAsset(asset({ redevRightContractDate: "2021-03-01" }), "자산1", true)).toBeNull();
  });
});

describe("#12 ⑫·⑭·엔진 — route", () => {
  it("🔑 인가일(2019-03-15)이 지정 공고(2020-06-19) 전이면 분양계약일 없이 비과세 — 입력부터 엔진까지, 분양계약일 고지도 없다", async () => {
    const r = await runCalc(form());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect("rightContractDate" in (r.body.redevelopment as object)).toBe(false);
    expect(r.result.isExempt).toBe(true);
    expect((r.result.warnings as string[]).join("\n")).not.toMatch(/분양계약일/);
  });
  it("부정 짝 — 같은 사실에서 인가일이 공고 후(2020-07-01)면 과세 (분양계약일을 넣을 칸이 없으니 인가일이 유일한 기준)", async () => {
    const r = await runCalc(form({ redevApprovalDate: "2020-07-01" }));
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
  });
  it("⑫ — 옛 클라이언트가 보낸 분양계약일은 조용히 무시된다(400이 아니다) · 판정은 인가일만 본다", async () => {
    const r = await runCalc(form());
    const body = JSON.parse(JSON.stringify(r.body)) as { redevelopment: Record<string, unknown> };
    body.redevelopment.rightContractDate = "2021-03-01";
    const res = await postTransfer(body as unknown as Record<string, unknown>);
    expect(res.status).toBe(200);
    expect(res.result.isExempt).toBe(true);
  });
  it("⑫ — 거주 개월 수가 사용승인일~양도일(약 40개월)을 넘으면 토지 출자도 차단 (준공 전 거주는 보유기간 중 거주가 아니다)", async () => {
    const r = await runCalc(
      redevAptForm({
        count: "1",
        price: "1000000000",
        assetOver: P1({ redevNewHouseResidenceMonths: "120", redevPriorHouseResidenceMonths: "" }),
        formOver: { residencePeriodMonths: "0" } as never,
      }),
    );
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).toContain("토지 출자 신축주택 거주기간 120개월");
  });
});
