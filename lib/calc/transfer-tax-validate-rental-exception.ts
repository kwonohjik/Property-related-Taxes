/**
 * 장기임대주택 거주주택 비과세 특례 검증 (⑧, 소령 §155⑳)
 *
 * `transfer-tax-validate-asset.ts`에서 분리 (800줄 정책). 자동 안분 fallback 금지 원칙 준수.
 * B 시나리오 취득/현양도 기준시가는 환산 모드 연동 시(isPhrpStdPriceLinked) 자산-수준
 * standardPriceAtAcq/Transfer가 단일 소스 — UI(⑤)·API 변환(④)과 동일 ternary (3중 패턴).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isPhrpStdPriceLinked } from "./transfer-phrp-stdprice-link";
import {
  deriveEffectiveRegDate,
  deriveRentalArticle,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";

export function validateRentalHousingException(
  rh: AssetForm["rentalHousingException"] | undefined,
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (!rh?.applyException) return null;

  // 임대주택 1호 이상 필수
  if (!rh.rentalUnits || rh.rentalUnits.length === 0) {
    return `${label}: 장기임대주택 특례 — 임대주택 정보를 1호 이상 입력하세요.`;
  }

  // 호별 검증
  for (let i = 0; i < rh.rentalUnits.length; i++) {
    const u = rh.rentalUnits[i];
    const unitLabel = `${label} 임대주택 #${i + 1}`;
    // 사업자등록등 — 세무서·지자체 둘 다 필수
    if (!u.businessRegistrationDate) return `${unitLabel}: 세무서 사업자등록일을 입력하세요.`;
    if (!u.rentalRegistrationDate) return `${unitLabel}: 지자체 임대사업자등록신청일을 입력하세요.`;

    // 도출 목 재사용(deriveRentalArticle) — UI 조건부 노출·엔진 판정과 3중 동기화
    const eff = deriveEffectiveRegDate({
      businessRegistrationDate: new Date(u.businessRegistrationDate),
      rentalRegistrationDate: new Date(u.rentalRegistrationDate),
    });
    const article = deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, eff);

    if (article === "나") {
      // 나목(기존사업자 매입) — 취득당시 기준시가 3억·국민주택규모·2호 (임대개시일 기준시가·5%룰 미사용)
      if (!u.acquisitionOfficialPrice || parseAmount(u.acquisitionOfficialPrice) <= 0) {
        return `${unitLabel}: 취득 당시 기준시가를 입력하세요 (나목 3억 이하 요건).`;
      }
      if (!u.isNationalSizeHousing) {
        return `${unitLabel}: 나목은 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 요건 충족 확인이 필요합니다.`;
      }
      if (!u.hasMinimum2Units) {
        return `${unitLabel}: 나목은 2호 이상 임대 요건 충족 확인이 필요합니다.`;
      }
    } else {
      // 그 외 목 — 임대개시일 기준시가 필수
      if (!u.standardPriceAtRentalStart || parseAmount(u.standardPriceAtRentalStart) <= 0) {
        return `${unitLabel}: 임대개시일 기준시가를 입력하세요.`;
      }
      // 건설임대 규모요건 — 도출 목이 건설(다/바/자)이면 면적 필수 (엔진 SIZE_REQUIRED와 동기화·침묵 통과 차단)
      if (article === "다" || article === "바" || article === "자") {
        if (!u.rentalLandArea || parseDecimal(u.rentalLandArea) <= 0
            || !u.rentalTotalFloorArea || parseDecimal(u.rentalTotalFloorArea) <= 0) {
          return `${unitLabel}: 건설임대는 대지면적·연면적(㎡)을 입력하세요 (규모요건 대지 298㎡·연면적 149㎡ 이하).`;
        }
      }
      if (!u.requirementsConfirmed) {
        return `${unitLabel}: 기타 요건 자기확인이 필요합니다 (임대료 5% 상한, 등록 유지 등).`;
      }
    }
  }

  // B 시나리오 추가 검증
  if (rh.scenario === 'B') {
    if (!rh.priorResidenceTransferDate) {
      return `${label}: PHRP 시나리오 — 직전거주주택 양도일을 입력하세요.`;
    }
    // 환산취득가 모드 연동 시 자산-수준 기준시가가 단일 소스 — API 변환(④)·UI(⑤)와 동일 ternary (3중 패턴)
    const linked = isPhrpStdPriceLinked(asset);
    const pAcq = linked
      ? parseAmount(asset.standardPriceAtAcq)
      : parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "");
    const pPrior = parseAmount(rh.standardPriceAtPriorTransfer ?? "");
    const pTransfer = linked
      ? parseAmount(asset.standardPriceAtTransfer)
      : parseAmount(rh.standardPriceAtTransferForPhrp ?? "");

    if (pAcq <= 0) {
      return linked
        ? `${label}: 임대→거주 전환 주택 시나리오 — 취득 정보의 환산 취득시 기준시가를 입력하세요 (§161① 안분에 연동됩니다).`
        : `${label}: 임대→거주 전환 주택 시나리오 — 취득 당시 기준시가를 입력하세요.`;
    }
    if (pPrior <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 직전거주주택 양도 당시 기준시가를 입력하세요.`;
    if (pTransfer <= 0) {
      return linked
        ? `${label}: 임대→거주 전환 주택 시나리오 — 취득 정보의 환산 양도시 기준시가를 입력하세요 (§161① 안분에 연동됩니다).`
        : `${label}: 임대→거주 전환 주택 시나리오 — 현 양도 당시 기준시가를 입력하세요.`;
    }

    // 시점 일관성 확인 (경고 수준 — 실무 이례 케이스 차단하지 않고 경고만)
    if (pPrior < pAcq) {
      return `${label}: PHRP 시나리오 — 직전 양도 당시 기준시가(${pPrior.toLocaleString()})가 취득 당시(${pAcq.toLocaleString()})보다 작습니다. 확인 후 재입력하세요.`;
    }
    if (pTransfer < pPrior) {
      return `${label}: PHRP 시나리오 — 현 양도 당시 기준시가(${pTransfer.toLocaleString()})가 직전 양도 당시(${pPrior.toLocaleString()})보다 작습니다. 확인 후 재입력하세요.`;
    }

    // 분모 0 방지
    if (pTransfer === pAcq) {
      return `${label}: PHRP 시나리오 — 취득 당시와 현 양도 당시 기준시가가 동일하여 §161① 비율을 계산할 수 없습니다.`;
    }
  }

  // 거주주택 취득일 검증 (자산-수준)
  if (!asset.acquisitionDate) {
    return `${label}: 장기임대주택 특례 — 거주주택 취득일을 입력하세요.`;
  }

  // §155⑳ 거주주택 거주 2년 + 보유 2년 요건 — 침묵 실패 차단
  const liveMonthsRaw = asset.residencePeriodMonthsAsset ?? "";
  const liveMonthsVal = parseInt(String(liveMonthsRaw).replace(/,/g, "") || "0", 10);

  if (!liveMonthsVal || liveMonthsVal < 24) {
    return `${label}: 장기임대주택 특례 — 거주주택 거주기간 2년(24개월) 이상이 필요합니다. 보유 상황 단계에서 "거주기간(개월)"을 24 이상으로 입력하세요. (현재: ${liveMonthsVal || 0}개월)`;
  }

  // 보유기간 24개월 검증 (취득일 ~ 양도일)
  if (formTransferDate && asset.acquisitionDate) {
    const acqMs = new Date(asset.acquisitionDate).getTime();
    const trnMs = new Date(formTransferDate).getTime();
    if (Number.isFinite(acqMs) && Number.isFinite(trnMs)) {
      const days = Math.floor((trnMs - acqMs) / (1000 * 60 * 60 * 24));
      if (days < 730) {
        return `${label}: 장기임대주택 특례 — 거주주택 보유기간 2년(730일) 이상이 필요합니다. (취득일~양도일: ${days}일)`;
      }
    }
  }

  return null;
}
