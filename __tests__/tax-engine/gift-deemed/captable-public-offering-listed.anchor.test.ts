/**
 * anchor: §39 cap-table — 공모 배정 제외의 **「주권상장법인이」 AND 조건** (안 D1)
 *
 * 계획서: docs/00-pm/capital-increase-captable-listed-proviso.plan.md v1.7 §13
 *
 * ── 왜 이 anchor가 따로 필요한가 ────────────────────────────────────────────
 * cap-table 경로에는 **두 개의 서로 다른 「상장」 축**이 있고, 하나만 허용된다.
 *
 *   ① 평가 산식 단서(「상증령」§29②1가·3나) — 상장이면 ㉯를 Min/Max(종가평균, 이론)로
 *      ⇒ ㉯에 **접촉**한다 ⇒ zero-sum 붕괴 ⇒ **안 C로 미반영 확정**(v1.2 §4-5)
 *      실측: 이론 ㉯ 15,000이면 Σdelta = 0 / 종가평균 12,000을 넣으면 Σdelta = −600,000,000
 *   ② 공모 제외의 상장 요건(「상증법」§39① 괄호 「**주권상장법인이**」) — 사실 플래그
 *      ⇒ `perShareAfter` 산출이 **끝난 뒤** taxable을 거르는 필터라 ㉯에 **미접촉** ⇒ 안전
 *
 * 이 파일은 **②만 반영됐고 ①은 여전히 미반영**임을 양방향으로 고정한다.
 * `isListed`가 ㉯ 계산으로 새어 들어가면 CL-1·CL-2가 즉시 깨진다.
 */
import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

/** A 전량 실권(60,000) · B가 자기분 40,000 + 재배정 60,000 인수 · 이론 ㉯ 15,000 */
const SHAREHOLDERS: CapShareholder[] = [
  { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
  { id: "B", name: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 100_000, reallocatedShares: 60_000, relatedTo: ["A"] },
];

const base = (over: Partial<Parameters<typeof calcCapitalIncreaseAllocation>[0]> = {}) =>
  calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 20_000,
    newSharePrice: 10_000,
    shareholders: SHAREHOLDERS,
    ...over,
  });

const withPublicOffering = (over: Record<string, unknown> = {}) =>
  calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 20_000,
    newSharePrice: 10_000,
    shareholders: SHAREHOLDERS.map((s) =>
      s.id === "B" ? { ...s, allocationMethod: "public_offering" as const } : s,
    ),
    ...over,
  });

describe("① 평가 산식 단서는 **여전히 미반영** (안 C 유지)", () => {
  it("CL-1 ⭐: `isListed`를 켜도 ㉯가 바뀌지 않는다", () => {
    // 켜도 이론 가중평균 그대로 — 종가평균으로 대체되면 안 된다(안 C).
    expect(base().perShareAfter).toBe(15_000);
    expect(base({ isListed: true }).perShareAfter).toBe(15_000);
  });

  it("CL-2 ⭐: `isListed`를 켜도 zero-sum·증여재산가액이 불변", () => {
    const off = base();
    const on = base({ isListed: true });
    expect(on.reconciliation.balanced).toBe(true);
    expect(on.reconciliation).toEqual(off.reconciliation);
    expect(on.byShareholder).toEqual(off.byShareholder);
    expect(on.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(300_000_000);
    expect(off.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(300_000_000);
  });
});

describe("② 공모 제외에는 「주권상장법인이」가 AND 조건", () => {
  it("CL-3 ⭐: **비상장** + 공모 배정 → 제외되지 않고 과세된다", () => {
    // 「상증법」§39① 괄호의 주어가 주권상장법인이다. 비상장법인의 모집방법 배정은 제외 대상이 아니다.
    // 종전에는 cap-table에 상장 여부를 표현할 수단이 없어 **무조건 0**이었다(과소과세).
    const r = withPublicOffering({ isListed: false });
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(300_000_000);
    expect(r.splits.every((s) => s.excludedReason === undefined)).toBe(true);
  });

  it("CL-4: **상장** + 공모 배정 → 제외되어 0", () => {
    const r = withPublicOffering({ isListed: true });
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(0);
    expect(JSON.stringify(r.splits)).toContain("§39① 적용 제외");
  });

  it("CL-5: `isListed` **미지정**도 비상장과 같이 과세된다 (안전측 기본값)", () => {
    // 미지정을 「제외」로 해석하면 과소과세 방향이다 — 명시적으로 켠 경우에만 제외한다.
    expect(withPublicOffering().perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(
      300_000_000,
    );
  });

  it("CL-6: 상장이어도 `allocationMethod`가 normal이면 그대로 과세 (회귀)", () => {
    expect(base({ isListed: true }).perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(
      300_000_000,
    );
  });
});
