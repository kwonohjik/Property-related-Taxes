/**
 * 양도소득세 계산기 단계별 유효성 검사 (Step1·Step3 통합 후 4단계)
 *
 * step 0: 자산 목록 (취득상세·환산취득가·1990·신축증축 모두 포함)
 * step 1: 보유 상황
 * step 2: 감면·공제
 * step 3: 가산세 (선택)
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateGeneralBuildingAsset } from "./transfer-tax-validate-gb";

// ─── 장기임대주택 거주주택 비과세 특례 검증 (⑧, 소령 §155⑳) ──────

/**
 * 장기임대주택 거주주택 비과세 특례 서브 검증.
 * API/UI fallback 없음 → validate에서 동일하게 명시 차단.
 * 자동 안분 fallback 금지 원칙 준수.
 */
function validateRentalHousingException(
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
    if (!u.registrationDate) return `${unitLabel}: 등록일을 입력하세요.`;
    if (!u.standardPriceAtRentalStart || parseAmount(u.standardPriceAtRentalStart) <= 0) {
      return `${unitLabel}: 임대개시일 기준시가를 입력하세요.`;
    }
    if (!u.requirementsConfirmed) {
      return `${unitLabel}: 기타 요건 자기확인이 필요합니다 (임대료 5% 상한, 등록 유지 등).`;
    }
  }

  // B 시나리오 추가 검증
  if (rh.scenario === 'B') {
    if (!rh.priorResidenceTransferDate) {
      return `${label}: PHRP 시나리오 — 직전거주주택 양도일을 입력하세요.`;
    }
    const pAcq = parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "");
    const pPrior = parseAmount(rh.standardPriceAtPriorTransfer ?? "");
    const pTransfer = parseAmount(rh.standardPriceAtTransferForPhrp ?? "");

    if (pAcq <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 취득 당시 기준시가를 입력하세요.`;
    if (pPrior <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 직전거주주택 양도 당시 기준시가를 입력하세요.`;
    if (pTransfer <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 현 양도 당시 기준시가를 입력하세요.`;

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

/** 다필지 자산 검증 — primary 자산이 다필지 모드일 때 */
function validateParcelMode(primary: AssetForm): string | null {
  const parcels = primary.parcels ?? [];
  if (parcels.length === 0) return "필지를 최소 1개 추가하세요.";
  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    const label = `필지 ${i + 1}`;
    const scenario = p.areaScenario ?? "partial";

    if (!p.useDayAfterReplotting && !p.acquisitionDate)
      return `${label}: 취득일을 선택하세요.`;
    if (p.useDayAfterReplotting && !p.replottingConfirmDate)
      return `${label}: 환지처분확정일을 선택하세요.`;

    if (scenario === "reduction") {
      if (!p.entitlementArea || parseFloat(p.entitlementArea) <= 0)
        return `${label}: 권리면적을 입력하세요.`;
      if (!p.allocatedArea || parseFloat(p.allocatedArea) <= 0)
        return `${label}: 교부면적을 입력하세요.`;
      if (!p.priorLandArea || parseFloat(p.priorLandArea) <= 0)
        return `${label}: 종전토지면적을 입력하세요.`;
      if (parseFloat(p.entitlementArea) <= parseFloat(p.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    } else {
      if (!p.transferArea || parseFloat(p.transferArea) <= 0)
        return `${label}: 양도면적을 입력하세요.`;
      if (scenario === "partial") {
        if (!p.acquisitionArea || parseFloat(p.acquisitionArea) <= 0)
          return `${label}: 총 취득면적을 입력하세요.`;
        if (parseFloat(p.acquisitionArea) < parseFloat(p.transferArea))
          return `${label}: 취득면적은 양도면적 이상이어야 합니다.`;
      }
    }

    if (p.acquisitionMethod === "estimated") {
      if (!p.standardPricePerSqmAtAcq || parseFloat(p.standardPricePerSqmAtAcq) <= 0)
        return `${label}: 취득시 ㎡당 기준시가를 입력하세요.`;
      if (!p.standardPricePerSqmAtTransfer || parseFloat(p.standardPricePerSqmAtTransfer) <= 0)
        return `${label}: 양도시 ㎡당 기준시가를 입력하세요.`;
    } else {
      if (!p.acquisitionPrice || parseAmount(p.acquisitionPrice) <= 0)
        return `${label}: 취득가액을 입력하세요.`;
    }
  }
  return null;
}

/** 자산 카드 1건의 취득 정보 검증 (취득가·환산·1990·신축) */
function validateAssetAcquisition(asset: AssetForm, label: string, formTransferDate?: string): string | null {
  // ── 상업용건물·오피스텔 환산취득가 전용 검증 (⑧, 소령 §164⑧, §176조의2②2호) ──
  // ⑧ 동기화 원칙: API buildCommercialBuildingValuation 의 undefined 반환 조건과 동일하게 차단.
  if (asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition) {
    // cbEra 선택 필수
    if (!asset.cbEra) {
      return `${label}: 상업용건물·오피스텔 — 호별고시 취득 시점을 선택하세요.`;
    }
    // 면적 3종 필수
    if (!parseDecimal(asset.cbExclusiveArea))
      return `${label}: 전용면적을 입력하세요.`;
    if (!parseDecimal(asset.cbSharedArea))
      return `${label}: 공유면적을 입력하세요.`;
    if (!parseDecimal(asset.cbLandArea))
      return `${label}: 대지면적을 입력하세요.`;
    // 호별고시가 공통 필수
    if (!parseAmount(asset.cbUnitPriceAtTransfer))
      return `${label}: 양도시 ㎡당 호별고시가를 입력하세요.`;
    if (!parseAmount(asset.cbUnitPriceAtFirstOrAcq))
      return `${label}: ${asset.cbEra === "pre_disclosure" ? "최초고시(2005)" : "취득시"} ㎡당 호별고시가를 입력하세요.`;
    // 양도시 개별공시지가 공통 필수
    if (!parseAmount(asset.cbLandPricePerSqmAtTransfer))
      return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요.`;

    if (asset.cbEra === "pre_disclosure") {
      // 건물 기준시가 3시점 필수 (총액, 원 — 외부에서 ㎡당 단가 × 연면적 보정계수 반영)
      if (!parseAmount(asset.cbBuildingStdPriceAtAcq))
        return `${label}: 취득시 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtFirst))
        return `${label}: 최초고시시(2005) 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtTransfer))
        return `${label}: 양도시 건물 기준시가(총액)를 입력하세요.`;
      // 개별공시지가 3시점 필수
      if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
        return `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
      if (!parseAmount(asset.cbLandPricePerSqmAtFirst))
        return `${label}: 최초고시시(2005) 개별공시지가(원/㎡)를 입력하세요.`;
    }

    if (asset.cbEra === "post_disclosure") {
      // post_disclosure: 취득시 개별공시지가 필수
      if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
        return `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
    }

    // 상업용건물 환산취득가 검증 완료 — 일반 취득 검증 스킵
    if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
    return null;
  }

  // ── 일반건물(토지+건물 일괄) 전용 검증 — transfer-tax-validate-gb.ts 위임 ──
  if (asset.assetKind === "general_building") {
    return validateGeneralBuildingAsset(asset, label, formTransferDate);
  }

  // ── 이월과세(증여) 전용 검증 — carryover_gift 시 일반 취득 검증 스킵 ──
  if (asset.acquisitionCause === "carryover_gift") {
    const c = asset.carryover;

    // (a) 가업상속공제 최우선 차단 (§97조의2 ④)
    if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
      return `${label}: 가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
    }

    if (!c) return `${label}: 이월과세 증여 정보를 입력하세요.`;

    // (b) 필수 날짜 필드
    if (!c.giftRegistryDate) return `${label}: 증여 등기접수일을 입력하세요.`;
    if (!c.donorAcquisitionDate) return `${label}: 증여자 취득일을 입력하세요.`;

    // (c) 비교과세 B 시나리오 취득가
    if (parseAmount(c.giftDateValuation) <= 0)
      return `${label}: 증여 당시 평가액을 입력하세요.`;

    // (d) 취득가액 — 환산 미사용 시 직접 입력 필수
    if (!c.useEstimatedAcquisition && parseAmount(c.donorAcquisitionPrice) <= 0) {
      return `${label}: 증여자 취득가액을 입력하세요. (환산취득가 사용 시 토글 켜기)`;
    }

    // (e) 환산 사용 시 모드 선택 필수 + 모드별 필수 필드 검증
    if (c.useEstimatedAcquisition) {
      // 환산 모드 미선택 차단
      if (!c.estimationMode) {
        return `${label}: 환산 방식(일반 기준시가/개별주택가격 미공시/공동주택 최초고시 전)을 선택하세요.`;
      }

      if (c.estimationMode === "general") {
        // 일반 기준시가 환산 — donorStandardPrice* 2개 필수
        if (parseAmount(c.donorStandardPriceAtAcquisition) <= 0)
          return `${label}: 취득시 기준시가를 입력하세요.`;
        if (parseAmount(c.donorStandardPriceAtTransfer) <= 0)
          return `${label}: 양도시 기준시가를 입력하세요.`;
      } else if (c.estimationMode === "phd") {
        // PHD §164⑤ — asset 수준 phdFirstDisclosureDate 등 필수
        if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일을 입력하세요.`;
        if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
          return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
        const transferPrice =
          parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
        if (transferPrice <= 0) return `${label}: 양도시 개별주택가격을 입력하세요.`;
      } else if (c.estimationMode === "apd") {
        // APD — PHD와 동일 경로(preHousingDisclosure)를 사용하므로 같은 필드 검증
        if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일(공동주택 최초공시일)을 입력하세요.`;
        if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
          return `${label}: 최초공시 공동주택가격을 입력하세요.`;
        const transferPrice =
          parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
        if (transferPrice <= 0) return `${label}: 양도시 공동주택가격을 입력하세요.`;
      }
    }

    // (f) 음수 차단
    if (parseAmount(c.donorCapitalExpenditure) < 0)
      return `${label}: 증여자 자본적지출은 음수일 수 없습니다.`;
    if (parseAmount(c.giftTaxAmount) < 0)
      return `${label}: 증여세 상당액은 음수일 수 없습니다.`;

    // carryover_gift 검증 완료 — 일반 취득 검증 스킵
    return null;
  }

  // 검용주택 분리계산은 calcMixedUseTransferTax 엔진이 별도 처리 — 전용 검증 후 return
  if (asset.isMixedUseHouse === true) {
    if (!asset.acquisitionDate) return `${label}: 건물 취득일을 입력하세요.`;
    // 토지·건물 취득일 다름 토글 ON일 때만 토지 취득일 필수. OFF면 acquisitionDate로 폴백.
    if (asset.hasSeperateLandAcquisitionDate && !asset.landAcquisitionDate)
      return `${label}: 토지 취득일을 입력하세요.`;
    if (!asset.residentialFloorArea || parseFloat(asset.residentialFloorArea) <= 0)
      return `${label}: 주택 연면적(㎡)을 입력하세요. (면적 정보)`;
    if (!asset.nonResidentialFloorArea || parseFloat(asset.nonResidentialFloorArea) <= 0)
      return `${label}: 상가 연면적(㎡)을 입력하세요. (면적 정보)`;
    if (!asset.mixedUseTotalLandArea || parseFloat(asset.mixedUseTotalLandArea) <= 0)
      return `${label}: 전체 토지 면적(㎡)을 입력하세요. (면적 정보)`;
    if (!asset.buildingFootprintArea || parseFloat(asset.buildingFootprintArea) <= 0)
      return `${label}: 건물 정착면적(㎡)을 입력하세요. (면적 정보)`;
    if (!asset.mixedTransferHousingPrice || parseAmount(asset.mixedTransferHousingPrice) <= 0)
      return `${label}: 양도시 개별주택공시가격을 입력하세요. (양도시 기준시가)`;
    if (!asset.mixedTransferLandPricePerSqm || parseAmount(asset.mixedTransferLandPricePerSqm) <= 0)
      return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요. (양도시 기준시가)`;
    // PHD 전용 검증 (취득시 면적 자동 계산 — acquisitionArea 불필요)
    if (asset.usePreHousingDisclosure) {
      if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일을 입력하세요.`;
      if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
        return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
      // ⑧ Validation fallback — API는 phdTransferHousingPrice || mixedTransferHousingPrice 로 fallback.
      // 메인 양도시 섹션에서 입력한 값(mixedTransferHousingPrice)도 인정.
      const transferHousingValue =
        parseAmount(asset.phdTransferHousingPrice) ||
        parseAmount(asset.mixedTransferHousingPrice);
      if (transferHousingValue <= 0)
        return `${label}: 양도시 개별주택가격을 입력하세요. (양도시 기준시가 섹션)`;
      // Case A 4부분 안분 — house_to_commercial + 최초공시일 < 용도변경일 시 상가건물 기준시가 별도 입력 필수
      if (
        asset.hasPartialUsageChange &&
        asset.partialChangeDirection === "house_to_commercial" &&
        asset.partialChangeDate &&
        asset.phdFirstDisclosureDate &&
        asset.phdFirstDisclosureDate < asset.partialChangeDate
      ) {
        // ⑧ Validation fallback — API는 phdCommercialBuildingStdPriceAtAcq || mixedAcqCommercialBuildingPrice fallback.
        // 메인 취득시 상가건물 기준시가도 인정 (UI 통합으로 단일 필드 공유).
        const acqCommercialBuildingValue =
          parseAmount(asset.phdCommercialBuildingStdPriceAtAcq) ||
          parseAmount(asset.mixedAcqCommercialBuildingPrice);
        if (acqCommercialBuildingValue <= 0) {
          return `${label}: Case A 4부분 안분 — 취득시 상가건물 기준시가를 입력하세요. (홈택스 조회)`;
        }
        if (!asset.phdCommercialBuildingStdPriceAtFirst || parseAmount(asset.phdCommercialBuildingStdPriceAtFirst) <= 0) {
          return `${label}: Case A 4부분 안분 — 최초고시 상가건물 기준시가를 입력하세요. (홈택스 조회)`;
        }
      }
    }
    // 보유 중 일부 용도변경 검증 (시행령 §166⑥ + 집행기준 99-164-10)
    if (asset.hasPartialUsageChange) {
      if (!asset.partialChangeDirection) {
        return `${label}: 보유 중 일부 용도변경 — 취득시 자산 구성을 선택하세요.`;
      }
      if (asset.partialChangeAcqResidentialArea) {
        const v = parseFloat(asset.partialChangeAcqResidentialArea);
        if (!Number.isFinite(v) || v < 0) {
          return `${label}: 취득시 주택 연면적이 잘못되었습니다.`;
        }
      }
      if (asset.partialChangeAcqCommercialArea) {
        const v = parseFloat(asset.partialChangeAcqCommercialArea);
        if (!Number.isFinite(v) || v < 0) {
          return `${label}: 취득시 상가 연면적이 잘못되었습니다.`;
        }
      }
      // 주택→상가: 취득시 상가건물 기준시가·개별공시지가는 직접 입력 또는 PHD ① fallback으로 충족
      if (asset.partialChangeDirection === "house_to_commercial") {
        // 상가건물 기준시가: 직접 입력 또는 PHD ① 전체 건물 기준시가 × (상가면적 / 전체면적) 자동 안분
        const directBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice);
        const phdBuilding = parseAmount(asset.phdBuildingStdPriceAtAcq);
        const resArea = parseFloat(asset.residentialFloorArea) || 0;
        const nonResArea = parseFloat(asset.nonResidentialFloorArea) || 0;
        const totalFloor = resArea + nonResArea;
        const autoBuilding =
          phdBuilding > 0 && totalFloor > 0
            ? Math.floor((phdBuilding * nonResArea) / totalFloor)
            : 0;
        if (directBuilding <= 0 && autoBuilding <= 0) {
          return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 상가건물 기준시가를 입력하세요. PHD ① 전체 건물 기준시가 입력 시 자동 안분, 또는 직접 조회·입력해야 합니다.`;
        }
        // 개별공시지가(상가): 직접 입력 또는 PHD ① 공시지가 fallback
        const directLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm);
        const phdLandPerSqm = parseAmount(asset.phdLandPricePerSqmAtAcq);
        if (directLandPerSqm <= 0 && phdLandPerSqm <= 0) {
          return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 개별공시지가(상가)를 입력하세요.`;
        }
      }
      // PHD ON + partialUsageChange ON 조합 시 용도변경일 필수
      // (Case A/B 분기 식별을 위해 firstDisclosureDate 와 비교 필요)
      if (asset.usePreHousingDisclosure) {
        if (!asset.partialChangeDate) {
          return `${label}: 보유 중 일부 용도변경 + 개별주택가격 미공시 환산 동시 사용 시 용도변경일이 필수입니다. 시행령 §164⑤ 환산 산식이 최초공시일과 용도변경일의 선후 관계에 따라 달라집니다.`;
        }
        const ucDate = new Date(asset.partialChangeDate);
        if (Number.isNaN(ucDate.getTime())) {
          return `${label}: 용도변경일 형식이 잘못되었습니다.`;
        }
      }
      // PHD 강제 변경 금지 (이슈 5) — 사용자 직전 상태 보존, 경고만 결과 카드에 표시
    }
    return null;
  }

  // ── 신축(자가건축) 케이스 전용 검증 (사례 28, 영 §162①4호) ──
  if (asset.acquisitionCause === "newConstruction") {
    // 4시점 중 최소 1개 필수 (영 §162①4호 취득일 기준)
    // G-5: 사용검사필증 교부일(approvalCertificateDate) 추가로 4시점 중 하나면 충족
    const hasAnyDate =
      !!asset.occupancyApprovalDate ||
      !!asset.approvalCertificateDate ||
      !!asset.temporaryApprovalDate ||
      !!asset.actualUseDate;
    if (!hasAnyDate) {
      return `${label}: 신축 주택의 사용승인일을 입력하세요. (소득세법 시행령 §162①4호 — 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 하나 이상 필수)`;
    }
    // 취득가액(신축비용) 필수
    if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0) {
      return `${label}: 신축 비용(취득가액)을 입력하세요.`;
    }
    // acquisitionDate는 4시점 중 가장 이른 날이 자동으로 폼에 동기화되므로 별도 검증 불필요.
    // (CompanionAssetCard 신축 분기에서 4시점 onChange 시점에 acquisitionDate를 자동 patch)
    // manualHoldingPeriodOverride 유효값 검증 (undefined이면 자동 분기 — 허용)
    const validOverrides = ["shortTermHousing70", "shortTerm60", "progressive"];
    if (
      asset.manualHoldingPeriodOverride !== undefined &&
      !validOverrides.includes(asset.manualHoldingPeriodOverride)
    ) {
      return `${label}: 토지 세율 수동 지정 값이 유효하지 않습니다.`;
    }
    // 신축 + companion 토지가 있고 1년 미만 보유 예상 시 건물 정착면적 필수 (부수토지 한도 산정)
    // 여기서는 보유기간 계산이 어렵고 면적은 있으면 더 좋으므로 강제 차단 대신 경고 수준만 유지.
    // 실제 엔진 분기에서 buildingFootprintArea가 없으면 자동 분기가 비활성됨.
    return null;
  }

  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

  const isAppraisal = asset.isAppraisalAcquisition === true;
  const isEstimated = !isAppraisal && asset.useEstimatedAcquisition === true;
  const hasPre1990 = (asset.pre1990Enabled ?? false) && asset.assetKind === "land";
  const isParcelMode = asset.parcelMode === true && asset.assetKind === "land";

  // 1) 다필지 모드는 별도 검증
  if (isParcelMode) return validateParcelMode(asset);

  // 2) 환지처분 시나리오
  if (asset.assetKind === "land") {
    const scenario = asset.areaScenario ?? "same";
    if (scenario === "reduction") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.entitlementArea || parseFloat(asset.entitlementArea) <= 0)
        return `${label}: 환지 권리면적을 입력하세요.`;
      if (!asset.allocatedArea || parseFloat(asset.allocatedArea) <= 0)
        return `${label}: 환지 교부면적을 입력하세요.`;
      if (!asset.priorLandArea || parseFloat(asset.priorLandArea) <= 0)
        return `${label}: 환지 이전 종전면적을 입력하세요.`;
      if (parseFloat(asset.entitlementArea) <= parseFloat(asset.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    }
    if (scenario === "increase") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
        return `${label}: 취득 당시 면적(권리면적 기준)을 입력하세요.`;
      if (!asset.transferArea || parseFloat(asset.transferArea) <= 0)
        return `${label}: 양도 당시 면적을 입력하세요.`;
    }
  }

  // 3) 1990.8.30. 이전 토지 환산 (자산-수준)
  if (hasPre1990) {
    const areaSqm = parseFloat((asset.acquisitionArea || "").replace(/,/g, ""));
    if (!areaSqm || areaSqm <= 0) return `${label}: 취득 당시 면적(㎡)을 입력하세요.`;
    if (!asset.pre1990PricePerSqm_1990 || parseAmount(asset.pre1990PricePerSqm_1990) <= 0)
      return `${label}: 1990.1.1. 개별공시지가(원/㎡)를 입력하세요.`;
    if (!asset.pre1990PricePerSqm_atTransfer || parseAmount(asset.pre1990PricePerSqm_atTransfer) <= 0)
      return `${label}: 양도당시 개별공시지가(원/㎡)를 입력하세요.`;
    const gradeValid = (raw: string) => {
      const n = Number((raw || "").replace(/,/g, ""));
      return Number.isFinite(n) && n > 0;
    };
    if (!gradeValid(asset.pre1990Grade_current)) return `${label}: 1990.8.30. 현재 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_prev)) return `${label}: 1990.8.30. 직전 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_atAcq)) return `${label}: 취득시 유효 토지등급을 입력하세요.`;
  }

  // 4) 환산취득가 — 기준시가
  // 주의: usePreHousingDisclosure === true 경로에서는 §164⑤ 3-시점 입력으로 자동 도출되므로
  //   standardPriceAtAcq / standardPriceAtTransfer 직접 입력 불요.
  // 검용주택 PHD는 위 isMixedUseHouse 분기에서 이미 return되어 이 줄에 도달하지 않음.
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(사례 23 공동주택 등)해도 PHD 경로는 표준시가 직접 입력 불요.
  const usesPhd = asset.usePreHousingDisclosure === true;

  if (isEstimated && !hasPre1990 && !usesPhd) {
    if (!asset.standardPriceAtAcq || parseAmount(asset.standardPriceAtAcq) <= 0)
      return `${label}: 취득 당시 기준시가를 입력하세요.`;
    if (!asset.standardPriceAtTransfer || parseAmount(asset.standardPriceAtTransfer) <= 0)
      return `${label}: 양도 당시 기준시가를 입력하세요.`;
  }

  // 4-2) 개별주택가격 미공시 취득 환산 (§164⑤) — 일반 자산: 11개 필수 필드
  // PHD §164⑤ 는 환산취득가 산식의 일부이므로 환산 모드(isEstimated)에서만 검증.
  // 실거래가/감정가액 모드에서 usePreHousingDisclosure 플래그가 잔존해도 무시.
  if (usesPhd && isEstimated) {
    if (!asset.phdFirstDisclosureDate)
      return `${label}: 최초 고시일을 입력하세요.`;
    // ISO 날짜 유효성 — 존재하지 않는 날(1993-02-30 등) 차단
    {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asset.phdFirstDisclosureDate);
      const d = m ? new Date(asset.phdFirstDisclosureDate) : null;
      if (!m || !d || isNaN(d.getTime()) ||
          d.getUTCFullYear() !== Number(m[1]) ||
          d.getUTCMonth() + 1 !== Number(m[2]) ||
          d.getUTCDate() !== Number(m[3])) {
        return `${label}: 최초 고시일이 유효하지 않습니다. (예: 공동주택 최초고시 1993-02-01)`;
      }
    }
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
    // 일반 자산: acquisitionArea 직접 입력 필요 (검용주택은 면적 자동 계산이므로 제외)
    if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
      return `${label}: 토지 면적(㎡)을 입력하세요. (자산 기본 정보)`;
    if (!asset.phdLandPricePerSqmAtAcq || parseAmount(asset.phdLandPricePerSqmAtAcq) <= 0)
      return `${label}: 취득시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtAcq || parseAmount(asset.phdBuildingStdPriceAtAcq) <= 0)
      return `${label}: 취득시 건물 기준시가를 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtFirst || parseAmount(asset.phdLandPricePerSqmAtFirst) <= 0)
      return `${label}: 최초공시일 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtFirst || parseAmount(asset.phdBuildingStdPriceAtFirst) <= 0)
      return `${label}: 최초공시일 건물 기준시가를 입력하세요.`;
    if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
      return `${label}: 양도시 개별주택가격을 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtTransfer || parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0)
      return `${label}: 양도시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtTransfer || parseAmount(asset.phdBuildingStdPriceAtTransfer) <= 0)
      return `${label}: 양도시 건물 기준시가를 입력하세요.`;
  }

  // 5) 취득가액 — 실거래가·감정가액 모두 fixedAcquisitionPrice 입력 루틴
  if (!isEstimated && !hasPre1990) {
    if (asset.acquisitionCause === "purchase") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: ${isAppraisal ? "감정가액" : "취득가액"}을 입력하세요.`;
    } else if (asset.acquisitionCause === "gift") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: 증여 신고가액을 입력하세요.`;
      if (!asset.donorAcquisitionDate)
        return `${label}: 증여자 취득일을 입력하세요.`;
    } else if (asset.acquisitionCause === "burdened_gift") {
      // ⑧ 부담부증여 (소령 §159) — Phase 1: general_building 전용 (별도 검증 분기에서 도달)
      // 일반(housing/land/building/...) 자산에서 burdened_gift 선택 시 차단.
      return `${label}: 부담부증여는 일반건물 자산에서만 지원됩니다 (Phase 1).`;
    } else if (asset.acquisitionCause === "inheritance") {
      if (!asset.decedentAcquisitionDate)
        return `${label}: 피상속인 취득일을 입력하세요.`;
      const hasAuto = asset.inheritanceValuationMode === "auto";
      const hasManual =
        asset.inheritanceValuationMode === "manual" &&
        asset.fixedAcquisitionPrice &&
        parseAmount(asset.fixedAcquisitionPrice) > 0;
      if (!hasAuto && !hasManual)
        return `${label}: 상속 취득가액(보충평가 또는 직접입력)을 입력하세요.`;
    }
  }

  // 6) 신축·증축 (매매 + housing/building 전용)
  if (asset.isSelfBuilt && asset.acquisitionCause === "purchase") {
    if (!asset.buildingType) return `${label}: 신축·증축 구분을 선택하세요.`;
    if (!asset.constructionDate) return `${label}: 신축·증축 완공일을 입력하세요.`;
    if (asset.buildingType === "extension" && (!asset.extensionFloorArea || parseFloat(asset.extensionFloorArea) <= 0))
      return `${label}: 증축 부분 바닥면적을 입력하세요.`;
  }

  // 7) 취득일-양도일 순서
  return null;
}

export function validateStep(step: number, form: TransferFormData): string | null {
  // step 0: 자산 목록 (취득 정보 통합)
  if (step === 0) {
    if (!form.assets || form.assets.length === 0) return "자산을 최소 1건 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
    if (!form.contractTotalPrice || parseAmount(form.contractTotalPrice) <= 0)
      return "총 양도가액을 입력하세요.";

    for (let i = 0; i < form.assets.length; i++) {
      const a = form.assets[i];
      const label = form.assets.length === 1 ? "자산" : `자산 ${i + 1}`;

      if (!a.assetKind) return `${label}: 자산 유형을 선택하세요.`;

      // ⑧ landNature 필수 차단 — 토지 자산이 포함된 일괄양도 시 명시 선택 강제
      // 자동 안분 fallback 금지 원칙 준수 (부수토지/독립 나대지에 따라 세율 분기가 달라짐)
      if (a.assetKind === "land") {
        const hasHousingInBundle = form.assets.some(
          (other) =>
            other.assetId !== a.assetId &&
            (other.assetKind === "housing" ||
              other.assetKind === "right_to_move_in" ||
              other.assetKind === "presale_right"),
        );
        if (hasHousingInBundle && !a.landNature) {
          return `${label}: 토지 성격(부수토지 / 독립 나대지)을 선택하세요. 주택·입주권과 함께 일괄양도하는 토지는 성격에 따라 세율이 달라집니다.`;
        }
      }

      // 공유 지분율 검증 (분자 ≤ 분모, 분모 > 0)
      const ownN = parseFloat(a.ownershipNumerator || "100");
      const ownD = parseFloat(a.ownershipDenominator || "100");
      if (!isFinite(ownN) || !isFinite(ownD)) return `${label}: 지분율 분자/분모는 숫자여야 합니다.`;
      if (ownD <= 0) return `${label}: 지분율 분모는 0보다 커야 합니다.`;
      if (ownN <= 0) return `${label}: 지분율 분자는 0보다 커야 합니다.`;
      if (ownN > ownD) return `${label}: 지분율 분자는 분모를 초과할 수 없습니다.`;
      if (ownD > 1000) return `${label}: 지분율 분모는 1000 이하여야 합니다.`;

      // 단건 + 지분 모드 차단 — 합산 신고 없이 ratio < 1.0 자산을 단독 계산 시 잘못된 결과
      // (사례 27 같은 동일 물건 다회 분할 취득은 모든 지분을 별도 자산으로 추가해야 정확)
      if (form.assets.length === 1 && ownN < ownD) {
        return `${label}: 지분 모드 자산(${ownN}/${ownD})은 단독으로 계산할 수 없습니다. 같은 물건의 다른 지분도 별도 자산으로 추가하거나, 단독 소유라면 지분율을 100/100으로 입력하세요.`;
      }

      // 다자산 양도가액 — 지분 모드(ratio < 1.0) 자산은 양도가액이 총양도가 × ratio로
      // 자동 결정되므로 actualSalePrice·standardPriceAtTransfer 모두 검증 면제.
      // 동일 물건 지분 단계취득 케이스(사례 27)에서 안분 키 입력 강요 차단.
      const isFractionalAsset = ownN < ownD;
      if (form.assets.length > 1 && !isFractionalAsset) {
        if (form.bundledSaleMode === "actual") {
          if (!a.actualSalePrice || parseAmount(a.actualSalePrice) <= 0)
            return `${label}: 계약서상 양도가액을 입력하세요.`;
        } else {
          if (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0)
            return `${label}: 양도시 기준시가를 입력하세요.`;
        }
      }

      // 자산별 취득 정보 검증 (취득일 + 취득가 + 환산 + 1990 + 신축)
      const acqError = validateAssetAcquisition(a, label, form.transferDate);
      if (acqError) return acqError;

      // ⑧ 장기임대주택 거주주택 비과세 특례 검증 (소령 §155⑳)
      const rhError = validateRentalHousingException(a.rentalHousingException, a, label, form.transferDate);
      if (rhError) return rhError;

      // 취득일-양도일 순서 (다필지 모드 외)
      if (!a.parcelMode && a.acquisitionDate && a.acquisitionDate >= form.transferDate)
        return `${label}: 취득일은 양도일보다 이전이어야 합니다.`;

      // 상속·증여자 취득일 순서
      if (
        a.acquisitionCause === "inheritance" &&
        a.decedentAcquisitionDate &&
        a.acquisitionDate &&
        a.decedentAcquisitionDate >= a.acquisitionDate
      )
        return `${label}: 피상속인 취득일은 상속개시일보다 이전이어야 합니다.`;
      if (
        a.acquisitionCause === "gift" &&
        a.donorAcquisitionDate &&
        a.acquisitionDate &&
        a.donorAcquisitionDate >= a.acquisitionDate
      )
        return `${label}: 증여자 취득일은 증여일보다 이전이어야 합니다.`;
    }

    // actual 모드 합계 검증 — 지분 모드 자산이 하나라도 있으면 ratio 자동 적용으로 합계 검증 생략.
    // 동일 물건 지분 단계취득은 ratio 합 = 100% 가정으로 시스템이 자동 분배.
    const anyFractional = form.assets.some((a) => {
      const n = parseFloat(a.ownershipNumerator || "100");
      const d = parseFloat(a.ownershipDenominator || "100");
      return isFinite(n) && isFinite(d) && d > 0 && n > 0 && n < d;
    });
    if (form.assets.length > 1 && form.bundledSaleMode === "actual" && !anyFractional) {
      const sumActual = form.assets.reduce(
        (s, a) => s + parseAmount(a.actualSalePrice),
        0,
      );
      if (sumActual !== parseAmount(form.contractTotalPrice))
        return "구분 기재된 양도가액 합이 총 양도가액과 일치하지 않습니다.";
    }
  }

  // step 1: 보유 상황 (구 step 3)
  if (step === 1) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";

    // 1세대1주택 + housing 자산 + interval 모드 거주 구간 검증
    const primary = form.assets?.[0];
    if (form.isOneHousehold && primary && primary.assetKind === "housing"
        && primary.residenceInputMode === "interval") {
      const periods = primary.residencePeriods ?? [];
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        const label = `거주 구간 #${i + 1}`;
        if (!p.moveInDate) return `${label}: 입주일을 입력하세요.`;
        if (!p.moveOutDate)
          return `${label}: 퇴거일을 입력하세요. (양도일까지 거주한 경우 양도일을 퇴거일로 입력)`;
        if (p.moveOutDate < p.moveInDate)
          return `${label}: 퇴거일은 입주일보다 이후여야 합니다.`;
        if (form.transferDate && p.moveInDate > form.transferDate)
          return `${label}: 입주일은 양도일 이전이어야 합니다.`;
        if (form.transferDate && p.moveOutDate && p.moveOutDate > form.transferDate)
          return `${label}: 퇴거일은 양도일 이전이어야 합니다.`;
      }
    }
  }

  // step 2: 감면·공제 (구 step 4)
  if (step === 2) {
    for (const asset of form.assets ?? []) {
      for (const r of asset.reductions ?? []) {
        if (r.type === "public_expropriation") {
          const cash = parseAmount(r.expropriationCash || "0");
          const bond = parseAmount(r.expropriationBond || "0");
          if (cash + bond <= 0) return "현금 또는 채권 보상액 중 최소 하나를 입력하세요.";
          if (!r.expropriationApprovalDate) return "사업인정고시일을 선택하세요.";
          if (form.transferDate && r.expropriationApprovalDate >= form.transferDate)
            return "사업인정고시일은 양도일보다 이전이어야 합니다.";
        }
        // Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본 요건 검증
        if (r.type === "new_99_3") {
          // 취득 유형별 필수 일자 검증
          // Round 9 (2026-05-06): 1호 매매계약일은 자산-수준 assetContractDate fallback
          // 메모리 feedback_validation_sync_8th_point.md ⑧ 정책 (UI/API fallback ↔ validate 동기화)
          if (r.acquisitionType993 === "from_builder") {
            const hasContractDate = !!(r.contractDate993 || asset.assetContractDate);
            if (!hasContractDate) return "§99의3 1호 적용: 매매계약일을 펼침 영역 상단에 입력하세요.";
          } else if (r.acquisitionType993 === "self_built") {
            if (!r.usageApprovalDate993) return "§99의3 2호 적용: 사용승인일을 선택하세요.";
          }
          // 취득시 기준시가 필수 (PHD 환산 결과 또는 직접 입력)
          // Round 10 (2026-05-06): PHD 모드 ON 시 자동 산출되어 standardPriceAtAcquisition993에 적용됨
          // PHD 모드 ON + 입력 부족 시 자동 적용 안 되므로 동일 검증으로 차단됨 (UI/API fallback ↔ validate 동기화 정책)
          if (parseAmount(r.standardPriceAtAcquisition993 || "0") <= 0) {
            return r.phdMode993
              ? "§99의3 PHD 환산 모드: 환산 결과가 0입니다. 토지 공시지가·면적·최초공시 정보를 모두 입력했는지 확인 후 '적용' 버튼을 클릭하세요."
              : "§99의3 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)";
          }
          // 5년 시점 기준시가 필수 (5년 후 양도인 경우 안분 산식에 사용)
          if (parseAmount(r.standardPriceAt5Years || "0") <= 0) {
            return "§99의3 적용: 5년 시점 기준시가를 입력하세요. (취득일+5년 인접 고시일 가격)";
          }
        }
      }
    }
  }

  // step 3: 가산세 (선택, 검증 없음 — useEffect로 자동 동기화)

  return null;
}
