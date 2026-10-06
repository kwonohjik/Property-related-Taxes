/**
 * S3-1 — 「취득시 건물 기준시가(나목)」·「양도시 개별주택가격」 요구/노출/전송 술어의 **격자 전수 패리티**.
 *
 * 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` §8 · UI 설계 §2.8·§7.3 #U-1.
 *
 * 한 술어(`ownerSplitHousingNeedsBuildingStd`·`ownerSplitHousingNeedsTransferTotal` — 엔진 leaf
 * `requiresHousingBuildingStdAtAcq`의 AssetForm 어댑터)가 다섯 층에서 같은 값을 내야 한다:
 *   ⑤ 노출 ⇔ ⑧ 필수(칸이 열린 상태에서만 요구 — 막다른 길 없음) ⇔ ④ 전송(숨은 stale 값은 안 나감)
 *   ⇔ ⑫ 요구 ⇔ 엔진 throw.
 * 한쪽만 막으면 「UI 통과 ↔ API 400」 또는 「화면에 없는 값이 계산에 쓰임」이 된다(`feedback_fe8_vs_12_parity_grid`).
 *
 * 격자 축: selfOwns 3 × 취득원인 2 × 별개 여부 2 × 파트 모드 조합 4 × PHD 2 × 부담부증여 2 × 겸용 2.
 * ⚠️ ④·⑫·엔진 입력은 **④의 실제 페이로드**(`buildSplitPayload` + `buildLandStdAtAcquisitionPayload`)에서 만든다 —
 *    조건을 이 파일에서 재기술하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  buildLandStdAtAcquisitionPayload,
  buildSplitPayload,
  isSplitPayloadActive,
} from "@/lib/calc/transfer-tax-api-split";
import { ownerSplitHousingNeedsBuildingStd } from "@/lib/calc/transfer-tax-split-acq-mode";
import { ownerSplitHousingNeedsTransferTotal } from "@/lib/calc/transfer-tax-split-acq-mode";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { refineSplitAcquisitionInputs, type Required2aLike } from "@/lib/api/transfer-tax-schema-required-refines-2a";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

type Mode = "actual" | "estimated";
interface Combo {
  selfOwns: "both" | "building_only" | "land_only";
  cause: "purchase" | "inheritance";
  separate: boolean;
  modes: "ae" | "ee" | "aa-direct" | "aa-blank";
  phd: boolean;
  burdened: boolean;
  mixed: boolean;
}

const ratioed = (v: string | undefined) => parseAmount(v ?? "") || undefined;

/** `aa-direct` = 두 파트 모두 실거래가 + 본인 파트 취득가액 직접 입력(비율 불요), `aa-blank` = 실거래가 + 파트 금액 비움(비율 안분) */
function modesOf(m: Combo["modes"]): { land: Mode; building: Mode } {
  if (m === "ee") return { land: "estimated", building: "estimated" };
  if (m === "ae") return { land: "actual", building: "estimated" };
  return { land: "actual", building: "actual" };
}

function assetOf(c: Combo, over: Partial<AssetForm> = {}): AssetForm {
  const modes = modesOf(c.modes);
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: c.cause,
    transferType: c.burdened ? "burdened_gift" : "sale",
    isMixedUseHouse: c.mixed,
    usePreHousingDisclosure: c.phd,
    selfOwns: c.selfOwns,
    acquisitionDate: "2018-03-02",
    // 별개 취득 = 매매 + 「취득일 다름」 토글 + 날짜 상이. 그 밖은 같은 날짜(소유자 분리 토글은 매매에서만 날짜 토글을 같이 켠다).
    hasSeperateLandAcquisitionDate: c.separate,
    landAcquisitionDate: c.separate ? "2006-05-10" : "2018-03-02",
    landAcqMode: modes.land,
    buildingAcqMode: modes.building,
    ...(c.modes === "aa-direct"
      ? { landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "400,000,000" }
      : {}),
    useEstimatedAcquisition: false,
    saleSplitMode: "apportioned",
    actualSalePrice: "1,200,000,000",
    fixedAcquisitionPrice: "700,000,000",
    // 비례의 입력 — 총액 H · 토지 단가×면적(가목)
    standardPriceAtAcq: "480,000,000",
    standardPricePerSqmAtAcq: "2,400,000",
    acquisitionArea: "100",
    // 양도시 기준시가(가목·나목) — 양도가액 안분·환산 분모. H_T는 비워 둔다.
    standardPricePerSqmAtTransfer: "5,600,000",
    transferArea: "100",
    buildingStandardPriceAtTransfer: "840,000,000",
    ...over,
  } as AssetForm;
}

function* grid(): Generator<Combo> {
  for (const selfOwns of ["both", "building_only", "land_only"] as const)
    for (const cause of ["purchase", "inheritance"] as const)
      for (const separate of [false, true])
        for (const modes of ["ae", "ee", "aa-direct", "aa-blank"] as const)
          for (const phd of [false, true])
            for (const burdened of [false, true])
              for (const mixed of [false, true]) {
                // 별개 취득은 매매만(비-매매는 취득일이 하나)
                if (separate && cause !== "purchase") continue;
                yield { selfOwns, cause, separate, modes, phd, burdened, mixed };
              }
}

const label = (c: Combo) => JSON.stringify(c);

/** ⑧ — 그 필드를 가리키는 오류가 있는가 */
function validateFlagsField(asset: AssetForm, field: string): boolean {
  const { result, fieldOf } = collectWithFields(() => validateSplitDirectInputs(asset, "자산 1"));
  return result != null && fieldOf(result) === field;
}

/** ④ 실제 페이로드 + 본체가 항상 싣는 필드 → ⑫·엔진이 보는 body */
function bodyOf(asset: AssetForm, c: Combo): Record<string, unknown> {
  const split = buildSplitPayload(asset, {
    isBurdenedGift: c.burdened,
    usesPhd: c.phd,
    ratioed,
  });
  return {
    propertyType: c.mixed ? "mixed-use-house" : "housing",
    transferType: c.burdened ? "burdened_gift" : "sale",
    acquisitionDate: "2018-03-02",
    transferDate: "2026-06-30",
    useEstimatedAcquisition: false,
    // 본체(transfer-tax-api.ts) — 분리 활성이면 결합 총액을 보낸다(PHD는 보내지 않는다)
    standardPriceAtAcquisition: c.phd ? undefined : parseAmount(asset.standardPriceAtAcq) || undefined,
    ...buildLandStdAtAcquisitionPayload(asset),
    ...split,
  };
}

/** ⑫ — 그 경로의 이슈가 있는가 */
function refineIssues(body: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const schema = z.object({}).passthrough().superRefine((d, ctx) => {
    refineSplitAcquisitionInputs(d as unknown as Required2aLike, ctx);
  });
  const r = schema.safeParse(body);
  if (!r.success) for (const i of r.error.issues) paths.push(i.path.join("."));
  return paths;
}

/** 엔진 입력 — 같은 body (날짜만 Date로) */
function engineInputOf(body: Record<string, unknown>): TransferTaxInput {
  const dated = { ...body } as Record<string, unknown>;
  for (const k of ["acquisitionDate", "landAcquisitionDate", "transferDate"]) {
    if (typeof dated[k] === "string") dated[k] = new Date(dated[k] as string);
  }
  return baseTransferInput({
    transferPrice: 1_200_000_000,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 2,
    ...(dated as Partial<TransferTaxInput>),
  });
}

function engineThrows(input: TransferTaxInput): string | null {
  try {
    calcSplitGain(input);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("나목(취득시 건물 기준시가) — ⑤노출 ⇔ ⑧필수 ⇔ ④전송 ⇔ ⑫요구 ⇔ 엔진 throw", () => {
  let total = 0;
  let leafTrue = 0;

  it("격자 전수 (선택 입력 N: 비움/채움 양쪽)", () => {
    for (const c of grid()) {
      total++;
      const blank = assetOf(c, { buildingStandardPriceAtAcq: "" });
      const filled = assetOf(c, { buildingStandardPriceAtAcq: "360,000,000" });
      const leaf = ownerSplitHousingNeedsBuildingStd(blank);
      if (leaf) leafTrue++;

      // ⑤ 어댑터는 N 값과 무관하다(칸 노출이 값에 좌우되지 않는다)
      expect(ownerSplitHousingNeedsBuildingStd(filled), label(c)).toBe(leaf);

      // ⑧ — 별개 취득은 별개 전용 규칙(V6)이 N을 요구하므로 이 격자 비교에서 제외하고 leaf=false만 확인한다.
      if (c.separate) {
        expect(leaf, `별개 취득은 비-별개 술어가 아니다 ${label(c)}`).toBe(false);
      } else {
        expect(validateFlagsField(blank, "buildingStandardPriceAtAcq"), `⑧ ${label(c)}`).toBe(leaf);
        // 채우면 막히지 않는다(막다른 길 없음)
        expect(validateFlagsField(filled, "buildingStandardPriceAtAcq"), `⑧ filled ${label(c)}`).toBe(false);
      }

      // ④ — 채워진 N은 leaf(또는 별개 취득)일 때만 나간다. 아니면 stale 값이 숨은 채 전송되지 않는다.
      const splitFilled = buildSplitPayload(filled, { isBurdenedGift: c.burdened, usesPhd: c.phd, ratioed });
      const sends = splitFilled.buildingStandardPriceAtAcquisition !== undefined;
      const separateActive =
        isSplitPayloadActive(filled, c.burdened) && c.separate && !c.mixed && filled.assetKind === "housing";
      expect(sends, `④ ${label(c)}`).toBe(leaf || separateActive);

      // ⑫ — N을 비운 body에서 N 이슈가 있으면 leaf (별개는 별개 전용 규칙)
      if (!c.separate) {
        const issues = refineIssues(bodyOf(blank, c));
        expect(issues.includes("buildingStandardPriceAtAcquisition"), `⑫ ${label(c)} ${issues.join(",")}`).toBe(leaf);

        // 엔진 — N 없는 입력에서 나목 때문에 throw하는가
        const msg = engineThrows(engineInputOf(bodyOf(blank, c)));
        const throwsForN = !!msg && /건물 기준시가\(나목\)/.test(msg);
        expect(throwsForN, `엔진 ${label(c)} ${msg ?? ""}`).toBe(leaf);
      }
    }
    // 격자가 비어 있지 않고 leaf 참/거짓 양쪽이 실제로 존재한다(공허한 통과 방지)
    expect(total).toBeGreaterThan(200);
    expect(leafTrue).toBeGreaterThan(10);
    expect(leafTrue).toBeLessThan(total);
  });
});

describe("양도시 개별주택가격(H_T) — 같은 격자, 환산 파트가 있을 때만", () => {
  it("격자 전수: ⑧ 필수 ⇔ ④ 전송 ⇔ ⑫ 요구 ⇔ 엔진 throw (N은 채움)", () => {
    let leafTrue = 0;
    for (const c of grid()) {
      if (c.separate) continue;
      const filled = assetOf(c, { buildingStandardPriceAtAcq: "360,000,000", standardPriceAtTransfer: "" });
      const withHT = assetOf(c, { buildingStandardPriceAtAcq: "360,000,000", standardPriceAtTransfer: "1,120,000,000" });
      const leaf = ownerSplitHousingNeedsTransferTotal(filled);
      if (leaf) leafTrue++;

      // 환산 파트가 있는 N 술어의 부분집합
      if (leaf) expect(ownerSplitHousingNeedsBuildingStd(filled), label(c)).toBe(true);

      // ⑧ — H_T 필드 오류
      expect(validateFlagsField(filled, "standardPriceAtTransfer"), `⑧ ${label(c)}`).toBe(leaf);
      expect(validateFlagsField(withHT, "standardPriceAtTransfer"), `⑧ withHT ${label(c)}`).toBe(false);

      // ④ — H_T 전송은 leaf일 때만 (asset-level 환산 플래그는 꺼져 있다 — 본체는 보내지 않는다)
      const sentHT = buildSplitPayload(withHT, { isBurdenedGift: c.burdened, usesPhd: c.phd, ratioed }).standardPriceAtTransfer;
      expect(sentHT !== undefined, `④ ${label(c)}`).toBe(leaf);

      // ⑫·엔진 — H_T를 비운 body
      const body = bodyOf(filled, c);
      const issues = refineIssues(body);
      expect(issues.includes("standardPriceAtTransfer"), `⑫ ${label(c)} ${issues.join(",")}`).toBe(leaf);
      const msg = engineThrows(engineInputOf(body));
      const throwsForHT = !!msg && /양도시 개별주택가격/.test(msg);
      expect(throwsForHT, `엔진 ${label(c)} ${msg ?? ""}`).toBe(leaf);
    }
    expect(leafTrue).toBeGreaterThan(5);
  });
});
