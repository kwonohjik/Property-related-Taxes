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
import { isRedevPhdTriggered } from "@/lib/calc/redev-phd-trigger";
import { exemptionAtApprovalInScope } from "@/lib/calc/redev-field-scope";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

import { isHousingContribEstimatedAxes } from "@/lib/tax-engine/redevelopment-branch-gate";
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

  // ── §163⑨ 증여 취득 종전자산 (Phase 3 — block 방식) ──
  // 증여받은 종전자산은 증여일 현재 상증법 §60~66 평가액(증여 신고가액)을 취득당시 실지거래가액으로
  // 본다(§163⑨) → 취득가액 "확인 가능" → §166③ 환산·§163⑥ 개산공제 배제. 증여 신고가액은 항상
  // 확인 가능하므로 환산 자체가 법적 불필요 → 원조합원 증여 + 환산 조합을 차단하고 실가 모드(종전자산
  // 취득가액=증여 신고가액)를 강제한다. 실가 모드의 redevActualAcquisitionPrice 필수 검증(land 분기·
  // housing 분기 각각)이 증여 신고가액 입력을 보장한다. 승계조합원 증여+환산은 아래(승계 분기)에서 이미 차단.
  // 상속 재개발은 inheritedAcquisition payload(별도 값 채널)로 환산 모드에서도 graceful override가
  // 가능했으나(transfer-tax.ts:248), 증여는 그 채널이 없고 신고가액이 항상 확인 가능하므로 block이 정합.
  // pre-1985 증여는 §176의2④ 의제취득 영역 → 게이트 false(기존 경로 유지).
  //
  // ⚠️ land + right(입주권) 조합: #1(A)로 실가가 **pay·receive 모두** 개방됨
  //    (pay=computeRightPay §166①1호, receive=computeRightReceive §166①2호 — 둘 다 신고가액=actualAcquisitionPrice 사용).
  //    따라서 land+right+증여+환산은 pay·receive 무관하게 §163⑨ "실가로 전환" 안내가 유효(deadlock 없음).
  //    → land+right 예외 없이 gift+환산 전체를 아래 가드로 처리(환산 receive 자체의 미지원은 아래 :106 환산-gate가 담당).
  const isGift163_9 =
    asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01";
  if (
    isGift163_9 &&
    asset.redevIsSuccessorMember !== "yes" &&
    asset.useEstimatedAcquisition
  ) {
    return `${label}: 증여 취득 종전자산은 환산취득가를 지원하지 않습니다. 증여일 평가액(증여세 신고가액)이 취득가액이므로 ⑤ 「인가전 분 종전 부동산 취득가액」에서 "실지거래가액"을 선택하고 증여 신고가액을 입력하세요. (소득세법 시행령 §163⑨)`;
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

  /**
   * ⑧ 인가일 이후 철거 전 「사실상 주거용 사용」 종료일 — 토글 ON이면 필수.
   *
   * 자동 안분 fallback 금지: 종료일을 모르면 합산 기간을 지어낼 수 없다. 「양도일까지」로
   * 메우면 **철거 후 기간까지 세어 과대 산정**된다(사전-2019-법령해석재산-0739은 철거 전
   * 사실상 주거용 사용 기간만 합산한다).
   */
  //
  // ⚠️ **범위 안일 때만 차단한다** (2026-09-05 · Q20). 이 토글은 ③-c 카드 안에만 있으므로
  //    축이 바뀌어 카드가 사라지면 값을 지울 위젯이 없다 — 그 상태에서 차단하면 「채울 칸 없는
  //    영구 차단」이 된다(memory `feedback_ui_gate_removes_sole_input_path`).
  //    ⑤ onChange·마이그레이션이 `clearOutOfScopeRedevPatch`로 함께 비우지만, 이 가드는
  //    그 정리를 거치지 않고 조립된 폼(직접 fixture·구 저장분)까지 덮는 두 번째 안전망이다.
  //
  // 🟠 남는 좁은 케이스: 카드의 렌더 게이트에는 폼-전역 `isOneHouseSingle`도 걸려 있는데
  //    ⑧은 자산만 받아 그 값을 볼 수 없다. 1세대1주택 플래그를 끄면 카드가 사라진 채 이 가드가
  //    살아난다 — 새로고침 시 마이그레이션이 정리한다. 닫으려면 ⑧에 폼-전역 축을 넘겨야 한다.
  if (exemptionAtApprovalInScope(asset) && asset.redevPostApprovalHousingUse === "yes") {
    const end = asset.redevPostApprovalHousingUseEndDate;
    if (!end) {
      return `${label}: 인가일 이후 사실상 주거용 사용을 선택했으면 사용 종료일(철거일)을 입력하세요. (사전-2019-법령해석재산-0739)`;
    }
    if (asset.redevApprovalDate && end <= asset.redevApprovalDate) {
      return `${label}: 사실상 주거용 사용 종료일은 관리처분계획인가일 이후여야 합니다. 인가일까지의 기간은 이미 보유기간에 포함됩니다.`;
    }
    // 양도일은 폼-전역이라 이 자산-수준 validate에는 없다 — 상한은 인가일 조건으로만 건다.
  }

  if (approvalLawBasis !== "urban_renovation_art_74") {
    return `${label}: 인가 법령 근거는 본 PR에서 "도정법 §74"만 지원합니다. (빈집소규모법 §29는 후속 PR)`;
  }

  // ── originalAssetType="land" 분기 (사례 37·40) — housing 전용 로직 skip ──
  if (originalAssetType === "land") {
    /**
     * ✅ 2026-08-27 — land + **apt** + receive + 환산(사례 43) 차단을 해제했다.
     *
     * 🔴 종전 주석의 진단이 틀렸다: 「`runLandContribEstimated()`가 pay 방향만 가정」이라 적었으나
     *    **그 함수는 이 경로에 없다**. 라우팅(`redevelopment.ts:188-194`)이
     *    `subject === "right"` 전용이라 **완공APT는 `runOriginalMember`로 간다** —
     *    거기서 §166③ 환산(`redevelopment-valuation.ts:306`)과 방향별 산식이 정상 적용된다.
     *    인접 함수의 한계를 이 조합의 한계로 옮겨 적은 것이다.
     *
     * 실측(anchor `case-43-land-apt-estimated-receive.anchor.test.ts`): 환산취득가·나목·가목·
     * 청산금분 네 값이 조문과 일치하고 신고서 행 잔차도 0이다.
     *
     * ⚠️ **아래 `subject === "right"` 게이트는 판정이 다르다 — 함께 지우지 말 것.**
     *
     * ※ 사례 42는 2026-08-27 종결됐다(PR #1321). 종전 주석의 「anchor toBe 검증 보류
     *   (snapshot only)」는 **stale**이었다 — 실제로는 `toBe`로 값을 고정하고 있었다.
     */
    // land + right + 환산 + receive: 후속 PR (runLandContribEstimated가 settlementPaid로 pay만 가정 —
    // §166②2호·§166①2호 수령 산식 미구현). 실가 receive는 아래 #1(A)로 개방.
    if (subject === "right" && settlementDirection !== "pay" && asset.useEstimatedAcquisition) {
      return `${label}: 토지 출자 + 입주권 양도 + 청산금 수령 + 환산취득가 조합은 후속 PR에서 지원됩니다. 취득가액을 확인할 수 있으면 ⑤ 「인가전 분 종전 부동산 취득가액」에서 "실지거래가액"을 선택하세요.`;
    }
    // land + right + 실가 (pay·receive 모두): #1(A) 지원 — runOriginalMember→computeRightPay(§166①1호, pay)/
    // computeRightReceive(§166①2호, receive)가 종전자산 actualAcquisitionPrice=신고가액 사용(환산 §166③ 아님).
    // 아래 실가 취득가액(redevActualAcquisitionPrice) 필수 검증으로 신고가액 입력 보장. subject="right"는
    // settlementSaleDate 불필요(신축 완공 전 권리 양도 — 잔금일이 양도일).

    // ── 청산금 수령 시 settlementSaleDate 필수 (subject="apt"만) ──
    // 사례 42 land+apt+receive (실가) — runOriginalMember 경로에서 settlement 기산일에 사용.
    // housing 분기와 동일 검증을 land 분기에도 적용 (line 159의 공통 가드는 land early return으로 도달 불가).
    if (subject === "apt"
        && asset.redevSettlementDirection === "receive"
        && !asset.redevSettlementSaleDate) {
      return `${label}: 청산금 수령 시 소유권이전 고시일의 다음날을 입력하세요. (NTS 집행기준 + 소법 §95④)`;
    }

    // 실가 모드 (사례 42 land+apt+receive 등) — 종전 자산 취득가액 필수.
    // 환산 모드는 아래 §166③ 분자·분모 검증 경로.
    if (!asset.useEstimatedAcquisition) {
      if (parseAmount(asset.redevActualAcquisitionPrice) <= 0) {
        return `${label}: 실가 모드 — 종전 자산 취득가액(실거래가)을 입력하세요. 취득가액 확인 불가 시 환산취득가 토글을 ON으로 전환하세요. (§166①1호)`;
      }
    }

    // 환산 모드일 때만 §166③ 분자·분모 검증 (사례 37 right+pay+환산)
    // 사례 40 (apt+pay+실가)은 자산-수준 acquisitionPrice 사용 — 별도 §166③ 입력 불필요
    if (asset.useEstimatedAcquisition) {
      // §166③ 2필드 필수 — 3중 패턴(UI/API/validate): LandPriceLookupField(단가×면적) 우선 > legacy 총액 fallback.
      const landArea = parseDecimal(asset.redevLandArea) || 0;
      const pricePerSqmAcq = parseAmount(asset.redevLandPricePerSqmAtAcq) || 0;
      const pricePerSqmApproval = parseAmount(asset.redevLandPricePerSqmAtApproval) || 0;
      const acqOk = (pricePerSqmAcq > 0 && landArea > 0) || parseAmount(asset.redevLandStdPriceAtAcq) > 0;
      if (!acqOk) {
        if (landArea <= 0) {
          return `${label}: 토지면적(㎡)을 입력하세요. (§166③ 분자 산정 필수)`;
        }
        return `${label}: 취득당시 토지 ㎡당 단가를 입력하세요. (§166③ 분자 — Vworld 조회 또는 직접 입력)`;
      }
      const approvalOk = (pricePerSqmApproval > 0 && landArea > 0) || parseAmount(asset.redevLandStdPriceAtApproval) > 0;
      if (!approvalOk) {
        return `${label}: 관리처분 직전 토지 ㎡당 단가를 입력하세요. (§166③ 분모 — §99①1호 공시기준일 기준)`;
      }
    }
    // land 검증 통과 — housing 전용 로직(하우스 라목값, PHD, 거주월수 등) skip
    return null;
  }

  if (originalAssetType !== "housing") {
    return `${label}: 출자 자산 종류가 올바르지 않습니다. (housing 또는 land만 지원)`;
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
    /**
     * 🔴 2026-08-26 정정(P2-05): 안내 문구가 **자산 종류에 따라 갈린다**.
     *    ②-a 「승계조합원 모드」(`redevIsSuccessorMember`) 카드는 `RedevelopmentBlock`이
     *    `{!isRightSubject && …}`로 **입주권 화면에서 제거**한다(#1245 — 완공APT 전용으로 분리).
     *    입주권의 승계 여부를 받는 실제 컨트롤은 ① 기본정보의 「조합원 유형」
     *    (`isSuccessorRightToMoveIn`)으로 **다른 필드**다. 종전 문구는 차단된 사용자에게
     *    그 화면에 존재하지 않는 이름의 토글을 찾게 했다.
     *    반대 방향 문구는 `validateSuccessorRightAsset`이 이미 쓰고 있다(짝을 맞춘다).
     */
    const remedy =
      asset.assetKind === "right_to_move_in"
        ? `① 기본정보의 「조합원 유형」을 "승계조합원"으로 바꾸세요.`
        : `②-a "승계조합원 모드"를 ON 하세요.`;
    return `${label}: 인가일은 취득일 이후여야 합니다. 관리처분 인가 후 입주권을 승계 취득한 경우 ${remedy} (사전-2019-법령해석재산-0649)`;
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

  /**
   * ── 승계조합원 취득가액 필수 (2026-08-25 신설 — E2-01) ──────────────────────
   *
   * 🔴 아래 주석은 「취득가액은 자산 카드의 `fixedAcquisitionPrice`에서 도출 (**자산 단계 validate가
   *    보장**)」이라고 적고 있었지만 **그 보장이 실재하지 않았다.**
   *    `validateAssetAcquisition`은 재개발 분기에서 이 함수로 위임한 뒤 곧바로 `return null`하고
   *    (`transfer-tax-validate-asset.ts:210-215`), 이 함수의 실가 취득가액 검증은 `&& !isSuccessor`로
   *    승계를 **제외**한다. 결과적으로 「승계조합원 + 매매 + 취득가액 공란」이 두 관문을 모두 통과해
   *    엔진에 `acquisitionPrice = 0`이 도달했다(실측 산출세액 315,000,000원 과대).
   *
   * 취득원인별로 취득가액이 나오는 경로가 다르다:
   *   · **매매(purchase)** — 자산 카드 「취득가액」(`fixedAcquisitionPrice`)이 유일한 경로다.
   *     같은 배치에서 `CompanionAcqPurchaseBlock`의 게이트를 열어 이 칸을 실제로 렌더한다
   *     (종전에는 칸 자체가 없어 **차단만 하면 dead-end**가 됐다).
   *   · **증여(gift)** — `CompanionAcqGiftBlock`이 별도 입력 경로를 갖는다.
   *   · **상속(inheritance)** — STEP 0.45 `inheritedAcquisition` 자동 평가가 취득가액을 만든다.
   * ⇒ 지금 뚫려 있던 것은 **매매**뿐이므로 그 경로만 요구한다(과잉 차단 금지).
   *
   * 근거: 「소득세법」 §97①1호 가목(실지거래가액) · 시행령 §162①4호(승계조합원 신축주택 취득시기).
   */
  if (
    isSuccessor &&
    asset.acquisitionCause === "purchase" &&
    parseAmount(asset.fixedAcquisitionPrice) <= 0
  ) {
    return `${label}: 승계조합원 — 입주권을 매매로 승계취득한 취득가액(실지거래가액)을 입력하세요. (소득세법 §97①1호 가목)`;
  }

  // ── 금액 ──
  // 사례 48 — 승계조합원 모드 시 권리가액 필드 자체가 UI에서 숨겨지므로 검증 제외.
  // 취득가액은 자산 카드의 fixedAcquisitionPrice 또는 inheritance 자동 평가에서 도출.
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
  // subject="apt"(완공 APT 양도, 사례 46)에서만 적용. 소유권이전 고시일은 신축APT 등기 절차의 일부.
  // subject="right"(입주권 양도, 사례 36 R-5)는 신축 완공 전 권리 양도 — 잔금일(saleDate)이 양도일이며 settlementSaleDate 불필요.
  if (subject === "apt"
      && asset.redevSettlementDirection === "receive"
      && !asset.redevSettlementSaleDate) {
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

  // ── 환산 모드 검증 ──
  // 사례 39 — 단독주택 출자 §166③ 2-point: housing + right + receive + useEstimated 조합 시 전용 검증
  // 3중 패턴(UI/API/validate) 동기화 (memory `feedback_validation_sync_8th_point`)
  // 네 지점(⑤ UI · ⑧ validate · ⑫ Zod · 엔진 dispatch) 공용 leaf — 복제 금지 (E1-04).
  const isHousingRightReceiveEstimated = isHousingContribEstimatedAxes({
    originalAssetType,
    subject,
    settlementDirection,
    useEstimatedAcquisition: asset.useEstimatedAcquisition,
  });

  if (isHousingRightReceiveEstimated) {
    // §166③ 분자·분모 모두 필수 (미입력 → 자동 안분 fallback 금지)
    if (parseAmount(asset.redevHousingStdPriceAtAcq) <= 0) {
      return `${label}: 단독주택 출자 환산취득가 — 취득당시 개별주택가격을 입력하세요. (§166③ 분자)`;
    }
    if (parseAmount(asset.redevHousingStdPriceAtApproval) <= 0) {
      return `${label}: 단독주택 출자 환산취득가 — 인가당시 개별주택가격을 입력하세요. (§166③ 분모)`;
    }
    // housing+right+receive+estimated 분기는 일반 D(managementDisposalHousingPrice) 검증 skip
    // (§166③ 분모 구조가 다름 — §166③ 산식 별도 적용)
  } else if (asset.useEstimatedAcquisition) {
    // 일반 환산 모드 — D(관리처분 라목값) 필수
    if (parseAmount(asset.redevManagementDisposalHousingPrice) <= 0) {
      return `${label}: 환산 모드 — D(관리처분 인가일 개별주택공시가격)를 입력하세요. (시행령 §166③ 분모)`;
    }
  }

  // ── §164⑦ 본문 발동 트리거 여부 ──
  // housing+right+receive+estimated 분기는 §164⑤ PHD 2-point 별도 산식 → §164⑦ 검증 skip.
  //
  // 🔑 날짜·모드 판정은 `isRedevPhdTriggered` **단일 소스**다(2026-08-24 B-3). 종전에는 여기서
  //    직접 비교해 **의제취득일 보정이 빠져 있었고**, UI·결과탭 게이트와 판정이 갈릴 수 있었다.
  //    이 분기 배제(`isHousingRightReceiveEstimated`)만 validate 고유 조건으로 남긴다 —
  //    그 플래그는 이 함수 안에서 계산되므로 술어 인자로 올리지 않는다.
  const isPreDisclosureTriggered =
    !isHousingRightReceiveEstimated && isRedevPhdTriggered(asset);

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
  } else if (asset.useEstimatedAcquisition && !isHousingRightReceiveEstimated) {
    // 본문 미발동 — 취득당시 라목값 단일 필수 (housing+right+receive+estimated 분기 제외)
    if (parseAmount(asset.redevAcquisitionHousingPrice) <= 0) {
      return `${label}: 환산 모드 — 취득당시 개별주택공시가격을 입력하세요. (취득일 ≥ 최초공시일 또는 최초공시일 미입력)`;
    }
  }

  // ── 부분 입력 차단 — 최초공시일 없이 A·PHD 단가 입력 시 모순 안내 ──
  const hasFirstDisclosureDate = !!asset.redevFirstDisclosureDate;
  const hasA = parseAmount(asset.redevFirstDisclosureHousingPrice) > 0;
  /**
   * 🔴 2026-08-26 정정(P2-06): 종전에는 `redevLandPricePerSqmAtAcq`도 신호로 봤다. 그 필드는
   *    **두 조문 축이 공유**한다 — 토지 출자 §166③ 분자 단가(`LandContribValuationContent`)와
   *    주택 출자 §164⑦ Sum_A. 토지 출자로 채운 뒤 ② 출자 자산을 「주택」으로 되돌리면
   *    「최초공시일도 입력하세요」로 막히는데, 그 화면에는 최초공시일 칸도 단가를 지울 칸도 없다
   *    (`RedevelopmentValuationSection`이 환산 모드에서만 렌더된다) — 영구 dead-end였다.
   *
   *    판별 기준은 `sec164-required-fields.ts`의 `shared?: boolean`과 같다 —
   *    「입력 위젯이 §164 섹션 **밖에도** 있는가」. 있으면 opt-in 신호로 보지 않는다.
   *    `redevLandPricePerSqmAtFirst`(최초공시 당시 단가)는 §164⑦ 전용이라 신호로 남긴다.
   *
   *    ⚠️ 필수입력 자체가 약해지는 것은 아니다 — 본문이 발동하면 위 `isPreDisclosureTriggered`
   *       블록이 이 단가를 여전히 필수로 요구한다.
   */
  const hasAnyPhd = parseAmount(asset.redevLandPricePerSqmAtFirst) > 0;
  if ((hasA || hasAnyPhd) && !hasFirstDisclosureDate) {
    return `${label}: A 또는 PHD 단가를 입력하셨다면 최초공시일도 입력하세요. (§164⑦ 본문 트리거)`;
  }

  // ── 사례 45 — 거주월수 분리 검증 (§154⑧1호 + 해석례 2020-386) ──
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
