/**
 * 별건 B3 — §163⑨1호 토지 비교(상증법 평가액 vs §164④ 가액 중 **큰 금액**)의 5칸은 토글 뒤에 숨기지 않는다
 *
 * 결함: 「1990.8.30. 이전 취득 토지 기준시가 환산」 토글을 켜고 5칸을 채운 뒤 끄면 칸이 숨는데 값은 남고,
 *   ④(`transfer-tax-api.ts` `hasPre1990ForSec164`)는 토글과 무관하게 5칸이 모두 차 있으면 `pre1990Land`를 보내 취득가액을 바꾼다.
 *   실측(상속 토지 1989 취득, 신고가액 1억 · 단가 5,000,000×100㎡): 토글 OFF·값 숨김 421,052,600원(산출세액 6,903,163)
 *   = 토글 ON 421,052,600원 = 비교 적용 / 5칸을 비우면 100,000,000원(산출세액 85,510,000). 토글은 이 맥락의 계산을 바꾸지 않는다.
 *   「많은 금액」(영 §163⑨ 단서 1호)은 강행이라 토글로 끌 수 있는 선택이 아니다 → 입력칸을 열고(검증 이동·E2E가 고정),
 *   계산은 그대로 둔다(법과 일치).
 */
import { describe, it, expect } from "vitest";
import { sec164LandFieldsAlwaysOpen, sec164LandLatchClearPatch } from "@/lib/calc/transfer-163-9-base-date";
import { sec164PartialInputError } from "@/lib/calc/transfer-tax-validate-sec164";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { buildPre1990LandPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const land = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "1989-01-01",
    inheritanceStartDate: "1989-01-01",
    acquisitionArea: "100",
    pre1990Enabled: false,
    ...over,
  }) as unknown as AssetForm;
const FULL = { pre1990PricePerSqm_1990: "5000000", pre1990Grade_current: "100000", pre1990Grade_prev: "90000", pre1990Grade_atAcq: "80000", pre1990GradeMode: "value" };

describe("sec164LandFieldsAlwaysOpen — 칸을 항상 여는 맥락", () => {
  it("🔑 의제취득일 이후 상속 토지", () => expect(sec164LandFieldsAlwaysOpen(land())).toBe(true));
  it("🔑 증여 토지 (1985 전후 무관 — `GiftLandStdPriceSection`)", () => {
    expect(sec164LandFieldsAlwaysOpen(land({ acquisitionCause: "gift", acquisitionDate: "1987-03-01" }))).toBe(true);
    expect(sec164LandFieldsAlwaysOpen(land({ acquisitionCause: "gift", acquisitionDate: "1980-03-01" }))).toBe(true);
  });
  it("긍정 짝: 의제취득일 前 상속은 제외 — 토글이 환산 모드를 정한다 (`PreDeemedInputs`)", () => {
    expect(sec164LandFieldsAlwaysOpen(land({ acquisitionDate: "1980-01-01", inheritanceStartDate: "1980-01-01" }))).toBe(false);
  });
  it("긍정 짝: 토지가 아니거나 매매면 아님", () => {
    expect(sec164LandFieldsAlwaysOpen(land({ assetKind: "housing" }))).toBe(false);
    expect(sec164LandFieldsAlwaysOpen(land({ acquisitionCause: "purchase" }))).toBe(false);
  });
});

describe("⑧ 부분 입력 오류의 이동 앵커", () => {
  const partial = { pre1990PricePerSqm_1990: "5000000" };
  const anchor = (a: AssetForm) => {
    const { result, fieldOf } = collectWithFields(() => sec164PartialInputError(a, "자산"));
    return { message: result, field: result ? fieldOf(result) : undefined };
  };
  it("🔑 비교 맥락 — 오류가 나고, 칸이 열려 있으므로 토글이 아니라 빈 칸이 앵커다", () => {
    const r = anchor(land(partial));
    expect(r.message).toMatch(/§164④ 취득당시 기준시가는 \d+개 항목을 \*\*모두\*\* 입력하거나/);
    expect(r.field).toBe("pre1990Grade_current");
  });
  it("긍정 짝: 의제취득일 前 상속은 여전히 토글이 앵커 (칸이 토글 뒤)", () => {
    const r = anchor(land({ ...partial, acquisitionDate: "1980-01-01", inheritanceStartDate: "1980-01-01" }));
    expect(r.message).toBeTruthy();
    expect(r.field).toBe("pre1990Enabled");
  });
});

describe("소비 = 화면 — 토글과 무관하게 5칸이 완비되면 ④가 환산 입력을 보낸다 (그래서 칸을 숨기면 안 된다)", () => {
  it("토글 OFF + 완비 → pre1990Land 포함", () => {
    expect(buildPre1990LandPayload(land({ ...FULL }), "2024-03-01")).toHaveProperty("pre1990Land");
  });
  it("긍정 짝: 비우면 {}", () => {
    expect(buildPre1990LandPayload(land(), "2024-03-01")).toEqual({});
  });
});

describe("켜짐 래치 정리 — 칸이 항상 열리는 맥락에서는 토글을 끌 수 없다", () => {
  it("🔑 비교 맥락의 켜짐은 끈다", () => {
    expect(sec164LandLatchClearPatch(land({ pre1990Enabled: true }))).toEqual({ pre1990Enabled: false });
  });
  it("긍정 짝: 의제취득일 前 상속의 켜짐은 사용자의 환산 선택이다 — 건드리지 않는다", () => {
    expect(sec164LandLatchClearPatch(land({ pre1990Enabled: true, acquisitionDate: "1980-01-01", inheritanceStartDate: "1980-01-01" }))).toEqual({});
  });
  it("복원 마이그레이션이 같은 patch를 쓴다 · 값(5칸)은 보존한다", () => {
    const a = migrateAsset({ ...land({ pre1990Enabled: true, ...FULL }) });
    expect(a.pre1990Enabled).toBe(false);
    expect(a.pre1990PricePerSqm_1990).toBe("5000000");
  });
  it("긍정 짝: 매매 토지의 켜짐은 그대로 (환산 모드 토글 — 사용자 선택)", () => {
    const a = migrateAsset({ ...land({ acquisitionCause: "purchase", acquisitionDate: "1985-05-01", pre1990Enabled: true }) });
    expect(a.pre1990Enabled).toBe(true);
  });
});
