/**
 * anchor — 환산 모드인데 §166③ 분모가 없으면 **취득가액 0으로 조용히 성공**했다 (E1-07)
 *
 * ## 무엇이 문제였나
 *
 * `computeRedevelopmentSplit` Step A는 `computeRedevelopmentValuation`이 `null`을 반환하면
 * 취득가액을 0으로 두고 계속 계산했다. 개산공제도 `valuationMeta.method === "actual"` 게이트에
 * 걸려 0이 되므로 **인가전 양도차익이 권리가액 전액**이 된다. 코드 주석 스스로
 * 「validation에서 차단되어야 함」이라 적었지만 그 차단은 ⑧(클라이언트)에만 있었고
 * ⑫ Zod에는 대응 refine이 없었다 — 클라이언트를 거치지 않은 요청은 오류 없이 통과했다.
 *
 * 같은 상황에서 sibling 환산 서브엔진 둘은 이미 `TaxRateNotFoundError`를 던진다
 * (`redevelopment-land-contribution.ts` 「§166③ 분모」 · `redevelopment-housing-contribution.ts`).
 * 본류만 침묵해 **세 번째 진실**(0으로 성공)이 있었다.
 *
 * ## 두 층을 함께 고정한다
 *
 * 엔진만 고치면 400 대신 500이 되고, ⑫만 고치면 엔진 직접 호출 경로가 남는다.
 * 그래서 이 anchor는 **엔진 throw**와 **⑫ 거부**를 같은 파일에서 본다.
 *
 * ⚠️ ⑫는 ⑧보다 **넓게 막지 않는다** — 승계조합원(`isSuccessorMember`)은 엔진이
 *    `runSuccessorMember`로 조기 분기해 §166 안분 자체를 하지 않으므로 분모를 요구하지 않는다.
 *    요구하면 화면에 없는 칸을 채우라는 dead-end가 된다.
 */
import { describe, it, expect } from "vitest";
import { runRedevelopment } from "@/lib/tax-engine/redevelopment";
import { TaxRateNotFoundError } from "@/lib/tax-engine/tax-errors";
import { addPropertyRefines } from "@/lib/api/transfer-tax-schema-refines";
import { case44Input, case44RedevelopmentInfo } from "./_helpers";

// ──────────────────────────────────────────────────────────────────────────────
// 엔진 — 분모 미입력이면 던진다
// ──────────────────────────────────────────────────────────────────────────────

describe("E1-07 엔진 · 환산 모드 분모 미입력 → TaxRateNotFoundError", () => {
  it("주택 출자 + 환산 + D(관리처분 라목값) 미입력 → throw", () => {
    const input = case44Input();
    input.redevelopment = {
      ...case44RedevelopmentInfo(),
      managementDisposalHousingPrice: undefined,
    };
    expect(() => runRedevelopment(input)).toThrow(TaxRateNotFoundError);
  });

  it("주택 출자 + 환산 + D=0 → throw (0은 분모가 될 수 없다)", () => {
    const input = case44Input();
    input.redevelopment = {
      ...case44RedevelopmentInfo(),
      managementDisposalHousingPrice: 0,
    };
    expect(() => runRedevelopment(input)).toThrow(TaxRateNotFoundError);
  });

  it("토지 출자 + 완공APT(subject=apt) + 환산 + 공시지가 미입력 → throw", () => {
    // subject="apt"는 runLandContribEstimated(입주권 전용)로 가지 않고 split을 탄다(E1-01).
    const input = case44Input();
    input.redevelopment = {
      ...case44RedevelopmentInfo(),
      originalAssetType: "land",
      managementDisposalHousingPrice: undefined,
      landStdPriceAtAcq: 100_000_000,
      landStdPriceAtApproval: undefined,
    };
    expect(() => runRedevelopment(input)).toThrow(TaxRateNotFoundError);
  });

  it("분모가 있으면 종전대로 계산된다 (과잉 차단 방지 — 사례 44 회귀)", () => {
    const result = runRedevelopment(case44Input());
    expect(result.preApproval.apportionedAcquisition).toBe(141_221_534);
  });

  it("실가 모드는 이 게이트와 무관하다", () => {
    const input = case44Input();
    input.useEstimatedAcquisition = false;
    input.actualAcquisitionPrice = 100_000_000;
    input.redevelopment = {
      ...case44RedevelopmentInfo(),
      managementDisposalHousingPrice: undefined,
    };
    expect(() => runRedevelopment(input)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ⑫ Zod — 같은 조합을 서버가 먼저 거부한다
// ──────────────────────────────────────────────────────────────────────────────

type RefineData = Parameters<typeof addPropertyRefines>[0];

function refineMessages(data: RefineData): string[] {
  const messages: string[] = [];
  const ctx = {
    addIssue: (issue: { message?: string }) => {
      if (issue.message) messages.push(issue.message);
    },
  } as unknown as Parameters<typeof addPropertyRefines>[1];
  addPropertyRefines(data, ctx);
  return messages;
}

const REDEV_BASE = {
  subject: "apt",
  approvalLawBasis: "urban_renovation_art_74",
  approvalDate: "2009-10-23",
  rightsValue: 219_218_500,
  settlementDirection: "pay",
  settlementAmount: 92_781_500,
  originalAssetType: "housing",
  acquisitionHousingPrice: 85_034_988,
} as const;

function payload(redevelopment: Record<string, unknown>): RefineData {
  return {
    useEstimatedAcquisition: true,
    redevelopment,
  } as unknown as RefineData;
}

describe("E1-07 ⑫ · Zod refine이 분모 미입력을 거부한다", () => {
  it("주택 출자 + 환산 + D 미입력 → 이슈", () => {
    const messages = refineMessages(payload({ ...REDEV_BASE }));
    expect(messages.some((m) => m.includes("§166③ 분모"))).toBe(true);
  });

  it("D가 있으면 통과 (⑧과 같은 기준)", () => {
    const messages = refineMessages(
      payload({ ...REDEV_BASE, managementDisposalHousingPrice: 132_000_000 }),
    );
    expect(messages).toEqual([]);
  });

  it("토지 출자 + 환산 → 개별공시지가 2필드를 요구한다", () => {
    const missing = refineMessages(payload({ ...REDEV_BASE, originalAssetType: "land" }));
    expect(missing.some((m) => m.includes("개별공시지가"))).toBe(true);

    const filled = refineMessages(
      payload({
        ...REDEV_BASE,
        originalAssetType: "land",
        landStdPriceAtAcq: 100_000_000,
        landStdPriceAtApproval: 150_000_000,
      }),
    );
    expect(filled).toEqual([]);
  });

  it("실가 모드는 요구하지 않는다", () => {
    const messages = refineMessages({
      useEstimatedAcquisition: false,
      redevelopment: { ...REDEV_BASE },
    } as unknown as RefineData);
    expect(messages).toEqual([]);
  });

  it("🔑 승계조합원은 요구하지 않는다 — 엔진이 §166 안분을 건너뛴다 (dead-end 방지)", () => {
    const messages = refineMessages(payload({ ...REDEV_BASE, isSuccessorMember: true }));
    expect(messages).toEqual([]);
  });

  it("🔑 단독주택 출자 §166③ 2-point 분기는 D가 아니라 전용 2필드를 쓴다", () => {
    const messages = refineMessages(
      payload({
        ...REDEV_BASE,
        subject: "right",
        settlementDirection: "receive",
        housingStdPriceAtAcq: 120_000_000,
        housingStdPriceAtApproval: 180_000_000,
      }),
    );
    expect(messages).toEqual([]);
  });
});
