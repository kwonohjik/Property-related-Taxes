/**
 * 겸용주택 × 토지 나중 취득 × 직접 입력 상한 — 고지·신고서 각주를 연 단위로 적는다(2026-11-17).
 *
 * 겸용은 거주를 정수 연수로만 받아(`mixedUse.residencePeriodYears` = floor(개월 ÷ 12)) 엔진 echo `directMonths`가 입력 개월이 아니라 연수 × 12다.
 * 개월로 적으면 70개월 입력이 「거주 60개월」로 보였다. 공제율은 연 단위라 세액은 같다(화면 경로 실측 `mixed-use-later-land-holding-residence.screen-path`).
 * 분리취득·부수토지 카드는 개월 그대로다(입력 개월이 엔진까지 온다).
 */
import { describe, expect, it } from "vitest";
import { landHoldingResidenceCapNotice } from "@/lib/tax-engine/transfer-land-holding-residence-notice";
import { fillMixedHousingResidenceCells } from "@/components/calc/results/transfer/FilingFormTableSplitResidence";
import type { MixedUseHousingPart } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const cap = { directMonths: 60, cappedMonths: 58, landHoldingMonths: 58 };

describe("엔진 고지 leaf", () => {
  it("years — 거주 연수 · 토지 보유 개월 · 토지분 연수", () => {
    const n = landHoldingResidenceCapNotice(cap, "years")!;
    expect(n).toContain("거주 연수 5년을 토지 보유기간 58개월로 상한해 계산했습니다(토지분 거주 4년 · 1년 미만은 공제율에 쓰지 않습니다)");
    expect(n).not.toContain("60개월");
    expect(n).toContain("확인 필요");
  });

  it("짝 — 기본(분리취득·카드)은 개월 그대로(불변)", () => {
    expect(landHoldingResidenceCapNotice({ directMonths: 178, cappedMonths: 58, landHoldingMonths: 58 })).toContain(
      "거주기간 178개월을 토지 보유기간 58개월로 상한해 계산했습니다(거주 178개월 → 토지분 58개월)",
    );
    expect(landHoldingResidenceCapNotice(undefined, "years")).toBeUndefined();
  });
});

describe("신고서 겸용 4열 거주기간 각주", () => {
  const hp = (withCap: boolean) =>
    ({
      landHoldingResidenceRateUsed: true,
      partLthd: { land: { residenceYears: 4 }, building: { residenceYears: 5 } },
      ...(withCap ? { landHoldingResidenceCap: cap } : {}),
    }) as unknown as Pick<MixedUseHousingPart, "partLthd" | "landHoldingResidenceRateUsed" | "landHoldingResidenceCap">;
  const run = (withCap: boolean) => {
    const notes: string[] = [];
    const filled = fillMixedHousingResidenceCells(hp(withCap), 70, () => {}, (_r, _c, note) => notes.push(note));
    return { filled, note: notes[0] ?? "" };
  };

  it("상한이 걸렸으면 연 단위로 병기 — 「거주 연수 5년」(수정 전 「거주 60개월」)", () => {
    const { filled, note } = run(true);
    expect(filled).toBe(true);
    expect(note).toContain("거주 연수 5년을 토지 보유기간 58개월로 상한해 계산 — 확인 필요");
    expect(note).not.toContain("60개월");
  });

  it("짝 — 상한이 없으면 병기 없음", () => {
    expect(run(false).note).not.toContain("상한");
  });
});
