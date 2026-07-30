/**
 * 토지/건물 분리 직접 입력(§166⑥) — 입력 합이 총액을 초과하는지 검증.
 *
 * 계획서: docs/02-design/features/land-building-split-mode-gating-and-salescase-drift.plan.md (Phase B)
 *
 * 엔진 `splitPair`는 한쪽만 입력되면 반대쪽을 **잔액**(총액 − 입력값)으로 도출한다.
 * 입력값이 총액을 넘으면 잔액이 음수가 되는데, 엔진은 clamp하지 않는다(조용한 오답 방지).
 * → 그 모순 입력을 여기서 차단한다.
 *
 * 판정식은 엔진에서 import한 `isSplitPairOverflow` 단일 소스 — validate가 규칙을 재구현하면
 * "UI 통과 ↔ validate 차단" 모순(⑧ 규칙)이 재발한다.
 *
 * ⚠️ **범위 한정**: 총액(엔진 transferPrice·acquisitionPrice)의 폼 매핑은 다분기다
 * (지분 안분·재개발·부담부증여·다필지 — `transfer-tax-api.ts:189-215`). validate에서 그 분기를
 * 재현하면 dual-truth가 되므로, **총액이 자산 필드와 1:1인 단순 경로에서만** 검증한다.
 * 그 외 경로는 미검증(엔진이 음수를 그대로 노출 — 눈에 띄는 이상값).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { isSplitPairOverflow } from "@/lib/tax-engine/transfer-tax-split-gain";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { requiresAcqStdPricePart } from "./transfer-tax-split-acq-mode";
import { needsSaleStdPart } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 빈 문자열·0 → undefined (API 변환 `parseAmount(...) || undefined`과 동일 규약) */
function opt(v: string | undefined): number | undefined {
  const n = parseAmount(v ?? "");
  return n > 0 ? n : undefined;
}

/**
 * `requiresAcqStdPrice` ⑥절 인자 보정 — `AssetForm`에는 `expenses` 프로퍼티가 **없다**
 * (실제 필드는 `directExpenses`). 보정하지 않고 asset을 그대로 넘기면 ⑥절이 validate에서만
 * 죽어, 엔진(`input.expenses = parseAmount(primary.directExpenses)` — transfer-tax-api.ts:238-243)과
 * 판정이 갈린다. **같은 함수를 공유하는 것만으로는 단일 소스가 아니다 — 인자까지 같아야 한다.**
 */
function withExpenses(asset: AssetForm) {
  return { ...asset, expenses: parseAmount(asset.directExpenses ?? "") };
}

/**
 * V1·V2 — 별개 취득 자산의 파트별 취득가액 필수 검증.
 *
 * 토지·건물을 서로 다른 시점에 취득했다면 취득가액은 파트별로 실재하며, 총액에서 잔액을
 * 도출하거나 기준시가 비율로 안분할 법적 근거가 없다(소득세법 §97①1호·§114⑦, 소득령 §176의2③).
 * 엔진이 미입력을 차단하므로(파트별 완결) 여기서 같은 조건을 필드 오류로 먼저 알린다.
 *
 * 환산(estimated)은 총액 미참조 구조(양도가 × 기준시가 비율)라 대상이 아니다.
 * 비소유 파트(`selfOwns≠both`)도 대상이 아니다 — 그 파트의 양도차익은 버려진다.
 */
function validateSeparateAcqParts(asset: AssetForm, label: string): string | null {
  const selfOwns = asset.selfOwns ?? "both";
  const parts = [
    {
      owned: selfOwns !== "building_only",
      name: "토지",
      mode: effectivePartAcqMode(asset.landAcqMode, asset),
      price: asset.landAcquisitionPrice,
      salesCase: asset.landSalesCaseValue,
    },
    {
      owned: selfOwns !== "land_only",
      name: "건물",
      mode: effectivePartAcqMode(asset.buildingAcqMode, asset),
      // 건물 신축 + 토지 상속·증여(2026-07-30): 건물 취득가액의 정본은 「신축비용」 칸
      // (`fixedAcquisitionPrice`)이다 — API 변환도 같은 후퇴를 적용하므로(transfer-tax-api-split.ts)
      // 여기서 인식하지 않으면 "API 통과 ↔ validate 차단" 모순이 된다(⑧ 3중 패턴).
      price:
        asset.buildingAcquisitionPrice ||
        (asset.landAcquisitionCause ? asset.fixedAcquisitionPrice : ""),
      salesCase: asset.buildingSalesCaseValue,
    },
  ];

  for (const p of parts) {
    if (!p.owned) continue;
    if (p.mode === "actual" || p.mode === "appraisal") {
      if (opt(p.price) == null) {
        const what = p.mode === "appraisal" ? "감정가액" : "취득가액";
        return `${label}: ${p.name} ${what}을 입력하세요 — 토지·건물 취득시기가 다르면 나머지 금액에서 자동 계산되지 않습니다(소득세법 §97①1호·§114⑦).`;
      }
    } else if (p.mode === "salesCase") {
      if (opt(p.salesCase) == null) {
        return `${label}: ${p.name} 매매사례가액을 입력하세요 — 매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다(소득령 §176의2③1호).`;
      }
    }
  }
  return null;
}

/**
 * 분리 직접 입력 초과 검증. 오류 메시지 또는 null.
 *
 * 검증 대상 게이트 — UI가 양도가액 직접입력 칸을 노출하는 조건과 동일:
 *   `hasSeperateLandAcquisitionDate && saleSplitMode === "actual"`
 */
export function validateSplitDirectInputs(asset: AssetForm, label: string): string | null {
  // ⚠️ 게이트는 **API 전송 조건(`isSplitPayloadActive`)과 같아야** 한다(2026-07-30).
  //    종전엔 `hasSeperateLandAcquisitionDate`만 봤는데, 비-매매 취득원인의 소유자 분리는
  //    그 플래그를 켜지 않으므로(취득일 2열 UI가 없다) validate 전체가 early-return돼
  //    **양도가액 안분 근거·기준시가 검증이 통째로 건너뛰어졌다** — 엔진은 조용히 null을
  //    반환하고 `selfOwns`가 무시되어 비소유 파트까지 과세된다.
  const selfOwnsSplit = (asset.selfOwns ?? "both") !== "both";
  if (!asset.hasSeperateLandAcquisitionDate && !selfOwnsSplit) return null;

  // ── V8. 소유자 분리 + 취득일 동일(비-매매 경로) — 취득시 기준시가 필수 ─────────────
  // 취득가액을 토지·건물로 나누는 유일한 근거가 §166⑥ 기준시가 비율이다. 셋 중 하나라도
  // 비면 `calcAcqStdPair`가 null → `calcApportionRatio` null → `calcSplitGain`이 null을
  // 반환하고 **selfOwns가 무시된다**(조용한 과대과세). 별개취득은 V3·V5·V6가 이미 담당한다.
  if (selfOwnsSplit && !isSeparateAcquisition(asset)) {
    const hasPerSqm = opt(asset.standardPricePerSqmAtAcq) != null;
    const hasArea = parseDecimal(asset.acquisitionArea) > 0;
    const hasTotal = opt(asset.standardPriceAtAcq) != null;
    if (!hasPerSqm || !hasArea || !hasTotal) {
      return `${label}: 토지·건물 소유자가 다르면 본인 소유분만 과세하므로 취득가액을 토지·건물로 나눠야 합니다 — 취득 당시 ㎡당 개별공시지가·면적·기준시가 총액을 입력하세요 (소득세법 §99①1호·시행령 §166⑥).`;
    }
  }

  // ── V1·V2. 별개 취득 — 취득가액 파트별 필수 (함수 최상단 필수) ──────────────
  // 아래 §7.2 검증과 `saleSplitMode !== "actual"` early-return(:57 상당)·`skipTotals`(지분·
  // 부담부증여·재개발 제외)보다 **앞**에 둔다. 뒤에 놓으면 그 경로들이 미검증이 되어,
  // 엔진의 파트별 필수 차단(transfer-tax-split-gain.ts calcOnePart → TaxCalculationError)이
  // 필드 오류가 아니라 계산 실패로만 보인다(⑧ 규칙 — UI 통과 ↔ 엔진 차단 모순).
  //
  // 엔진 게이트와 **같은 헬퍼**로 판정한다 — 재구현하면 dual-truth가 된다.
  if (isSeparateAcquisition(asset)) {
    const partErr = validateSeparateAcqParts(asset, label);
    if (partErr) return partErr;

    // ── V3. 축 B 파트별 독립 — all-or-nothing ──────────────────────────────
    // `building`에서 건물분 기준시가(§99①1호 나목)를 명시 입력하면 엔진은 결합 총액을 버리고
    // 토지분을 `㎡당 공시지가 × 면적`으로만 산출한다. 그 3요소 중 하나라도 비면
    // `calcAcqStdPair`가 null → 분리 계산 전체가 **오류 없이 비활성**된다(§3.1 동형 결함).
    //
    // ⚠️ **술어 게이트 필수**(2026-07-29). UI는 취득시 기준시가 카드를 `requiresAcqStdPrice`로
    //    게이팅하므로, 실가/실가로 되돌린 사용자에게는 입력 칸이 없다. 그 상태에서 잔존한
    //    `buildingStandardPriceAtAcq`만 보고 차단하면 **입력 칸이 없는데 막히는 dead-end**가 된다
    //    (⑧ 규칙 — UI 통과 ↔ validate 차단 모순). 술어가 false면 그 값은 계산에 쓰이지 않으므로
    //    all-or-nothing을 요구할 이유도 없다.
    // 자산 종류 무관(2026-07-30) — 주택 별개취득도 파트 독립 산정을 쓴다(§163⑥2호가목 "취득당시").
    // 2026-07-30 파트별 분해 — **토지분 술어**로 좁힌다. 건물분만 필요한 조합
    // (토지 실거래가 + 건물 환산)에서 토지 3요소를 함께 요구하면 계산에 쓰이지도 않는
    // 값을 강제하게 된다(계획서 transfer-split-acq-std-part-gating.plan.md §3.2 (3)).
    if (
      opt(asset.buildingStandardPriceAtAcq) != null &&
      requiresAcqStdPricePart("land", withExpenses(asset), {
        landMode: effectivePartAcqMode(asset.landAcqMode, asset),
        buildingMode: effectivePartAcqMode(asset.buildingAcqMode, asset),
        isSeparate: true,
        hasSaleRatio:
          opt(asset.landStandardPriceAtTransfer) != null &&
          opt(asset.buildingStandardPriceAtTransfer) != null,
      })
    ) {
      if (opt(asset.standardPricePerSqmAtAcq) == null || opt(asset.acquisitionArea) == null) {
        return `${label}: 건물분 취득시 기준시가를 입력하면 토지분도 취득 당시 ㎡당 개별공시지가와 토지 면적으로 산출해야 합니다 — 둘 다 입력하세요(소득세법 §99①1호 가목·나목).`;
      }
    }

    // ── V6. 일반건물 별개취득 — 건물분 취득시 기준시가 **필수** (Phase 3) ──────────────
    // 자산 전체 결합 총액은 이 조합에서 읽기 전용 파생 표시로 바뀌고 전송도 차단되므로
    // (transfer-tax-api-split.ts), 엔진이 legacy 역산으로 후퇴할 수 없다. 건물분이 비면
    // `calcAcqStdPair` null → `TaxCalculationError` throw가 되므로 여기서 필드 오류로 먼저 알린다.
    //
    // 술어 게이트 필수 — 실가/실가에서는 취득시 기준시가 자체가 계산에 쓰이지 않아
    // 입력 카드도 숨겨지므로, 요구하면 입력 칸 없는 dead-end가 된다(V3와 동일 원칙).
    // 자산 종류 무관(2026-07-30) — 주택도 결합 총액 역산이 아니라 파트별 나목 기준시가를 쓴다.
    if (
      opt(asset.buildingStandardPriceAtAcq) == null &&
      requiresAcqStdPricePart("building", withExpenses(asset), {
        landMode: effectivePartAcqMode(asset.landAcqMode, asset),
        buildingMode: effectivePartAcqMode(asset.buildingAcqMode, asset),
        isSeparate: true,
        hasSaleRatio:
          opt(asset.landStandardPriceAtTransfer) != null &&
          opt(asset.buildingStandardPriceAtTransfer) != null,
      })
    ) {
      return `${label}: 건물분 취득시 기준시가를 입력하세요 — 토지·건물 취득시기가 달라 각 파트가 자기 취득일의 직전 고시분을 쓰므로, 결합 총액에서 역산하면 건물분에 토지 취득시점이 섞입니다(소득세법 §99①1호 나목·시행령 §164③).`;
    }
  }

  // §7.2 양도시 기준시가 필수 검증 (2026-07-28 사용자 확정 — feedback_no_silent_apportion_fallback):
  // apportioned(일괄양도) 안분 또는 estimated(환산) 파트는 **양도시 토지·건물 기준시가**로 안분/환산한다
  // (§166⑥→부가세령§64①1호 "양도 당시 기준시가"). 미입력 시 엔진이 취득시 비율(landRatio)로 조용히
  // 대체하나(split-gain.ts:147-150,256), 이는 사용자가 일괄양도/환산을 선택했는데 법령과 다른 결과를
  // 내는 자동 안분 fallback이므로 **여기서 차단**한다(사용자 입력 강제 — 조용한 대체 대신 명시 오류).
  // 조건부 차단이라 엔진 fallback 경로는 이 게이트로 도달이 막히고, actual/legacy 경로는 불변(⑧ 모순 없음).
  const landMode = effectivePartAcqMode(asset.landAcqMode, asset);
  const buildingMode = effectivePartAcqMode(asset.buildingAcqMode, asset);
  const hasSaleRatio =
    opt(asset.landStandardPriceAtTransfer) != null && opt(asset.buildingStandardPriceAtTransfer) != null;

  // 양도시 기준시가 배치 — UI 노출과 **같은 술어**. 여기서 재기술하면 "칸이 없는데 차단"이 된다.
  // `saleSplitMode` fallback은 UI(CompanionAcqDateSection.tsx:202)·API(transfer-tax-api-split.ts:67)와
  // 3중으로 맞춘다 — stale sessionStorage 자산은 undefined일 수 있다.
  const saleStdCtx = {
    saleSplitMode: asset.saleSplitMode ?? ("apportioned" as const),
    landMode,
    buildingMode,
    selfOwns: asset.selfOwns ?? ("both" as const),
  };

  // ⚠️ V4의 `hasSaleRatio`는 **좁히지 않는다**(2026-07-30 검토 결론). 파트 배치로 카드가 화면에서
  //    사라진 뒤에도 잔존 기준시가가 §64①1호 안분 비율로 쓰이는 것은 사실이나, 그 상황은
  //    **이번 변경이 만드는 것이 아니다** — 구분양도 + 양쪽 실지거래가액에서는 현행
  //    `needsSaleStdPrice`(LandBuildingSaleSplitSection.tsx:183-186)도 false라 카드가 이미 숨는다.
  //    2026-07-29에 그 경로를 "정당한 입력"으로 확정했고(S1 해소, split-sale-std-price-transmit.test.ts),
  //    사용자가 **직접 입력한** 기준시가로 법정 안분(§166⑥ → 부가세령 §64①1호)하는 것은
  //    `feedback_no_silent_apportion_fallback`이 금지하는 "시스템이 값을 지어내는" 자동 안분이 아니다.
  //    값은 모드를 되돌리면 화면에 복귀한다(표시 게이트만 — 값 보존).

  // ── V4. 양도가액 구분 근거 (규칙 ① — §166⑥ → 부가가치세법 시행령 §64①1호) ─────────────
  // "구분양도"를 골랐는데 토지·건물 양도가액을 **둘 다 비우면** 구분 근거가 없다.
  // 이때 엔진은 `saleRatio ?? landRatio`로 **취득시** 비율에 후퇴하는데(split-gain),
  // 규칙 ①은 "구분이 없으면 **양도시** 기준시가 비율"이라 법령과 어긋난다.
  // → 양도가액 구분 입력 **또는** 양도시 기준시가 2필드 중 하나를 요구한다(자동 fallback 금지).
  const separateAcq = isSeparateAcquisition(asset);
  // ⚠️ **별개취득 여부와 무관하게 적용**한다(2026-07-29 확정) — 규칙 ①은 양도가액을 나누는
  //    규칙이라 취득시기 상이 여부와 관계가 없다. 엔진도 같은 범위로 차단한다(취득시 비율 후퇴 폐지).
  if (
    asset.saleSplitMode === "actual" &&
    opt(asset.landTransferPrice) == null &&
    opt(asset.buildingTransferPrice) == null &&
    !hasSaleRatio
  ) {
    // ⚠️ 안내 문구는 **실제 입력 칸의 이름**과 일치해야 한다 — 토지분 총액 칸은 표시 전용으로
    //    바뀌었으므로(2026-07-29) "양도시 토지 기준시가를 입력하세요"라고 하면 없는 칸을 찾게 된다.
    //    양도시 기준시가 2칸은 구분양도에서 화면에 없을 수 있으나(2026-07-30 파트 배치),
    //    일괄양도로 전환하면 나타나므로 유효한 해소 경로다 — 두 경로를 모두 안내한다.
    return `${label}: 구분양도를 선택했으면 토지·건물 양도가액을 입력하거나, 양도시 토지 공시지가·면적과 건물 기준시가를 입력하세요 (§166⑥ — 양도 당시 기준시가 비율로 안분).`;
  }

  // ── V5. 취득시 기준시가 — **필요할 때만** 필수 (2026-07-29 사용자 확정 규칙 ③) ──────────
  // 취득시 기준시가는 취득가액을 **환산해야 할 때만** 필요하다. 양쪽 실지거래가액을 아는
  // 케이스에서는 계산 어디에도 등장하지 않으므로 요구하면 안 된다.
  // 판정은 엔진과 **같은 술어**를 import해 쓴다 — 조건을 재인코딩하면 엔진 요건이 바뀔 때
  // validate가 조용히 어긋난다(선례: isSplitPairOverflow).
  // 엔진 차단과 **같은 범위**(별개 취득)로 한정한다 — 비-별개취득은 총액이 실재해 엔진이
  // 종전대로 단일 자산 경로로 정상 산출하므로 막을 이유가 없다(⑧ 모순 방지).
  // ⚠️ V4(양도가액 구분)를 **먼저** 검사한다 — 양도가액 구분이 정해지면 술어 ⑤절이 꺼져
  //    취득시 기준시가 요건 자체가 사라지므로, 더 실행 가능한 오류를 먼저 보여야 한다.
  // ⚠️ 이 분기는 별개취득 경로에서 **이미 도달 불가**다 — V6가 건물분 미입력을, V3가 건물분
  //    입력 시 토지 3요소를 먼저 차단하므로 여기 도달하면 3요소가 이미 채워져 있다.
  //    V3/V6 조건이 바뀌면 되살아나는 안전망이라 제거하지 않고 게이트만 파트별로 맞춘다.
  if (
    separateAcq &&
    requiresAcqStdPricePart("land", withExpenses(asset), { landMode, buildingMode, isSeparate: true, hasSaleRatio })
  ) {
    if (opt(asset.standardPricePerSqmAtAcq) == null || parseDecimal(asset.acquisitionArea) <= 0) {
      return `${label}: 환산·감정·매매사례 취득가액 계산에는 취득시 ㎡당 개별공시지가와 토지 면적이 필요합니다 (소득세법 §99①1호 가목).`;
    }
  }

  // ── V7. 양도시 기준시가 — **파트별** 필수 (2026-07-30 파트 배치) ────────────────────
  // 종전에는 한쪽 파트만 환산이어도 양쪽을 요구했다. 기준시가 카드가 "쓰는 섹션 아래"로 이동한
  // 뒤에는 그 요구가 **입력 칸 없는 차단**이 된다 — 구분양도 + 토지만 환산이면 건물 양도시
  // 기준시가 칸이 화면에 없다(계획서 §5.5). 노출 술어와 같은 함수로 파트별로 판정한다.
  // 메시지는 `양도시 기준시가` 연속 토큰을 유지한다 — 기존 anchor 4곳이 그 부분문자열에 의존한다
  // (transfer-tax-validate-split.test.ts:78,86,537,550).
  if (needsSaleStdPart("land", saleStdCtx) && opt(asset.landStandardPriceAtTransfer) == null) {
    return `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 토지분(㎡당 공시지가 × 면적)이 필요합니다 (소득세법 §99①1호 가목).`;
  }
  if (needsSaleStdPart("building", saleStdCtx) && opt(asset.buildingStandardPriceAtTransfer) == null) {
    return `${label}: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 건물분이 필요합니다 — 「건물 기준시가 계산」으로 산정해 입력하세요 (소득세법 §99①1호 나목).`;
  }

  if (asset.saleSplitMode !== "actual") return null;

  // ── 총액이 자산 필드와 1:1이 아닌 경로는 미검증(위 ⚠️ 참조) ──
  // 지분 판정은 API 정본(`transfer-tax-api.ts:140` primaryFractional = getOwnershipRatio(primary) < 1.0)과
  // 동일 헬퍼 재사용 — 기본 자산은 100/100이라 "필드 존재 여부"로 판정하면 항상 지분 모드가 된다.
  const skipTotals =
    asset.transferType === "burdened_gift" ||
    asset.assetKind === "redevelopment_apt" ||
    getOwnershipRatio(asset) < 1.0;

  // ① 양도가액 — 총액 = actualSalePrice (단건 자산 카드 입력)
  if (!skipTotals) {
    const totalTransfer = parseAmount(asset.actualSalePrice ?? "");
    if (totalTransfer > 0) {
      const land = opt(asset.landTransferPrice);
      const building = opt(asset.buildingTransferPrice);
      if (isSplitPairOverflow(totalTransfer, land, building)) {
        return land != null && building != null
          ? `${label}: 토지·건물 양도가액의 합이 양도가액(${totalTransfer.toLocaleString()}원)을 초과합니다.`
          : `${label}: ${land != null ? "토지" : "건물"} 양도가액이 양도가액(${totalTransfer.toLocaleString()}원)을 초과합니다 — 나머지가 음수가 됩니다.`;
      }
    }
  }

  // ② 취득가액 — 실거래가·감정가액 모드만(환산·매매사례는 총액을 사용자가 입력하지 않는다)
  // ⚠️ **별개 취득은 제외**(V4): 취득가액 축에서 잔액 규칙 자체가 폐지돼 "합 = 총액" 불변식이
  //    성립하지 않는다. 파트 합이 상단 총액과 달라도 정상이며(총액은 사후 집계일 뿐),
  //    잔존한 `fixedAcquisitionPrice`로 차단하면 정당한 입력이 막힌다.
  const isEstimated = asset.useEstimatedAcquisition === true;
  const isSalesCase = asset.isSalesCaseAcquisition === true;
  if (!skipTotals && !isEstimated && !isSalesCase && !isSeparateAcquisition(asset)) {
    const totalAcq = parseAmount(asset.fixedAcquisitionPrice ?? "");
    if (totalAcq > 0) {
      const land = opt(asset.landAcquisitionPrice);
      const building = opt(asset.buildingAcquisitionPrice);
      if (isSplitPairOverflow(totalAcq, land, building)) {
        return land != null && building != null
          ? `${label}: 토지·건물 취득가액의 합이 취득가액(${totalAcq.toLocaleString()}원)을 초과합니다.`
          : `${label}: ${land != null ? "토지" : "건물"} 취득가액이 취득가액(${totalAcq.toLocaleString()}원)을 초과합니다 — 나머지가 음수가 됩니다.`;
      }
    }
  }

  // ③ 자본적지출 — 총액은 **`directExpenses`**(엔진 `input.expenses`의 실제 소스,
  //    transfer-tax-api.ts:224-229)다. `capitalExpenditure`가 아니다 — 그걸 총액으로 보면
  //    판정식만 공유하고 **피연산자가 달라져** 단일 소스가 무효화된다(validate 통과 ↔ 엔진 음수).
  //    `directExpenses`는 deprecated(legacy 마이그레이션 전용)라 신규 입력에선 0 → 엔진도
  //    총액 0일 때 잔액 규칙을 쓰지 않고 독립 입력으로 처리하므로 모순 자체가 발생하지 않는다.
  const totalExp = parseAmount(asset.directExpenses ?? "");
  if (totalExp > 0) {
    const land = opt(asset.landDirectExpenses);
    const building = opt(asset.buildingDirectExpenses);
    if (isSplitPairOverflow(totalExp, land, building)) {
      return `${label}: 토지·건물 자본적지출이 총 자본적지출(${totalExp.toLocaleString()}원)과 맞지 않습니다.`;
    }
  }

  return null;
}
