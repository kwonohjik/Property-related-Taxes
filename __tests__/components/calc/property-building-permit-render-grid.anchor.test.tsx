/**
 * PSA-E3 — 비철거 건축물 허가·사용승인 칸 «화면 ≡ ⑧ ≡ ④ ≡ ⑫» 렌더 격자
 * (실제 ⑧ `validateStep(2)` + 실제 ⑫ Zod + 실제 렌더 `Step2SeparateAggregate`).
 *
 * 격자: 과세기준일 연도(2010·2011·2019·2026) × 철거 ON/OFF × 공장용지 × 답(미선택·예·아니오·모름).
 *   (a) 칸 노출 = «철거 OFF ∧ 과세기준일 ≥ 2011.6.1.» (오라클은 시행일 리터럴 — 화면 코드는 날짜를 비교하지 않는다)
 *   (b) ⑧이 허가 문구로 막으면 그 칸이 화면에 있다(막다른 길 0) · 칸이 없으면 ⑧은 허가 문구로 막지 않는다
 *   (c) ⑧ 통과 ⇒ ④ 본문을 실제 Zod에 넣어 통과(«⑧ 통과 ∧ ⑫ 400» = 0) · ④의 buildingPermit 전송 ⇔ 칸 노출
 *   (d) 선택값이 라디오에 반영되고, 미선택이면 아무것도 눌려 있지 않다(기본값 없음)
 *   (e) PSA-S2 — 용도지역·바닥면적 블록(`pt-sa-area-basis`)은 사슬 끝에서만: 비철거는 «허가 칸 없는 시행본 또는 허가 예», 철거는 «2024.6.1.~ 건축물 ∧ 앞 요건 통과».
 *       블록이 그려졌는데 ⑧이 면적을 요구하지 않거나(과요구 아님 확인), ⑧이 면적을 요구하는데 블록이 없는(막다른 길) 셀 0 · ④ 면적 키 전송 ⇔ 블록 노출 ∧ 값 있음
 * 공허 방지: 셀 수·노출 셀·숨김 셀·차단 셀·통과 셀 하한을 단언한다.
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Step2SeparateAggregate } from "@/components/calc/property/Step2SeparateAggregate";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import { PROPERTY_SEPARATE } from "@/lib/tax-engine/legal-codes";

type Answer = FormState["saBuildingPermit"];
const ANSWERS: Answer[] = ["", "yes", "no", "unknown"];
const YEARS = [2010, 2011, 2019, 2026];

const base = (year: number, over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "300,000,000",
  saLandArea: "300",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: "100",
  otherSeparateAggregateValue: "0",
  otherComprehensiveValue: "0",
  // 철거 ON 셀은 철거 경로가 자기 칸을 모두 채워 통과하게 한다(이 격자의 관심은 본 경로 허가 칸이 숨는지)
  ...over,
  ...(over.saDemolished
    ? { saDemolishedDate: `${year}-01-01`, saDemolishedKind: "building" as const, saDemolishedPermit: "yes" as const, saDemolishedOtherUse: "no" as const }
    : {}),
});

const groupLen = (c: HTMLElement) => c.querySelectorAll('input[type="radio"][name="saBuildingPermit"]').length;

function zodItemIssue(body: Record<string, unknown>): string | null {
  const r = propertyTaxInputSchema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.find((i) => i.path[0] === "separateAggregateItem")?.message ?? null;
}

describe("PSA-E3 렌더 격자 — 화면 ≡ ⑧ ≡ ④ ≡ ⑫", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("연도 × 철거 × 공장 × 답 — 노출 · 막다른 길 0 · «⑧ 통과 ∧ ⑫ 400» 0 · ④ ⇔ 노출 · 선택 반영", () => {
    const bad: string[] = [];
    const stats = { cells: 0, shown: 0, hidden: 0, blocked: 0, passed: 0, areaShown: 0 };
    for (const year of YEARS) {
      vi.setSystemTime(new Date(`${year}-07-15T00:00:00Z`));
      for (const saDemolished of [false, true]) {
        for (const saIsFactory of [false, true]) {
          for (const answer of ANSWERS) for (const withArea of [true, false]) {
            const f = base(year, { saDemolished, saIsFactory, saBuildingPermit: answer, ...(withArea ? {} : { saZoningDistrict: "", saBuildingFloorArea: "" }) });
            const tag = `${year}/demolished=${saDemolished}/factory=${saIsFactory}/permit=${answer || "-"}/area=${withArea}`;
            stats.cells++;
            const { container, unmount } = render(<Step2SeparateAggregate form={f} onChange={() => {}} />);
            const shown = groupLen(container) === 3;
            const expectShown = !saDemolished && year >= 2011; // 영 §101① 단서 첫 과세기준일 2011.6.1.
            if (groupLen(container) !== (expectShown ? 3 : 0)) bad.push(`${tag} 노출 ${groupLen(container)} ≠ 기대 ${expectShown ? 3 : 0}`);
            if (shown) stats.shown++;
            else stats.hidden++;

            const message = validateStep(2, f);
            const blocksOnPermit = message === PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE;
            if (blocksOnPermit) {
              stats.blocked++;
              if (!shown) bad.push(`${tag} ⑧이 허가 칸을 요구하는데 화면에 없음(막다른 길)`);
              if (answer !== "") bad.push(`${tag} 답이 있는데 ⑧이 허가로 막음`);
            }
            if (shown && answer === "" && !blocksOnPermit) bad.push(`${tag} 칸이 보이고 미선택인데 ⑧이 허가로 막지 않음`);

            // (e) 용도지역·바닥면적 블록 — 사슬 끝에서만(오라클은 리터럴: 비철거 = 시행본에 허가 칸 없음(<2011) ∨ 허가 예 · 철거 = 면적 문언 시행본(2024.6.1.~) — 철거 셀은 건축물 · 철거 2026/…-01-01 · 허가 예 · 건축 외 아니오)
            const areaShown = container.querySelector('[data-testid="pt-sa-area-basis"]') !== null;
            const expectArea = saDemolished ? year >= 2024 : year < 2011 || answer === "yes";
            if (areaShown !== expectArea) bad.push(`${tag} 면적 블록 노출 ${areaShown} ≠ 기대 ${expectArea}`);
            if (areaShown) stats.areaShown++;
            const needsAreaMessage = message === "용도지역을 선택하세요." || message === "건물 바닥면적(㎡)을 입력하세요." || (message?.includes("바닥면적") ?? false) || (message?.includes("용도지역") ?? false);
            if (needsAreaMessage && !areaShown) bad.push(`${tag} ⑧이 면적 칸을 요구하는데 블록이 없음(막다른 길): ${message}`);
            if (areaShown && !withArea && message === null) bad.push(`${tag} 면적 블록이 보이고 비었는데 ⑧이 막지 않음`);
            if (!shown && blocksOnPermit) bad.push(`${tag} 칸이 없는데 ⑧이 허가로 막음`);

            const body = buildPropertyTaxRequestBody(f);
            const wired = Object.prototype.hasOwnProperty.call(body.separateAggregateItem as object, "buildingPermit");
            if (wired !== shown) bad.push(`${tag} ④ 전송(${wired}) ≠ 칸 노출(${shown})`);
            const bodyItem = body.separateAggregateItem as Record<string, unknown>;
            const areaWired = Boolean(bodyItem.zoningDistrict) || bodyItem.buildingFloorArea !== undefined;
            if (areaWired !== (areaShown && withArea)) bad.push(`${tag} ④ 면적 전송(${areaWired}) ≠ 블록 노출·값 있음(${areaShown && withArea})`);

            if (message === null) {
              stats.passed++;
              const zod = zodItemIssue(body);
              if (zod !== null) bad.push(`${tag} ⑧ 통과인데 ⑫ 400: ${zod}`);
            }

            // (d) 선택 반영 — 기본값 없음
            if (shown) {
              const checked = [...container.querySelectorAll('input[type="radio"][name="saBuildingPermit"]:checked')].map((i) => (i as HTMLInputElement).value);
              if (JSON.stringify(checked) !== JSON.stringify(answer ? [answer] : [])) bad.push(`${tag} 선택 반영 ${JSON.stringify(checked)}`);
            }
            unmount();
          }
        }
      }
    }
    expect(bad, bad.slice(0, 8).join("\n")).toEqual([]);
    // 비공허 — 노출·숨김·차단·통과 갈래를 모두 지난다
    expect(stats.cells).toBe(YEARS.length * 2 * 2 * ANSWERS.length * 2);
    expect(stats.areaShown).toBeGreaterThan(20);
    expect(stats.shown).toBeGreaterThan(20);
    expect(stats.hidden).toBeGreaterThan(20);
    expect(stats.blocked).toBeGreaterThan(5);
    expect(stats.passed).toBeGreaterThan(20);
  });
});

describe("PSA-E3 위젯 — 쓰기·문구·숨은 값", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T00:00:00Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("클릭 → onChange({saBuildingPermit}) 한 칸만 패치(자동 채움·미러링 없음)", () => {
    const onChange = vi.fn();
    render(<Step2SeparateAggregate form={base(2026, {})} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("pt-sa-permit-no"));
    fireEvent.click(screen.getByTestId("pt-sa-permit-unknown"));
    fireEvent.click(screen.getByTestId("pt-sa-permit-yes"));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([{ saBuildingPermit: "no" }, { saBuildingPermit: "unknown" }, { saBuildingPermit: "yes" }]);
  });

  it("칸 순서 = ⑧ 순서(PSA-S2): 토지 면적 → 공장용지 → 철거 토글 → 허가 → (허가 «예») 용도지역 → 바닥면적 · 점프 앵커 data-field", () => {
    // 허가 미선택 — 허가까지만(면적 블록은 사슬 끝)
    const blank = render(<Step2SeparateAggregate form={base(2026, {})} onChange={() => {}} />);
    const names = (c: HTMLElement) => {
      const all = [...c.querySelectorAll('input[type="radio"]')].map((i) => (i as HTMLInputElement).name);
      return all.filter((n, i) => all.indexOf(n) === i);
    };
    expect(names(blank.container)).toEqual(["saBuildingPermit"]);
    expect(blank.container.querySelectorAll('[data-field="buildingPermit"]')).toHaveLength(1);
    blank.unmount();
    // 허가 «아니오»·«모름» — 확정이라 면적 블록 없음
    for (const p of ["no", "unknown"] as const) {
      const r = render(<Step2SeparateAggregate form={base(2026, { saBuildingPermit: p })} onChange={() => {}} />);
      expect(names(r.container)).toEqual(["saBuildingPermit"]);
      expect(r.container.querySelector('[data-testid="pt-sa-area-basis"]')).toBeNull();
      r.unmount();
    }
    // 허가 «예» — 허가 아래 용도지역 → 바닥면적, 철거 토글 뒤
    const { container } = render(<Step2SeparateAggregate form={base(2026, { saBuildingPermit: "yes" })} onChange={() => {}} />);
    expect(names(container)).toEqual(["saBuildingPermit", "saZoningDistrict"]);
    const html = container.innerHTML;
    const at = (needle: string) => html.indexOf(needle);
    expect(at("토지 면적 (㎡)")).toBeLessThan(at("공장용지"));
    expect(at("공장용지")).toBeLessThan(at("건축물 철거 완료"));
    expect(at("건축물 철거 완료")).toBeLessThan(at('data-testid="pt-sa-permit"'));
    expect(at('data-testid="pt-sa-permit"')).toBeLessThan(at('data-testid="pt-sa-area-basis"'));
    expect(at('data-testid="pt-sa-area-zoning"')).toBeLessThan(at("건물 바닥면적 (㎡)"));
  });

  it("뜻 설명 — 영 §101① 단서 verbatim 반영(예=받았거나 받을 필요 없고 사용승인도 문제 없음 · 아니오=받아야 하는데 받지 않음 / 받지 않고 사용 중) + 근거 조문 · 접혀도 DOM·인쇄에 남음", () => {
    const { container } = render(<Step2SeparateAggregate form={base(2026, {})} onChange={() => {}} />);
    const text = screen.getByTestId("pt-sa-permit").textContent ?? "";
    for (const phrase of [
      "허가 등을 받았거나 받을 필요가 없고",
      "사용승인(임시사용승인 포함)도 받았거나 받을 필요가 없거나 아직 사용 중이 아닌 경우",
      "허가 등을 받아야 하는데 받지 않았거나(사용 여부와 무관)",
      "사용승인을 받아야 하는데 받지 않고 사용 중인 경우",
      PROPERTY_SEPARATE.BUILDING_PERMIT_101,
      "모름은 인정하지 않고 확인 필요로 표시합니다",
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(container.querySelector(".hidden.print\\:block")).not.toBeNull();
    // 필수 표시 · placeholder 숫자 예시 없음
    expect(screen.getByTestId("pt-sa-permit").querySelector("input[placeholder]")).toBeNull();
  });

  it("철거 ON → 칸 숨김, 철거를 끄면 고른 답이 그대로(숨은 값 보존 — 위젯은 저장값을 지우지 않는다)", () => {
    const onChange = vi.fn();
    const on = base(2026, { saBuildingPermit: "no", saDemolished: true });
    const { rerender, container } = render(<Step2SeparateAggregate form={on} onChange={onChange} />);
    expect(groupLen(container)).toBe(0);
    rerender(<Step2SeparateAggregate form={{ ...on, saDemolished: false }} onChange={onChange} />);
    expect((screen.getByTestId("pt-sa-permit-no") as HTMLInputElement).checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
