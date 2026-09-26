/**
 * 장기임대주택 거주주택 비과세 특례 검증 (⑧, 소령 §155⑳)
 *
 * `transfer-tax-validate-asset.ts`에서 분리 (800줄 정책). 자동 안분 fallback 금지 원칙 준수.
 * B 시나리오 취득/현양도 기준시가는 환산 모드 연동 시(isPhrpStdPriceLinked) 자산-수준
 * standardPriceAtAcq/Transfer가 단일 소스 — UI(⑤)·API 변환(④)과 동일 ternary (3중 패턴).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { canDeclareRentalHousingException } from "./rental-housing-exception-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isPhrpStdPriceLinked } from "./transfer-phrp-stdprice-link";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import {
  deriveEffectiveRegDate,
  deriveRentalArticle,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { isLifetimeLimitEra155_20 } from "@/lib/tax-engine/data/rental-155-20-era";

export function validateRentalHousingException(
  rh: AssetForm["rentalHousingException"] | undefined,
  asset: AssetForm,
  /**
   * 자산 인덱스 — **필수다**. 기본값 0을 주면 컴패니언 호출부가 인자를 빠뜨렸을 때
   * 조용히 통과해, 좁히려던 축이 그대로 열린다(P6-c-4).
   */
  assetIndex: number,
  label: string,
  formTransferDate?: string,
  /**
   * 🔴 **⑤와 같은 축이다** (P4-3a · 3중 패턴). 판정 메뉴는 §161 안분 입력을 화면에 띄우지
   *    않으므로(`RentalHousingSectionMode`), 여기서 그 값을 필수로 막으면 **화면에 없는 칸**
   *    때문에 판정이 영구 차단된다 — 이 파일이 `:26`에서 이미 한 번 겪은 dead-end다.
   *    ⑤가 감추는 것은 ⑧도 요구하지 않는다.
   */
  mode: "full" | "facts" = "full",
  /**
   * §155의3① — 거주주택이 상생임대주택이면 「제155조제20항제1호 … 거주기간의 제한을 받지 않는다」(OH-42).
   * 엔진(`checkEligibility`의 `winWinResidenceExempt`)과 같은 술어 `qualifiesWinWinRental` 결과를 호출부가
   * 넘긴다 — 여기서 24개월로 막으면 판정 메뉴·엔진은 비과세인데 계산기만 영구 차단된다.
   */
  winWinResidenceExempt = false,
): string | null {
  if (!rh?.applyException) return null;
  /**
   * 🔴 자산 종류 게이트 — ⑤와 **같은 술어**를 쓴다 (2026-09-07 UI 리뷰).
   *
   * 종전에는 여기에 술어가 없어, 주택에서 특례를 켠 뒤 종류를 토지·상가 등으로 바꾸면
   * 「임대주택 정보를 1호 이상 입력하세요」로 계산이 영구 차단됐다 — 그 입력 카드는
   * ⑤ 게이트(`AssetSectionExtras.tsx:28`) 밖이라 **화면에 없다**(dead-end).
   */
  /**
   * 🔴 **위치 축도 함께 본다** (P6-c-4). ④는 primary만 보내므로(엔진 입력이 top-level 단일
   *    객체다) 컴패니언에서 검증하면 **효과 없는 입력 때문에 계산이 차단된다** — 실측으로
   *    확인했다. ⑤가 같은 술어로 카드를 감춘다.
   */
  if (!canDeclareRentalHousingException(asset.assetKind, assetIndex)) return null;

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

    // 임대기간 interval 모드 — malformed(종료<시작)·구간 겹침만 차단(월수 부족은 엔진 RENTAL_PERIOD_SHORT 위임, direct 대칭)
    if (u.rentalInputMode === "interval") {
      const ps = u.rentalPeriods ?? [];
      for (let k = 0; k < ps.length; k++) {
        if (ps[k].start && ps[k].end && ps[k].end < ps[k].start) {
          return `${unitLabel}: 임대 구간 #${k + 1} 종료일은 시작일보다 이후여야 합니다.`;
        }
      }
      // 겹침 차단 — sumRentalMonths 단순합산 이중계산 방지 (residence 정책 동일)
      const complete = ps
        .map((p, idx) => ({ ...p, idx }))
        .filter((p) => p.start && p.end)
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      for (let k = 1; k < complete.length; k++) {
        if (complete[k - 1].end > complete[k].start) {
          return `${unitLabel}: 임대 구간 #${complete[k - 1].idx + 1}과 #${complete[k].idx + 1}이 겹칩니다. 겹치면 임대기간이 이중 계산되므로 분리·병합하세요.`;
        }
      }
    }

    // 도출 목 재사용(deriveRentalArticle) — UI 조건부 노출·엔진 판정과 3중 동기화
    const eff = deriveEffectiveRegDate({
      businessRegistrationDate: new Date(u.businessRegistrationDate),
      rentalRegistrationDate: new Date(u.rentalRegistrationDate),
    });
    const article = deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, eff);

    if (article === "나") {
      // 나목(기존사업자 매입) — 취득당시 기준시가 3억·국민주택규모·2호 (임대개시일 기준시가 미사용)
      if (!u.acquisitionOfficialPrice || parseAmount(u.acquisitionOfficialPrice) <= 0) {
        return `${unitLabel}: 취득 당시 기준시가를 입력하세요 (나목 3억 이하 요건).`;
      }
      if (!u.isNationalSizeHousing) {
        return `${unitLabel}: 나목은 국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하) 요건 충족 확인이 필요합니다.`;
      }
      if (!u.hasMinimum2Units) {
        return `${unitLabel}: 나목은 2호 이상 임대 요건 충족 확인이 필요합니다.`;
      }
    } else if (article === "라") {
      // 라목(미분양 매입) — 취득당시 기준시가 3억·최초분양계약일·5호·면적 (비수도권·임대개시일 기준시가 미사용)
      if (!u.acquisitionOfficialPrice || parseAmount(u.acquisitionOfficialPrice) <= 0) {
        return `${unitLabel}: 취득 당시 기준시가를 입력하세요 (라목 3억 이하 요건).`;
      }
      if (!u.firstSaleContractDate) {
        return `${unitLabel}: 라목은 최초 분양계약일(2008.6.11~2009.6.30)을 입력하세요.`;
      }
      if (!u.hasMinimum5UnitsInCity) {
        return `${unitLabel}: 라목은 같은 시·군 5호 이상 임대 요건 충족 확인이 필요합니다.`;
      }
      if (!u.rentalLandArea || parseDecimal(u.rentalLandArea) <= 0
          || !u.rentalTotalFloorArea || parseDecimal(u.rentalTotalFloorArea) <= 0) {
        return `${unitLabel}: 라목은 대지면적·연면적(㎡)을 입력하세요 (대지 298㎡·연면적 149㎡ 이하).`;
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
    }
    // §155⑳2호(양도일 현재 등록·임대 중·임대료 5% 이내)는 목을 가리지 않는다 — 나·라목 포함(OH-41).
    // 엔진 `checkEligibility`가 전 목에 요구하므로 ⑤도 전 목에 토글을 띄운다(3중 패턴).
    if (!u.requirementsConfirmed) {
      return `${unitLabel}: 기타 요건 자기확인이 필요합니다 (임대료 5% 상한, 등록 유지 등).`;
    }
    // ㉓1호 자진말소 1/2은 민특법 임대의무기간 기준이다 — 등록 유형 없이는 판정할 수 없다(OH-39).
    // ⑤는 말소 토글 ON + 가·다·라·마목일 때 이 선택지를 띄운다(엔진 `terminationEligibleArticle`과 같은 목).
    if (
      u.rentalAutoTermination &&
      (article === "가" || article === "다" || article === "라" || article === "마") &&
      !u.terminatedRegistrationType
    ) {
      return `${unitLabel}: 말소된 임대주택의 민간임대주택 등록 유형(단기 4년·장기일반 8년)을 선택하세요 (소령 §155㉓1호 임대의무기간 1/2 판정).`;
    }
  }

  /**
   * OH-40 — 2019.2.12 이후 취득 · 2025.2.27 이전 양도(부칙 경과조치 제외) 거주주택 양도(A)는 「생애 한 차례만
   * 거주주택을 최초로 양도하는 경우」로 한정된다. 판정 메뉴(`facts`)에서만 묻는다 — 계산기(`calc`)는 판정 사실
   * 칸이 없으므로(P6-c-2) 막지 않고, 엔진이 「판정 보류」 고지를 낸다(침묵 적용 아님).
   */
  if (
    mode === "facts" &&
    rh.scenario === "A" &&
    !rh.priorRentalExemptionHistory &&
    asset.acquisitionDate &&
    formTransferDate &&
    isLifetimeLimitEra155_20(
      new Date(asset.acquisitionDate),
      new Date(formTransferDate),
      rh.residenceTransitionUnderAddendum === true,
    )
  ) {
    return `${label}: 2019.2.12 이후 취득한 거주주택을 2025.2.27 이전에 양도하는 경우 — 장기임대주택을 보유한 채 거주주택을 양도해 이 특례를 적용받은 이력이 있는지 선택하세요 (소령 §155⑳ 괄호, 대통령령 제29523호 부칙 제7조①).`;
  }

  // B 시나리오 추가 검증 — §161① 안분 입력. 판정에는 쓰이지 않으므로 facts 모드에서는 묻지 않는다.
  if (rh.scenario === 'B' && mode === "full") {
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

  /**
   * OH-15 — B의 §155⑳1호 거주요건은 「사업자등록·임대사업자 등록 이후 거주기간」이다. ⑤가 ③ 거주 블록에
   * **모든 모드에서** 띄우므로 두 모드 모두 막는다(화면에 있는 칸). 미입력이면 엔진이 요건 불충족으로 본다.
   */
  if (rh.scenario === "B" && (rh.postRegistrationResidenceMonths ?? "") === "") {
    return `${label}: 임대→거주 전환 주택 시나리오 — 사업자등록·임대사업자 등록 이후 거주기간(개월)을 입력하세요 (소령 §155⑳1호).`;
  }

  // 거주주택 취득일 검증 (자산-수준)
  /**
   * ── 여기부터는 **거주주택 자신의 보유·거주 요건**이다 ────────────────────────────
   *
   * 🔴 **판정 메뉴(`facts`)에서는 막지 않는다.**
   *
   *   1. 이 요건들은 `checkEligibility`가 판정하는 바로 그 축이고, 판정 메뉴는 「요건 미달」을
   *      **답으로 보여주는** 화면이다. 차단하면 사용자는 왜 비과세가 아닌지 끝내 알 수 없다
   *      (`one-house-exemption-validate.ts` 헤더: 「막는 것은 판정이 **불가능한** 입력뿐」).
   *   2. 🔴 취득일은 판정 메뉴에서 **③ 단계 필드**다. ② 단계에서 요구하면 그 화면에 **없는 칸**
   *      때문에 「다음」이 영구 차단된다 — 이 파일이 `:26`에서 이미 한 번 겪은 dead-end다
   *      (E2E OHR-4가 실제로 그 상태를 잡아냈다).
   *
   * 계산기(`full`)는 종전대로 전부 차단한다 — 세액을 내려면 특례 적용 여부가 확정돼야 한다.
   */
  if (mode === "facts") return null;

  if (!asset.acquisitionDate) {
    return `${label}: 장기임대주택 특례 — 거주주택 취득일을 입력하세요.`;
  }

  // interval 모드는 residencePeriodMonthsAsset(raw)를 sync하지 않으므로 도출값 사용 —
  // 엔진 deriveResidencePeriodMonths와 동일 소스(interval 모드 거주기간 오차단 방지).
  const liveMonthsVal = deriveResidencePeriodMonths(asset, formTransferDate ?? "", "");

  if (rh.scenario === "B") {
    // OH-15 — 등록 이후 거주기간은 전체 거주기간의 일부다. 더 길면 두 입력 중 하나가 틀렸다.
    const postReg = parseInt(rh.postRegistrationResidenceMonths ?? "", 10) || 0;
    if (postReg > (liveMonthsVal || 0)) {
      return `${label}: 임대→거주 전환 주택 시나리오 — 등록 이후 거주기간(${postReg}개월)이 전체 거주기간(${liveMonthsVal || 0}개월)보다 깁니다. 확인 후 재입력하세요.`;
    }
    if (postReg < 24 && !winWinResidenceExempt) {
      return `${label}: 장기임대주택 특례 — 임대→거주 전환 주택은 사업자등록·임대사업자 등록 이후 거주기간이 2년(24개월) 이상이어야 합니다 (현재: ${postReg}개월, 소령 §155⑳1호).`;
    }
  } else if ((!liveMonthsVal || liveMonthsVal < 24) && !winWinResidenceExempt) {
    return `${label}: 장기임대주택 특례 — 거주주택 거주기간 2년(24개월) 이상이 필요합니다. "거주주택 거주기간"(개월 직접 또는 입주·퇴거 구간)을 24개월 이상으로 입력하세요. (현재: ${liveMonthsVal || 0}개월)`;
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
