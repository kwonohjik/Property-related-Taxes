/**
 * 상업용건물·오피스텔(`assetKind === "commercial_building"`) 전용 ⑧ validation.
 *
 * `transfer-tax-validate-asset.ts`가 799줄(트리거 800 직하)에 이르러 분리했다(2026-08-07).
 * 세 블록이 한 자산종류만 다루고, 전용 헬퍼 6종(`resolveCbEra`·§164⑥ 단서·§164⑧ 준용·
 * pre1990 브리지)을 **여기서만** 쓰므로 자연스러운 이음매다.
 *
 * ## ⚠️ 호출 순서와 「종료 vs 계속」은 호출부가 정한다
 *
 * 세 함수의 `null`은 **의미가 다르다**:
 *
 * | 함수 | 진입 조건 | null의 뜻 |
 * |---|---|---|
 * | `validateCommercialInheritanceAsset` | 호출부가 판정 | **검증 통과 + 종료**(generic 취득 검증 스킵) |
 * | `validateCommercialAppurtenantLand` | **내부** 판정 | 해당 없음 또는 통과 — **계속 진행** |
 * | `validateCommercialEstimatedAsset` | 호출부가 판정 | **검증 통과 + 종료** |
 *
 * ⇒ 앞뒤 둘은 호출부에서 `if (조건) return f(...)` 형태로만 쓴다. 조건을 함수 안으로 넣고
 *    `null`을 반환하면 상속 상가가 **generic 취득 검증으로 흘러가** 조용히 다른 규칙을 탄다.
 *
 * 순서 근거(원본에서 유지):
 *   ① 상속 인터셉트 — 아래 환산 블록·generic 검증이 stale `useEstimatedAcquisition=true`에서
 *      상속을 못 잡으므로 **isEstimated 무관하게 먼저**
 *   ② 증여 추계 차단 — 환산 검증보다 먼저(실거래가는 generic으로 fall-through)
 *   ③ 부수토지 판정 — 취득 모드와 직교
 *   ④ 환산취득가 전용
 */

import { effectiveCommercialLandPriceAtAcq } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isCommercialPre1990Acquisition } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isSec164_5ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { isSec164_8ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { isBeforeBuildingStdPriceNotice } from "@/lib/calc/commercial-164-6-proviso";
import { resolveCbEra } from "@/lib/calc/commercial-cb-era";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { sec164CommercialStatus, isFullyFilled } from "./sec164-required-fields";
import { deriveSec163_9BaseDate } from "./transfer-163-9-base-date";
import { isSec163_9PreDeemed } from "./transfer-163-9-base-date";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 상업용건물·오피스텔 + **상속** (소령 §163⑨) — 환산 검증 전 우선 인터셉트.
 *
 * §163⑨: 상속 상가는 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 **의제**한다(환산 아님).
 *
 * ⚠️ **호출부에서 `if (상가 && 상속) return this(...)` 로만 쓴다** — 진입하면 항상 종료다.
 */
export function validateCommercialInheritanceAsset(asset: AssetForm, label: string): string | null {
  if (!asset.acquisitionDate) return `${label}: 취득일(상속개시일)을 입력하세요.`;
  if (!asset.decedentAcquisitionDate) return `${label}: 피상속인 취득일을 입력하세요.`;

  // ① 필수 — 다만 **「①이 유일 취득원」은 거짓**이었다(D-5 · 2026-08-07).
  //   §163⑨**2호**는 「평가액과 §164⑤~⑦ 가액 **중 많은 금액**」이므로 **② 단독도 가목**이고,
  //   엔진도 그렇게 계산한다(`clauseA = max(①,②)`). ①만 요구하면 ②를 다 채운 사용자가
  //   막힌다(probe Y-5). pre-deemed에는 ③(환산)까지 있어 「확인 불가」 선언도 통과 사유다.
  //   ⚠️ post-deemed는 나목이 §163⑨ 의제로 대체돼 **③이 없다** — 선언해도 갈 곳이 없어
  //      인정하지 않는다(anchor X-12c).
  const cbClauseAOk =
    parseAmount(asset.publishedValueAtInheritance) > 0 ||
    isFullyFilled(sec164CommercialStatus(asset)) ||
    (isSec163_9PreDeemed(asset) && asset.preDeemedClauseAUnconfirmed === true);
  if (!cbClauseAOk) return `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요.`;

  // §164⑥ **부분 입력 차단은 진입부 `sec164PartialInputError`로 이관**(2026-08-06) — 증여도
  // 같은 규정(§163⑨2호)인데 이 블록은 상속 전용이라 도달하지 못했고, 필드 목록이 빌더와
  // 이중 관리였다. 여기 남는 것은 **§164⑥ 단서**(전부 채운 경우에만 적용되는 추가 요구)뿐이다.
  const inhDate164 = deriveSec163_9BaseDate(asset);
  // §164⑥ 단서 — 취득 연도 ≤2000이면 나목(건물 기준시가) 가액이 없어 §164⑤ 준용이 필요하다.
  // 8필드를 채워 §164⑥을 적용하는 경우에만 요구한다(전부 비우면 상증법 평가액만 사용 → 무관).
  if (
    isFullyFilled(sec164CommercialStatus(asset)) &&
    isBeforeBuildingStdPriceNotice(inhDate164) &&
    !asset.cbAcqBuildingStdBy164_5
  )
    return `${label}: 취득당시(상속개시일) 건물 기준시가는 §164⑥ 단서에 따라 §164⑤ 준용으로 산정해야 합니다. [건물 기준시가 계산]으로 산정한 뒤 확인란을 체크하세요.`;

  return null;
}

/**
 * 상업용건물 **부수토지 초과분** 판정 검증 (⑧, 지방세령 §101①2호·§101②).
 *
 * ⑧ 동기화 원칙: API `buildCommercialAppurtenantLand`의 payload 생성 조건과 정확히 맞춘다.
 *   · 두 면적 모두 공란 = 판정 생략(허용) · 둘 다 입력 = 판정 수행
 *   · 하나만 입력 = 판정 불가인데 사용자는 입력했다고 믿는 상태 → 차단
 *   · 면적이 있는데 용도지역이 없으면 엔진이 throw하므로 여기서 먼저 막는다(§101① 단서 시 면제)
 *
 * ⚠️ **진입 조건을 내부에서 판정**한다 — null이면 「해당 없음 또는 통과」이므로 호출부는
 *    `if (err) return err;` 로 받고 **계속 진행**한다.
 */
export function validateCommercialAppurtenantLand(asset: AssetForm, label: string): string | null {
  if (asset.assetKind !== "commercial_building") return null;

  const totalLand = parseDecimal(asset.cbTotalLandArea);
  const totalFootprint = parseDecimal(asset.cbTotalBuildingFootprintArea);
  const anyEntered = totalLand > 0 || totalFootprint > 0;
  if (!anyEntered) return null;

  if (!(totalLand > 0)) return `${label}: 부수토지 판정 — 집합건물 전체 대지면적을 입력하세요.`;
  if (!(totalFootprint > 0))
    return `${label}: 부수토지 판정 — 집합건물 전체 바닥면적을 입력하세요.`;
  if (!asset.cbUnapprovedBuilding && !asset.cbZoneType)
    return `${label}: 부수토지 판정 — 용도지역을 선택하세요 (지방세법 시행령 §101② 적용배율).`;

  return null;
}

/**
 * 상업용건물·오피스텔 **환산취득가** 전용 검증 (⑧, 소령 §164⑥, §176조의2②2호).
 *
 * ⑧ 동기화 원칙: API `buildCommercialBuildingValuation`의 undefined 반환 조건과 동일하게 차단.
 *
 * ⚠️ **호출부에서 `if (상가 && useEstimatedAcquisition) return this(...)` 로만 쓴다** —
 *    진입하면 항상 종료다(generic 취득 검증 스킵).
 */
export function validateCommercialEstimatedAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  // 적용 cbEra — 명시 선택 없으면 취득일에서 파생(API·UI와 **같은 함수**, 3중 패턴).
  // 취득일이 없으면 파생도 불가하므로 취득일 입력을 먼저 요구한다.
  const era = resolveCbEra(asset);
  if (!era) {
    return `${label}: 상업용건물·오피스텔 — 취득일을 입력하세요 (호별고시 취득 시점 구분의 기준일).`;
  }
  // 면적 3종 필수
  if (!parseDecimal(asset.cbExclusiveArea)) return `${label}: 전용면적을 입력하세요.`;
  if (!parseDecimal(asset.cbSharedArea)) return `${label}: 공유면적을 입력하세요.`;
  if (!parseDecimal(asset.cbLandArea)) return `${label}: 대지면적을 입력하세요.`;
  // 호별고시가 공통 필수
  if (!parseAmount(asset.cbUnitPriceAtTransfer))
    return `${label}: 양도시 ㎡당 호별고시가를 입력하세요.`;
  if (!parseAmount(asset.cbUnitPriceAtFirstOrAcq))
    return `${label}: ${era === "pre_disclosure" ? "최초고시(2005)" : "취득시"} ㎡당 호별고시가를 입력하세요.`;
  // 양도시 개별공시지가 공통 필수
  if (!parseAmount(asset.cbLandPricePerSqmAtTransfer))
    return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요.`;

  if (era === "pre_disclosure") {
    // 건물 기준시가 3시점 필수 (총액, 원 — 외부에서 ㎡당 단가 × 연면적 보정계수 반영)
    if (!parseAmount(asset.cbBuildingStdPriceAtAcq))
      return `${label}: 취득시 건물 기준시가(총액)를 입력하세요.`;
    if (!parseAmount(asset.cbBuildingStdPriceAtFirst))
      return `${label}: 최초고시시(2005) 건물 기준시가(총액)를 입력하세요.`;
    if (!parseAmount(asset.cbBuildingStdPriceAtTransfer))
      return `${label}: 양도시 건물 기준시가(총액)를 입력하세요.`;
    // 개별공시지가 3시점 필수.
    // ⑧ API 동일 fallback — 취득 1990-08-30 이전은 가목의 가액이 없어 §164④ 토지등급 환산값을 쓴다.
    // UI 통과 ↔ validate 차단 모순을 막기 위해 API와 **같은 함수**로 유효값을 판정한다.
    if (!effectiveCommercialLandPriceAtAcq(asset, formTransferDate ?? ""))
      return isCommercialPre1990Acquisition(asset)
        ? `${label}: 취득일이 개별공시지가 고시(1990.8.30.) 전입니다 — §164④ 토지등급 환산 입력(1990 공시지가·등급 3종)을 완성하거나 취득시 개별공시지가를 직접 입력하세요.`
        : `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
    if (!parseAmount(asset.cbLandPricePerSqmAtFirst))
      return `${label}: 최초고시시(2005) 개별공시지가(원/㎡)를 입력하세요.`;
    // §164⑥ 단서 — 취득연도 ≤2000은 나목(건물 기준시가) 가액이 없어 §164⑤ 준용이 필요하다.
    // 준용 산정에는 신축연도·구조·용도가 필요해 엔진이 자동 산정할 수 없으므로(AssetForm 미보유)
    // 사용자의 명시적 확인을 요구한다. 확인 없이 임의 금액이 들어가면 P_A가 조용히 틀린다.
    if (isSec164_5ProvisoApplicable(era, asset.acquisitionDate) && !asset.cbAcqBuildingStdBy164_5)
      return `${label}: 취득당시 건물 기준시가는 §164⑥ 단서에 따라 §164⑤ 준용으로 산정해야 합니다. [건물 기준시가 계산]으로 산정한 뒤 확인란을 체크하세요.`;
    // §164⑥ 산식 괄호 단서 — 두 시점 기준시가합이 같으면 §164⑧ 준용이 강제된다.
    // B(전기의 기준시가합)가 없으면 준용 산정이 불가하고, 그대로 두면 비율 1로 법령과 다른 값이 나온다.
    if (isSec164_8ProvisoApplicable(asset) && !parseAmount(asset.cbPrevStdPriceSum))
      return `${label}: 취득당시 기준시가합과 최초고시당시 기준시가합이 같습니다 — §164⑥ 산식 괄호 단서에 따라 §164⑧을 준용해야 합니다. 전기(취득 직전 고시분)의 토지·건물 기준시가 합계액을 입력하세요.`;
  }

  if (era === "post_disclosure") {
    // post_disclosure: 취득시 개별공시지가 필수 (API와 동일 유효값 판정)
    if (!effectiveCommercialLandPriceAtAcq(asset, formTransferDate ?? ""))
      return `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
  }

  // 상업용건물 환산취득가 검증 완료 — 일반 취득 검증 스킵
  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
  return null;
}
