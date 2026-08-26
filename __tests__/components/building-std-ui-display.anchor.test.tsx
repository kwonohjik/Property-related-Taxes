/**
 * F-15 · F-35 · F-36 · F-44 · F-46 Pre-Do anchor — 건물 기준시가 UI 표시 5건.
 *
 * ── F-15 취득연도 Select 옵션이 `for (let y = 2025; y >= 1986; y--)` 하드코딩
 *    양도연도는 `availableYears()` 파생(2026~2001)인데 취득연도만 하드코딩이라 두 축이 어긋난다.
 *    · 상한: 2026 취득을 고를 수 없어 §164⑧ 동일연도(취득=양도=2026)를 시작조차 못 한다.
 *    · 하한: 산정기준율표는 §8① 의제로 **1985(=1985년 이전)** 열을 실제로 갖는다
 *      (실측 신축1980 기준: 취득1985 → 0.738 / 취득1986 → 0.752). 설계문서도 그 칸을 명시했다.
 *    ⇒ 상한은 `availableYears` 를 따르게 하고, 하한을 1985 까지 내리되 그 1건만 「1985년 이전」 표기.
 *
 * ── F-35 조정률 **요약 칩**만 `ctx` 에 `structureKey` 를 넘기지 않는다
 *    II 최고층수의 통나무조 제외는 `ctx.structureKey !== "solid_wood"` 로 판정되므로 칩에서만 빠진다.
 *    실측: 통나무조(구조지수 135)·최고층수 21층 → **칩 130.0% vs 엔진 90.0%**(40%p).
 *    같은 화면의 모달 미리보기와 엔진은 둘 다 넘긴다 — 칩만 누락이다. 세액은 엔진값이라 정확하다.
 *
 * ── F-36 취득연도 **2001** 이 「2000년 이전 취득」 UI 분기에 함께 걸린다
 *    `acqIndexYear = y <= 2000 ? 2001 : y` 라 2001 에서도 2001 이 되어, violet 안내와 공시지가
 *    필드가 `acqIndexYear === 2001` 조건으로 ≤2000 과 2001 을 구별하지 못한다.
 *    엔진 경계는 `year >= 2001` 이라 2001년 취득에는 산정기준율이 **적용되지 않는데** 안내는 뜬다.
 *    ⚠️ 2001~2002 취득의 조회연도 고정(fixedYear=2001)은 계획서 처방이므로 **유지**한다 —
 *       안내문·필드 라벨·hint 의 조건만 `y <= 2000` 으로 옮긴다.
 *
 * ── F-44 일괄 계산 모달 결과 행에만 「원」 접미사 (`${fmt(...)} 원`)
 *    같은 디렉터리의 결과 표시 3곳은 bare 숫자이고, 이 기능군 계획서가 「숫자 끝 "원" 금지」를 명문화했다.
 *    ⚠️ components/ 전역에 같은 패턴이 112건 있어 **이 2줄만** 고치는 모듈 단위 정리다.
 *
 * ── F-46 취득 ≤2000 공시지가 hint 가 근거를 소득세법 시행령 §164⑤ **단독**으로 제시
 *    §164⑤ 본문에는 개별공시지가·위치지수·2001 어느 것도 없다(KoreanLaw 실측:
 *    "최초로 고시한 기준시가 × 국세청장이 고시한 기준율"). 무관한 조문은 아니고 **불완전 인용**이다.
 *    11줄 위 주석은 이미 「(고시 §6①·소령 §164⑤)」로 병기하고 있다 ⇒ hint 도 병기한다.
 *
 * ⚠️ §1~§5 는 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as fs from "node:fs";
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";
import { calcSpecialAdjustmentRate } from "@/lib/tax-engine/building-standard-price-helpers";
import {
  resolveAcqBaseGroup,
  resolveAcqBaseRate,
} from "@/lib/tax-engine/data/building-standard-price";
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";

afterEach(cleanup);

function renderWith(over: Partial<BuildingStdPriceFormState>) {
  render(
    <BuildingStdPriceForm
      lockedTaxType="transfer"
      initialForm={{ builtYear: "1990", floorArea: "200", ...over }}
      onResult={() => {}}
    />,
  );
}

const FORM_SRC = fs.readFileSync(
  "components/calc/building-std-price/BuildingStdPriceForm.tsx",
  "utf8",
);

describe("F-15 취득연도 옵션 — §1 (수정 전 실패)", () => {
  it("산정기준율표에 1985(=1985년 이전) 열이 실재한다 — 사실 고정", () => {
    const g = resolveAcqBaseGroup("rc")!;
    expect(resolveAcqBaseRate(g, 1980, 1985)).toBe(0.738);
    expect(resolveAcqBaseRate(g, 1980, 1986)).toBe(0.752);
  });

  it("옵션이 하드코딩 루프가 아니다", () => {
    expect(FORM_SRC).not.toContain("for (let y = 2025; y >= 1986; y--)");
  });

  it("상한은 지수표 보유 연도를 따르고 하한은 1985 다", () => {
    // shadcn Select 는 열기 전 옵션을 렌더하지 않아 DOM 으로 관측할 수 없다 ⇒ 옵션 산출 규칙을 본다.
    expect(FORM_SRC).toContain("const ACQ_YEAR_MIN = 1985;");
    expect(FORM_SRC).toMatch(/const top = yearOpts\.length > 0 \? yearOpts\[0\]/);
    expect(FORM_SRC).toMatch(/for \(let y = top; y >= ACQ_YEAR_MIN; y--\)/);
  });
});

describe("F-35 조정률 요약 칩 — §2 (수정 전 실패)", () => {
  it("통나무조 최고층수 제외가 칩에도 반영된다 — 칩 130% vs 엔진 90% 였다", () => {
    const feats = { maxFloors: 21 };
    const withKey = calcSpecialAdjustmentRate(feats, 135, 100, {
      isResidential: false,
      isApartment: false,
      structureKey: "solid_wood",
    });
    const withoutKey = calcSpecialAdjustmentRate(feats, 135, 100, {
      isResidential: false,
      isApartment: false,
    });
    expect(withKey).toBe(0.9);
    expect(withoutKey).toBe(1.3); // 사실 고정 — structureKey 를 빼면 제외가 적용되지 않는다
    // 칩이 structureKey 를 넘기는지 소스로 확인한다(세 호출부가 각자 ctx 를 조립하는 구조라 재발이 잦다)
    const src = fs.readFileSync(
      "components/calc/building-std-price/BuildingStdValuationSections.tsx",
      "utf8",
    );
    expect(src).toMatch(/structureKey:\s*f\.valStructureKey/);
  });
});

describe("F-36 취득 2001 UI 분기 — §3 (수정 전 실패)", () => {
  it("안내·필드 조건이 `acqIndexYear === 2001` 이 아니라 취득연도 ≤2000 을 본다", () => {
    // `acqIndexYear` 는 ≤2000 을 2001 로 접으므로 2001년 취득과 구별할 수 없다.
    expect(FORM_SRC).not.toContain("acqIndexYear === 2001 && !apartmentConv");
  });

  it("2001년 취득에는 §164⑤ 환산 안내가 뜨지 않는다", () => {
    renderWith({ acquisitionYear: "2001", transferYear: "2024" });
    expect(screen.queryByText(/2000년 이전 취득/)).toBeNull();
  });

  it("2000년 취득에는 종전대로 안내가 뜬다 (역방향 가드)", () => {
    renderWith({ acquisitionYear: "2000", transferYear: "2024" });
    expect(screen.getByText(/2000년 이전 취득/)).toBeTruthy();
  });
});

describe("F-44 · F-46 문구 — §4·§5 (수정 전 실패)", () => {
  it("F-44 일괄 계산 모달 결과 행에 「원」 접미사가 없다", () => {
    const src = fs.readFileSync(
      "components/calc/building-std-price/MultiPointBuildingStdPriceModal.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/\$\{fmt\([^)]*\)\} 원/);
  });

  it("F-46 취득 ≤2000 공시지가 hint 가 고시를 병기한다", () => {
    expect(FORM_SRC).not.toContain('hint="§164⑤ — 2001.1.1 현재 개별공시지가로 위치지수 산정"');
    expect(FORM_SRC).toMatch(/고시 §6①/);
  });
});
