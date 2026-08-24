/**
 * B-3 — 재개발 §164⑦ 트리거가 **의제취득일**을 반영한다.
 * 계획서: docs/00-pm/red-phd-snapshot-followups.plan.md (B-3)
 *
 * ## 왜 바꾸는가 — 새 해석이 아니라 적용 범위 일치
 *
 * 「소득세법 시행령」 제164조 제7항 본문은 「…공시되기 전에 **취득한** 주택」이라고만 하고
 * 취득시기 자체는 일반 규정(의제취득일 포함)에 맡긴다. 이 저장소는 그 해석을 이미
 * `isPhdEligible`(`phd-eligibility.ts`)로 채택해 **⑧ validate · ⑩ Zod refine · 겸용 validate**
 * 등 실제 차단 게이트에서 쓰고 있다. 재개발 경로만 인라인 날짜 비교라 판정이 갈렸다.
 *
 * ## 세액이 갈리는 입력은 제도상 불가능한 값뿐이다
 *
 * 두 판정이 달라지려면 **최초공시일 ≤ 1985-01-01**이어야 하는데, 개별주택가격은 2005-04-30,
 * 공동주택가격은 2006-04-28에 최초 공시됐다. 정상 입력에서는 결과가 같다(아래 4행 실측).
 */
import { describe, it, expect } from "vitest";
import { isRedevPhdTriggered } from "@/lib/calc/redev-phd-trigger";
import { isPhdEligible } from "@/lib/calc/phd-eligibility";

const trig = (acquisitionDate: string, redevFirstDisclosureDate: string) =>
  isRedevPhdTriggered({ useEstimatedAcquisition: true, acquisitionDate, redevFirstDisclosureDate });

describe("의제취득일(1985-01-01) 보정", () => {
  it("🔑 1984-12-31 이전 취득은 1985-01-01 취득으로 본다 — 최초공시일이 그 이전이면 미발동", () => {
    // 유효취득일 1985-01-01 ≥ 최초공시일 1985-01-01 → 취득 당시 이미 고시분 존재
    expect(trig("1984-01-01", "1985-01-01")).toBe(false);
    expect(trig("1980-06-01", "1984-12-31")).toBe(false);
  });

  it("실무 입력(최초공시 2005/2006)에서는 보정 여부와 무관하게 발동한다", () => {
    expect(trig("1984-12-31", "2005-04-30")).toBe(true); // 유효취득일 1985-01-01 < 2005
    expect(trig("2003-05-10", "2005-04-30")).toBe(true);
    expect(trig("1970-01-01", "2006-04-28")).toBe(true);
  });

  it("🔴 `isPhdEligible`과 판정이 일치한다 — 같은 §164⑦을 두 경로가 다르게 보면 안 된다", () => {
    const cases: [string, string][] = [
      ["1984-01-01", "1985-01-01"],
      ["1980-06-01", "1984-12-31"],
      ["1984-12-31", "2005-04-30"],
      ["2003-05-10", "2005-04-30"],
      ["2010-03-01", "2005-04-30"],
      ["2005-04-30", "2005-04-30"],
    ];
    for (const [acq, first] of cases) {
      expect(trig(acq, first)).toBe(isPhdEligible(acq, first));
    }
  });

  it("모드·날짜 게이트는 그대로 — 판정 불능은 미발동(`isPhdEligible`과 반대 방향)", () => {
    // isPhdEligible은 날짜가 비면 true(차단하지 않음)지만, 트리거는 false(발동 안 함)여야 한다.
    expect(isPhdEligible("", "2005-04-30")).toBe(true);
    expect(trig("", "2005-04-30")).toBe(false);
    expect(trig("2003-05-10", "")).toBe(false);
    expect(
      isRedevPhdTriggered({
        useEstimatedAcquisition: false,
        acquisitionDate: "2003-05-10",
        redevFirstDisclosureDate: "2005-04-30",
      }),
    ).toBe(false);
  });
});

/**
 * 🔴 ⑧ validate가 UI·결과탭 게이트와 **같은 술어**를 쓴다.
 *
 * 종전에는 `transfer-tax-validate-redev.ts`가 날짜를 직접 비교해, 의제취득일 보정이 없는
 * 판정으로 필수입력을 요구했다. 판정이 갈리면 「UI에는 §164⑦ 블록이 없는데 validate는
 * 그 필드를 요구한다」 같은 dead-end가 생긴다.
 */
describe("⑧ validate 동기화", () => {
  it("의제취득일 보정 케이스에서 validate가 §164⑦ 필수입력을 요구하지 않는다", async () => {
    const { validateRedevelopmentAsset } = await import("@/lib/calc/transfer-tax-validate-redev");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-asset-factory");
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "redevelopment_apt" as const,
      redevSubject: "apt" as const,
      useEstimatedAcquisition: true,
      // 유효취득일 1985-01-01 ≥ 최초공시일 → §164⑦ 미발동
      acquisitionDate: "1984-01-01",
      redevFirstDisclosureDate: "1985-01-01",
      redevApprovalDate: "2009-06-01",
      redevRightsValue: "300000000",
      redevManagementDisposalHousingPrice: "132000000",
      // §164⑦ 본문이 요구하는 A·면적·단가·건물은 비워 둔다
      redevAcquisitionHousingPrice: "100000000",
    };
    const err = validateRedevelopmentAsset(asset, "자산1");
    // §164⑦ 본문 필수입력(A·토지면적·단가·건물) 오류가 나오면 안 된다
    expect(err ?? "").not.toMatch(/§164⑦ 본문/);
  });
});
