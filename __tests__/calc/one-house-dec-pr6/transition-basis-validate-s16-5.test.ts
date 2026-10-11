/**
 * 결정 #21(S16-5) ⑧ — 경과조치 사유 필수 범위가 사유 칸이 화면에 있는 경로와 같다 (3중 패턴).
 *
 * | 경로 | 묻는 화면 | 양도일 조건 |
 * |---|---|---|
 * | §154⑩ 표준 경로(B · 임대 0호) | 판정 메뉴(facts) · 부담부증여(full + requirePriorHistory) | 양도일과 무관 — 2019.2.12. 이후 취득이면 |
 * | §155⑳ A (하위 결정 가) | 판정 메뉴 · 부담부증여 | 구간(2019.2.12. 이후 취득 · 2025.2.27. 이전 양도) 안 |
 * 계산기 카드(calc, mode "full" + requirePriorHistory false)는 사유 칸이 없어 막지 않는다 — 막으면 막다른 오류.
 */
import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type Rh = AssetForm["rentalHousingException"];

function asset(rhe: Partial<Rh>, acquisitionDate: string): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionDate,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "60",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      wasRegisteredRentalOrChildcare: true,
      priorResidenceTransferDate: "2022-01-10",
      postRegistrationResidenceMonths: "30",
      // 계산기·부담부증여(full)는 §161① 기준시가 3필드가 필수다
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtPriorTransfer: "400,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
      ...rhe,
    } as Rh,
  };
}
const b154 = (over: Partial<Rh> = {}, acq = "2020-05-01") => asset({ scenario: "B", rentalUnits: [], ...over }, acq);
const aPath = (over: Partial<Rh> = {}, acq = "2019-06-01") =>
  asset(
    {
      scenario: "A",
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2016-06-01",
          rentalRegistrationDate: "2016-06-01",
          rentalCategory: "long_general",
          rentalAcquisitionType: "purchase",
          standardPriceAtRentalStart: "300,000,000",
          requirementsConfirmed: true,
          rentalMonths: "96",
        },
      ],
      ...over,
    },
    acq,
  );

const call = (
  a: AssetForm,
  transfer: string,
  mode: "full" | "facts",
  requirePriorHistory = mode === "facts",
) => validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", transfer, mode, false, false, requirePriorHistory);

const REASON = "경과조치의 사유";

describe("S16-5 ⑧ §154⑩ 경로 — 사유 필수는 양도일과 무관", () => {
  it("V-1 ★ 판정 메뉴 · 양도 2026-03-01(구간 밖) · 체크만 → 사유를 묻는다 (종전: 통과)", () => {
    expect(call(b154({ residenceTransitionUnderAddendum: true }), "2026-03-01", "facts")).toContain(REASON);
  });
  it("V-2 ★ 부담부증여(full + requirePriorHistory) · 구간 밖 · 체크만 → 사유를 묻는다 (종전: 통과 — 증여 화면에서 사유 없이 종전규정을 받음)", () => {
    expect(call(b154({ residenceTransitionUnderAddendum: true }), "2026-03-01", "full", true)).toContain(REASON);
    expect(call(b154({ residenceTransitionUnderAddendum: true }), "2024-06-01", "full", true)).toContain(REASON);
  });
  it("V-3 사유를 고르면 통과 · 체크하지 않으면 묻지 않는다 (긍정 짝)", () => {
    for (const mode of ["facts", "full"] as const) {
      const req = mode === "full";
      expect(call(b154({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing" }), "2026-03-01", mode, req)).toBeNull();
      expect(call(b154({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "contract_without_prior_rental" }), "2026-03-01", mode, req)).toBeNull();
      expect(call(b154({ residenceTransitionUnderAddendum: false }), "2026-03-01", mode, req)).toBeNull();
    }
  });
  it("V-4 계산기 카드(full + requirePriorHistory 없음)는 막지 않는다 — 사유 칸이 없다 (막으면 막다른 오류)", () => {
    expect(call(b154({ residenceTransitionUnderAddendum: true }), "2026-03-01", "full", false)).toBeNull();
  });
  it("V-5 부정 짝 — 2019.2.12. 전 취득은 경과조치 칸이 없으므로 묻지 않는다", () => {
    expect(call(b154({ residenceTransitionUnderAddendum: true }, "2018-12-31"), "2026-03-01", "facts")).toBeNull();
  });
  it("V-6 사유가 종전규정을 주지 않으면 ⑧도 등록일 이후 거주기간을 요구한다 (소비 술어와 같은 leaf)", () => {
    const withoutPrior = b154({
      residenceTransitionUnderAddendum: true,
      residenceTransitionBasis: "contract_without_prior_rental",
      postRegistrationResidenceMonths: "",
    });
    expect(call(withoutPrior, "2024-06-01", "full")).toContain("등록 이후 거주기간");
    // 종전규정을 주는 사유면 그 칸을 요구하지 않는다(비조정 취득 — 일반 거주요건 없음)
    const residing = b154({
      residenceTransitionUnderAddendum: true,
      residenceTransitionBasis: "residing",
      postRegistrationResidenceMonths: "",
    });
    expect(call(residing, "2024-06-01", "full")).toBeNull();
  });
});

describe("S16-5 하위 결정 가) — §155⑳ A 경로도 부담부증여(full)에서 사유 필수", () => {
  it("V-7 ★ 구간 안 · 체크만 → 사유를 묻는다 (full + requirePriorHistory) / 이미 facts는 묻는다", () => {
    const a = aPath({ residenceTransitionUnderAddendum: true });
    expect(call(a, "2024-06-01", "full", true)).toContain(REASON);
    expect(call(a, "2024-06-01", "facts")).toContain(REASON);
  });
  it("V-8 사유를 고르면 통과 · 구간 밖(2025-02-28 양도)은 묻지 않는다 · 계산기 카드는 막지 않는다 (짝)", () => {
    expect(
      call(aPath({ residenceTransitionUnderAddendum: true, residenceTransitionBasis: "residing" }), "2024-06-01", "full", true),
    ).toBeNull();
    expect(call(aPath({ residenceTransitionUnderAddendum: true }), "2025-02-28", "full", true)).toBeNull();
    expect(call(aPath({ residenceTransitionUnderAddendum: true }), "2024-06-01", "full", false)).toBeNull();
  });
});
