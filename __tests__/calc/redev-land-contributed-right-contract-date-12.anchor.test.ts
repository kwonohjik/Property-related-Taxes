/**
 * #12 ④⑧⑫⑭ — 조합원 분양계약일(`redevRightContractDate`) 입력 경로.
 *
 * 폼(AssetForm) → ④ payload(`rightContractDate`) → ⑧ validate → ⑫ Zod → ⑭ Date 변환 → 엔진(입주권 전환 완료일 =
 * 인가일·분양계약일 중 늦은 날). 한 층만 빠져도 엔진은 「분양계약일 미입력」으로 조용히 떨어져 거주요건 예외가 성립하지 않는다.
 * 판정 자체(P1~P4)는 엔진 anchor `land-contributed-apt-residence-basis-12`가 고정한다 — 이 파일은 **입력이 도달하는지**를 본다.
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
  it("토지 출자 원조합원 완공APT: 분양계약일을 싣는다", () => {
    expect(buildRedevelopmentPayload(asset({ redevRightContractDate: "2020-01-10" })).rightContractDate).toBe("2020-01-10");
  });
  it("미입력이면 undefined — 모르는 값을 날짜로 지어내지 않는다", () => {
    expect(buildRedevelopmentPayload(asset({})).rightContractDate).toBeUndefined();
  });
  it("축 밖(주택 출자 · 승계조합원 · 입주권)이면 stale 값을 보내지 않는다", () => {
    for (const o of [
      { redevOriginalAssetType: "housing" },
      { redevIsSuccessorMember: "yes" },
      { assetKind: "right_to_move_in", redevSubject: "right" },
    ]) {
      expect(buildRedevelopmentPayload(asset({ redevRightContractDate: "2020-01-10", ...o })).rightContractDate).toBeUndefined();
    }
  });
});

describe("#12 ⑧ — validate", () => {
  it("분양계약일 > 사용승인일 → 차단(칸 redevRightContractDate로 이동)", () => {
    const { result: err, fieldOf } = collectWithFields(() =>
      validateRedevelopmentAsset(asset({ redevRightContractDate: "2021-03-01" }), "자산1", true),
    );
    expect(err).toContain("분양계약일은 사용승인일 이전");
    expect(fieldOf(err!)).toBe("redevRightContractDate");
  });
  it("같은 날(계약일 = 사용승인일)은 통과, 미입력도 통과(선택 입력)", () => {
    expect(validateRedevelopmentAsset(asset({ redevRightContractDate: "2021-02-15" }), "자산1", true)).toBeNull();
    expect(validateRedevelopmentAsset(asset({}), "자산1", true)).toBeNull();
  });
});

describe("#12 ⑫·⑭·엔진 — route", () => {
  it("🔑 분양계약일이 공고 전(2020-01-10)이면 입력부터 엔진까지 도달해 비과세 (수정 전: 기대 불가 — 입력 칸 없음)", async () => {
    const r = await runCalc(form({ redevRightContractDate: "2020-01-10" }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.redevelopment as { rightContractDate?: string }).rightContractDate).toBe("2020-01-10");
    expect(r.result.isExempt).toBe(true);
  });
  it("부정 짝 — 같은 사실에서 분양계약일을 비우면 과세 + 입력 안내 고지", async () => {
    const r = await runCalc(form({}));
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect((r.result.warnings as string[]).join("\n")).toMatch(/조합원 분양계약일을 입력하지 않아/);
  });
  it("부정 짝 — 분양계약일이 공고 후(2020-07-01)면 입력해도 과세", async () => {
    const r = await runCalc(form({ redevRightContractDate: "2020-07-01" }));
    expect(r.result.isExempt).toBe(false);
  });
  it("⑫ — 분양계약일 > 사용승인일을 직접 호출하면 400", async () => {
    const r = await runCalc(form({ redevRightContractDate: "2020-01-10" }));
    const body = JSON.parse(JSON.stringify(r.body)) as { redevelopment: Record<string, unknown> };
    body.redevelopment.rightContractDate = "2021-03-01";
    const res = await postTransfer(body as unknown as Record<string, unknown>);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("분양계약일은 사용승인일 이전");
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
