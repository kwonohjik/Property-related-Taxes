/**
 * anchor — 감정평가가액 basis · §166⑧ 예외의 **5단 배관** (Phase 1-E · E-2)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.6 · §12.9
 *
 * ## 왜 배관을 따로 잡는가
 *
 * ⑫ Zod 입력 정의 · ⑬ body spread · ⑭ Route 매핑은 스키마에 없는 키를 `parse()`가 **조용히
 * 버리는**(strip) 지점이다. 엔진 계약과 anchor가 아무리 통과해도 **값이 도달하지 않으면** 기능은
 * 없는 것과 같다(메모리 `feedback_api_zod_schema_sync`).
 *
 * 🔬 **감지 범위 실측** (2026-08-06 mutation probe — 「TS는 전혀 못 잡는다」는 부정확하다):
 *
 * | 빠뜨린 곳 | `tsc --noEmit` | 이 anchor |
 * |---|---|---|
 * | ⑫만 | **잡는다** (2건) — ⑭가 `data.landAppraisalAtTransfer`를 읽어 「없는 속성」이 된다 | 잡는다 |
 * | ⑫ + ⑭ **동시** | **프로덕션 코드에서는 침묵** (남는 1건은 이 anchor 파일 자신이다) | **잡는다 — 유일** |
 *
 * ⇒ 정확히는 **「한쪽만 빠지면 TS가 잡고, 짝지어 빠지면 못 잡는다」**이다. 그리고 신규 필드를
 *   추가할 때 실제로 일어나는 실수가 바로 **짝지어 빠뜨리는 것**이다(둘 다 같은 작업 단위라서).
 *
 * ⇒ 이 파일은 **폼 → ④API 변환 → ⑫Zod → ⑭Route → 엔진 input** 전 구간을 한 번에 통과시킨다.
 *   중간을 캐스팅으로 건너뛰면 바로 그 구간이 검증에서 빠진다.
 *
 * ## 고정 계약
 *   E-2-1  감정 3필드는 **일괄·구분 양쪽에서** 전송된다 (일괄양도에서도 basis이므로)
 *   E-2-2  §166⑧ 예외는 **구분양도에서만** 전송된다
 *   E-2-3  근거(`saleSplitExemptionNote`)는 **전송되지 않는다** — 계산 무관 UI 전용
 *   E-2-4  Zod가 4필드를 **strip하지 않는다**
 *   E-2-5  Route가 감정일자를 **Date로 변환**한다 (문자열이면 엔진의 창 비교가 런타임에 깨진다)
 *   E-2-6  validate — 감정 3필드 all-or-nothing · 예외 선택 시 근거 필수
 */
import { describe, it, expect } from "vitest";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const ratioed = (v: string | undefined) =>
  v ? parseInt(String(v).replace(/,/g, ""), 10) || undefined : undefined;

const APPRAISAL = {
  landAppraisalAtTransfer: "1,200,000,000",
  buildingAppraisalAtTransfer: "300,000,000",
  appraisalDateAtTransfer: "2023-06-01",
};

/** 구분양도 + 토지·건물 취득일 분리(분리 축 활성) */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2015-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "250,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "1,200,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "900,000,000",
    buildingStandardPriceAtTransfer: "600,000,000",
    actualSalePrice: "1,500,000,000",
    ...over,
  } as AssetForm;
}

const payloadOf = (a: AssetForm) =>
  buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed });

/** ⑫ Zod → ⑭ Route 까지 실제로 통과시킨다 (캐스팅 금지 — 그 구간이 검증 대상이다) */
function throughSchemaAndRoute(body: Record<string, unknown>) {
  const parsed = propertySchema.parse({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    acquisitionPrice: 550_000_000,
    transferDate: "2024-06-01",
    acquisitionDate: "2018-06-01",
    // propertySchema의 **필수** 필드 — 하나라도 빠지면 parse가 통째로 실패한다.
    expenses: 0,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isOneHousehold: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...body,
  });
  return {
    parsed,
    engineInput: buildTransferEngineInput(
      parsed,
      new Date("2024-06-01"),
      new Date("2018-06-01"),
      undefined,
    ),
  };
}

describe("E-2-1 — 감정 3필드는 일괄·구분 양쪽에서 전송된다", () => {
  it("구분양도에서 전송된다", () => {
    const body = payloadOf(asset(APPRAISAL));
    expect(body.landAppraisalAtTransfer).toBe(1_200_000_000);
    expect(body.buildingAppraisalAtTransfer).toBe(300_000_000);
    expect(body.appraisalDateAtTransfer).toBe("2023-06-01");
  });

  it("🔴 일괄양도에서도 전송된다 — 여기서도 안분 basis이기 때문이다", () => {
    const body = payloadOf(
      asset({ ...APPRAISAL, saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" }),
    );
    expect(
      body.landAppraisalAtTransfer,
      "일괄양도에서 빠지면 감정평가가액이 조용히 무시되고 기준시가로 안분된다",
    ).toBe(1_200_000_000);
  });
});

describe("E-2-2 · E-2-3 — §166⑧ 예외의 게이트와 근거 취급", () => {
  const withExemption = { saleSplitExemption: "other_law", saleSplitExemptionNote: "근거 문서 2024-1" };

  it("구분양도에서 전송된다", () => {
    expect(payloadOf(asset(withExemption as Partial<AssetForm>)).saleSplitExemption).toBe("other_law");
  });

  it("일괄양도로 되돌리면 전송되지 않는다 — 판정 자체가 구분 기재 전용이다", () => {
    const body = payloadOf(
      asset({
        ...(withExemption as Partial<AssetForm>),
        saleSplitMode: "apportioned",
        landTransferPrice: "",
        buildingTransferPrice: "",
      }),
    );
    expect(body.saleSplitExemption).toBeUndefined();
  });

  it("근거는 전송되지 않는다 — 계산에 쓰이지 않는 서술 텍스트다 (UI 전용)", () => {
    expect(payloadOf(asset(withExemption as Partial<AssetForm>)).saleSplitExemptionNote).toBeUndefined();
  });
});

describe("E-2-4 · E-2-5 — Zod가 버리지 않고, Route가 Date로 바꾼다", () => {
  it("🔴 Zod가 4필드를 strip하지 않는다 (스키마 누락은 타입 오류를 내지 않는다)", () => {
    const { parsed } = throughSchemaAndRoute(
      payloadOf(asset({ ...APPRAISAL, saleSplitExemption: "other_law" } as Partial<AssetForm>)),
    );
    expect(parsed.landAppraisalAtTransfer).toBe(1_200_000_000);
    expect(parsed.buildingAppraisalAtTransfer).toBe(300_000_000);
    expect(parsed.appraisalDateAtTransfer).toBe("2023-06-01");
    expect(parsed.saleSplitExemption).toBe("other_law");
  });

  it("🔴 Route가 감정일자를 Date로 변환한다 — 문자열이면 엔진의 창 비교가 깨진다", () => {
    const { engineInput } = throughSchemaAndRoute(payloadOf(asset(APPRAISAL)));
    expect(engineInput.appraisalDateAtTransfer).toBeInstanceOf(Date);
    expect(engineInput.appraisalDateAtTransfer!.toISOString().slice(0, 10)).toBe("2023-06-01");
  });

  it("감정 입력이 없으면 엔진 input에도 없다 — 빈 값을 지어내지 않는다", () => {
    const { engineInput } = throughSchemaAndRoute(payloadOf(asset()));
    expect(engineInput.appraisalDateAtTransfer).toBeUndefined();
    expect(engineInput.landAppraisalAtTransfer).toBeUndefined();
  });
});

describe("E-2-6 — validate (⑧)", () => {
  const v = (a: AssetForm) => validateSplitDirectInputs(a, "자산 1");

  it("감정가액만 넣고 감정일자를 비우면 차단한다", () => {
    const msg = v(asset({ landAppraisalAtTransfer: "1,200,000,000", buildingAppraisalAtTransfer: "300,000,000" }));
    expect(msg).toContain("감정일자");
  });

  it("감정일자는 있는데 한쪽 가액만 넣으면 차단한다", () => {
    const msg = v(asset({ landAppraisalAtTransfer: "1,200,000,000", appraisalDateAtTransfer: "2023-06-01" }));
    expect(msg).toContain("양쪽 모두");
  });

  it("3필드를 모두 채우면 통과한다", () => {
    expect(v(asset(APPRAISAL))).toBeNull();
  });

  it("예외를 선택하고 근거를 비우면 차단한다", () => {
    const msg = v(asset({ saleSplitExemption: "other_law" } as Partial<AssetForm>));
    expect(msg).toContain("근거를 입력하세요");
  });

  it("근거를 채우면 통과한다", () => {
    expect(
      v(asset({ saleSplitExemption: "other_law", saleSplitExemptionNote: "철거 예정 확인서" } as Partial<AssetForm>)),
    ).toBeNull();
  });

  it("일괄양도로 되돌리면 근거가 없어도 통과한다 — 전송되지 않으므로 막을 이유가 없다", () => {
    expect(
      v(
        asset({
          saleSplitExemption: "other_law",
          saleSplitMode: "apportioned",
          landTransferPrice: "",
          buildingTransferPrice: "",
        } as Partial<AssetForm>),
      ),
    ).toBeNull();
  });
});
