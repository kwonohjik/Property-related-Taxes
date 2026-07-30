/**
 * ④⑬ 토지·건물 분리(소령 §166⑥·§168②) API 페이로드 빌더 — `transfer-tax-api.ts`에서 분리(800줄 정책).
 *
 * 분리 축의 게이트 판정과 파트 필드 전송을 **한 곳에 모은다**. 게이트가 본체에 흩어져 있으면
 * "UI는 칸을 노출하는데 API는 전송하지 않는" 침묵 누락이 재발한다(PR #837 §3.1 실사고).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio } from "./transfer-tax-api-helpers";
import { effectivePartAcqMode, isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 지분 스케일 적용기 — **금액 필드 전용** 단일 진입점.
 *
 * UI 입력은 전부 100% 기준값이고(`AssetForm.ownershipNumerator` 규약) API 변환이 × ratio를
 * 적용한다. 총액(`transferPrice`·`acquisitionPrice`·`capitalExpenditure` 등)은 이미 그렇게
 * 처리되는데 **파트 필드·추계 가액은 raw로 새어나가고 있었다** — 같은 body 안에서 100%와
 * 지분 스케일이 섞여 세액이 틀어진다.
 *
 * ⚠️ 기준시가는 대상이 아니다 — 소유 지분이 아니라 물건의 속성값이며, 환산 산식에서
 *    분자·분모로 함께 나타나 비율이 상쇄된다.
 */
export function makeRatioed(ratio: number, fractional: boolean) {
  return (v: string | undefined): number | undefined => {
    const n = parseAmount(v ?? "");
    if (!n) return undefined;
    return fractional ? applyRatio(n, ratio) : n;
  };
}

/** 분리 축이 활성인가 — `calcSplitGain` 진입 게이트(transfer-tax-split-gain.ts)와 동일 조건. */
export function isSplitPayloadActive(primary: AssetForm, isBurdenedGift: boolean): boolean {
  // ⚠️ 부담부증여 제외 — 엔진이 transferPrice·acquisitionPrice를 §159 안분액으로 override하므로
  //    (transfer-tax-burdened-gift-step.ts) 사용자가 화면에서 보는 계약 총액과 **다른 총액**이 기준이 된다.
  //    그 상태로 토지 양도가액을 직접 입력하면 잔액이 계약총액 기준으로 계산돼 음수가 된다
  //    (계약 10억·§159 채무 4억에서 토지 6억 입력 → 건물 = 4억 − 6억 = −2억).
  //    부담부증여는 기준시가 비율 안분만 사용한다.
  return (
    (primary.hasSeperateLandAcquisitionDate === true || primary.selfOwns !== "both") &&
    !isBurdenedGift
  );
}

/** 분리 축 전송 페이로드 — 본체 body에 그대로 spread한다. */
export function buildSplitPayload(
  primary: AssetForm,
  opts: {
    isBurdenedGift: boolean;
    /** §164⑤ PHD 모드 — 취득일 동일이어도 calcSplitGain 진입을 위해 landAcquisitionDate fallback */
    usesPhd: boolean;
    ratioed: (v: string | undefined) => number | undefined;
  },
): Record<string, unknown> {
  const { isBurdenedGift, usesPhd, ratioed } = opts;
  const isSplitActive = isSplitPayloadActive(primary, isBurdenedGift);
  // **별개 취득** — 분리 활성의 부분집합. 취득시점이 실제로 달라 취득가액이 파트별로 실재하는
  // 경우만 true(겸용·selfOwns 강제 분리에서 날짜가 같으면 false).
  // 엔진 취득가액 축의 파트별 완결 게이트(§97①1호·§114⑦) — 판정 단일 소스는 그 헬퍼 1곳.
  const separateAcquisition = isSplitActive && isSeparateAcquisition(primary);

  // 파트 모드 미선택("") 시 자산 전체 레거시 플래그에서 파생 —
  // UI 표시·validate와 단일 소스(effectivePartAcqMode, dual-truth 방지).
  const landAcqMode = effectivePartAcqMode(primary.landAcqMode, primary);
  const buildingAcqMode = effectivePartAcqMode(primary.buildingAcqMode, primary);
  const saleSplitMode = primary.saleSplitMode ?? "apportioned";

  // 파트별 취득가액 직접입력 게이트 — actual·appraisal 모드만(환산·매매사례는 총액을 사용자가 입력하지 않음).
  // UI가 분리 칸을 노출하는 조건과 동일(LandBuildingSplitSection showAcqInputs 파트별 판정).
  const landAcqDirectActive = isSplitActive && (landAcqMode === "actual" || landAcqMode === "appraisal");
  const buildingAcqDirectActive = isSplitActive && (buildingAcqMode === "actual" || buildingAcqMode === "appraisal");
  // 양도가액 직접입력 게이트 — saleSplitMode==="actual"(구분양도) 시만.
  // 엔진은 saleSplitMode를 명시 입력으로 소비하므로("죽은 모드" 재발 방지, §9 M2) 이 게이트를
  // 벗어나도 유령 값이 도달하지 않지만, "기준시가 비율 안분"으로 되돌린 뒤 잔존한 직접 입력값을
  // 사용자 의도와 다르게 전송하지 않기 위해 여전히 게이트로 막는다.
  const saleDirectActive = isSplitActive && saleSplitMode === "actual";
  // 양도시 기준시가 — 분리 축이 활성이면 **항상 전송**한다(2026-07-29 S1 해소).
  //
  // 종전 게이트는 `apportioned || 어느 파트든 환산`이었다. 그러나 validate V4가
  // "구분양도 + 양도가액 미입력 + **양도시 기준시가 2필드**"를 정당한 입력으로 인정하므로
  // (§166⑥ → 부가세령 §64①1호 — 구분이 없으면 양도 당시 기준시가 비율), 그 조합에서 필드가
  // 전송되지 않아 **validate는 통과시키는데 엔진은 throw**했다(계층 간 `hasSaleRatio` 비대칭 —
  // UI·validate는 폼값 기준, 엔진은 `calcSaleApportionRatio(input)` 즉 전송값 기준).
  //
  // 과잉 전송은 무해하다 — 양도가액 2칸이 입력되면 `splitPair`가 비율을 쓰지 않고(split-gain.ts:99),
  // 환산 파트가 없으면 분모로도 소비되지 않는다. 기준시가는 물건 속성값이라 지분 스케일 대상도 아니다.
  const saleStdPriceActive = isSplitActive;

  return {
    // 토지/건물 취득일 분리 + 소유자 분리 (소령 §166⑥, §168②)
    selfOwns: primary.selfOwns !== "both" ? primary.selfOwns : undefined,
    landAcquisitionDate:
      (primary.hasSeperateLandAcquisitionDate || primary.selfOwns !== "both") && primary.landAcquisitionDate
        ? primary.landAcquisitionDate
        : usesPhd
          ? primary.acquisitionDate
          : undefined,
    // 파트별 취득 모드 + 양도 분리 모드 — 엔진 명시 입력(§9 M2, "죽은 모드" 재발 방지).
    ...(isSplitActive
      ? { landAcqMode, buildingAcqMode, saleSplitMode, isSeparateAcquisition: separateAcquisition }
      : {}),
    // 건물분 취득시 기준시가(§99①1호 나목) — **별개 취득 전용**(자산 종류 무관, 2026-07-30).
    // 주택도 포함한다: §163⑥2호가목은 "라목의 주택 **취득당시**의 라목 가액"을 요구하는데,
    // 토지를 먼저 취득하고 건물을 나중에 취득했다면 토지 취득 당시엔 주택이 없어 라목 결합
    // 공시가 존재하지 않는다 → 각 파트가 자기 취득일 기준으로 §163⑥1호·2호를 따른다.
    ...(separateAcquisition
      ? {
          buildingStandardPriceAtAcquisition: parseAmount(primary.buildingStandardPriceAtAcq) || undefined,
          // **결합 총액 전송 차단**(2026-07-29 Phase 3). 이 조합에서 자산 전체 취득시 기준시가
          // 블록은 읽기 전용 파생 표시로 바뀌어 사용자가 총액을 더는 입력하지 않는다. 폼에 남은
          // 옛 값이 계속 전송되면 엔진이 legacy 역산(calcAcqStdPair :58-61)으로 그 값을 써
          // **화면에 보이지 않는 값이 계산에 쓰인다**. 폼 값은 지우지 않는다(토글 복귀 시 복원).
          //
          // ⚠️ 본체(`transfer-tax-api.ts:269`)가 설정한 값을 **덮어쓰는 방식**이다 —
          //    이 빌더의 spread(:316)가 뒤에 오므로 override가 성립한다. 별도 플래그를 body에
          //    넣으면 Zod 스키마에 없는 키가 되어 침묵 strip되거나 검증 오류가 된다.
          standardPriceAtAcquisition: undefined,
        }
      : {}),
    // 양도가액 2필드 — 구분양도 게이트.
    ...(saleDirectActive
      ? {
          landTransferPrice: ratioed(primary.landTransferPrice),
          buildingTransferPrice: ratioed(primary.buildingTransferPrice),
        }
      : {}),
    // 취득가액 2필드.
    ...(landAcqDirectActive ? { landAcquisitionPrice: ratioed(primary.landAcquisitionPrice) } : {}),
    ...(buildingAcqDirectActive
      ? { buildingAcquisitionPrice: ratioed(primary.buildingAcquisitionPrice) }
      : {}),
    // 파트별 매매사례가액 — salesCase 모드 시만. 별개 취득이면 미입력 = 차단(§176의2③1호 —
    // 탐색 창이 파트별 취득일 ±3개월로 달라 총액 안분 근거 없음), 동시 취득이면 §166⑥ 안분 fallback.
    ...(isSplitActive && landAcqMode === "salesCase"
      ? { landSalesCaseValue: ratioed(primary.landSalesCaseValue) }
      : {}),
    ...(isSplitActive && buildingAcqMode === "salesCase"
      ? { buildingSalesCaseValue: ratioed(primary.buildingSalesCaseValue) }
      : {}),
    // 자본적지출 2필드 — 모드 무관 항상 입력 가능(UI 상시 노출).
    ...(isSplitActive
      ? {
          landDirectExpenses: ratioed(primary.landDirectExpenses),
          buildingDirectExpenses: ratioed(primary.buildingDirectExpenses),
        }
      : {}),
    // 양도시 기준시가 2필드 — 기준시가는 지분 스케일 대상이 아니다(물건 속성값).
    ...(saleStdPriceActive
      ? {
          landStandardPriceAtTransfer: parseAmount(primary.landStandardPriceAtTransfer) || undefined,
          buildingStandardPriceAtTransfer: parseAmount(primary.buildingStandardPriceAtTransfer) || undefined,
        }
      : {}),
  };
}
