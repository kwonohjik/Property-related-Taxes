/**
 * anchor — §155① 처분기한 pending은 **신규 주택 취득 경위로 §155①이 막힌 세대**에 기한을 약속하지 않는다
 * (2026-11-12 리뷰 J-1).
 *
 * `evaluateTemporaryTwoHouseTiming`은 경위 불성립(`origin.blocked`)이면 `timing.overall`만 거짓으로 바꾸고
 * `oneYearMet`·`threeYearMet`은 그대로 둔다. pending 게이트가 `oneYearMet`·`threeYearMet`만 보면
 * 「이 날까지 양도하면 비과세」를 내는데, 그 날 안에 양도해도 경위 때문에 과세다.
 *
 * 시료: 종전(양도) 주택 2021-06-01 취득 · 신규 주택 = 분양권 완공 2022-07-01 · 비조정 · 양도 2026-01-15(기한 2025-07-01 도과).
 *   - 분양권 취득 2021-03-01(종전 주택보다 먼저 = 순차 사례, 분양권 주택 수 산입 2021.1.1. 이후) → §155① 부적용 → pending 없음.
 *   - 분양권 취득일 미입력(모름) → 불성립 + 확인 필요 → pending 없음.
 *   - 대조: 일반 취득 → PD-1과 같이 기한을 낸다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const PRESALE_START = D("2021-01-01");

type Origin = NonNullable<NonNullable<TransferTaxInput["temporaryTwoHouse"]>["newHouseOrigin"]>;

const judge = (newHouseOrigin: Origin, transferDate = "2026-01-15") =>
  checkExemption(
    baseTransferInput({
      transferDate: D(transferDate),
      acquisitionDate: D("2021-06-01"),
      householdHousingCount: 2,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2021-06-01"),
        newAcquisitionDate: D("2022-07-01"),
        newHouseOrigin,
      },
    }) as OneHouseJudgeInput,
    rules,
    PRESALE_START,
  );

describe("J-1 — 경위 불성립 세대에 §155① 처분기한을 약속하지 않는다", () => {
  it("대조: 일반 취득 · 기한 도과 → 기한을 낸다", () => {
    const r = judge({ kind: "general" });
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).toContain("155-1-disposal-deadline");
  });

  it("분양권 순차 사례(권리 취득이 종전 주택보다 먼저) → 기한 없음", () => {
    const r = judge({ kind: "presale", rightAcquisitionDate: D("2021-03-01") });
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).not.toContain("155-1-disposal-deadline");
  });

  it("같은 사실을 기한 안(2025-06-02)에 양도해도 과세 — 약속이 지켜질 수 없음을 고정", () => {
    expect(judge({ kind: "presale", rightAcquisitionDate: D("2021-03-01") }, "2025-06-02").isExempt).toBe(false);
  });

  it("분양권 취득일 모름 → 기한 없음", () => {
    const r = judge({ kind: "presale" });
    expect(r.isExempt).toBe(false);
    expect(r.pending.map((p) => p.id)).not.toContain("155-1-disposal-deadline");
  });
});
