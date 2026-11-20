/**
 * @vitest-environment jsdom
 *
 * §155⑦3호 귀농주택 ⑩4호·⑪·귀농 전 취득 — ⑤ 위젯과 ⑧ 양 화면 검증 (결정 #44). 엔진·route는
 * `__tests__/tax-engine/transfer/rural-return-to-farm-facts.anchor.test.ts`가 고정한다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | W-1 | ⑤ | 3호 블록에 ⑩4호 목·⑪·귀농 전 취득 라디오가 있고 고르면 같은 칸으로 올라간다 · 1호에는 없다 |
 * | W-2 | ⑤ | 가·나·다목을 골라야 본인/배우자 질문이 열리고, 해당 없음·모름이면 지운다 |
 * | W-3 | ⑤ | 유형을 3호에서 다른 유형으로 바꾸면 3호 전용 답을 지운다(stale 답이 판정에 실리지 않는다) |
 * | V-1 | ⑧ 양 화면 | 미응답이면 계산기 Step1과 판정 메뉴가 같은 칸에 오류를 낸다 · 「모름」은 유효한 답이다 |
 * | W-4 · V-2 | ⑤⑧ | 종전 ⑩1호 연고지 — 행 취득일이 2016-02-17 전일 때만 칸이 열리고 두 화면 ⑧이 묻는다 · 유형을 바꾸면 지운다(D-85) |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryRuralHouseBlock } from "@/components/calc/transfer/HouseEntryRuralHouseBlock";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

afterEach(cleanup);

const row = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "rural",
    region: "non_capital",
    acquisitionDate: "2023-05-15",
    officialPrice: "100000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    oneHouseRuralHouse: true,
    ruralHouseKind: "return_to_farm",
    ruralOutsideCapitalEupMyeon: true,
    ruralLandAreaSqm: "500",
    ruralReturnedToFarmExitHouse: false,
    ...over,
  }) as HouseEntry;

describe("W-1 ⑤ 라디오", () => {
  it("3호 블록의 ⑩4호·⑪·귀농 전 취득 라디오를 고르면 같은 칸으로 올라간다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={row()} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-rural-farmland-basis-ga"));
    expect(onUpdate).toHaveBeenLastCalledWith({ ruralFarmlandBasis: "ga" });
    fireEvent.click(screen.getByTestId("house-row-rural-prior-exemption-unknown"));
    expect(onUpdate).toHaveBeenLastCalledWith({ ruralPriorReturnFarmExemption: "unknown" });
    fireEvent.click(screen.getByTestId("house-row-rural-general-before-return-no"));
    expect(onUpdate).toHaveBeenLastCalledWith({ ruralGeneralHouseBeforeReturn: "no" });
  });

  it("1호 상속 블록에는 이 질문이 없다(짝)", () => {
    render(<HouseEntryRuralHouseBlock house={row({ ruralHouseKind: "inherited" })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-rural-farmland-basis")).toBeNull();
    expect(screen.queryByTestId("house-row-rural-prior-exemption")).toBeNull();
    expect(screen.queryByTestId("house-row-rural-general-before-return")).toBeNull();
  });

  it("나목 설명이 귀농주택 취득일에 따라 갈린다 — 2016.3.31. 전 취득은 종전 가목으로 판정한다고 안내", () => {
    render(<HouseEntryRuralHouseBlock house={row({ acquisitionDate: "2016-03-30" })} onUpdate={vi.fn()} />);
    expect(screen.queryByText(/종전 가목/)).not.toBeNull();
    cleanup();
    render(<HouseEntryRuralHouseBlock house={row({ acquisitionDate: "2016-03-31" })} onUpdate={vi.fn()} />);
    expect(screen.queryByText(/종전 가목/)).toBeNull();
  });
});

describe("W-2 본인/배우자 질문", () => {
  it("가·나·다목을 골라야 열린다 — 해당 없음·모름·미응답이면 없다", () => {
    for (const basis of ["ga", "na", "da"] as const) {
      render(<HouseEntryRuralHouseBlock house={row({ ruralFarmlandBasis: basis })} onUpdate={vi.fn()} />);
      expect(screen.queryByTestId("house-row-rural-farmland-holder")).not.toBeNull();
      cleanup();
    }
    for (const basis of ["none", "unknown", undefined] as const) {
      render(<HouseEntryRuralHouseBlock house={row({ ruralFarmlandBasis: basis })} onUpdate={vi.fn()} />);
      expect(screen.queryByTestId("house-row-rural-farmland-holder")).toBeNull();
      cleanup();
    }
  });

  it("해당 없음·모름을 고르면 본인/배우자 답을 함께 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={row({ ruralFarmlandBasis: "ga", ruralFarmlandHolder: "spouse" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-rural-farmland-basis-unknown"));
    expect(onUpdate).toHaveBeenLastCalledWith({ ruralFarmlandBasis: "unknown", ruralFarmlandHolder: undefined });
  });
});

describe("W-3 유형 전환", () => {
  it("3호에서 다른 유형으로 바꾸면 3호 전용 답을 지운다", () => {
    const onUpdate = vi.fn();
    render(
      <HouseEntryRuralHouseBlock
        house={row({ ruralFarmlandBasis: "ga", ruralFarmlandHolder: "self", ruralPriorReturnFarmExemption: "none", ruralGeneralHouseBeforeReturn: "yes" })}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByText("1호 상속"));
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ruralHouseKind: "inherited",
        ruralFarmlandBasis: undefined,
        ruralFarmlandHolder: undefined,
        ruralPriorReturnFarmExemption: undefined,
        ruralGeneralHouseBeforeReturn: undefined,
      }),
    );
  });
});

describe("V-1 ⑧ 양 화면", () => {
  const calcIssues = (r: HouseEntry) => {
    const f = createDefaultTransferFormData();
    f.houses = [r];
    return collectStep1Issues(f).map((i) => i.message).join(" | ");
  };
  const menuErrs = (r: HouseEntry) => {
    const f = createInitialOneHouseJudgmentForm();
    f.houses = [r];
    return validateAllSteps(f).filter((e) => e.severity === "error").map((e) => e.field);
  };
  it("미응답이면 계산기도 판정 메뉴도 막는다", () => {
    expect(calcIssues(row())).toContain("영농·영어의 목적");
    expect(menuErrs(row())).toContain("houses.0.ruralFarmlandBasis");
  });
  it("모든 답(모름 포함)을 하면 이 사유는 사라진다", () => {
    const answered = row({
      ruralFarmlandBasis: "unknown",
      ruralPriorReturnFarmExemption: "unknown",
      ruralGeneralHouseBeforeReturn: "unknown",
    });
    expect(calcIssues(answered)).not.toContain("영농·영어의 목적");
    expect(menuErrs(answered).filter((f) => /rural(Farmland|Prior|General|Land)/.test(f))).toEqual([]);
  });
});

describe("W-4 · V-2 종전 ⑩1호 연고지 (D-85)", () => {
  const answered = { ruralFarmlandBasis: "ga", ruralFarmlandHolder: "self", ruralPriorReturnFarmExemption: "none", ruralGeneralHouseBeforeReturn: "yes" } as const;
  it("2016-02-16 취득 행에만 칸이 열리고 고르면 같은 칸으로 올라간다 · 2016-02-17이면 없다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={row({ acquisitionDate: "2016-02-16" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("house-row-rural-hometown-no"));
    expect(onUpdate).toHaveBeenLastCalledWith({ ruralHometownLocated: "no" });
    cleanup();
    render(<HouseEntryRuralHouseBlock house={row({ acquisitionDate: "2016-02-17" })} onUpdate={vi.fn()} />);
    expect(screen.queryByTestId("house-row-rural-hometown")).toBeNull();
  });
  it("유형을 바꾸면 연고지 답도 지운다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryRuralHouseBlock house={row({ acquisitionDate: "2016-02-16", ruralHometownLocated: "yes" })} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText("1호 상속"));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ ruralHometownLocated: undefined }));
  });
  it("⑧ 두 화면 — 2016-02-16 미답이면 막고 「모름」은 통과 · 2016-02-17은 묻지 않는다", () => {
    const calc = (r: HouseEntry) => {
      const f = createDefaultTransferFormData();
      f.houses = [r];
      return collectStep1Issues(f).map((i) => i.message).join(" | ");
    };
    const menu = (r: HouseEntry) => {
      const f = createInitialOneHouseJudgmentForm();
      f.houses = [r];
      return validateAllSteps(f).filter((e) => e.severity === "error").map((e) => e.field);
    };
    const before = row({ acquisitionDate: "2016-02-16", ...answered });
    expect(calc(before)).toContain("연고지");
    expect(menu(before)).toContain("houses.0.ruralHometownLocated");
    const unknown = row({ acquisitionDate: "2016-02-16", ...answered, ruralHometownLocated: "unknown" });
    expect(calc(unknown)).not.toContain("연고지");
    expect(menu(unknown)).not.toContain("houses.0.ruralHometownLocated");
    const after = row({ acquisitionDate: "2016-02-17", ...answered });
    expect(calc(after)).not.toContain("연고지");
    expect(menu(after)).not.toContain("houses.0.ruralHometownLocated");
  });
});
