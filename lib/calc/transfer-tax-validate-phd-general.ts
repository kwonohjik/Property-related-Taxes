/**
 * ⑧ 일반 자산 §164⑦(개별주택가격·공동주택가격 최초 공시 전 취득) 3-시점 환산 필수 입력 — `validateAssetAcquisitionBranches`의 4-2) 블록.
 * 800줄 정책으로 `transfer-tax-validate-acquisition.ts`에서 옮겼다(로직 변경 없음). 이월과세는 `transfer-tax-validate-carryover-asset.ts`가 증여자 취득일로 따로 본다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { fieldError } from "./transfer-tax-validate-field";
import { isPhdEligible } from "./phd-eligibility";
import { isPhdApartment, phdAcqDisclosedPriceName, phdClause } from "./phd-housing-term";
import { derivePre1990PlainHousePhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";
import { classifySameAdjustmentPeriod } from "@/lib/tax-engine/same-adjustment-period-std-price";

/** 환산 모드 · §164⑦ 사용 중인 일반 자산 — 첫 오류 메시지 또는 null. */
export function validateGeneralPhdEstimated(asset: AssetForm, label: string, formTransferDate?: string): string | null {
    if (!asset.phdFirstDisclosureDate)
      return fieldError("phdFirstDisclosureDate", `${label}: 최초 고시일을 입력하세요.`);
    // ISO 날짜 유효성 — 존재하지 않는 날(1993-02-30 등) 차단
    {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asset.phdFirstDisclosureDate);
      const d = m ? new Date(asset.phdFirstDisclosureDate) : null;
      if (!m || !d || isNaN(d.getTime()) ||
          d.getUTCFullYear() !== Number(m[1]) ||
          d.getUTCMonth() + 1 !== Number(m[2]) ||
          d.getUTCDate() !== Number(m[3])) {
        return fieldError("phdFirstDisclosureDate", `${label}: 최초 고시일이 유효하지 않습니다. (예: 공동주택 최초고시 1993-02-01)`);
      }
    }
    // §164⑦ 적용가능 게이트 — 취득일(의제취득일 1985-01-01 반영) ≥ 최초고시일이면
    // 취득당시 고시분 존재 → 3-시점 환산 대상 아님 (isPhdEligible 단일 소스).
    // 이월과세(carryover_gift)는 위 전용 블록(:202~)에서 증여자 취득일 기준으로 별도 게이트.
    if (!isPhdEligible(asset.acquisitionDate, asset.phdFirstDisclosureDate)) {
      // 공동주택은 처음 매겨진 가격이 국세청장 고시(§164⑥)일 수도 있다 — 이름·조문은 PHD 패널 라디오(`phdHousingType`)를 따른다
      const apartment = isPhdApartment(asset);
      return fieldError("phdFirstDisclosureDate", `${label}: 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 ${phdAcqDisclosedPriceName(apartment)}이 고시되어 있으므로 3-시점 환산(${phdClause(apartment)}) 대상이 아닙니다 — 3-시점 환산을 끄고 취득시 기준시가를 직접 입력하세요.`);
    }
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return fieldError("phdFirstDisclosureHousingPrice", `${label}: 최초 고시 개별주택가격을 입력하세요.`);
    // 일반 자산: acquisitionArea 직접 입력 필요 (겸용주택은 면적 자동 계산이므로 제외)
    if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
      return fieldError("acquisitionArea", `${label}: 토지 면적(㎡)을 입력하세요. (자산 기본 정보)`);
    /**
     * 취득시 토지 단위 공시지가 — 1990.8.30. 이전 취득 주택은 **영 §164④ 등급가액 환산**이 대신한다.
     *
     * 그날 이전에는 개별공시지가가 고시되지 않았으므로 「입력하세요」로 막으면 그 취득 시기의
     * 주택은 계산 자체가 불가능하다. §164⑦ 분자가 요구하는 「취득당시의 법 §99①1호 **가목**의
     * 가액」을 §164④가 정의하고, 법 §99③2호가 「…공시되기 전에 취득한 **토지 및 주택**」을 한 호에서
     * 위임한다. 겸용주택(`assetKind="housing"`)은 이미 같은 브리지를 쓰고 있었다.
     *
     * ⚠️ ④(`transfer-tax-api-body-blocks.ts`)·⑤와 **같은 파생 함수**를 쓴다 — 3중 패턴.
     *    한쪽만 열면 「UI 통과 ↔ validate 차단」 또는 그 반대의 침묵 불일치가 난다.
     */
    if (
      (!asset.phdLandPricePerSqmAtAcq || parseAmount(asset.phdLandPricePerSqmAtAcq) <= 0) &&
      derivePre1990PlainHousePhdLandPricePerSqmAtAcq(asset, formTransferDate ?? "") === null
    )
      return fieldError("phdLandPricePerSqmAtAcq", `${label}: 취득시 토지 단위 공시지가를 입력하세요. (1990.8.30. 이전 취득이면 아래 토지등급가액 환산을 켜고 등급을 입력하세요 — 영 §164④)`);
    if (!asset.phdBuildingStdPriceAtAcq || parseAmount(asset.phdBuildingStdPriceAtAcq) <= 0)
      return fieldError("phdBuildingStdPriceAtAcq", `${label}: 취득시 건물 기준시가를 입력하세요.`);
    if (!asset.phdLandPricePerSqmAtFirst || parseAmount(asset.phdLandPricePerSqmAtFirst) <= 0)
      return fieldError("phdLandPricePerSqmAtFirst", `${label}: 최초공시일 토지 단위 공시지가를 입력하세요.`);
    if (!asset.phdBuildingStdPriceAtFirst || parseAmount(asset.phdBuildingStdPriceAtFirst) <= 0)
      return fieldError("phdBuildingStdPriceAtFirst", `${label}: 최초공시일 건물 기준시가를 입력하세요.`);
    if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
      return fieldError("phdTransferHousingPrice", `${label}: 양도시 개별주택가격을 입력하세요.`);
    if (!asset.phdLandPricePerSqmAtTransfer || parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0)
      return fieldError("phdLandPricePerSqmAtTransfer", `${label}: 양도시 토지 단위 공시지가를 입력하세요.`);
    if (!asset.phdBuildingStdPriceAtTransfer || parseAmount(asset.phdBuildingStdPriceAtTransfer) <= 0)
      return fieldError("phdBuildingStdPriceAtTransfer", `${label}: 양도시 건물 기준시가를 입력하세요.`);

    /**
     * A11(2026-09-02) — §164⑦ 산식 **괄호 단서**(§164⑧ 준용) 미구현 구간 차단.
     *
     * 조문(법제처 `lsInfoR.do` 산식 이미지 `<img alt="@@LATEX@@…">` 디코드 — **조문 본문
     * 텍스트에는 없다**): 「… / …최초로 공시한 주택가격공시당시의 …합계액**(취득당시의 가액과
     * 최초로 공시한 주택가격 공시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)**」
     *
     * 두 합계가 같으면 비율이 1이 되어 `P_A_est = P_F`가 되고 환산이 무의미해진다
     * (실측 10,288,162원 과소). 트리거는 우연이 아니다 — §164③이 「새로운 기준시가가 고시되기
     * 전에 취득…하는 경우에는 **직전의 기준시가**에 의한다」이므로 취득일이 최초공시일 직전
     * 고시주기 안이면 두 시점이 같은 고시분으로 귀착해 **필연적으로 일치**한다.
     *
     * ⚠️ **「같으면 항상 틀린다」가 아니다.** 「소득세법 시행규칙」 §80①2호(취득연도의 다음 연도
     *    말일 **후**)면 대체분모 = 취득당시 가액이라 **비율 1이 곧 법령이 요구하는 값**이다.
     *    ⇒ **1호 구간에서만** 차단한다. 그 연도 축은 저장소에 이미 있는 도메인 무관 leaf를 쓴다.
     *
     * ⚠️ 인자 의미 주의(`feedback_shared_predicate_argument_parity`) — 그 leaf의 「양도」 자리에
     *    §164⑦ 준용에서는 **「최초공시」**가 들어간다. 축이 다르므로 이름이 아니라 의미로 맞춘다.
     *
     * ⚠️ 합계 산식은 **엔진과 floor 위치를 맞춘다** — `transfer-tax-pre-housing-disclosure.ts`는
     *    `landPricePerSqm * area`를 floor 없이 곱한 뒤 건물분을 더한다(§164⑥의 `INT()`와 다르다).
     *    어긋나면 ⑧이 보는 조건과 엔진 판정이 갈린다.
     *
     * 형제 §164⑥은 이 규칙을 이미 구현·차단했다(`commercial-164-6-proviso.ts` ·
     * `transfer-tax-validate-commercial-asset.ts:163-166`). §164⑦만 그 밖에 있었다 —
     * 저장소 전체에서 `164⑦` × `제8항` 교집합 grep 0건으로, 의도적 유보가 아니라 미인지다.
     *
     * 1차 조치는 **탐지 + 차단**이다(사용자 결정 2026-09-02). 산정하려면 B(전기 기준시가합)·
     * D(조정월수) 입력을 ①②③⑤⑧⑫에 신설해야 하고, 현재 폼에 그 칸이 없다
     * (실측 `calcSec164_8AdjustedDenominator(A, undefined, 24, 12) = null`).
     */
    const phdArea = parseFloat(asset.acquisitionArea) || 0;
    const phdSumAtAcq =
      parseAmount(asset.phdLandPricePerSqmAtAcq) * phdArea +
      parseAmount(asset.phdBuildingStdPriceAtAcq);
    const phdSumAtFirst =
      parseAmount(asset.phdLandPricePerSqmAtFirst) * phdArea +
      parseAmount(asset.phdBuildingStdPriceAtFirst);
    if (
      asset.acquisitionDate &&
      asset.phdFirstDisclosureDate &&
      classifySameAdjustmentPeriod({
        standardPriceAtAcquisition: phdSumAtAcq,
        // §164⑦ 준용에서 「양도」 자리 = 「최초공시」
        standardPriceAtTransfer: phdSumAtFirst,
        acquisitionDate: new Date(asset.acquisitionDate),
        transferDate: new Date(asset.phdFirstDisclosureDate),
      }) === "clause_1"
    ) {
      const clause = phdClause(isPhdApartment(asset));
      return `${label}: 취득당시 기준시가합과 최초공시당시 기준시가합이 같습니다 — ${clause} 산식 괄호 단서에 따라 §164⑧을 준용해야 하는데, 준용 산정에 필요한 전기(취득 직전 고시분) 기준시가합 입력 칸이 아직 없습니다. 3-시점 환산(${clause})을 끄고 취득시 기준시가를 직접 입력하세요.`;
    }
  return null;
}
