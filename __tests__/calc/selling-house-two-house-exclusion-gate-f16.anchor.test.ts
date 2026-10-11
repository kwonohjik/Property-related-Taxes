/**
 * F-16 ⑤⑧ — 양도 주택 2주택 전용 배제(§167의10①3호·7호) 화면 게이트와 validate.
 *
 * ⑤ 게이트가 없으면 입력칸이 화면에 뜨지 않아 엔진 축이 no-op이 된다.
 * ⑧은 3호가 요구하는 **취득 당시** 기준시가를 받아야 한다 — 미입력이면 엔진은 배제하지 않고
 * 경고만 남기므로, 사용자가 토글을 켜고도 왜 배제가 안 되는지 모르게 된다.
 *
 * dead-end 회피: 토글을 켠 뒤 주택수를 바꿔도 섹션이 남아야 ⑧의 요구를 해소할 화면이 있다.
 */
import { describe, it, expect } from "vitest";
import {
  sellingHouseExclusionVisible,
  sellingHouseTwoHouseExclusionVisible,
} from "@/lib/calc/house-count-inputs-scope";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing" };
  return { ...f, ...over };
}

describe("F-16 ⑤ 양도 주택 2주택 배제 섹션 가시성", () => {
  it("F16-G1 주택수 2면 보인다", () => {
    expect(sellingHouseTwoHouseExclusionVisible(form({ householdHousingCount: "2" }))).toBe(true);
  });

  it("F16-G2 주택수 1에서는 보이지 않고 3에서는 보인다 — 두 호는 유효 주택 수 2채에서 성립하고, 유효 수는 세대 주택 수 이하다", () => {
    expect(sellingHouseTwoHouseExclusionVisible(form({ householdHousingCount: "1" }))).toBe(false);
    // PR1b(S14b-2 짝) — 종전 `=== 2`는 불산입 주택(§167의10① 괄호)이 낀 3채 세대(유효 2채)의 선언 경로를 막았다.
    expect(sellingHouseTwoHouseExclusionVisible(form({ householdHousingCount: "3" }))).toBe(true);
  });

  it("F16-G3 토글이 켜져 있으면 주택수와 무관하게 남는다 — 끌 화면이 사라지면 dead-end", () => {
    expect(
      sellingHouseTwoHouseExclusionVisible(
        form({ householdHousingCount: "3", sellingHouseExclusion: { isUnavoidableReason: true } }),
      ),
    ).toBe(true);
    expect(
      sellingHouseTwoHouseExclusionVisible(
        form({ householdHousingCount: "3", sellingHouseExclusion: { isLitigationHousing: true } }),
      ),
    ).toBe(true);
  });

  it("F16-G4 양도 주택 자체 배제 섹션은 2주택부터 열린다(PR1b S14b-2) — 1주택에서는 둘 다 닫힌다", () => {
    const two = form({ householdHousingCount: "2" });
    expect(sellingHouseExclusionVisible(two)).toBe(true);
    expect(sellingHouseTwoHouseExclusionVisible(two)).toBe(true);
    const one = form({ householdHousingCount: "1" });
    expect(sellingHouseExclusionVisible(one)).toBe(false);
    expect(sellingHouseTwoHouseExclusionVisible(one)).toBe(false);
  });
});

describe("F-16 ⑧ 3호 부속값 요구", () => {
  const STEP = 1; // 보유 상황
  const msgs = (f: TransferFormData) => collectStepIssues(STEP, f).map((i) => i.message).join(" | ");

  it("F16-G5 부득이한 사유 토글 ON인데 취득 당시 기준시가가 없으면 막는다", () => {
    const f = form({
      householdHousingCount: "2",
      sellingHouseExclusion: { isUnavoidableReason: true, unavoidableResidenceYears: "2" },
    });
    expect(msgs(f)).toContain("취득 당시 기준시가");
  });

  it("F16-G6 거주기간이 없어도 막는다", () => {
    const f = form({
      householdHousingCount: "2",
      sellingHouseExclusion: { isUnavoidableReason: true, acquisitionOfficialPrice: "250000000" },
    });
    expect(msgs(f)).toContain("거주기간");
  });

  it("F16-G7 둘 다 채우면 통과한다(긍정 짝)", () => {
    const f = form({
      householdHousingCount: "2",
      sellingHouseExclusion: {
        isUnavoidableReason: true,
        unavoidableResidenceYears: "2",
        acquisitionOfficialPrice: "250000000",
      },
    });
    expect(msgs(f)).not.toContain("취득 당시 기준시가");
    expect(msgs(f)).not.toContain("거주기간");
  });

  // 2026-10-04 정책 변경(사용자 결정 「모름은 납세자에게 불리하게」) — 종전 「날짜를 요구하지 않는다(미입력 = 진행 중)」.
  //   빈 날짜에 「진행 중」과 「모름」이 겹쳤다 ⇒ 확정판결일 또는 「양도일 현재 소송 진행 중」 택일을 요구한다.
  it("F16-G8 소송 취득은 확정판결일 또는 「진행 중」 선택을 요구한다 — 둘 중 하나면 통과(긍정 짝)", () => {
    const f = (se: NonNullable<TransferFormData["sellingHouseExclusion"]>) =>
      form({ householdHousingCount: "2", sellingHouseExclusion: se });
    expect(msgs(f({ isLitigationHousing: true }))).toContain("소송 진행 중");
    expect(msgs(f({ isLitigationHousing: true, litigationPending: true }))).not.toContain("소송");
    expect(msgs(f({ isLitigationHousing: true, litigationAcquisitionDate: "2024-01-01" }))).not.toContain("소송");
  });
});
