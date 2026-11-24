/**
 * anchor U-8 — 비사업용 토지 판정 메뉴 사이드바 요약 + 지목·용도지역 라벨 사본 가드 (계획서 §9.3 · UV-12)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeNblJudgmentSummary } from "@/lib/calc/nbl-judgment-summary";
import { NBL_LAND_TYPE_LABEL, NBL_ZONE_TYPE_LABEL } from "@/lib/calc/nbl-judgment-labels";
import { createInitialNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";
import { NBL_JUDGMENT_STEPS } from "@/lib/calc/nbl-judgment-steps";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const form = (asset: Partial<AssetForm> = {}, over: Record<string, unknown> = {}) => {
  const f = createInitialNblJudgmentForm();
  return { ...f, ...over, assets: [{ ...f.assets[0], ...asset }] } as ReturnType<typeof createInitialNblJudgmentForm>;
};
const labels = (f: ReturnType<typeof form>) => computeNblJudgmentSummary(f).map((i) => i.label);
const valueOf = (f: ReturnType<typeof form>, label: string) => computeNblJudgmentSummary(f).find((i) => i.label === label)?.value;

describe("[SM-1] 사이드바 요약 — 입력으로 알 수 있는 항목만", () => {
  it("빈 폼 = 요약 없음", () => {
    expect(computeNblJudgmentSummary(createInitialNblJudgmentForm())).toEqual([]);
  });

  it("값이 있는 항목만 보인다 · 지분은 100% 미만일 때만", () => {
    const f = form({ addressJibun: "서울 강남구 테스트동 1", acquisitionDate: "2015-03-01", acquisitionArea: "1000", nblLandType: "farmland", nblZoneType: "agriculture_forest" }, { transferDate: "2024-06-01" });
    expect(labels(f)).toEqual(["소재지", "취득일", "양도일", "면적", "지목", "용도지역"]);
    expect(valueOf(f, "취득일")).toBe("2015.03.01");
    expect(valueOf(f, "면적")).toBe("1,000 ㎡");
    expect(valueOf(f, "지목")).toBe("농지 (전·답·과수원)");
    const shared = form({ ...f.assets[0], ownershipNumerator: "50", ownershipDenominator: "100" });
    expect(valueOf(shared, "공유 지분")).toBe("50%");
  });

  it("취득원인에 따라 날짜 라벨이 갈린다 · 이월과세는 증여자 취득일 + 증여 등기접수일(취득일 칸은 읽지 않는다)", () => {
    expect(labels(form({ acquisitionCause: "inheritance", acquisitionDate: "2020-01-01" }))).toContain("상속개시일");
    expect(labels(form({ acquisitionCause: "gift", acquisitionDate: "2020-01-01" }))).toContain("증여 등기접수일");
    const co = form({ acquisitionCause: "carryover_gift", acquisitionDate: "1999-09-09", carryover: { ...createInitialNblJudgmentForm().assets[0].carryover, donorAcquisitionDate: "2012-01-01", giftRegistryDate: "2022-06-01" } as never });
    expect(valueOf(co, "증여자 취득일")).toBe("2012.01.01");
    expect(valueOf(co, "증여 등기접수일")).toBe("2022.06.01");
    expect(computeNblJudgmentSummary(co).some((i) => i.value.includes("1999"))).toBe(false); // 잔재 `acquisitionDate`
  });

  it("무조건 사업용 의제는 입력 선언이 아니라 엔진 판정 — 요건 미충족 선언은 안 보인다", () => {
    const exempt = form({ acquisitionCause: "inheritance", acquisitionDate: "2005-03-01", decedentAcquisitionDate: "1990-01-01", nblLandType: "farmland", nblZoneType: "agriculture_forest" }, { transferDate: "2009-06-01" });
    expect(valueOf(exempt, "무조건 사업용 의제")).toBe("성립 (엔진 판정)");
    // 같은 선언이라도 양도일이 달라 요건이 안 맞으면(2024) 보이지 않는다
    const notExempt = form({ ...exempt.assets[0] }, { transferDate: "2024-06-01" });
    expect(valueOf(notExempt, "무조건 사업용 의제")).toBeUndefined();
    // 양도일이 없으면 판정할 수 없어 묻지 않는다
    expect(valueOf(form({ ...exempt.assets[0] }), "무조건 사업용 의제")).toBeUndefined();
  });

  it("부득이한 사유 건수 · 도시편입일(유효 형식만) · 양도일 의제", () => {
    const f = form({
      nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2022-01-01", endDate: "2022-12-31", secondaryDate: "", description: "" }] as never,
      nblUrbanIncorporationDate: "2022-06-01",
      nblDeemedTransferReason: "auction",
      nblDeemedTransferDate: "2023-12-01",
    });
    expect(valueOf(f, "부득이한 사유")).toBe("1건");
    expect(valueOf(f, "도시편입일")).toBe("2022.06.01");
    expect(valueOf(f, "양도일 의제")).toBe("2023.12.01");
    // 깨진 형식(옛 raw text)·사유만 있고 날짜 없음 → 숨김
    const broken = form({ nblUrbanIncorporationDate: "20230214", nblDeemedTransferReason: "auction", nblDeemedTransferDate: "" });
    expect(labels(broken)).not.toContain("도시편입일");
    expect(labels(broken)).not.toContain("양도일 의제");
  });
});

describe("[SM-2] 라벨 사본 ↔ 컨테이너 옵션 (UV-12)", () => {
  const src = readFileSync(path.join(process.cwd(), "components/calc/transfer/nbl/NblSectionContainer.tsx"), "utf8");
  const block = (name: string) => {
    const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(src);
    if (!m) throw new Error(`${name} 블록을 찾지 못했습니다`);
    return [...m[1].matchAll(/value:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map((x) => [x[1], x[2]] as const);
  };

  it("지목: 컨테이너 옵션 value·label 전부 사본과 같다", () => {
    const opts = block("LAND_TYPE_OPTIONS");
    expect(opts.length).toBe(6);
    expect(Object.fromEntries(opts)).toEqual(NBL_LAND_TYPE_LABEL);
  });

  it("용도지역: 컨테이너 옵션 value·label 전부 사본과 같다", () => {
    const opts = block("ZONE_TYPE_OPTIONS");
    expect(opts.length).toBeGreaterThanOrEqual(11);
    expect(Object.fromEntries(opts)).toEqual(NBL_ZONE_TYPE_LABEL);
  });
});

describe("[SM-3] 단계 라벨 정본", () => {
  it("입력 3 + 결과 1", () => {
    expect(NBL_JUDGMENT_STEPS).toHaveLength(4);
    expect(NBL_JUDGMENT_STEPS[3]).toBe("판정 결과");
  });
});
