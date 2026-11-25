/**
 * PSA-U1 — 철거 사실 칸 «화면 ≡ ⑧ ≡ ⑫» 렌더 격자 (실제 ⑧ `validateStep(2)` + 실제 ⑫ Zod + 실제 렌더 `Step2SeparateAggregate`).
 *
 * 각 셀(과세기준일 연도 × 철거일 × 종류 × 공장용지 × 답 정책)에서 «⑧이 다음으로 묻는 칸»을 따라가며 채운다:
 *   1. ⑧의 첫 결함 문구를 필드로 되짚는다(`PROPERTY_DEMOLISHED_ISSUE_MESSAGE` 역조회).
 *   2. **그 필드의 위젯이 화면에 그려져 있어야 한다** — «⑧이 요구하는 칸 = 화면에 그려진 칸»(막다른 길 0).
 *   3. 답 정책대로 그 칸을 채우고 다시 렌더 — 끝날 때까지 반복.
 * 끝에서 (a) 화면에 그려진 사실 칸 그룹 = ⑧이 물은 칸(순서까지)이다 — 화면이 ⑧이 묻지 않는 칸을 더 그리지 않는다(방향 2) ·
 *   (b) ⑧ 통과이면 ④ 본문을 실제 Zod에 넣어 통과 — «⑧ 통과 ∧ ⑫ 400» = 0 ·
 *   (c) 철거 전 바닥면적 칸 «필수 표시(*)» ⇔ 비웠을 때 ⑧이 바닥면적 문구로 막는다.
 * 공허 방지: 셀 수·차단·통과·끝까지 채운 셀·사슬 3단계까지 간 셀 하한을 단언한다.
 *
 * ⏱ 시간 제한: 연도 4개 × 철거일 약 10 × 종류 3 × 공장용지 2 × 정책 4 ≈ 연도당 수백 셀 · 셀당 렌더 1~7회 — 연도별 `it` 하나당 제한 180초
 *   (로컬 실측은 보고서에 기록). 느려지면 정책·날짜 축을 줄이지 말고 연도별 분할을 유지한다.
 */
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Step2SeparateAggregate } from "@/components/calc/property/Step2SeparateAggregate";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE as M } from "@/lib/tax-engine/property-separate-requirements";
import { addMonthsUtc } from "@/lib/tax-engine/civil-period";
import { format } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

type Fact = "yes" | "no" | "unknown";
/** 답 정책 — yes/no/unknown은 전 칸 같은 답, mix는 허가 예 · 건축 외 아니오 · 빈집정비 예 · 공용/유료 아니오(사슬이 열렸다 닫히는 갈래) */
type Policy = "yes" | "no" | "unknown" | "mix";
const POLICIES: Policy[] = ["yes", "no", "unknown", "mix"];
const MIX: Record<string, Fact> = {
  saDemolishedPermit: "yes",
  saDemolishedOtherUse: "no",
  saDemolishedVacantHouse: "yes",
  saDemolishedPublicUse: "no",
  saDemolishedPublicUsePaid: "no",
};
const YEARS = [2016, 2019, 2024, 2026];
const DAY = 86_400_000;

/** 철거일 후보 — s 뒤 하루 · 당일 · 2개월 전 · 6/12/36개월 만료일 당일과 앞뒤 하루 */
function removals(s: Date): string[] {
  const out = new Set<string>([format(new Date(s.getTime() + DAY), "yyyy-MM-dd"), format(s, "yyyy-MM-dd"), format(addMonthsUtc(s, -2), "yyyy-MM-dd")]);
  for (const m of [6, 12, 36]) {
    const r = addMonthsUtc(s, -m);
    for (const k of [-1, 0, 1]) out.add(format(new Date(r.getTime() + k * DAY), "yyyy-MM-dd"));
  }
  return [...out];
}

/** ⑧·⑫ 문구 → 필드(엔진이 문장 정본 — 역조회) */
const FIELD_BY_MESSAGE = new Map<string, string>([
  [M.demolishedKind, "demolishedKind"],
  [M.demolishedPermit, "demolishedPermit"],
  [M.demolishedOtherUse, "demolishedOtherUse"],
  [M.demolishedVacantHouse, "demolishedVacantHouse"],
  [M.demolishedPublicUse, "demolishedPublicUse"],
  [M.demolishedPublicUsePaid, "demolishedPublicUsePaid"],
  [M.buildingFloorArea, "buildingFloorArea"],
  [M.zoningDistrict, "zoningDistrict"],
  [M.demolishedAfterBaseDate, "contradiction"],
  [M.demolishedFactoryHouse, "contradiction"],
]);

/** 사실 칸 필드 → 화면 라디오 그룹 name · 폼 키 */
const WIDGET: Record<string, { name: string; key: keyof FormState }> = {
  demolishedKind: { name: "saDemolishedKind", key: "saDemolishedKind" },
  demolishedPermit: { name: "saDemolishedPermit", key: "saDemolishedPermit" },
  demolishedOtherUse: { name: "saDemolishedOtherUse", key: "saDemolishedOtherUse" },
  demolishedVacantHouse: { name: "saDemolishedVacantHouse", key: "saDemolishedVacantHouse" },
  demolishedPublicUse: { name: "saDemolishedPublicUse", key: "saDemolishedPublicUse" },
  demolishedPublicUsePaid: { name: "saDemolishedPublicUsePaid", key: "saDemolishedPublicUsePaid" },
};
/** 사실 칸 5개(종류 라디오는 철거 ON이면 항상 그려지므로 비교 대상이 아니다) */
const FACT_GROUPS = Object.values(WIDGET).map((w) => w.name).filter((n) => n !== "saDemolishedKind");

/** 정책별 답 */
function answer(policy: Policy, key: keyof FormState): Fact {
  return policy === "mix" ? (MIX[key as string] ?? "yes") : policy;
}

const base = (date: string, kind: FormState["saDemolishedKind"], isFactory: boolean, floor: string): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "400,000,000",
  saLandArea: "400",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: floor,
  saIsFactory: isFactory,
  saDemolished: true,
  saDemolishedDate: date,
  saDemolishedKind: kind,
  otherSeparateAggregateValue: "0",
  otherComprehensiveValue: "0",
});

const renderedGroups = (c: HTMLElement) => {
  const names = [...c.querySelectorAll('input[type="radio"]')].map((i) => (i as HTMLInputElement).name).filter((n) => FACT_GROUPS.includes(n));
  return names.filter((n, i) => names.indexOf(n) === i);
};

function zodFirstItemIssue(body: Record<string, unknown>): string | null {
  const r = propertyTaxInputSchema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.find((i) => i.path[0] === "separateAggregateItem")?.message ?? null;
}

interface Stats {
  cells: number;
  blockedByContradiction: number;
  finished: number;
  depth3: number;
}

/** 한 셀을 끝까지 따라간다. 어긋남은 사람이 읽을 문장으로 돌려준다(없으면 null). */
function walk(start: FormState, policy: Policy, stats: Stats): string | null {
  stats.cells++;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = render(<Step2SeparateAggregate form={start} onChange={() => {}} />, { container: el });
  let form = start;
  const asked: string[] = [];
  const tag = () => `${start.saDemolishedDate}/${start.saDemolishedKind || "-"}/factory=${start.saIsFactory}/${policy}`;
  try {
    for (let step = 0; step < 12; step++) {
      const message = validateStep(2, form);
      if (message === null) break;
      const field = FIELD_BY_MESSAGE.get(message);
      if (!field) return `${tag()} ⑧ 문구를 필드로 되짚을 수 없음: ${message}`;
      if (field === "contradiction") {
        // 철거일 > 과세기준일 · 공장용지 ∧ 주택 — 사실 칸이 아니라 모순 안내가 보여야 한다
        if (!el.querySelector('[data-testid="pt-sa-demolished-contradiction"]')) return `${tag()} ⑧은 모순으로 막는데 화면에 모순 안내 없음`;
        stats.blockedByContradiction++;
        return null;
      }
      if (field === "zoningDistrict") return `${tag()} 용도지역은 채워 둔 셀인데 ⑧이 요구함`;
      if (field === "buildingFloorArea") {
        // 철거 전 바닥면적 — 기존 «건물 바닥면적» 칸 재사용: ⑧이 요구하면 라벨에 필수 표시가 있어야 한다
        const lb = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("바닥면적 (㎡)"));
        if (!lb?.textContent?.includes("*")) return `${tag()} ⑧이 바닥면적을 요구하는데 라벨에 필수 표시 없음`;
        form = { ...form, saBuildingFloorArea: "100" };
        ui.rerender(<Step2SeparateAggregate form={form} onChange={() => {}} />);
        continue;
      }
      if (field === "demolishedKind") {
        if (!el.querySelector('input[type="radio"][name="saDemolishedKind"]')) return `${tag()} 종류 칸이 화면에 없음`;
        form = { ...form, saDemolishedKind: policy === "yes" ? "house" : "building" };
        ui.rerender(<Step2SeparateAggregate form={form} onChange={() => {}} />);
        continue;
      }
      const w = WIDGET[field];
      if (!el.querySelector(`input[type="radio"][name="${w.name}"]`)) return `${tag()} ⑧이 ${field}를 요구하는데 화면에 그 칸이 없음(막다른 길) — ⑧: ${message}`;
      asked.push(w.name);
      form = { ...form, [w.key]: answer(policy, w.key) };
      ui.rerender(<Step2SeparateAggregate form={form} onChange={() => {}} />);
    }
    if (validateStep(2, form) !== null) return `${tag()} 12번 채워도 ⑧이 안 풀림: ${validateStep(2, form)}`;

    // (a) 화면에 그려진 사실 칸 그룹 = ⑧이 물은 칸(순서까지) — 방향 2: 화면이 ⑧이 묻지 않는 칸을 더 그리지 않는다
    const shown = renderedGroups(el);
    if (JSON.stringify(shown) !== JSON.stringify(asked)) return `${tag()} 화면 칸 ${JSON.stringify(shown)} ≠ ⑧이 물은 칸 ${JSON.stringify(asked)}`;
    stats.finished++;
    if (asked.length >= 5) stats.depth3++; // 허가·건축 외·빈집정비·공용·유료 전부

    // (b) ⑧ 통과 ∧ ⑫ 400 = 0
    const zod = zodFirstItemIssue(buildPropertyTaxRequestBody(form));
    if (zod !== null) return `${tag()} ⑧ 통과인데 ⑫ 400: ${zod}`;

    // (c) 바닥면적 «필수 표시(*)» ⇔ 비웠을 때 ⑧이 바닥면적 문구로 막는다
    const blankFloor = { ...form, saBuildingFloorArea: "" };
    ui.rerender(<Step2SeparateAggregate form={blankFloor} onChange={() => {}} />);
    const label = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("바닥면적 (㎡)"));
    const star = label?.textContent?.includes("*") ?? false;
    const blocksOnFloor = validateStep(2, blankFloor) === M.buildingFloorArea;
    if (star !== blocksOnFloor) return `${tag()} 바닥면적 필수 표시(${star}) ≠ ⑧ 바닥면적 차단(${blocksOnFloor})`;
    return null;
  } finally {
    ui.unmount();
    el.remove();
  }
}

describe("PSA-U1 렌더 격자 — 화면 ≡ ⑧ ≡ ⑫ (요구 칸 = 그려진 칸)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  for (const year of YEARS) {
    it(
      `과세기준일 ${year}-06-01 — 전 셀 «⑧이 요구하는 칸 = 화면 칸» · «⑧ 통과 ∧ ⑫ 400» 0 · 바닥면적 표시 ≡ 차단`,
      () => {
        vi.setSystemTime(new Date(`${year}-07-15T00:00:00Z`));
        const s = parseISO(`${year}-06-01`);
        const stats: Stats = { cells: 0, blockedByContradiction: 0, finished: 0, depth3: 0 };
        const bad: string[] = [];
        for (const date of removals(s)) {
          for (const kind of ["", "house", "building"] as const) {
            for (const isFactory of [false, true]) {
              for (const floor of ["100", ""]) {
                for (const policy of POLICIES) {
                  const miss = walk(base(date, kind, isFactory, floor), policy, stats);
                  if (miss && bad.length < 8) bad.push(miss);
                  else if (miss) bad.push("…");
                }
              }
            }
          }
        }
        expect(bad, bad.slice(0, 8).join("\n")).toEqual([]);
        // 비공허 — 격자가 «끝까지 채움 / 모순 차단» 두 갈래를 모두 지난다
        expect(stats.cells).toBeGreaterThan(300);
        expect(stats.finished).toBeGreaterThan(100);
        expect(stats.blockedByContradiction).toBeGreaterThan(0);
        if (year >= 2024) expect(stats.depth3).toBeGreaterThan(0); // 사슬(허가·건축 외·빈집·공용·유료) 끝까지 간 셀
      },
      180_000,
    );
  }
});
