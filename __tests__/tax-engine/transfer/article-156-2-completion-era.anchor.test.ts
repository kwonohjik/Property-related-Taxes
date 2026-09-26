/**
 * anchor — OH-30 · OH-30b · 「소득세법 시행령」 §156의2④(§156의3③) 연혁
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.3.
 *
 * ## OH-30 — 신축주택 완성 후 기한
 * 2023-01-11 이전 양도: 완성 후 **2년** 이내 이사·양도(MST 247489, 2021-02-17 시행본 MST 229391도 2년).
 * 2023-01-12 이후 양도: 3년 — 대통령령 제33267호 부칙 제8조①②. 같은 부칙이 §156의2⑤2·3호(대체주택)도
 * 함께 옮겼으므로 E-5와 **한 함수**(`resolve1562DeadlineYears`)를 공유한다.
 *
 * ## OH-30b — ④의 「종전주택 취득 후 1년 지난 후 권리 취득」 요건
 * 대통령령 제32420호(2022-02-15 공포·시행)가 ④ 각 호 외의 부분에 신설. 부칙 제12조:
 * 「이 영 시행 전에 조합원입주권 또는 분양권을 취득한 경우의 1세대1주택 특례 적용에 관하여는
 *  제156조의2제4항 각 호 외의 부분 또는 제156조의3제3항 각 호 외의 부분의 개정규정에도 불구하고
 *  종전의 규정에 따른다.」 ⇒ **권리 취득일 < 2022-02-15**면 ④에 1년 요건이 없다
 * (2021-02-17 시행본 ④ 본문: 「…조합원입주권을 취득한 날부터 3년이 지나 종전의 주택을 양도하는
 *  경우로서…」 — 1년 문언 없음. ③은 그 전부터 1년 요건이 있다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import {
  resolve1562DeadlineYears,
  clause4RequiresOneYearGap,
} from "@/lib/tax-engine/data/article-156-2-completion-era";
import type { RightThreeYearException } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const d = (s: string) => new Date(s);

function withRight(p: {
  houseAcq: string;
  rightAcq: string;
  transfer: string;
  exception: RightThreeYearException;
}): TransferTaxInput {
  return baseTransferInput({
    householdHousingCount: 1,
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: d(p.houseAcq),
    transferDate: d(p.transfer),
    presaleRights: [
      { id: "r1", type: "redevelopment_right", acquisitionDate: d(p.rightAcq), region: "capital" },
    ],
    rightThreeYearException: p.exception,
  });
}
const newHouse = (completion: string): RightThreeYearException => ({
  kind: "new_house",
  completionDate: d(completion),
  movedInWithin3Years: true,
  residedOneYearOrMore: true,
});
const status = (i: TransferTaxInput) => resolveArticle89Clause2(i, undefined).status;

describe("leaf", () => {
  it("resolve1562DeadlineYears — 2023-01-11 → 2년 / 2023-01-12 → 3년", () => {
    expect(resolve1562DeadlineYears(d("2023-01-11"))).toBe(2);
    expect(resolve1562DeadlineYears(d("2023-01-12"))).toBe(3);
  });
  it("clause4RequiresOneYearGap — 권리 취득 2022-02-14 → 없음 / 2022-02-15 → 있음", () => {
    expect(clause4RequiresOneYearGap(d("2022-02-14"))).toBe(false);
    expect(clause4RequiresOneYearGap(d("2022-02-15"))).toBe(true);
  });
});

describe("OH-30 — ④2호 완성 후 기한", () => {
  it("★ 리뷰 R1: 권리 2017-06-01 · 완성 2020-06-01 · 양도 2022-10-01 → 2년 도과 → 배제(과세)", () => {
    const i = withRight({
      houseAcq: "2015-01-01",
      rightAcq: "2017-06-01",
      transfer: "2022-10-01",
      exception: newHouse("2020-06-01"),
    });
    expect(status(i)).toBe("excluded");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(false);
  });

  it("완성 2020-06-01: 양도 2023-01-11 배제(2년) / 2023-01-12 충족(3년)", () => {
    const at = (t: string) =>
      withRight({ houseAcq: "2015-01-01", rightAcq: "2017-06-01", transfer: t, exception: newHouse("2020-06-01") });
    expect(status(at("2023-01-11"))).toBe("excluded");
    expect(status(at("2023-01-12"))).toBe("exception_met");
  });

  it("2년 이내(완성 2021-06-01 · 양도 2022-10-01)는 개정 전에도 충족 (긍정 짝)", () => {
    const i = withRight({
      houseAcq: "2015-01-01",
      rightAcq: "2017-06-01",
      transfer: "2022-10-01",
      exception: newHouse("2021-06-01"),
    });
    expect(status(i)).toBe("exception_met");
  });

  it("⑬ 추징 경고 문구도 양도일의 기한을 말한다 — 2022 양도는 「2년」", () => {
    const r = calculateTransferTax(
      withRight({ houseAcq: "2015-01-01", rightAcq: "2017-06-01", transfer: "2022-10-01", exception: newHouse("2021-06-01") }),
      mockRates,
    );
    const w = (r.warnings ?? []).join("\n");
    expect(w).toContain("신축주택 완성 후 2년 이내");
    expect(w).not.toContain("신축주택 완성 후 3년 이내");
  });
});

describe("OH-30b — ④의 1년 요건은 권리 취득일 2022-02-15부터", () => {
  // 종전주택 2021-06-01 취득 → 권리 취득이 1년 이내(1년 요건 미충족) · 3년 초과 양도 2025-06-01
  const at = (rightAcq: string) =>
    withRight({ houseAcq: "2021-06-01", rightAcq, transfer: "2025-06-01", exception: newHouse("2024-06-01") });

  it("권리 2022-02-14 취득 → 종전 ④(1년 요건 없음) → 예외 충족", () => {
    expect(status(at("2022-02-14"))).toBe("exception_met");
  });
  it("권리 2022-02-15 취득 → 개정 ④(1년 요건) 미충족 → 배제", () => {
    expect(status(at("2022-02-15"))).toBe("excluded");
  });
  it("선언이 없으면 — 2022-02-14 취득은 구 ④가 남아 판정 불가 / 2022-02-15 취득은 배제 확정", () => {
    const undeclared = (rightAcq: string) => ({ ...at(rightAcq), rightThreeYearException: undefined });
    expect(resolveArticle89Clause2(undeclared("2022-02-14"), undefined)).toMatchObject({
      status: "undetermined",
      // ③ 경로(시행규칙 §75①)와 「3년 이내 양도」 기한은 1년 요건 미충족이라 안내하지 않는다
      openArticles: ["소득세법 시행령 §156의2 ④"],
    });
    expect(resolveArticle89Clause2(undeclared("2022-02-14"), undefined).deadline).toBeUndefined();
    expect(status(undeclared("2022-02-15"))).toBe("excluded");
  });
  it("§75①(경매·공매)은 ③의 위임이라 1년 요건 미충족이면 구 ④ 경로에서도 받지 않는다", () => {
    const i = {
      ...at("2022-02-14"),
      rightThreeYearException: { kind: "delay", reason: "auction", disposedByThatMethod: true } as const,
    };
    expect(status(i)).toBe("excluded");
  });
  it("★ 3년 이내 양도는 ③만 남고 ③은 1년 요건이 늘 있다 → 배제 (구 ④는 「3년이 지나」 한정)", () => {
    const i = withRight({
      houseAcq: "2016-06-01",
      rightAcq: "2016-10-01",
      transfer: "2018-06-01",
      exception: newHouse("2018-01-01"),
    });
    expect(status(i)).toBe("excluded");
  });
  it("★ 리뷰형: 종전 2016-06-01 · 권리 2016-10-01 · 완성 2019-01-01 · 양도 2020-06-01 → 비과세", () => {
    const i = withRight({
      houseAcq: "2016-06-01",
      rightAcq: "2016-10-01",
      transfer: "2020-06-01",
      exception: newHouse("2019-01-01"),
    });
    expect(status(i)).toBe("exception_met");
    expect(calculateTransferTax(i, mockRates).isExempt).toBe(true);
  });
});

describe("E-5 §156의2⑤ 대체주택 — 같은 부칙(동작 불변 회귀 가드)", () => {
  const rh = (t: string) =>
    baseTransferInput({
      householdHousingCount: 2,
      acquisitionDate: d("2019-01-01"),
      transferDate: d(t),
      replacementHouse: {
        businessApprovalDate: d("2018-06-01"),
        completionDate: d("2020-06-01"),
        replacementResidenceMonths: 24,
        willResideNewHouse: true,
      },
    } as Partial<TransferTaxInput>);
  it("완성 2020-06-01: 양도 2023-01-11 과세(2년) / 2023-01-12 비과세(3년)", () => {
    expect(calculateTransferTax(rh("2023-01-11"), mockRates).isExempt).toBe(false);
    expect(calculateTransferTax(rh("2023-01-12"), mockRates).isExempt).toBe(true);
  });
});
