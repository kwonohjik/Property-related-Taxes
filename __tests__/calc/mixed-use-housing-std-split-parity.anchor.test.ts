/**
 * anchor: S3-2 UI — 「주택건물 기준시가(나목)」 ⑤ 노출 · ④ 전송 · ⑧ 필수 · ⑫ 요구가 **같은 술어**다 (3중 패턴 · 격자).
 *
 * 술어 규칙은 엔진 leaf(`lib/tax-engine/mixed-use-housing-std.ts`)에만 있다. 이 격자는 leaf를 **직접 import**해
 * UI 어댑터가 판정을 복제하지 않았음을 보인다(어댑터는 폼 → leaf 인자 변환만). ⑫는 ④가 만든 페이로드를 실제 Zod 스키마에 넣어 본다
 * (leaf 직접 호출 anchor는 ⑫를 거치지 않는다 — `feedback_leaf_anchor_skips_zod_layer`).
 *
 * 설계: `docs/02-design/features/housing-std-split-proportional-s3-2.ui.design.md` §3.2 · §5.
 */
import { describe, it, expect } from "vitest";
import {
  mixedAcqHousingBuildingStd,
  mixedTransferHousingBuildingStd,
  needsMixedHousingBuildingStdAtAcq,
  needsMixedHousingBuildingStdAtTransfer,
  needsMixedHousingPriceAtAcq,
  needsMixedHousingPriceAtTransfer,
  housingFloorAreaForModal,
} from "@/lib/calc/mixed-use-housing-std-split";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
  isHousingPriceAtTransferRequired,
} from "@/lib/tax-engine/mixed-use-housing-std";
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import { validateMixedUseAsset } from "@/lib/calc/transfer-tax-validate-mixed-use-asset";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { mixedUseAssetSchema } from "@/lib/api/transfer-tax-schema-mixed-use";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2024-08-20";
const N_ACQ = "mixedAcqHousingBuildingStdPrice";
const N_TR = "mixedTransferHousingBuildingStdPrice";

function mixed(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: "2010-03-15",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "200",
    mixedTransferHousingPrice: "1,600,000,000",
    mixedTransferCommercialBuildingPrice: "100,000,000",
    mixedTransferLandPricePerSqm: "12,000,000",
    mixedAcqHousingPrice: "400,000,000",
    mixedAcqCommercialBuildingPrice: "80,000,000",
    mixedAcqLandPricePerSqm: "1,200,000",
    mixedAcqHousingBuildingStdPrice: "150,000,000",
    mixedTransferHousingBuildingStdPrice: "400,000,000",
    ...over,
  } as AssetForm;
}
function form(a: AssetForm): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "3,000,000,000",
    assets: [a],
  } as unknown as TransferFormData;
}
type Sent = { acquisitionStandardPrice: { housingBuildingPrice?: number }; transferStandardPrice: { housingBuildingPrice?: number } };
const payload = (a: AssetForm) => buildMixedUsePayload(a, form(a)) as unknown as Sent & Record<string, unknown>;

// ── 격자 ─────────────────────────────────────────────────────────────
interface Cell { name: string; over: Partial<AssetForm> }
/**
 * PHD ON 셀이 ⑧을 **통과**하도록 필수 입력(최초 고시·3시점)을 채운다 — 채우지 않으면 ⑧이 「최초 고시일을 입력하세요」로 먼저 막혀
 * 이 격자의 PHD 셀이 전부 공허해진다(2026-10-07 점검 지적). 취득일은 최초 고시일(2005-04-30) 이전이어야 한다(상속<1985 셀은 자기 값 유지).
 */
const PHD_FIXTURE: Partial<AssetForm> = {
  usePreHousingDisclosure: true,
  acquisitionDate: "2000-01-01",
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "200,000,000",
  phdLandPricePerSqmAtFirst: "1,500,000",
  phdLandPricePerSqmAtAcq: "1,000,000",
  phdBuildingStdPriceAtAcq: "40,000,000",
  phdBuildingStdPriceAtFirst: "45,000,000",
  phdCommercialBuildingStdPriceAtFirst: "30,000,000",
};
const PHD: Cell[] = [
  { name: "PHD OFF", over: {} },
  { name: "PHD ON", over: PHD_FIXTURE },
];
const DIR: Cell[] = [
  { name: "용도변경 없음", over: {} },
  { name: "주택→상가", over: { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", partialChangeDate: "2012-01-01" } },
  { name: "상가→주택", over: { hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeDate: "2012-01-01" } },
  { name: "플래그 OFF + 방향 잔존(stale)", over: { hasPartialUsageChange: false, partialChangeDirection: "commercial_to_house" } },
];
const CAUSE: Cell[] = [
  { name: "매매 환산", over: {} },
  { name: "매매 실가", over: { useEstimatedAcquisition: false, fixedAcquisitionPrice: "700,000,000" } },
  // 상속·증여는 신고가액(override)만 있어도 ⑧이 통과한다(H 없음 셀 — Q-B). H가 있으면 override는 무시된다.
  { name: "상속(≥1985)", over: { acquisitionCause: "inheritance", mixedHousingInheritedValueOverride: "450,000,000", mixedCommercialInheritedValueOverride: "100,000,000" } },
  { name: "증여(≥1985)", over: { acquisitionCause: "gift", mixedHousingGiftValueOverride: "450,000,000", mixedCommercialGiftValueOverride: "100,000,000" } },
  { name: "상속(<1985)", over: { acquisitionCause: "inheritance", acquisitionDate: "1980-05-01", mixedHousingInheritedValueOverride: "450,000,000", mixedCommercialInheritedValueOverride: "100,000,000" } },
];
const DATES: Cell[] = [
  { name: "취득일 같음", over: {} },
  { name: "토지·건물 취득일 다름", over: { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-06-10", mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" } },
];
const HPRICE: Cell[] = [
  { name: "H 있음", over: {} },
  { name: "H 없음", over: { mixedAcqHousingPrice: "" } },
];

const GRID: Array<{ name: string; asset: AssetForm }> = [];
for (const p of PHD) for (const d of DIR) for (const c of CAUSE) for (const t of DATES) for (const h of HPRICE) {
  GRID.push({
    name: [p.name, d.name, c.name, t.name, h.name].join(" · "),
    asset: mixed({ ...(p.over === PHD_FIXTURE ? PHD_FIXTURE : {}), ...c.over, ...d.over, ...t.over, ...h.over, ...(p.over === PHD_FIXTURE ? { usePreHousingDisclosure: true } : {}) }),
  });
}

/** leaf 인자 — 어댑터와 **독립으로** 이 테스트가 다시 쓴 파생(어댑터가 틀리면 여기서 갈린다). */
function leafArgs(a: AssetForm) {
  return {
    usePhd: a.usePreHousingDisclosure,
    partialDirection: a.hasPartialUsageChange && a.partialChangeDirection ? a.partialChangeDirection : undefined,
    byInheritanceOrGift:
      (a.acquisitionCause === "inheritance" || a.acquisitionCause === "gift") && a.acquisitionDate >= "1985-01-01",
  };
}

describe("⑤ 노출 술어 = 엔진 leaf (격자)", () => {
  it.each(GRID.map((g) => [g.name, g.asset] as const))("%s", (_n, a) => {
    const args = leafArgs(a);
    expect(needsMixedHousingBuildingStdAtAcq(a)).toBe(isHousingBuildingStdAtAcqRequired(args));
    expect(needsMixedHousingBuildingStdAtTransfer(a)).toBe(isHousingBuildingStdAtTransferRequired(args));
    expect(needsMixedHousingPriceAtAcq(a)).toBe(isHousingPriceAtAcqRequired(args));
    expect(needsMixedHousingPriceAtTransfer(a)).toBe(isHousingPriceAtTransferRequired(args));
  });

  it("규칙표(고정) — PHD ON은 양쪽 거짓 · 상가→주택은 취득만 거짓 · 상속증여도 나목은 필수", () => {
    expect(needsMixedHousingBuildingStdAtAcq(mixed())).toBe(true);
    expect(needsMixedHousingBuildingStdAtTransfer(mixed())).toBe(true);
    const phd = mixed({ usePreHousingDisclosure: true });
    expect([needsMixedHousingBuildingStdAtAcq(phd), needsMixedHousingBuildingStdAtTransfer(phd)]).toEqual([false, false]);
    const c2h = mixed({ hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house" });
    expect([needsMixedHousingBuildingStdAtAcq(c2h), needsMixedHousingBuildingStdAtTransfer(c2h)]).toEqual([false, true]);
    const h2c = mixed({ hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" });
    expect([needsMixedHousingBuildingStdAtAcq(h2c), needsMixedHousingBuildingStdAtTransfer(h2c)]).toEqual([true, true]);
    const inh = mixed({ acquisitionCause: "inheritance" });
    expect([needsMixedHousingBuildingStdAtAcq(inh), needsMixedHousingPriceAtAcq(inh)]).toEqual([true, false]);
  });

  it("겸용이 아니면(일반 주택·일반건물) 전부 거짓", () => {
    for (const over of [{ isMixedUseHouse: false }, { assetKind: "building" as AssetForm["assetKind"] }]) {
      const a = mixed(over);
      expect([needsMixedHousingBuildingStdAtAcq(a), needsMixedHousingBuildingStdAtTransfer(a)]).toEqual([false, false]);
    }
  });
});

describe("④ 전송 ⇔ ⑤ 노출 — 술어 참일 때만 키를 싣는다 (격자)", () => {
  it.each(GRID.map((g) => [g.name, g.asset] as const))("%s", (_n, a) => {
    const p = payload(a);
    expect("housingBuildingPrice" in p.acquisitionStandardPrice).toBe(needsMixedHousingBuildingStdAtAcq(a));
    expect("housingBuildingPrice" in p.transferStandardPrice).toBe(needsMixedHousingBuildingStdAtTransfer(a));
    if (needsMixedHousingBuildingStdAtAcq(a)) expect(p.acquisitionStandardPrice.housingBuildingPrice).toBe(150_000_000);
    if (needsMixedHousingBuildingStdAtTransfer(a)) expect(p.transferStandardPrice.housingBuildingPrice).toBe(400_000_000);
  });

  it("지분 60%여도 나목은 스케일하지 않는다(기준시가 전부 100% — 비례 분모·분자가 같은 스케일)", () => {
    const a = mixed({ ownershipNumerator: "60", ownershipDenominator: "100" } as Partial<AssetForm>);
    const p = payload(a);
    expect(p.acquisitionStandardPrice.housingBuildingPrice).toBe(150_000_000);
    expect(p.transferStandardPrice.housingBuildingPrice).toBe(400_000_000);
  });

  it("술어가 거짓이 된 뒤에도 store 값은 남지만 미전송 (useEffect 정리 없음)", () => {
    const a = mixed({ usePreHousingDisclosure: true });
    expect(a.mixedAcqHousingBuildingStdPrice).toBe("150,000,000");
    expect("housingBuildingPrice" in payload(a).acquisitionStandardPrice).toBe(false);
    expect("housingBuildingPrice" in payload(a).transferStandardPrice).toBe(false);
  });

  it("폴백 없음 — 비어 있으면 0 그대로 전송(상가건물·PHD·H에서 값을 지어내지 않는다)", () => {
    const a = mixed({ mixedAcqHousingBuildingStdPrice: "", mixedTransferHousingBuildingStdPrice: "", phdBuildingStdPriceAtAcq: "40,000,000" });
    expect(payload(a).acquisitionStandardPrice.housingBuildingPrice).toBe(0);
    expect(payload(a).transferStandardPrice.housingBuildingPrice).toBe(0);
  });

  it("stale sessionStorage(필드 자체가 없음) → 예외 없이 0 · ⑧이 막는다", () => {
    const a = mixed() as Partial<AssetForm>;
    delete a.mixedAcqHousingBuildingStdPrice;
    delete a.mixedTransferHousingBuildingStdPrice;
    expect(mixedAcqHousingBuildingStd(a as AssetForm)).toBe(0);
    expect(mixedTransferHousingBuildingStd(a as AssetForm)).toBe(0);
    expect(() => validateMixedUseAsset(a as AssetForm, "자산", TRANSFER_DATE)).not.toThrow();
    expect(validateMixedUseAsset(a as AssetForm, "자산", TRANSFER_DATE)).toMatch(/주택건물 기준시가를 입력하세요/);
  });
});

/** ⑧ 결과 — 오류 메시지와 그 입력칸 키 */
function validated(a: AssetForm): { msg: string | null; field: string | undefined } {
  const { result, fieldOf } = collectWithFields(() => validateMixedUseAsset(a, "자산", TRANSFER_DATE));
  return { msg: result, field: result ? (fieldOf(result) as string | undefined) : undefined };
}

/**
 * ⑧이 **N과 무관한 이유로 먼저 막는** 셀의 분류 — 조용히 건너뛰지 않고 이유를 단언한다.
 *  · `h`   : 취득시 개별주택가격(H) 미입력(상속·증여 제외) — ⑧이 H 칸으로 막는다(N 검사 이전).
 *  · `unsup`: ⑧이 명시적으로 막는 미지원 조합(실가·감정·상속·증여 × 용도변경, 실가 × PHD) — 어느 쪽에서도 N 칸 오류는 아니다.
 */
function blockKind(a: AssetForm): "ok" | "h" | "unsup" | "other" {
  const v = validated(a);
  if (v.msg === null) return "ok";
  if (v.field === "mixedAcqHousingPrice") return "h";
  if (/조합은 아직 지원하지 않습니다/.test(v.msg)) return "unsup";
  return "other";
}

const EXPECTED_COUNT = { ok: 74, h: 14, unsup: 72, other: 0 };

describe("⑧ validate ⇔ ⑤ 일치 — 술어 참이면 미입력 차단(그 입력칸으로 이동), 거짓이면 요구 안 함 (격자)", () => {
  it.each(GRID.map((g) => [g.name, g.asset] as const))("%s", (_n, a) => {
    const kind = blockKind(a);
    // 선행 오류가 있는 셀은 skip이 아니라 **분류된 이유**여야 한다 — 이유 불명의 선행 오류는 실패(공허 통과 방지).
    expect(["ok", "h", "unsup"], `이유 불명의 ⑧ 선행 오류: ${validated(a).msg}`).toContain(kind);
    if (kind === "h") {
      // H 없음 + 상속·증여 외: ⑧이 H 칸으로 막는다 = leaf가 H를 요구하는 조합(⑧ ⊇ leaf)
      expect(needsMixedHousingPriceAtAcq(a)).toBe(true);
      return;
    }
    if (kind === "unsup") return;
    const acq = validated({ ...a, mixedAcqHousingBuildingStdPrice: "" });
    expect(acq.field === N_ACQ).toBe(needsMixedHousingBuildingStdAtAcq(a));
    const tr = validated({ ...a, mixedTransferHousingBuildingStdPrice: "" });
    expect(tr.field === N_TR).toBe(needsMixedHousingBuildingStdAtTransfer(a));
    if (acq.field === N_ACQ) expect(acq.msg).toMatch(/^자산: .*주택건물 기준시가를 입력하세요/);
  });

  it("격자 단언 셀 수가 고정돼 있다 — 단언 셀 / H 선행 / 미지원 조합 (공허 통과 방지)", () => {
    const count = { ok: 0, h: 0, unsup: 0, other: 0 };
    for (const g of GRID) count[blockKind(g.asset)]++;
    // 160셀 = PHD(2) × 방향(4) × 취득원인(5) × 취득일(2) × H(2) — 숫자가 바뀌면 fixture·⑧ 선행 검증이 달라진 것이다.
    expect(count).toEqual(EXPECTED_COUNT);
    // PHD ON·상가→주택·주택→상가가 각각 단언 셀을 가진다(어느 축도 통째로 빠지지 않는다)
    const asserted = (f: (a: AssetForm) => boolean) => GRID.filter((g) => blockKind(g.asset) === "ok" && f(g.asset)).length;
    expect(asserted((a) => a.usePreHousingDisclosure === true)).toBeGreaterThan(0);
    expect(asserted((a) => a.hasPartialUsageChange === true && a.partialChangeDirection === "commercial_to_house")).toBeGreaterThan(0);
    expect(asserted((a) => a.hasPartialUsageChange === true && a.partialChangeDirection === "house_to_commercial")).toBeGreaterThan(0);
    expect(asserted((a) => a.acquisitionCause === "inheritance" && !a.mixedAcqHousingPrice)).toBeGreaterThan(0); // Q-B
  });

  it("토지·건물 취득일이 다르면 ⑧ 취득시 메시지가 「건물 취득일 기준」을 밝힌다 — 같으면 없다 (⑫ 메시지와 정합)", () => {
    const blank = { mixedAcqHousingBuildingStdPrice: "" };
    const sep = validated(mixed({ ...blank, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-06-10", mixedAcqLandPricePerSqmAtBuildingAcq: "1,800,000" }));
    expect(sep.field).toBe(N_ACQ);
    expect(sep.msg).toContain("건물 취득일 2010-03-15 기준");
    const same = validated(mixed(blank));
    expect(same.field).toBe(N_ACQ);
    expect(same.msg).not.toContain("건물 취득일");
  });

  it("메시지에 미확인 조문 인용이 없다(§·소득세법·시행령 부재)", () => {
    const m = validated(mixed({ mixedAcqHousingBuildingStdPrice: "" })).msg ?? "";
    const t = validated(mixed({ mixedTransferHousingBuildingStdPrice: "" })).msg ?? "";
    for (const s of [m, t]) expect(s).not.toMatch(/§|소득세법|시행령/);
  });

  it("상속·증여 취득은 나목만 요구하고 개별주택가격(H)은 요구하지 않는다 (Q-B)", () => {
    // 신고가액만 입력(H 없음) — 상속 ⑧은 「신고가액 또는 H」 중 하나만 요구한다.
    const a = mixed({
      acquisitionCause: "inheritance",
      mixedAcqHousingPrice: "",
      useEstimatedAcquisition: false,
      mixedHousingInheritedValueOverride: "450,000,000",
      mixedCommercialInheritedValueOverride: "100,000,000",
    });
    const blankN = validated({ ...a, mixedAcqHousingBuildingStdPrice: "" });
    expect(blankN.field).toBe(N_ACQ);
    expect(validated(a).field).not.toBe("mixedAcqHousingPrice");
  });
});

describe("⑧ 기존 개별주택가격(H) 검사 ⇔ leaf H 술어 — 같은 결과인가 (격자)", () => {
  it.each(GRID.map((g) => [g.name, g.asset] as const))("%s", (_n, a) => {
    const hAcq = validated({ ...a, mixedAcqHousingPrice: "" });
    const hTr = validated({ ...a, mixedTransferHousingPrice: "" });
    // leaf가 H를 요구하는 조합이면 ⑧도 H(또는 더 이른 오류)로 막아야 한다 — ⑧ ⊇ leaf (UI 통과 ↔ ⑫·엔진 차단 모순 방지).
    if (needsMixedHousingPriceAtAcq(a)) expect(hAcq.msg, "취득시 H 필수인데 ⑧이 통과").not.toBeNull();
    if (needsMixedHousingPriceAtTransfer(a)) expect(hTr.msg, "양도시 H 필수인데 ⑧이 통과").not.toBeNull();
    // 상속·증여(≥1985)는 H를 요구하지 않는다 — ⑧이 취득시 H 때문에 막으면 안 된다.
    if (leafArgs(a).byInheritanceOrGift && !a.usePreHousingDisclosure && validated({ ...a, mixedAcqHousingPrice: "100,000,000" }).msg === null) {
      expect(hAcq.field).not.toBe("mixedAcqHousingPrice");
    }
  });
});

describe("⑫ Zod ⇔ ⑤ 일치 — ④ 페이로드를 실제 스키마에 넣는다 (격자)", () => {
  /** 스키마가 나목 칸 때문에 내는 이슈 경로 */
  const nIssues = (a: AssetForm): string[] => {
    const r = mixedUseAssetSchema.safeParse(JSON.parse(JSON.stringify(payload(a))));
    return r.success
      ? []
      : r.error.issues.map((i) => i.path.join(".")).filter((p) => p.endsWith("housingBuildingPrice"));
  };
  it.each(GRID.map((g) => [g.name, g.asset] as const))("%s", (_n, a) => {
    const blank = { ...a, mixedAcqHousingBuildingStdPrice: "", mixedTransferHousingBuildingStdPrice: "" };
    const paths = nIssues(blank);
    expect(paths.includes("acquisitionStandardPrice.housingBuildingPrice")).toBe(needsMixedHousingBuildingStdAtAcq(a));
    expect(paths.includes("transferStandardPrice.housingBuildingPrice")).toBe(needsMixedHousingBuildingStdAtTransfer(a));
    // 채우면 이 필드 이슈가 없다 (⑧ 통과 ⇒ ⑫ 통과)
    expect(nIssues(a)).toEqual([]);
  });
});

describe("모달 prefill 연면적 — 표시 보조 (엔진 computeAcqDerivedAreas와 같은 규칙)", () => {
  it("기본: 주택 연면적", () => {
    expect(housingFloorAreaForModal(mixed({ residentialFloorArea: "123.45" }), "acq")).toBe("123.45");
    expect(housingFloorAreaForModal(mixed({ residentialFloorArea: "123.45" }), "transfer")).toBe("123.45");
  });
  it("주택→상가 취득시: 전체가 주택이었다 — 주택+상가 합 (입력값이 있으면 그 값)", () => {
    const h2c = { hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial" as const };
    expect(housingFloorAreaForModal(mixed({ ...h2c }), "acq")).toBe("200");
    expect(housingFloorAreaForModal(mixed({ ...h2c, partialChangeAcqResidentialArea: "150" }), "acq")).toBe("150");
    expect(housingFloorAreaForModal(mixed({ ...h2c }), "transfer")).toBe("100");
  });
});
