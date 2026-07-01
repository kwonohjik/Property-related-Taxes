/**
 * NBL 무조건 사업용 의제 성립 시 지목 미선택 허용 — 수정 anchor
 *
 * Plan: docs/00-pm/nbl-exemption-jibok-validation-fix.plan.md §5 Phase 0
 *
 * 버그: 공익수용(§168의14③3호) 의제 성립 + 지목 미선택 시, NBL 데이터 파이프라인의
 *       4개 게이트(❶검증·❷raw빌더·❸Zod·❹서버매퍼)가 지목을 요구/누락하여
 *       계산 차단 또는 엔진 미도달. UI는 의제 성립 시 지목 입력을 비활성화하므로 모순.
 *
 * Pre-Do(TDD): 수정 전 A~B anchor는 각 계층에서 RED. 변경 ❶❷❸❹ 후 GREEN.
 *   공익수용은 지목(categoryGroup) 무관 — 고시일 ≤ 2006.12.31(가목) 또는 취득일 ≤ 고시일−5년(나목).
 */
import { describe, it, expect } from "vitest";

// transfer-tax-schema.ts ⇄ transfer-tax-schema-sub.ts 순환 — main을 먼저 평가해 초기화 순서 확정
import "@/lib/api/transfer-tax-schema";

import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { buildNonBusinessLandRaw, buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-sub";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";

const TRANSFER = "2024-05-01";

/** 공익수용 의제 성립(고시일 2004-04-23 ≤ 2006.12.31) + 지목·용도지역 미선택 토지 */
function exemptLandAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    fixedAcquisitionPrice: "200,000,000",
    acquisitionArea: "1000",
    nblUseDetailedJudgment: true,
    nblLandType: "", // 지목 미선택
    nblZoneType: "", // 용도지역 미선택
    nblExemptPublicExpropriation: true,
    nblExemptPublicNoticeDate: "2004-04-23", // ≤ 2006-12-31 → isExempt
    ...overrides,
  } as AssetForm;
}

describe("[NBL-EXEMPT-JIBOK] 무조건 의제 성립 시 지목 미선택 허용", () => {
  // ❶ 계층 A — 클라이언트 검증
  it("A: 의제 성립 + 지목 미선택 → 지목/용도지역 검증 통과(차단 없음)", () => {
    const err = validateAssetAcquisition(exemptLandAsset(), "자산1", TRANSFER);
    // 유효 자산 전체 통과 → null. (지목/용도지역 오류로 차단되지 않음)
    expect(err).toBeNull();
  });

  // ❷ 계층 C-1 — 클라이언트 raw 빌더
  it("C-1: 의제 성립 + 지목 미선택 → buildNonBusinessLandRaw 전송(undefined 아님)", () => {
    const raw = buildNonBusinessLandRaw(exemptLandAsset(), TRANSFER);
    expect(raw).toBeDefined();
    expect(raw!.nblExemptPublicExpropriation).toBe(true);
    expect(raw!.nblLandType).toBe("");
  });

  // ❸ 계층 C-2 — Zod 스키마
  it("C-2: 지목 '' 를 포함한 raw → nonBusinessLandRawSchema 통과", () => {
    const raw = buildNonBusinessLandRaw(exemptLandAsset(), TRANSFER)!;
    const parsed = nonBusinessLandRawSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  // ❹ 계층 B + 엔진 — 서버 매퍼 → 판정
  it("B+엔진: 매퍼 non-null → 무조건 의제로 사업용 판정", () => {
    const raw = buildNonBusinessLandRaw(exemptLandAsset(), TRANSFER);
    const input = buildNblEngineInput(raw as never);
    expect(input).toBeDefined();
    const judgment = judgeNonBusinessLand(input!);
    expect(judgment.isNonBusinessLand).toBe(false);
    expect(judgment.unconditionalExemption?.reason).toBe("public_expropriation");
  });

  // anchor 5 — 잔존 플래그 override (§4.0 오과세 봉쇄)
  it("잔존 플래그: isNonBusinessLand=true 잔존 + 의제 → 엔진 사업용 override", () => {
    const raw = buildNonBusinessLandRaw(exemptLandAsset(), TRANSFER);
    const nblInput = buildNblEngineInput(raw as never);
    const result = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isNonBusinessLand: true, // 간편모드에서 켠 잔존 플래그
        nonBusinessLandDetails: nblInput,
      }),
      makeMockRates(),
    );
    expect(result.nonBusinessLandJudgmentDetail?.isNonBusinessLand).toBe(false);
  });

  // 케이스 4 회귀 가드 — 의제 미충족 시 지목 요구 유지
  it("가드: 공익수용 ON·미충족(고시일 2017, 2018 취득 → 5년 이내) → 지목 요구 유지", () => {
    const err = validateAssetAcquisition(
      exemptLandAsset({ nblExemptPublicNoticeDate: "2017-04-23" }),
      "자산1",
      TRANSFER,
    );
    expect(err).toMatch(/지목을 선택/);
  });
});
