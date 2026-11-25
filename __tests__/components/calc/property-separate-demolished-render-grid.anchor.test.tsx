/**
 * PSA-U1·S1 — 철거 사실 칸 «화면 ≡ 사슬 ≡ ⑧ ≡ ⑫» 렌더 격자 (실제 ⑧ `validateStep(2)` + 실제 ⑫ Zod + 실제 렌더 `Step2SeparateAggregate` + 엔진 사슬 `demolishedChainOf`).
 *
 * 각 뿌리 셀(과세기준일 연도 × 철거일 × 종류 × 공장용지 × 바닥면적 유무 × 숨은 답 미리 채움 유무)에서 ⑧이 다음으로 묻는 칸을 따라가며, **물은 칸마다 답 {예·아니오·모름}을 전부 분기하는 DFS**로 걷는다(정책 샘플링 아님):
 *   N1. 화면에 그려진 사실 칸 그룹(종류 포함) = 엔진 `chain.order`(바닥면적 쌍 제외) — 순서까지. 노출 = 답한 칸 + 첫 미답 칸(`chain.next`)뿐이고 그 뒤 칸은 DOM에 없다.
 *   N2. ⑧의 첫 결함 칸 = `chain.next`(용도지역·바닥면적은 한 쌍) — 막힌 칸이 곧 화면의 마지막 질문(막다른 길 0 · 요구 과소 0). `next`가 없으면 ⑧은 날짜·모순 결함이 아니면 통과한다.
 *   N3. ⑧ 통과이면 ④ 본문을 실제 Zod에 넣어 통과 — «⑧ 통과 ∧ ⑫ 400» = 0 · 본문의 사실 칸 키 집합 = `chain.asked` 중 값이 있는 칸(숨은 답은 폼에 남아도 본문에 없다).
 *   N4. 철거 전 바닥면적 칸 «필수 표시(*)» ⇔ 용도지역·바닥면적 블록(`SeparateAggregateAreaBasis`) 노출 ⇔ `chain.asked.buildingFloorArea` ⇔ 비웠을 때 ⑧이 용도지역·바닥면적 문구로 막는다(PSA-S2: 블록은 사슬 끝에서만).
 *   N5(PSA-SU). 확정 안내 `pt-sa-seq-settled` 노출 ⇔ 엔진 `chain.resolved`가 접힘(fold) — `data-reason` = 엔진 사유 · 본문 = 엔진 `resolved.notice` 그대로. 성립(holds)·날짜 결함·모순은 확정 안내 없음.
 *   N6(PSA-SU). 낭독 한 줄 `pt-sa-seq-status`(항상 마운트) = next가 있으면 «다음 질문: {칸 이름}» · 접힘 확정이면 확정 문구 · 그 밖은 빈 문자열.
 *   N7(PSA-SU). «이전에 고른 답» 표식 `pt-sa-prev-answer-{field}` ⇔ 그려진 칸 ∧ 저장값 있음(이 격자는 클릭 없이 마운트만 하므로 확인 집합이 비어 있다) — 그려지지 않은 칸엔 없다.
 * 비공허: 셀 수·접힘 확정 사유별·성립(holds)·깊이 5(공용·유료까지)·빈집정비 관문·빈집정비 단서 자리 셀 하한을 단언한다.
 *
 * ⏱ 시간 제한: 연도별 `it` 하나당 180초(로컬 실측은 PR 본문에 기록). 느려지면 날짜·답 축을 줄이지 말고 연도별 분할을 유지한다.
 */
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Step2SeparateAggregate } from "@/components/calc/property/Step2SeparateAggregate";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { demolishedFormValues } from "@/components/calc/property/request-body";
import { demolishedChainOf } from "@/lib/calc/property-separate-requirements";
import { PROPERTY_ASK_FIELD_NAME } from "@/lib/calc/property-demolished-verdict-text";
import { DEMOLISHED_DATE_NOTICE } from "@/components/calc/property/separate-sequence";
import { DEMOLISHED_KIND_NOTICE } from "@/components/calc/property/separate-sequence";
import { settledLeadOf } from "@/components/calc/property/separate-sequence";
import { settledTail } from "@/components/calc/property/separate-sequence";
import { demolishedSettledOf } from "@/components/calc/property/separate-sequence";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE as M } from "@/lib/tax-engine/property-separate-requirements";
import { addMonthsUtc } from "@/lib/tax-engine/civil-period";
import { format } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

type Fact = "yes" | "no" | "unknown";
const ANSWERS: Fact[] = ["yes", "no", "unknown"];
const YEARS = [2015, 2016, 2019, 2023, 2024, 2026];
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
  [M.demolishedDate, "demolishedDate"],
  [M.demolishedKind, "demolishedKind"],
  [M.demolishedPermit, "demolishedPermit"],
  [M.demolishedOtherUse, "demolishedOtherUse"],
  [M.demolishedVacantHouse, "demolishedVacantHouse"],
  [M.demolishedPublicUse, "demolishedPublicUse"],
  [M.demolishedPublicUsePaid, "demolishedPublicUsePaid"],
  [M.buildingFloorArea, "buildingFloorArea"],
  [M.zoningDistrict, "buildingFloorArea"],
  [M.demolishedAfterBaseDate, "contradiction"],
  [M.demolishedFactoryHouse, "contradiction"],
]);

/** 사실 칸 필드(종류 포함) → 화면 라디오 그룹 name · 폼 키 · 본문 키 */
const WIDGET: Record<string, { name: string; key: keyof FormState; wire: string }> = {
  demolishedKind: { name: "saDemolishedKind", key: "saDemolishedKind", wire: "demolishedKind" },
  demolishedPermit: { name: "saDemolishedPermit", key: "saDemolishedPermit", wire: "demolishedPermit" },
  demolishedOtherUse: { name: "saDemolishedOtherUse", key: "saDemolishedOtherUse", wire: "demolishedOtherUse" },
  demolishedVacantHouse: { name: "saDemolishedVacantHouse", key: "saDemolishedVacantHouse", wire: "demolishedVacantHouse" },
  demolishedPublicUse: { name: "saDemolishedPublicUse", key: "saDemolishedPublicUse", wire: "demolishedPublicUse" },
  demolishedPublicUsePaid: { name: "saDemolishedPublicUsePaid", key: "saDemolishedPublicUsePaid", wire: "demolishedPublicUsePaid" },
};
const GROUPS = Object.values(WIDGET).map((w) => w.name);
const FACT_FIELDS = Object.keys(WIDGET).filter((f) => f !== "demolishedKind");

const base = (date: string, kind: FormState["saDemolishedKind"], isFactory: boolean, floor: string, prefill: boolean): FormState => ({
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
  // 숨은 답 미리 채움 — 화면·④가 사슬 밖 칸의 저장값을 새게 하면 안 된다(stale 변형)
  ...(prefill
    ? { saDemolishedPermit: "yes", saDemolishedOtherUse: "yes", saDemolishedVacantHouse: "yes", saDemolishedPublicUse: "no", saDemolishedPublicUsePaid: "unknown" }
    : {}),
});

function renderedGroups(c: HTMLElement): string[] {
  const names = [...c.querySelectorAll('input[type="radio"]')].map((i) => (i as HTMLInputElement).name).filter((n) => GROUPS.includes(n));
  return names.filter((n, i) => names.indexOf(n) === i);
}

function zodFirstItemIssue(body: Record<string, unknown>): string | null {
  const r = propertyTaxInputSchema.safeParse(body);
  if (r.success) return null;
  return r.error.issues.find((i) => i.path[0] === "separateAggregateItem")?.message ?? null;
}

interface Stats {
  roots: number;
  nodes: number;
  contradiction: number;
  holds: number;
  depth5: number;
  gate: number;
  proviso: number;
  settledShown: number;
  marks: number;
  folds: Record<string, number>;
}

/** 한 노드(폼 상태)를 검사하고, ⑧이 물은 칸이 사실 칸이면 답 3가지로 분기한다. 어긋남은 사람이 읽을 문장으로 모은다. */
function visit(form: FormState, ui: ReturnType<typeof render>, el: HTMLElement, stats: Stats, bad: string[], trail: string): void {
  stats.nodes++;
  ui.rerender(<Step2SeparateAggregate form={form} onChange={() => {}} />);
  const fail = (m: string) => {
    if (bad.length < 8) bad.push(`${trail} — ${m}`);
  };
  const chain = demolishedChainOf(demolishedFormValues(form));
  const message = validateStep(2, form);

  // N1 — 화면 칸 = chain.order(바닥면적 쌍 제외) · 순서까지
  const expected = chain.order.filter((f) => f !== "buildingFloorArea").map((f) => WIDGET[f].name);
  const shown = renderedGroups(el);
  if (JSON.stringify(shown) !== JSON.stringify(expected)) return fail(`화면 칸 ${JSON.stringify(shown)} ≠ chain.order ${JSON.stringify(expected)}`);

  // N4 — 바닥면적 필수 표시 ⇔ chain.asked.buildingFloorArea
  const label = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("바닥면적 (㎡)"));
  const star = label?.textContent?.includes("*") ?? false;
  if (star !== chain.asked.buildingFloorArea) return fail(`바닥면적 필수 표시(${star}) ≠ chain.asked.buildingFloorArea(${chain.asked.buildingFloorArea})`);
  // PSA-S2 — 용도지역·바닥면적 블록은 사슬 끝에서만 그려진다(그려졌다 = 요구됐다)
  const areaShown = el.querySelector('[data-testid="pt-sa-area-basis"]') !== null;
  if (areaShown !== chain.asked.buildingFloorArea) return fail(`면적 블록 노출(${areaShown}) ≠ chain.asked.buildingFloorArea(${chain.asked.buildingFloorArea})`);

  // N5 — 확정 안내 ⇔ 엔진 접힘 확정 · 사유·문장은 엔진 값 그대로
  const settledEl = el.querySelector('[data-testid="pt-sa-seq-settled"]');
  const fold = chain.resolved?.kind === "fold" ? chain.resolved : null;
  if ((settledEl !== null) !== (fold !== null)) return fail(`확정 안내 노출(${settledEl !== null}) ≠ chain.resolved 접힘(${fold !== null})`);
  if (fold && settledEl) {
    if (settledEl.getAttribute("data-reason") !== fold.foldReason) return fail(`확정 안내 사유 ${settledEl.getAttribute("data-reason")} ≠ ${fold.foldReason}`);
    // 날짜만으로 확정(at: date)이면 «철거일로 정해져…»·«철거일을 바꾸면…», 답으로 확정이면 «이 답으로…»·«답을 바꾸면…»(L-2)
    const settled = demolishedSettledOf(form);
    if (!settled || settled.dateOnly !== (fold.at === "date")) return fail("확정 안내 dateOnly ≠ 엔진 resolved.at === date");
    if (!settledEl.textContent?.includes(fold.notice) || !settledEl.textContent.includes(settledLeadOf(settled)) || !settledEl.textContent.includes(settledTail(settled))) return fail("확정 안내 본문이 엔진 notice·고정 문장을 담지 않음");
    stats.settledShown++;
  }
  // N6 — 낭독 한 줄
  const statusText = el.querySelector('[data-testid="pt-sa-seq-status"]')?.textContent ?? null;
  const wantStatus = chain.next ? `다음 질문: ${PROPERTY_ASK_FIELD_NAME[chain.next]}` : fold ? "별도합산 불성립이 확정되어 나머지 칸은 묻지 않습니다" : form.saDemolishedDate === "" ? DEMOLISHED_DATE_NOTICE : "";
  if (statusText !== wantStatus) return fail(`낭독 한 줄 «${statusText}» ≠ «${wantStatus}»`);
  const statusEl = el.querySelector('[data-testid="pt-sa-seq-status"]');
  if (statusEl?.getAttribute("role") !== "status" || statusEl.getAttribute("aria-live") !== "polite") return fail("낭독 한 줄에 role=status · aria-live=polite 없음");
  // N6b — 화면 안내 한 줄과 낭독이 같은 칸을 가리킨다: 철거일 없음 → 날짜 안내 · 철거일 있고 다음이 종류 → 종류 안내(날짜 안내 아님)
  const dateNotice = el.querySelector('[data-testid="pt-demolished-dates-notice"]')?.textContent ?? null;
  const kindNotice = el.querySelector('[data-testid="pt-demolished-kind-notice"]')?.textContent ?? null;
  const wantDate = form.saDemolishedDate === "" ? DEMOLISHED_DATE_NOTICE : null;
  // 종류를 골랐는데 다음이 다시 종류면(공장용지 × 주택 모순) 모순 안내(role=alert)가 그 칸을 가리키므로 종류 안내는 없다
  const wantKind = form.saDemolishedDate !== "" && chain.next === "demolishedKind" && form.saDemolishedKind === "" ? DEMOLISHED_KIND_NOTICE : null;
  if (chain.next === "demolishedKind" && form.saDemolishedKind !== "" && !el.querySelector('[data-testid="pt-sa-demolished-contradiction"]')) return fail("종류를 골랐는데 다음 칸이 종류인데 모순 안내 없음");
  if (dateNotice !== wantDate || kindNotice !== wantKind) return fail(`화면 안내(날짜 «${dateNotice}» · 종류 «${kindNotice}») ≠ (날짜 «${wantDate}» · 종류 «${wantKind}»)`);
  // N7 — «이전에 고른 답» 표식 ⇔ 그려졌고 저장값이 있다
  for (const f of ["demolishedKind", "demolishedVacantHouse", "demolishedPermit", "demolishedOtherUse", "demolishedPublicUse", "demolishedPublicUsePaid", "buildingFloorArea"] as const) {
    const stored = f === "buildingFloorArea" ? form.saBuildingFloorArea !== "" || form.saZoningDistrict !== "" : (form[WIDGET[f].key] as string) !== "";
    const wantMark = chain.order.includes(f) && stored;
    const hasMark = el.querySelector(`[data-testid="pt-sa-prev-answer-${f}"]`) !== null;
    if (hasMark !== wantMark) return fail(`이전에 고른 답 표식(${f}) ${hasMark} ≠ 그려짐∧저장값 ${wantMark}`);
    if (hasMark) stats.marks++;
  }

  const field = message === null ? null : (FIELD_BY_MESSAGE.get(message) ?? "?");
  if (field === "?") return fail(`⑧ 문구를 필드로 되짚을 수 없음: ${message}`);

  if (field === "contradiction") {
    if (!el.querySelector('[data-testid="pt-sa-demolished-contradiction"]')) return fail("⑧은 모순으로 막는데 화면에 모순 안내 없음");
    stats.contradiction++;
    return;
  }
  if (field === "demolishedDate") {
    if (chain.order.length !== 0) return fail("철거일 결함인데 사슬이 칸을 읽음");
    return;
  }

  // N2 — ⑧의 첫 결함 칸 = chain.next
  if (field === null) {
    if (chain.next !== null) return fail(`⑧ 통과인데 chain.next=${chain.next}`);
    // N3 — ⑧ 통과 ∧ ⑫ 400 = 0 · 본문 사실 칸 키 = chain.asked 중 값이 있는 칸
    const body = buildPropertyTaxRequestBody(form) as { separateAggregateItem: Record<string, unknown> };
    const zod = zodFirstItemIssue(body as unknown as Record<string, unknown>);
    if (zod !== null) return fail(`⑧ 통과인데 ⑫ 400: ${zod}`);
    for (const f of Object.keys(WIDGET)) {
      const w = WIDGET[f];
      const wired = w.wire in body.separateAggregateItem;
      const should = chain.asked[f as keyof typeof chain.asked] && (form[w.key] as string) !== "";
      if (wired !== should) return fail(`본문 ${w.wire} 키(${wired}) ≠ chain.asked 중 값이 있는 칸(${should})`);
    }
    if (("buildingFloorArea" in body.separateAggregateItem) !== chain.asked.buildingFloorArea) return fail("본문 buildingFloorArea 키 ≠ chain.asked.buildingFloorArea");
    const r = chain.resolved;
    if (!r) return fail("⑧ 통과인데 chain.resolved 없음");
    if (r.kind === "holds") stats.holds++;
    else stats.folds[r.foldReason] = (stats.folds[r.foldReason] ?? 0) + 1;
    if (chain.order.filter((f) => FACT_FIELDS.includes(f)).length >= 5) stats.depth5++;
    if (chain.vacantHousePosition === "gate") stats.gate++;
    if (chain.vacantHousePosition === "proviso") stats.proviso++;
    // 바닥면적을 비우면 chain.asked일 때만 ⑧이 막는다
    const blank = validateStep(2, { ...form, saBuildingFloorArea: "" });
    if ((blank === M.buildingFloorArea) !== chain.asked.buildingFloorArea) return fail(`바닥면적 비움 → ⑧ 차단(${blank === M.buildingFloorArea}) ≠ chain.asked.buildingFloorArea`);
    return;
  }

  const expectedField = chain.next === null ? "?" : chain.next;
  if (field !== expectedField) return fail(`⑧ 첫 결함 ${field} ≠ chain.next ${expectedField}`);
  if (field === "buildingFloorArea") {
    // 용도지역은 채워 둔 상태 — 바닥면적이 비어 있는 노드. 입력하면 사슬 끝
    if (form.saBuildingFloorArea) return fail("바닥면적을 채웠는데 ⑧이 요구함");
    visit({ ...form, saBuildingFloorArea: "100" }, ui, el, stats, bad, `${trail}>면적=100`);
    return;
  }
  const w = WIDGET[field];
  if (!el.querySelector(`input[type="radio"][name="${w.name}"]`)) return fail(`⑧이 ${field}를 요구하는데 화면에 그 칸이 없음(막다른 길)`);
  if (field === "demolishedKind") {
    for (const kind of ["house", "building"] as const) visit({ ...form, saDemolishedKind: kind }, ui, el, stats, bad, `${trail}>종류=${kind}`);
    return;
  }
  for (const a of ANSWERS) visit({ ...form, [w.key]: a }, ui, el, stats, bad, `${trail}>${field}=${a}`);
}

describe("PSA-U1·S1 렌더 격자 — 화면 ≡ 사슬 ≡ ⑧ ≡ ⑫ (노출 칸 = chain.order 앞부분 = ⑧이 물은 칸)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  for (const year of YEARS) {
    it(
      `과세기준일 ${year}-06-01 — 답 3지 전수 DFS: N1 화면 칸 = chain.order · N2 ⑧ 칸 = chain.next · N3 ⑧ 통과 ∧ ⑫ 400 = 0 · N4 바닥면적 표시 ≡ 차단`,
      () => {
        vi.setSystemTime(new Date(`${year}-07-15T00:00:00Z`));
        const s = parseISO(`${year}-06-01`);
        const stats: Stats = { roots: 0, nodes: 0, contradiction: 0, holds: 0, depth5: 0, gate: 0, proviso: 0, settledShown: 0, marks: 0, folds: {} };
        const bad: string[] = [];
        const el = document.createElement("div");
        document.body.appendChild(el);
        const ui = render(<Step2SeparateAggregate form={base("", "", false, "", false)} onChange={() => {}} />, { container: el });
        try {
          for (const date of removals(s)) {
            for (const kind of ["", "house", "building"] as const) {
              for (const isFactory of [false, true]) {
                for (const floor of ["100", ""]) {
                  for (const prefill of [false, true]) {
                    stats.roots++;
                    visit(base(date, kind, isFactory, floor, prefill), ui, el, stats, bad, `${date}/${kind || "-"}/factory=${isFactory}/floor=${floor || "-"}/prefill=${prefill}`);
                  }
                }
              }
            }
          }
        } finally {
          ui.unmount();
          el.remove();
        }
        expect(bad, bad.join("\n")).toEqual([]);
        // 비공허 — 격자가 접힘·성립·모순 차단·빈집정비 두 자리를 모두 지난다
        expect(stats.roots).toBeGreaterThan(250);
        expect(stats.nodes).toBeGreaterThanOrEqual(stats.roots);
        expect(stats.settledShown).toBeGreaterThan(0);
        if (year >= 2016) expect(stats.marks).toBeGreaterThan(0); // 2015: 날짜만으로 접혀 답 칸이 없다
        expect(stats.contradiction).toBeGreaterThan(0);
        if (year >= 2016) {
          expect(stats.holds).toBeGreaterThan(0);
          expect(stats.folds.period ?? 0).toBeGreaterThan(0);
        } else {
          expect(stats.folds.not_yet ?? 0).toBeGreaterThan(0);
        }
        if (year >= 2019) expect(stats.folds.permit ?? 0).toBeGreaterThan(0);
        if (year >= 2024) {
          expect(stats.folds.other_use ?? 0).toBeGreaterThan(0);
          expect(stats.folds.public_use_unpaid ?? 0).toBeGreaterThan(0);
          expect(stats.depth5).toBeGreaterThan(0); // 허가·건축 외·빈집정비·공용·유료 전부 읽은 셀
          expect(stats.gate).toBeGreaterThan(0);
          expect(stats.proviso).toBeGreaterThan(0);
        }
         
        console.log(`[PSA-S1 렌더 격자 ${year}] roots=${stats.roots} nodes=${stats.nodes} holds=${stats.holds} contradiction=${stats.contradiction} settled=${stats.settledShown} marks=${stats.marks} depth5=${stats.depth5} gate=${stats.gate} proviso=${stats.proviso} folds=${JSON.stringify(stats.folds)}`);
      },
      180_000,
    );
  }
});
