/**
 * 재개발/재건축 (시행령 §166) — Validation helper.
 *
 * transfer-tax-validate.ts 분리 — 800줄 정책.
 *
 * 검증 항목:
 *  - 분기 결정 ToggleCard (subject·approvalLawBasis·originalAssetType·settlementDirection)
 *  - 일정·금액 (approvalDate·rightsValue·preApprovalExpenses)
 *  - 인가일 ≥ 취득일 (승계조합원 인가 후 취득은 후속 PR 차단)
 *  - 청산금 수령 시 settlementSaleDate 필수 (NTS 집행기준 + §95④)
 *  - 환산 모드 (useEstimatedAcquisition=true) 시 acquisitionStdPrice + managementDisposalStdPrice 필수
 *  - §164⑦ 단서 — 최초공시일 입력 시 최초고시 기준시가 동반 필수
 *  - §164⑦ 단서 차단 — 취득일 < 최초공시일이면 firstDisclosureStdPrice 필수
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function validateRedevelopmentAsset(asset: AssetForm, label: string): string | null {
  // ── 분기 결정 필드 ──
  // UI display fallback과 동일(RedevelopmentBlock.tsx) + API 변환(buildRedevelopmentPayload).
  // 3중 패턴 강제 (memory `mirror-pattern`, 8지점 ⑧):
  //   redevSubject 미입력 시 assetKind="right_to_move_in" → "right", 그 외 → "apt"
  // UI 통과 ↔ validate 차단 모순 방지.
  const subjectDefault = asset.assetKind === "right_to_move_in" ? "right" : "apt";
  const subject = asset.redevSubject || subjectDefault;
  const approvalLawBasis = asset.redevApprovalLawBasis || "urban_renovation_art_74";
  const originalAssetType = asset.redevOriginalAssetType || "housing";
  const settlementDirection = asset.redevSettlementDirection || "pay";

  // 지원 분기: subject="apt" (사례 44~48) + subject="right" (사례 36). 그 외 차단.
  if (subject !== "apt" && subject !== "right") {
    return `${label}: 양도 대상이 올바르지 않습니다. (지원: 완공 APT 양도 / 조합원입주권 양도)`;
  }

  // ── subject="right" 전용 검증 (사례 36) ──
  // 형식 가드 A: 객관적·입력 유효성 — 미충족 시 다음 단계 진입 차단.
  if (subject === "right") {
    // A-1: receive 분기 시 settlementAmount > 0 필수 (청산금 수령 없이 receive 선택 불가)
    if (
      asset.redevSettlementDirection === "receive" &&
      parseAmount(asset.redevSettlementAmount) <= 0
    ) {
      return `${label}: 청산금 수령 방향인 경우 청산금 수령액을 입력하세요. (시행령 §166①2호 가목)`;
    }
    // A-2: 비과세 자기선언(exemptionEligibleAtApproval=true) 시 form-전역 보유 상황과 일관성 검증은
    // UI 경고 카드(b)에서만 처리 (자기선언 우선 — validate 차단 X).
    // → 별도 API/validate 동기화 불필요 (자기선언 필드 = UI 단독 경고).
  }

  if (approvalLawBasis !== "urban_renovation_art_74") {
    return `${label}: 인가 법령 근거는 본 PR에서 "도정법 §74"만 지원합니다. (빈집소규모법 §29는 후속 PR)`;
  }
  if (originalAssetType !== "housing") {
    return `${label}: 출자 자산은 본 PR에서 "주택 출자"만 지원합니다. (토지 출자는 후속 PR)`;
  }
  // 사례 47 — 신축APT 양도 + 청산금 수령 동시 신고 지원 (receiveOnlyMode !== "yes" 허용).
  // 엔진 applySettlementExemption() 가 동시신고 분기를 처리. (project_case_47_redev_apt_with_settlement_receive)
  // receiveOnly=yes + direction !== "receive" 논리 모순 차단 (Zod refine과 동일).
  if (asset.redevReceiveOnlyMode === "yes" && settlementDirection !== "receive") {
    return `${label}: 청산금 수령분 단독 신고 모드는 청산금 방향이 "수령"이어야 합니다.`;
  }

  // ── 일정 ──
  if (!asset.redevApprovalDate) {
    return `${label}: 관리처분/사업시행계획 인가일을 입력하세요.`;
  }
  // 사례 48 — 승계조합원 모드 분기. 인가일 < 취득일 차단을 명시 토글로 우회.
  const isSuccessor = asset.redevIsSuccessorMember === "yes";
  if (!isSuccessor && asset.acquisitionDate && new Date(asset.redevApprovalDate) < new Date(asset.acquisitionDate)) {
    return `${label}: 인가일은 취득일 이후여야 합니다. 관리처분 인가 후 입주권을 승계 취득한 경우 "승계조합원 모드"를 ON 하세요. (사전-2019-법령해석재산-0649)`;
  }
  if (isSuccessor) {
    // 사례 48 — 승계조합원 신축APT 양도 — 본 PR 5건 가드.
    if (!asset.redevCompletionDate) {
      return `${label}: 승계조합원 모드 — 준공일(사용검사필증 교부일)을 입력하세요. (시행령 §162①4호)`;
    }
    const completionDate = new Date(asset.redevCompletionDate);
    if (completionDate < new Date(asset.redevApprovalDate)) {
      return `${label}: 준공일은 관리처분 인가일 이후여야 합니다.`;
    }
    // 양도일 ≥ 준공일 검증은 form-global transferDate 가 자산 단위 validate에 없어 route handler/엔진에서 보장.
    if (asset.acquisitionDate && new Date(asset.acquisitionDate) < new Date(asset.redevApprovalDate)) {
      return `${label}: 승계조합원 모드는 관리처분 인가일 이후 입주권 취득이어야 합니다. (인가 전 취득은 원조합원)`;
    }
    if (settlementDirection !== "pay" || parseAmount(asset.redevSettlementAmount) > 0) {
      // 본 PR settlement 미지원 — pay 0원만 허용 (default 통과).
      return `${label}: 승계조합원 모드에서 청산금 분기(납부·수령)는 본 PR에서 미지원입니다. (후속 PR)`;
    }
    if (asset.redevReceiveOnlyMode === "yes") {
      return `${label}: 승계조합원 모드에서 청산금 수령 단독 신고는 본 PR에서 미지원입니다. (후속 PR)`;
    }
    if (asset.useEstimatedAcquisition) {
      return `${label}: 승계조합원 모드에서 환산취득가 모드는 본 PR에서 미지원입니다. 상속·증여 평가액 또는 매매가를 직접 입력하세요. (후속 PR)`;
    }
    // P9 — 승계조합원은 정의상 상속·증여·매매 중 하나. 신축자가건축 등 비현실적 조합 차단.
    const validCauses = ["purchase", "gift", "inheritance"];
    if (asset.acquisitionCause && !validCauses.includes(asset.acquisitionCause)) {
      return `${label}: 승계조합원은 취득원인이 매매·증여·상속 중 하나여야 합니다. (자산 카드 "취득원인" 확인)`;
    }
  }

  // ── 금액 ──
  // 사례 48 — 승계조합원 모드 시 권리가액 필드 자체가 UI에서 숨겨지므로 검증 제외.
  // 취득가액은 자산 카드의 fixedAcquisitionPrice 또는 inheritance 자동 평가에서 도출 (자산 단계 validate가 보장).
  if (!isSuccessor && parseAmount(asset.redevRightsValue) <= 0) {
    return `${label}: 권리가액을 입력하세요. (시행령 §166④ 평가액 — 관리처분 가격이 없는 경우는 후속 PR)`;
  }
  if (parseAmount(asset.redevSettlementAmount) < 0) {
    return `${label}: 청산금 금액을 입력하세요. (없으면 0)`;
  }
  if (parseAmount(asset.redevPreApprovalExpenses) < 0) {
    return `${label}: 인가전 분 필요경비를 입력하세요. (없으면 0)`;
  }

  // ── 청산금 수령 시 settlementSaleDate 필수 ──
  if (asset.redevSettlementDirection === "receive" && !asset.redevSettlementSaleDate) {
    return `${label}: 청산금 수령 시 소유권이전 고시일의 다음날을 입력하세요. (NTS 집행기준 + 소법 §95④)`;
  }

  // ── 실가 모드 검증 — 인가전 분 종전 주택 취득가액(실거래가) 필수 ──
  // 환산 모드(useEstimatedAcquisition=true) 시 비활성. §166①1호 인가전 분 차감 기준.
  // 사례 48 승계조합원 모드는 §166 안분 우회 — 인가전 분 자체가 미산정이므로 본 검증 비활성.
  if (!asset.useEstimatedAcquisition && !isSuccessor) {
    if (parseAmount(asset.redevActualAcquisitionPrice) <= 0) {
      return `${label}: 실가 모드 — 인가전 분 종전 주택 취득가액(실거래가)을 입력하세요. 취득가액 확인 불가 시 환산취득가 토글을 ON으로 전환하세요. (§166①1호)`;
    }
  }

  // ── 환산 모드 검증 — D(관리처분 라목값) 필수 ──
  if (asset.useEstimatedAcquisition) {
    if (parseAmount(asset.redevManagementDisposalHousingPrice) <= 0) {
      return `${label}: 환산 모드 — D(관리처분 인가일 개별주택공시가격)를 입력하세요. (시행령 §166③ 분모)`;
    }
  }

  // ── §164⑦ 본문 발동 트리거 여부 ──
  const isPreDisclosureTriggered =
    !!asset.useEstimatedAcquisition &&
    !!asset.redevFirstDisclosureDate &&
    !!asset.acquisitionDate &&
    new Date(asset.acquisitionDate) < new Date(asset.redevFirstDisclosureDate);

  if (isPreDisclosureTriggered) {
    // 본문 발동 — PHD 패턴 7필드 모두 필수
    if (parseAmount(asset.redevFirstDisclosureHousingPrice) <= 0) {
      return `${label}: §164⑦ 본문 — A(최초공시 주택가격) 입력 필수입니다.`;
    }
    const area = parseFloat((asset.redevLandArea || "").replace(/,/g, ""));
    if (!isFinite(area) || area <= 0) {
      return `${label}: §164⑦ 본문 — 토지면적(㎡) 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevLandPricePerSqmAtAcq) <= 0) {
      return `${label}: §164⑦ 본문 — 취득시 토지 ㎡당 단가(공시지가 조회) 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevBuildingStdPriceAtAcq) < 0) {
      return `${label}: §164⑦ 본문 — 취득시 건물 기준시가 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevLandPricePerSqmAtFirst) <= 0) {
      return `${label}: §164⑦ 본문 — 최초공시 당시 토지 ㎡당 단가 입력 필수입니다.`;
    }
    if (parseAmount(asset.redevBuildingStdPriceAtFirst) < 0) {
      return `${label}: §164⑦ 본문 — 최초공시 당시 건물 기준시가 입력 필수입니다.`;
    }
  } else if (asset.useEstimatedAcquisition) {
    // 본문 미발동 — 취득당시 라목값 단일 필수
    if (parseAmount(asset.redevAcquisitionHousingPrice) <= 0) {
      return `${label}: 환산 모드 — 취득당시 개별주택공시가격을 입력하세요. (취득일 ≥ 최초공시일 또는 최초공시일 미입력)`;
    }
  }

  // ── 부분 입력 차단 — 최초공시일 없이 A·PHD 단가 입력 시 모순 안내 ──
  const hasFirstDisclosureDate = !!asset.redevFirstDisclosureDate;
  const hasA = parseAmount(asset.redevFirstDisclosureHousingPrice) > 0;
  const hasAnyPhd =
    parseAmount(asset.redevLandPricePerSqmAtAcq) > 0 ||
    parseAmount(asset.redevLandPricePerSqmAtFirst) > 0;
  if ((hasA || hasAnyPhd) && !hasFirstDisclosureDate) {
    return `${label}: A 또는 PHD 단가를 입력하셨다면 최초공시일도 입력하세요. (§164⑦ 본문 트리거)`;
  }

  // ── 사례 45 — 거주월수 분리 검증 (§155⑰ + 해석례 2020-386) ──
  // 가시성: UI 에서 1세대1주택 + householdHousingCount === 1 일 때만 노출.
  // 빈문자열은 허용 (legacy fallback). 음수만 reject.
  // 3중 패턴: UI hide ↔ API undefined ↔ validate undefined-허용 (모순 차단).
  const priorRaw = (asset.redevPriorHouseResidenceMonths || "").trim();
  const newRaw = (asset.redevNewHouseResidenceMonths || "").trim();
  if (priorRaw) {
    const v = parseInt(priorRaw.replace(/,/g, ""), 10);
    if (!isFinite(v) || v < 0) {
      return `${label}: 종전주택 거주개월수는 0 이상의 정수여야 합니다.`;
    }
  }
  if (newRaw) {
    const v = parseInt(newRaw.replace(/,/g, ""), 10);
    if (!isFinite(v) || v < 0) {
      return `${label}: 신축주택 거주개월수는 0 이상의 정수여야 합니다.`;
    }
  }

  // 거주기간(입주일·퇴거일) 자동 산정 입력 검증 — silent 채우기 금지 정책 준수.
  // 한쪽만 입력 시 차단. start > end 차단. 양쪽 모두 비어있으면 위 *ResidenceMonths 직접 입력 경로 허용.
  const periodChecks: Array<{ start: string; end: string; name: string }> = [
    {
      start: asset.redevPriorResidenceStartDate || "",
      end: asset.redevPriorResidenceEndDate || "",
      name: "종전주택",
    },
    {
      start: asset.redevNewResidenceStartDate || "",
      end: asset.redevNewResidenceEndDate || "",
      name: "신축주택",
    },
  ];
  for (const { start, end, name } of periodChecks) {
    const hasStart = !!start;
    const hasEnd = !!end;
    if (hasStart !== hasEnd) {
      return `${label}: ${name} 거주기간은 입주일과 퇴거일을 모두 입력하거나 모두 비워두세요.`;
    }
    if (hasStart && hasEnd) {
      const s = new Date(start);
      const e = new Date(end);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        return `${label}: ${name} 거주기간 날짜 형식이 올바르지 않습니다.`;
      }
      if (s.getTime() > e.getTime()) {
        return `${label}: ${name} 입주일이 퇴거일보다 이후일 수 없습니다.`;
      }
    }
  }

  return null;
}
