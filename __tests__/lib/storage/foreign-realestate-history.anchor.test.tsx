/**
 * 국외자산 부동산 U3 — 이력 저장·제목·dedup·빈 폼 판정·불러오기(재계산)·드로어·목록 합계
 *
 * 계획서: `docs/02-design/features/transfer-foreign-realestate.ui.plan.md` §6.4 · §14.6(저장 보류) → U3 §15.
 * 기대값은 교재 사례(K-1): 총 납부세액 = 결정세액 147,860,000 + 지방소득세 14,786,000 = 162,646,000.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { createCalculationRepository, resetLocalDB } from "@/lib/storage";
import type { CalculationRecord } from "@/lib/storage/types";
import { generateTitle } from "@/lib/storage/title-generator";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { foreignTaxLawVersion } from "@/lib/storage/foreign-history";
import { isTransferFormEmpty, transferTaxLawVersion } from "@/components/calc/transfer-tax-save-handler";
import { HistoryDetailDrawer, extractResultSummaryItems } from "@/components/history/HistoryDetailDrawer";
import { extractTotalTax } from "@/app/history/HistoryClient";
import { resumeCalculationRecord } from "@/lib/calc/history-resume-entry";
import { foreignResultSummaryItems } from "@/lib/calc/transfer-foreign-history";
import { createDefaultTransferFormData, mergePersistedWizard, migratePersistedTransferForm, useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import type { CalcWizardState } from "@/lib/stores/calc-wizard-store";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { k1Input, ratesAt } from "../../tax-engine/foreign-realestate/_fixtures";
import { foreignForm, gainAsset2, k1Asset } from "../../calc/_foreign-form-fixture";

const NOW = "2026-11-27T00:00:00.000Z";
const UID = "user-foreign-history";

const result = calc(k1Input({ domesticResidenceYears: 5 }), ratesAt("2026-07-10"));
const wrapped = { mode: "foreign", result } as unknown as Record<string, unknown>;
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const asInput = (form: unknown) => json(form) as Record<string, unknown>;

beforeEach(async () => {
  await resetLocalDB();
  useCalcWizardStore.getState().reset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("제목", () => {
  it("K-1 — 「양도소득세 (국외 부동산) — 국가 소재지 (양도 날짜)」", () => {
    expect(generateTitle("transfer", asInput(foreignForm()), NOW)).toBe("양도소득세 (국외 부동산) — 미국 Seattle (양도 2026.07.10)");
  });

  it("자산 2건 — 대표(첫 자산)에 「외 1건」 · 국가 「기타」는 싣지 않는다", () => {
    const f = foreignForm({}, [k1Asset({ countryCode: "OTHER" }), gainAsset2()]);
    expect(generateTitle("transfer", asInput(f), NOW)).toBe("양도소득세 (국외 부동산) — Seattle 외 1건 (양도 2026.07.10)");
  });

  it("소재지가 비면 국가만, 둘 다 비면 양도일만, 모두 비면 라벨만", () => {
    expect(generateTitle("transfer", asInput(foreignForm({}, [k1Asset({ address: "" })])), NOW)).toBe("양도소득세 (국외 부동산) — 미국 (양도 2026.07.10)");
    expect(generateTitle("transfer", asInput(foreignForm({}, [k1Asset({ address: "", countryCode: "" })])), NOW)).toBe("양도소득세 (국외 부동산) — 양도 2026.07.10");
    expect(generateTitle("transfer", asInput(foreignForm({}, [k1Asset({ address: "", countryCode: "", transferDate: "" })])), NOW)).toBe("양도소득세 (국외 부동산)");
  });

  it("숨은 국내 입력이 제목에 새지 않는다 — 폼 전역 양도일·국내 주소가 남아 있어도", () => {
    const f = foreignForm({ transferDate: "2020-01-01" });
    f.assets[0] = { ...f.assets[0], addressRoad: "서울 강남구 테헤란로 1" };
    const title = generateTitle("transfer", asInput(f), NOW);
    expect(title).not.toContain("테헤란로");
    expect(title).not.toContain("2020.01.01");
  });

  it("국내 폼 제목은 그대로(회귀)", () => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2026-06-03";
    f.assets[0] = { ...f.assets[0], addressRoad: "서울 강남구 테헤란로 1" };
    expect(generateTitle("transfer", asInput(f), NOW)).toBe("양도소득세 — 서울 강남구 테헤란로 1 (양도 2026.06.03)");
  });
});

describe("dedup 키", () => {
  const key = (f: unknown) => extractBusinessKey("transfer", asInput(f));

  it("국가+소재지+대표 양도일 + |foreign 접미", () => {
    expect(key(foreignForm())).toBe("addr:미국 Seattle|2026.07.10|foreign");
  });

  it("자산을 뒤에 추가해도 키가 같다(같은 신고서 = 같은 record) · 소재지·양도일이 다르면 다른 키", () => {
    const base = key(foreignForm());
    expect(key(foreignForm({}, [k1Asset(), gainAsset2()]))).toBe(base);
    expect(key(foreignForm({}, [k1Asset({ address: "Portland" })]))).not.toBe(base);
    expect(key(foreignForm({}, [k1Asset({ transferDate: "2026-08-01" })]))).not.toBe(base);
  });

  it("소재지가 비면 키가 없다(content 폴백) — ⑧이 소재지를 필수로 막는 이유", () => {
    expect(key(foreignForm({}, [k1Asset({ address: "" })]))).toBeNull();
  });

  it("같은 문자열의 국내 record와 키가 겹치지 않는다", () => {
    const domestic = createDefaultTransferFormData();
    domestic.transferDate = "2026-07-10";
    domestic.assets[0] = { ...domestic.assets[0], addressRoad: "미국 Seattle" };
    expect(key(domestic)).toBe("addr:미국 Seattle|2026.07.10");
    expect(key(domestic)).not.toBe(key(foreignForm()));
  });
});

describe("빈 폼 판정 · 세율 기준일", () => {
  const blankAsset = k1Asset({ countryCode: "", address: "", transferDate: "", transferAmount: "", transferRate: "", acquisitionDate: "", acquisitionAmount: "", acquisitionRate: "", costRows: [] });
  const empty = (f: unknown) => isTransferFormEmpty(asInput(f));

  it("국외 입력만 있는 폼(국내 양도일·자산은 비었다)은 빈 폼이 아니다", () => {
    expect(foreignForm().transferDate).toBe("");
    expect(empty(foreignForm())).toBe(false);
  });

  it("값이 하나도 없는 국외 폼은 빈 폼 — 통화·종류 기본값은 입력이 아니다", () => {
    expect(empty(foreignForm({ foreignResidenceYears: "" }, [blankAsset]))).toBe(true);
  });

  it("거주 연수 · 소재지 · 금액 행 하나만 넣어도 빈 폼이 아니다", () => {
    expect(empty(foreignForm({ foreignResidenceYears: "5" }, [blankAsset]))).toBe(false);
    expect(empty(foreignForm({ foreignResidenceYears: "" }, [{ ...blankAsset, address: "x" }]))).toBe(false);
    expect(empty(foreignForm({ foreignResidenceYears: "" }, [{ ...blankAsset, costRows: [{ date: "", amountForeign: "100", exchangeRate: "" }] }]))).toBe(false);
  });

  it("국외 폼은 숨은 국내 입력이 있어도 국외 값만 본다", () => {
    const f = foreignForm({ foreignResidenceYears: "", transferDate: "2026-07-10" }, [blankAsset]);
    expect(empty(f)).toBe(true);
  });

  it("국내 폼 판정은 그대로(회귀) — 양도일만 있어도 비지 않고, 기본 폼은 빈다", () => {
    expect(empty(createDefaultTransferFormData())).toBe(true);
    expect(empty({ ...createDefaultTransferFormData(), transferDate: "2026-06-03" })).toBe(false);
  });

  it("세율 기준일 — 국외는 자산별 양도일 중 가장 늦은 날(결과 appliedLawDate), 국내는 폼 양도일", () => {
    const f = foreignForm({}, [k1Asset(), gainAsset2()]);
    expect(foreignTaxLawVersion(f)).toBe("2026-07-10");
    expect(transferTaxLawVersion(f)).toBe("2026-07-10");
    expect(transferTaxLawVersion({ ...createDefaultTransferFormData(), transferDate: "2026-06-03" })).toBe("2026-06-03");
    expect(transferTaxLawVersion(foreignForm({}, [blankAsset]))).toBe("");
  });
});

describe("저장 → 목록 → 복원 (IndexedDB 왕복)", () => {
  const repo = () => createCalculationRepository(UID);
  const save = (form: ReturnType<typeof foreignForm>, resultData: Record<string, unknown> = wrapped) =>
    repo().saveOrUpdateByBusinessKey({
      taxType: "transfer",
      title: generateTitle("transfer", asInput(form), NOW),
      inputData: asInput(form),
      resultData,
      taxLawVersion: transferTaxLawVersion(form),
      linkedCalculationId: null,
      clientId: null,
    });

  it("K-1 저장 → list에 제목·키·납부세액 162,646,000이 있고 폼 슬라이스(행 포함)가 그대로 복원된다", async () => {
    const form = foreignForm({ foreignResidenceYears: "5" });
    const { created } = await save(form);
    expect(created).toBe(true);
    const [rec] = await repo().list({ taxType: "transfer" });
    expect(rec.title).toBe("양도소득세 (국외 부동산) — 미국 Seattle (양도 2026.07.10)");
    expect(rec.businessKey).toBe("addr:미국 Seattle|2026.07.10|foreign");
    expect(rec.taxLawVersion).toBe("2026-07-10");
    expect((rec.resultData as { mode: string }).mode).toBe("foreign");
    expect(extractTotalTax(rec.resultData)).toBe("162,646,000");

    const restored = migratePersistedTransferForm(rec.inputData);
    expect(restored.assetLocation).toBe("foreign");
    expect(restored.foreignResidenceYears).toBe("5");
    expect(restored.foreignAssets).toEqual(form.foreignAssets);
    expect(restored.foreignAssets[0].costRows).toEqual([{ date: "2026-07-10", amountForeign: "30000", exchangeRate: "1100" }]);
  });

  it("같은 물건을 자산을 더해 다시 저장하면 새 record가 아니라 같은 record를 갱신한다 — 제목은 「외 1건」", async () => {
    await save(foreignForm());
    const second = await save(foreignForm({}, [k1Asset(), gainAsset2()]));
    expect(second.created).toBe(false);
    const all = await repo().list({ taxType: "transfer" });
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("양도소득세 (국외 부동산) — 미국 Seattle 외 1건 (양도 2026.07.10)");
    expect(migratePersistedTransferForm(all[0].inputData).foreignAssets).toHaveLength(2);
  });

  it("소재지가 다른 국외 건은 별개 record", async () => {
    await save(foreignForm());
    await save(foreignForm({}, [k1Asset({ address: "Portland" })]));
    expect(await repo().list({ taxType: "transfer" })).toHaveLength(2);
  });

  it("임시저장(결과 없음) 뒤 계산 결과 저장 — 1건이고 결과가 채워진다(draft 결과 보존 가드)", async () => {
    await save(foreignForm(), {});
    await save(foreignForm());
    await save(foreignForm(), {});
    const all = await repo().list({ taxType: "transfer" });
    expect(all).toHaveLength(1);
    expect((all[0].resultData as { mode?: string }).mode).toBe("foreign");
  });

  it("국내 record와 같은 목록에 공존해도 서로 덮어쓰지 않는다", async () => {
    const dom = createDefaultTransferFormData();
    dom.transferDate = "2026-07-10";
    dom.assets[0] = { ...dom.assets[0], addressRoad: "미국 Seattle" };
    await repo().saveOrUpdateByBusinessKey({
      taxType: "transfer",
      title: generateTitle("transfer", asInput(dom), NOW),
      inputData: asInput(dom),
      resultData: { mode: "single", result: { totalTax: 1 } },
      taxLawVersion: "2026-07-10",
      linkedCalculationId: null,
      clientId: null,
    });
    await save(foreignForm());
    expect(await repo().list({ taxType: "transfer" })).toHaveLength(2);
  });
});

describe("재계산(불러오기) — 폼 슬라이스 복원", () => {
  const record = (inputData: Record<string, unknown>, resultData: Record<string, unknown> = wrapped): CalculationRecord =>
    ({
      id: "f1", userId: "u", taxType: "transfer", title: "t", inputData, resultData,
      taxLawVersion: "2026-07-10", linkedCalculationId: null, clientId: null, createdAt: NOW, updatedAt: NOW,
    }) as unknown as CalculationRecord;

  it("국외 이력 → 국외 라디오·거주 연수·자산 행·외국납부세액이 복원되고 첫 단계에서 열린다(결과는 되살리지 않는다)", async () => {
    const push = vi.fn();
    const saved = foreignForm(
      { foreignResidenceYears: "5", foreignTaxEnabled: true, foreignTaxMethod: "expense" },
      [k1Asset({ taxRows: [{ date: "2026-08-01", amountForeign: "1000", exchangeRate: "1000" }] }), gainAsset2()],
    );
    const blocked = await resumeCalculationRecord(record(asInput(saved)), { push } as never);
    expect(blocked).toBeNull();
    expect(push).toHaveBeenCalledWith("/calc/transfer-tax");
    const s = useCalcWizardStore.getState();
    expect(s.currentStep).toBe(0);
    expect(s.result).toBeNull();
    expect(s.formData.assetLocation).toBe("foreign");
    expect(s.formData.foreignResidenceYears).toBe("5");
    expect(s.formData.foreignTaxEnabled).toBe(true);
    expect(s.formData.foreignTaxMethod).toBe("expense");
    expect(s.formData.foreignAssets).toEqual(saved.foreignAssets);
  });

  it("깨진 foreignAssets(비배열 행·옛 enum)는 복원 때 현행 모양으로 걸러진다(③)", async () => {
    const saved = asInput(foreignForm());
    (saved.foreignAssets as Record<string, unknown>[])[0].capitalRows = "깨짐";
    (saved.foreignAssets as Record<string, unknown>[])[0].kind = "옛값";
    await resumeCalculationRecord(record(saved), { push: vi.fn() } as never);
    const a = useCalcWizardStore.getState().formData.foreignAssets[0];
    expect(a.capitalRows).toEqual([]);
    expect(a.kind).toBe("land");
  });

  it("국내 이력 재개는 국외 슬라이스를 건드리지 않는다(기본 상태 유지)", async () => {
    const dom = createDefaultTransferFormData();
    dom.transferDate = "2026-06-03";
    const before = useCalcWizardStore.getState().formData.foreignAssets;
    await resumeCalculationRecord(record(asInput(dom), { mode: "single", result: { totalTax: 1 } }), { push: vi.fn() } as never);
    expect(useCalcWizardStore.getState().formData.assetLocation).toBe("domestic");
    expect(useCalcWizardStore.getState().formData.foreignAssets).toEqual(before);
  });

  it("sessionStorage 복원 경로(mergePersistedWizard)도 국외 슬라이스를 보존한다", () => {
    const form = foreignForm({ foreignResidenceYears: "6" }, [k1Asset(), gainAsset2()]);
    const merged = mergePersistedWizard({ formData: asInput(form) }, useCalcWizardStore.getState() as CalcWizardState);
    expect(merged.formData.assetLocation).toBe("foreign");
    expect(merged.formData.foreignAssets).toEqual(form.foreignAssets);
    expect(merged.currentStep).toBe(0);
  });
});

describe("상세 드로어 · 요약", () => {
  const rec = (resultData: Record<string, unknown>): CalculationRecord =>
    ({
      id: "f2", userId: "u", taxType: "transfer", title: "양도소득세 (국외 부동산) — 미국 Seattle (양도 2026.07.10)",
      inputData: asInput(foreignForm()), resultData, taxLawVersion: "2026-07-10", linkedCalculationId: null, clientId: null,
      createdAt: NOW, updatedAt: NOW,
    }) as unknown as CalculationRecord;

  it("요약 항목 — 국외 필드명으로 양도차익·양도소득금액·과세표준·산출세액·결정세액·지방소득세·납부세액", () => {
    const items = extractResultSummaryItems(json(wrapped), "transfer");
    expect(items.map((i) => i.label)).toEqual([
      "양도차익 합계", "양도소득금액 합계", "기본공제", "양도소득 과세표준", "산출세액", "결정세액", "지방소득세", "납부세액",
    ]);
    const by = Object.fromEntries(items.map((i) => [i.label, i.value]));
    expect(by["양도소득금액 합계"]).toBe("437,000,000");
    expect(by["양도소득 과세표준"]).toBe("434,500,000");
    expect(by["산출세액"]).toBe("147,860,000");
    expect(by["지방소득세"]).toBe("14,786,000");
    expect(by["납부세액"]).toBe("162,646,000");
  });

  it("거주 5년 미만 — «납세의무 없음» 한 줄", () => {
    const nl = calc(k1Input({ domesticResidenceYears: 3 }), ratesAt("2026-07-10"));
    expect(foreignResultSummaryItems(json({ mode: "foreign", result: nl }))).toEqual([
      { label: "과세 여부", value: "납세의무 없음 (국외자산 양도 5년 거주 요건 미충족)" },
    ]);
  });

  it("국내 결과·빈 결과(임시저장)는 국외 요약을 타지 않는다", () => {
    expect(foreignResultSummaryItems({ mode: "single", result: { totalTax: 1 } })).toBeNull();
    expect(foreignResultSummaryItems({})).toBeNull();
    expect(extractResultSummaryItems({}, "transfer")).toEqual([]);
  });

  it("드로어 머리 값 = 납부세액 162,646,000 · 요약 목록 · 재계산 버튼 — 국외 결과로 터지지 않는다", () => {
    render(<HistoryDetailDrawer record={rec(json(wrapped))} taxTypeLabel="양도소득세" onClose={() => {}} onDelete={async () => {}} onTitleUpdate={async () => {}} />);
    expect(screen.getByTestId("drawer-headline-value").textContent).toBe("162,646,000");
    expect(document.body.textContent).toContain("양도소득세 (국외 부동산) — 미국 Seattle (양도 2026.07.10)");
    expect(document.body.textContent).toContain("양도소득금액 합계");
    expect(screen.queryByRole("button", { name: "이 조건으로 재계산" })).not.toBeNull();
    // 국내 전용 진입(수정신고·경정청구·다건 합산)은 국외 이력에 열리지 않는다
    expect(screen.queryByRole("button", { name: /수정신고|경정청구|합산/ })).toBeNull();
  });
});
