/**
 * 증여로 보는 경우 — Phase 3 유형(추정·의제 §45·§45의2 · 기타이익 §41의2·§41의3·§42·§42의2·§42의3 ·
 * 법인 §45의3·§45의5) 입력 검증(⑧). `gift-deemed-validate.ts`에서 분리(800줄 정책) — Zod의
 * `lib/validators/gift-deemed-input-phase3.ts`와 같은 경계다. 공통 가드(증여일·유형)와 §43² 선행 표 검증은
 * 본 파일(`validateDeemedInput`)에 남는다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { resolveScEraExclusion } from "@/lib/tax-engine/gift-deemed/specific-corp-era";
import { resolveRcEraExclusion } from "@/lib/tax-engine/gift-deemed/related-corp-era";
import type { DeemedFormState, EdShareholderRow } from "@/components/calc/deemed-gift/shared";
import { validatePriorSameClauseRows } from "./gift-deemed-43-2";

/**
 * 영 §34의5④2호가목 — 「산출세액(「법인세법」 §55의2에 따른 토지등 양도소득에 대한 법인세액은
 * 제외한다)」. §55의2분은 §55① 정의상 산출세액에 **포함**돼 들어오므로 그보다 클 수 없다.
 * 자동 보정(clamp)은 하지 않는다 — 어느 쪽 칸이 틀렸는지 앱이 알 수 없다(자동 fallback 금지).
 */
function validateScLandTransferTax(form: DeemedFormState): string | null {
  const assessed = parseAmount(form.scCorpTaxAssessed);
  const land = parseAmount(form.scCorpTaxLandTransfer);
  if (land < 0) return "토지등 양도소득에 대한 법인세액은 0 이상으로 입력하세요";
  if (land > assessed)
    return "토지등 양도소득에 대한 법인세액이 법인세 산출세액보다 큽니다 — 산출세액은 그 세액을 포함한 금액입니다 (「법인세법」 §55①)";
  return null;
}

function validateScPriorTransactions(form: DeemedFormState): string | null {
  return validatePriorSameClauseRows(form.scPriorTransactions, form.giftDate, { item: "선행거래", date: "거래일" });
}

/** Phase 3 유형이면 그 유형의 오류, 아니면 null. `validateDeemedInput`의 switch가 이 유형들을 여기로 넘긴다 */
export function validateDeemedPhase3(form: DeemedFormState): string | null {
  switch (form.type) {
    case "acquisition_fund_presumption":
      if (parseAmount(form.afAcquisitionValue) <= 0)
        return form.afSubType === "debt_repayment" ? "채무상환금액을 입력하세요" : "취득재산가액을 입력하세요";
      break;
    case "nominee_trust":
      if (form.ntValuationMode === "per_share") {
        if (parseAmount(form.ntPerSharePrice) <= 0) return "1주당 평가액(명의개서일 §63)을 입력하세요";
        if (parseAmount(form.ntNewShares) <= 0) return "명의신탁 신주 수를 입력하세요";
      } else if (parseAmount(form.ntPropertyValue) <= 0) {
        return "명의신탁 재산 가액을 입력하세요";
      }
      break;
    case "excess_dividend": {
      // ⑧ F1: 주주 목록 필수 — 엔진 요구사항 동기화 (API fallback: edShareholders ?? [])
      const edRows: EdShareholderRow[] = form.edShareholders ?? [];
      if (edRows.length === 0) return "주주를 1명 이상 추가하세요";

      // ⑧ F2: 최대주주등 최소 1명
      const hasMajor = edRows.some((r) => r.role === "major_shareholder");
      if (!hasMajor) return "최대주주등(배당 포기·과소수령) 주주를 1명 이상 지정하세요";

      // ⑧ F3: 특수관계인(수증자) 최소 1명
      const hasRelated = edRows.some((r) => r.role === "related_party");
      if (!hasRelated) return "초과배당을 수령한 특수관계인 주주를 1명 이상 지정하세요";

      // ⑧ F4: 각 행 — 지분율 > 0, 실수령 배당금 >= 0
      for (const [i, row] of edRows.entries()) {
        if (parseDecimal(row.ownershipRatioPctStr) <= 0)
          return `${i + 1}번째 주주의 지분율을 입력하세요 (0 초과)`;
        if (parseAmount(row.actualDividendStr) < 0)
          return `${i + 1}번째 주주의 실수령 배당금은 0 이상이어야 합니다`;
      }

      // ⑧ F5: 소득세 모드는 INITIAL "undetermined"로 store·display·api·validate 4자 일치
      // (feedback_store_default_vs_ui_display_fallback — display fallback과 모순되는 명시 선택 강제는 금지)

      // ⑧ F6: 모드별 조건부 필드
      if (form.edIncomeTaxMode === "separate" && parseAmount(form.edSeparateTaxAmount) < 0)
        return "분리과세 소득세액은 0 이상이어야 합니다";
      if (form.edIncomeTaxMode === "comprehensive" && parseAmount(form.edComprehensiveTaxBase) <= 0)
        return "종합과세 과세표준을 입력하세요 (양수여야 합니다)";

      // ⑧ F7: 정산 모드 — 실제 소득세 필수 (0은 유효)
      if (form.edSettlementMode && form.edActualIncomeTax === "")
        return "정산용 실제 소득세액을 입력하세요 (납부 0원이면 0 입력)";
      // 🔴 IG-019: ④가 `giftTaxContext`를 `edDonorRelationship`이 있을 때만 만들고, 엔진은
      // `if (input.giftTaxContext)` 안에서만 정산을 돌린다. 관계를 안 고르면 정산 결과가
      // 화면에 하나도 나오지 않는데, 안내문은 「정산 결과는 계산 후 결과 화면에 표시됩니다」라고
      // 단언한다 ⇒ 정산을 쓰려면 §3 관계 선택은 「선택」이 아니라 필수다.
      if (form.edSettlementMode && !form.edDonorRelationship)
        return "정산 계산에는 증여자와의 관계 선택이 필요합니다";

      break;
    }
    case "listing_gain":
      if (parseAmount(form.lgSettlementPrice) <= 0) return "정산기준일 1주당 평가가액을 입력하세요";
      if (parseAmount(form.lgShares) <= 0) return "증여·유상취득 주식수를 입력하세요";
      if (form.lgCorpGrowthMode === "auto") {
        if (parseAmount(form.lgMonthsBusinessStart) <= 0)
          return "사업연도개시일~상장전일 월수를 입력하세요";
        if (parseAmount(form.lgMonthsAcqToSettlement) <= 0)
          return "증여·취득일~정산기준일 월수를 입력하세요";
      }
      break;
    case "property_service_use":
      if (parseAmount(form.psuMarketValue) <= 0) return form.psuSubType === "free_use" ? "시가 상당액을 입력하세요" : "시가를 입력하세요";
      break;
    case "org_change":
      if (parseAmount(form.ocBaseValue) <= 0) return "변동 전 해당 재산가액을 입력하세요";
      if (form.ocSubType === "share_change" && parseAmount(form.ocPostPerShare) <= 0) return "변동 후 1주당 가액을 입력하세요";
      break;
    case "value_increase":
      if (parseAmount(form.viCurrentValue) <= 0) return "사유발생일 현재 재산가액을 입력하세요";
      break;
    case "specific_corp": {
      // 행위시법 — 이 화면이 계산할 수 없는 시점이면 여기서 막는다(엔진도 같은 술어로 막지만,
      //   ⑧이 먼저 잡아야 사용자가 「계산은 됐는데 0원」이 아니라 이유를 바로 본다).
      const eraErr = resolveScEraExclusion(form.giftDate || undefined);
      if (eraErr) return eraErr;
      // 법 §45의5①은 거래상대방을 과세요건으로 못박는다 — 미선택을 통과시키면 제3자와의 거래도 과세된다
      if (form.scCounterparty === "") return "거래상대방을 선택하세요 (§45의5①)";
      const priorErr = validateScPriorTransactions(form);
      if (priorErr) return priorErr;
      const isPriceType =
        form.scTransactionType === "low_price" || form.scTransactionType === "high_price";
      if (isPriceType) {
        // 2·3호는 이익이 시가−대가로 «도출»된다(영 §34의5④1호다목) — 거래이익 칸을 쓰지 않는다
        if (parseAmount(form.scMarketValue) <= 0) return "시가를 입력하세요 (상증령 §34의5⑧)";
        if (parseAmount(form.scConsideration) <= 0) return "대가를 입력하세요";
      } else if (parseAmount(form.scTransactionBenefit) <= 0) {
        return "거래이익을 입력하세요";
      }
      // ⓐ §45의5① 특정법인 해당성 신고값 — 선택 입력이지만 넣었다면 비율 범위를 지킨다.
      // (미입력은 fallback이 아니라 «간접 0% / 판정 보류»라는 의미가 있는 상태다 — 엔진 JSDoc 참조)
      if (form.scGroupRatioPct.trim() !== "") {
        const groupPct = parseDecimal(form.scGroupRatioPct);
        if (groupPct <= 0 || groupPct > 100)
          return "지배주주등 합계 주식보유비율은 0 초과 100 이하로 입력하세요";
      }
      const isRoster = form.scMode === "roster";
      const isAuto = form.scCorporateTaxMode === "auto";
      if (isRoster) {
        // roster+direct: 주주 명단 필수 + 각 행 name·shares + 발행주식 총수
        if (!form.scShareholders || form.scShareholders.length === 0)
          return "주주 명단을 입력하세요 (+ 행 추가)";
        for (let i = 0; i < form.scShareholders.length; i++) {
          const sh = form.scShareholders[i];
          if (!sh.name.trim()) return `주주 ${i + 1}의 성명을 입력하세요`;
          if (parseAmount(sh.shares) <= 0) return `주주 ${i + 1}의 주식수를 입력하세요`;
        }
        if (parseAmount(form.scTotalShares) <= 0) return "발행주식 총수를 입력하세요";
        // 🔴 SC-H: 법 §45의5①은 「… **주식보유비율을 곱하여** 계산한 금액」이다. 보유주식수가
        //    발행주식총수를 넘는 것은 법이 상정하지 않는 사실관계이고, 계산기가 그것을 조용히
        //    계산하면 증여재산가액이 **특정법인의 이익을 넘는다**(실측: 총수 50,000·갑 60,000
        //    → 1,200,000,000 = 지분율 120% / 갑 40,000+을 40,000 → Σ 1,600,000,000 = 이익의 160%).
        //    §45의3이 R-4(지분합 100%)·R-7(매출합=총매출)로 이미 하는 교차검증과 비대칭이었다.
        const scTotal = parseAmount(form.scTotalShares);
        for (let i = 0; i < form.scShareholders.length; i++) {
          if (parseAmount(form.scShareholders[i].shares) > scTotal)
            return `주주 ${i + 1}의 주식수가 발행주식 총수(${scTotal.toLocaleString()}주)를 초과합니다`;
        }
        const scSum = form.scShareholders.reduce((a, sh) => a + parseAmount(sh.shares), 0);
        if (scSum > scTotal)
          return `주주 주식수 합계(${scSum.toLocaleString()}주)가 발행주식 총수(${scTotal.toLocaleString()}주)를 초과합니다`;
        // 법 §45의5①은 「거래한 날을 증여일로 하여」라고 거래 단위로 증여를 본다 ⇒ 증여자가 2인이면
        // 그것은 **별개의 두 거래**다. 합산해 한 번에 넣으면 두 행이 서로 donor_self로 상쇄돼 0원이 된다.
        if (form.scShareholders.filter((sh) => sh.isDonor).length > 1)
          return "증여자 본인은 1명만 지정할 수 있습니다 — 증여자가 2인 이상이면 거래별로 나누어 계산하세요 (§45의5①)";
        // 간접출자관계 — 고아 참조를 여기서 막는다(새 입력축이라 §45의3의 RC-H 결함을 물려받지 않는다)
        const shIds = new Set(form.scShareholders.map((sh) => sh.id));
        for (let i = 0; i < (form.scIntermediaryCorps ?? []).length; i++) {
          const c = form.scIntermediaryCorps![i];
          if (!c.corpShareholderId) return `간접출자관계 ${i + 1}의 경유 법인을 선택하세요`;
          if (!shIds.has(c.corpShareholderId))
            return `간접출자관계 ${i + 1}의 경유 법인이 주주 명단에 없습니다`;
          if (!form.scShareholders.find((sh) => sh.id === c.corpShareholderId)?.isCorporate)
            return `간접출자관계 ${i + 1}의 경유 법인은 주주 명단에서 「법인」으로 표시해야 합니다`;
          if (c.owners.length === 0) return `간접출자관계 ${i + 1}의 개인 소유주를 추가하세요`;
          for (let j = 0; j < c.owners.length; j++) {
            const o = c.owners[j];
            if (!o.individualId) return `간접출자관계 ${i + 1}의 소유주 ${j + 1}을 선택하세요`;
            if (!shIds.has(o.individualId))
              return `간접출자관계 ${i + 1}의 소유주 ${j + 1}이 주주 명단에 없습니다`;
            const pct = parseDecimal(o.ratioPctStr);
            if (pct <= 0 || pct > 100)
              return `간접출자관계 ${i + 1}의 소유주 ${j + 1} 지분율은 0 초과 100 이하로 입력하세요`;
          }
        }
        if (isAuto) {
          // roster+auto: 산출세액·소득금액 필수 (자동안분 fallback 금지, 0 차단)
          if (parseAmount(form.scCorpTaxAssessed) <= 0) return "법인세 산출세액을 입력하세요";
          if (parseAmount(form.scCorpIncome) <= 0) return "각사업연도소득금액을 입력하세요 (분모 0 불가)";
          const landErr = validateScLandTransferTax(form);
          if (landErr) return landErr;
        }
        // roster+direct: corporateTax 0 허용 (이월결손금 0)
      } else {
        // single 경로
        if (isAuto) {
          if (parseAmount(form.scCorpTaxAssessed) <= 0) return "법인세 산출세액을 입력하세요";
          if (parseAmount(form.scCorpIncome) <= 0) return "각사업연도소득금액을 입력하세요 (분모 0 불가)";
          const landErr = validateScLandTransferTax(form);
          if (landErr) return landErr;
        }
        // 🔴 SC-N: 종전 주석은 「ratio 기존(0 허용)」이었다. 그런데 §45의5①의 증여의제이익은
        //    「… 주식보유비율을 **곱하여** 계산한 금액」이라 비율 0이면 결과가 항상 0원이다.
        //    그 0원에 엔진이 붙이는 사유는 「증여의제이익이 1억원 미만 (§34의5⑤)」 — 산술적으로는
        //    참이지만 **진짜 원인(지분율 미입력)을 가린다**. 사용자는 비과세로 오인한다.
        //    ⑫는 `numer` nonnegative라 0을 통과시키므로 여기가 유일한 관문이다.
        if (parseDecimal(form.scRatioPct) <= 0)
          return "지배주주등의 주식보유비율을 입력하세요 (§45의5① — 비율이 0이면 증여의제이익도 0입니다)";
        if (parseDecimal(form.scRatioPct) > 100)
          return "지배주주등의 주식보유비율은 100% 이하로 입력하세요";
      }
      break;
    }
    case "related_corp": {
      // R-0 행위시법 — §45의3③상 증여시기는 「수혜법인의 사업연도 종료일」이다.
      //   구법(~2017-12-31)은 계산식이 단일식이라 현행 3분기 산식으로 계산하면 틀린다.
      //   엔진도 같은 술어로 막지만(안전망), 사용자에게는 여기서 먼저 알린다.
      const eraBlock = resolveRcEraExclusion(form.giftDate);
      if (eraBlock) return eraBlock;
      // R-1 기업규모
      if (!form.rcEnterpriseSize) return "기업규모를 선택하세요";
      // R-2 재무
      if (parseAmount(form.rcTotalSalesStr) <= 0) return "총 매출액을 입력하세요";
      if (parseAmount(form.rcTaxableIncomeStr) <= 0) return "각 사업연도 소득금액을 입력하세요";
      // 🔴 RC-F: 이 두 필드는 **0·음수가 적법한 값**이라 `<= 0` 형태로는 막을 수 없고,
      //    `parseAmount("") === 0`이라 종전 검사는 **공란을 그대로 통과**시켰다.
      //    ④는 0을 보내고 ⑫는 `z.number().int()`라 「명시 0」과 「미입력」이 wire 상
      //    구분되지 않는다 — **원문자열을 보는 ⑧만이 구분 가능한 지점**이다.
      //    같은 파일 `bargain_transfer`의 `if (!form.bargPrice?.trim())`가 선례다.
      //    실측: 세무조정후영업손익 공란 → 증여의제이익 0원(사유 없음) /
      //         법인세 순세액 공란 → 43,200,000이 나올 자리에 50,000,000(+6,800,000 과다).
      if (form.rcPreTaxAdjOperatingIncomeStr.trim() === "")
        return "세무조정 후 영업손익을 입력하세요 (영업손실이면 음수, 0이면 0)";
      if (form.rcCorporateTaxNetStr.trim() === "")
        return "법인세 순세액을 입력하세요 (이월결손금 등으로 없으면 0)";
      if (parseAmount(form.rcCorporateTaxNetStr) < 0) return "법인세 순세액은 0 이상이어야 합니다";
      // R-3 주주 roster 빈행 차단
      if (form.rcShareholders.length < 2) return "주주를 2명 이상 입력하세요";
      for (const [i, row] of form.rcShareholders.entries()) {
        const n = i + 1;
        if (!row.name.trim()) return `${n}번째 주주 이름을 입력하세요`;
        if (parseDecimal(row.directRatioPctStr) < 0) return `${n}번째 주주의 직접지분율은 0 이상이어야 합니다`;
        if (!row.relation) return `${n}번째 주주의 관계를 선택하세요`;
      }
      // R-4 직접지분 합계 100% (cross-field — 톨러런스 0.01%, parseDecimal round 없음)
      const totalDirectPct = form.rcShareholders.reduce((s, r) => s + parseDecimal(r.directRatioPctStr), 0);
      if (Math.abs(totalDirectPct - 100) > 0.01)
        return `주주 직접지분 합계가 100%가 아닙니다 (현재 ${totalDirectPct.toFixed(2)}%)`;
      // R-5 간접출자법인 roster 빈행 차단 — 섹션 3의 «렌더 게이트와 같은 술어»에 태운다.
      // related-corp-form.tsx:186이 `corpOptions.length > 0`(= 법인주주 존재)일 때만 섹션을 그리므로,
      // 법인주주를 개인으로 되돌리면 빈 행이 남은 채 섹션이 사라져 «화면에 없는 칸»을 요구했다.
      const hasCorpShareholder = form.rcShareholders.some((s) => s.isCorporate);
      // 🔴 RC-H: 종전에는 참조 필드를 «비어있지 않음»으로만 봤다. 주주 행을 지우거나 개인↔법인을
      //    뒤집으면 그 id를 가리키던 참조가 **고아**로 남는데, 화면의 select는 매칭되는 option이
      //    없어 「-- 주주 선택 --」으로 보이면서도 차단되지 않았다. 사용자가 입력한 비율이
      //    조용히 무시된다(엔진은 고아를 건너뛴다). 술어를 ⑤의 option 목록과 같은 집합
      //    — «현재 비법인 주주 id» — 으로 맞춘다.
      const individualIds = new Set(form.rcShareholders.filter((s) => !s.isCorporate).map((s) => s.id));
      if (hasCorpShareholder) {
        for (const [i, row] of form.rcIntermediaryCorps.entries()) {
          const n = i + 1;
          if (!row.corpShareholderId) return `${n}번째 간접출자법인의 법인주주를 선택하세요`;
          const corpRow = form.rcShareholders.find((s) => s.id === row.corpShareholderId);
          if (!corpRow || !corpRow.isCorporate)
            return `${n}번째 간접출자법인이 가리키는 법인주주가 주주현황에 없습니다 — 다시 선택하세요`;
          if (parseDecimal(row.stakeInBeneficiaryPctStr) <= 0)
            return `${n}번째 간접출자법인의 수혜법인 지분율을 입력하세요`;
          // 🔴 RC-L: 같은 값을 두 곳에서 받는다 — 주주현황의 「직접지분」과 여기의 「수혜법인
          //    직접지분」. 엔진은 **이쪽만** 쓰고(법인주주의 directRatio는 전달된 뒤 폐기된다),
          //    화면의 「지분합계 100%」 배지는 **저쪽만** 본다. 어긋나면 조용히 계산됐다.
          //    ⚠️ 칸을 없애 한쪽에서 파생하는 수정은 하지 않는다 — 상증령 §34의3⑱3호의
          //       다단계 간접출자(경유 법인이 수혜법인 직접주주가 아닌 경우)를 영구히 막는다.
          if (Math.abs(parseDecimal(row.stakeInBeneficiaryPctStr) - parseDecimal(corpRow.directRatioPctStr)) > 0.01)
            return (
              `${n}번째 간접출자법인의 수혜법인 지분율(${row.stakeInBeneficiaryPctStr}%)이 ` +
              `주주현황의 「${corpRow.name.trim() || "법인주주"}」 직접지분(${corpRow.directRatioPctStr}%)과 다릅니다 — 같은 값이어야 합니다`
            );
          if (row.owners.length === 0) return `${n}번째 간접출자법인의 개인 소유주를 추가하세요`;
          for (const [j, owner] of row.owners.entries()) {
            if (!owner.individualId) return `${n}번째 법인 ${j + 1}번 소유주를 선택하세요`;
            if (!individualIds.has(owner.individualId))
              return `${n}번째 법인 ${j + 1}번 소유주가 주주현황의 개인 주주가 아닙니다 — 다시 선택하세요`;
            if (parseDecimal(owner.ratioPctStr) <= 0) return `${n}번째 법인 ${j + 1}번 소유주의 지분율을 입력하세요`;
          }
        }
        // 🔴 RC-3-f: 위의 행 단위 동치 검사만으로는 **같은 법인주주를 가리키는 행이 2개**일 때
        //    둘 다 통과한다(각 행 30% = 섹션2의 30%). 엔진 `computeIndirectPaths`는
        //    `for (const corp of intermediaryCorps)`로 **행마다** path를 push하고
        //    `sumIndirectPaths`가 그대로 더하므로, 간접보유비율이 행 수에 **선형으로 배가**된다
        //    (probe 실측: 1행 421,200,000 / 2행 842,400,000 / 3행 1,263,600,000).
        //    ⚠️ 가드를 `corpShareholderId` uniqueness로 두지 않는 이유 — 그것은 중복만 잡고
        //       「한 행에 지분을 부풀리는」 형제 경로를 놓친다. **법인주주별 합계 대조**는 둘 다
        //       잡는다(30+30=60 ≠ 30, 그리고 60 ≠ 30). 행 단위 검사는 그대로 둔다.
        const stakeSumByCorp = new Map<string, number>();
        for (const row of form.rcIntermediaryCorps)
          stakeSumByCorp.set(
            row.corpShareholderId,
            (stakeSumByCorp.get(row.corpShareholderId) ?? 0) + parseDecimal(row.stakeInBeneficiaryPctStr),
          );
        for (const [corpId, sum] of stakeSumByCorp) {
          const corpRow = form.rcShareholders.find((s) => s.id === corpId);
          if (!corpRow) continue; // 고아 참조는 위 루프가 이미 차단한다
          const direct = parseDecimal(corpRow.directRatioPctStr);
          if (Math.abs(sum - direct) > 0.01) {
            const rowCount = form.rcIntermediaryCorps.filter((r) => r.corpShareholderId === corpId).length;
            return (
              `「${corpRow.name.trim() || "법인주주"}」의 간접출자법인 수혜법인 지분율 합계` +
              `(${sum.toFixed(2)}%${rowCount > 1 ? ` — ${rowCount}개 행` : ""})가 ` +
              `주주현황의 직접지분(${direct.toFixed(2)}%)과 다릅니다 — 같아야 합니다`
            );
          }
        }
      }
      // R-6 매출처 roster 빈행 차단 (자동 안분 fallback 금지)
      if (form.rcSalesPartners.length === 0) return "매출처를 1개 이상 입력하세요";
      for (const [i, row] of form.rcSalesPartners.entries()) {
        const n = i + 1;
        if (!row.name.trim()) return `${n}번째 매출처 이름을 입력하세요`;
        if (parseAmount(row.salesAmountStr) < 0) return `${n}번째 매출처의 매출액은 0 이상이어야 합니다`;
        // §⑭3호 보유비율 블록의 렌더 게이트와 같은 술어(related-corp-form.tsx:346).
        // 특수관계를 끄거나 과세제외유형을 고르면 블록이 언마운트되는데 종전엔 무조건 순회해
        // «화면에 없는 칸»으로 차단했다. 엔진도 같은 술어로 건너뛴다(lib/tax-engine/gift-deemed/related-corp.ts:145).
        // §⑩3호만 「× 수혜법인의 주식보유비율」로 축소된다 — 비율 미입력은 차단한다.
        // (자동 안분 fallback 금지: 엔진은 미입력 시 제외액 0을 돌려주므로 여기가 실제 관문이다)
        // 🔴 RC-3-h: ⑩1호는 「**중소기업인 수혜법인이** 중소기업인 특수관계법인과 거래한
        //    매출액」(상증령 §34의3⑩1호)이라 수혜법인 측 요건이 이미 입력돼 있는데도
        //    어느 층도 보지 않았다. 실측: 일반기업 421,200,000원 → 0원, 중견기업
        //    162,000,000원 → 0원이 «오류 없이» 계산됐다.
        //    ⑤의 option `disabled` 술어와 같다(related-corp-form.tsx `sec10_1Allowed`) —
        //    기업규모를 나중에 바꿔 남은 stale 값이 여기로 온다.
        //    ⚠️ **필요조건 검사**다. ⑥이 중소기업을 「조특법 §6① 중소기업 **으로서**
        //       공시대상기업집단에 소속되지 아니하는 기업」으로 정의하므로 `small`이라고
        //       ⑩1호 요건이 충족되는 것은 아니고, 특수관계법인 측 규모는 입력 자체가 없다.
        //       확실히 틀린 쪽만 막고, 나머지는 사용자 단언으로 둔다.
        // 🔴 RC-3-i: 영 §34의3⑩ 후단이 「동시에 해당하는 경우」를 상정하므로 호는 **배열**이다.
        //    ⑤가 슬롯마다 «없음»을 허용하니 빈 값을 걷어낸 뒤, 호별 요건을 각각 검사한다.
        const rowTypes = row.isRelated ? row.exclusionTypes.filter((t) => t !== "") : [];
        if (rowTypes.length !== new Set(rowTypes).size)
          return `${n}번째 매출처: 같은 과세제외유형을 두 번 선택했습니다 — 다른 호를 고르거나 「없음」으로 두세요`;
        if (rowTypes.includes("sec10_1") && form.rcEnterpriseSize !== "small")
          return (
            `${n}번째 매출처: ⑩1호는 수혜법인이 중소기업인 경우에만 적용됩니다 ` +
            `(현재 ${form.rcEnterpriseSize === "medium" ? "중견기업" : "일반기업"} — 상증령 §34의3⑩1호) — 다시 선택하세요`
          );
        // ⑩2호와 ⑩3호는 같은 「수혜법인의 보유비율」을 50% 기준으로 가르므로 **동시 해당할 수 없다**.
        if (rowTypes.includes("sec10_2") && rowTypes.includes("sec10_3"))
          return (
            `${n}번째 매출처: ⑩2호(50% 이상)와 ⑩3호(50% 미만)는 같은 보유비율을 기준으로 ` +
            "갈리므로 동시에 해당할 수 없습니다 — 하나만 선택하세요"
          );
        if (rowTypes.includes("sec10_3")) {
          const pct = parseDecimal(row.beneficiaryStakePctStr);
          if (pct <= 0)
            return `${n}번째 매출처의 「수혜법인의 이 매출처 주식보유비율」을 입력하세요 (상증령 §34의3⑩3호)`;
          // 3호는 「100분의 50 미만」, 2호는 「100분의 50 이상」 — 비율로 호가 갈린다.
          if (pct >= 50)
            return `${n}번째 매출처는 보유비율이 50% 이상입니다 — 상증령 §34의3⑩3호는 「100분의 50 미만」인 경우이므로 ⑩2호(전액 제외)를 선택하세요`;
        }
        if (row.isRelated && rowTypes.length === 0) {
          for (const [j, stake] of row.rulingStakes.entries()) {
            if (!stake.shareholderId) return `${n}번째 매출처 §⑭ ${j + 1}번 주주를 선택하세요`;
            if (!individualIds.has(stake.shareholderId))
              return `${n}번째 매출처 §⑭ ${j + 1}번 주주가 주주현황의 개인 주주가 아닙니다 — 다시 선택하세요`;
            if (parseDecimal(stake.ratioPctStr) <= 0)
              return `${n}번째 매출처 §⑭ ${j + 1}번 주주의 보유비율을 입력하세요`;
          }
        }
      }
      // R-7 매출처 합계 = 총매출액 (정수 원 → 톨러런스 0)
      const salesSum = form.rcSalesPartners.reduce((s, r) => s + parseAmount(r.salesAmountStr), 0);
      const totalSales = parseAmount(form.rcTotalSalesStr);
      if (totalSales > 0 && salesSum !== totalSales)
        return `매출처 합계(${salesSum.toLocaleString()})가 총매출액(${totalSales.toLocaleString()})과 다릅니다`;
      // R-8 §⑮ 배당공제 — ⑤ 고급 토글과 «같은 술어»로 태운다(3중 패턴).
      //   조문 계산식의 **분모가 배당가능이익**이다. 배당소득만 받고 배당가능이익을 0으로
      //   두면 산식이 정의되지 않는데, 엔진은 0을 돌려주므로(공제 소멸) 여기가 실제 관문이다.
      //   ⚠️ 반대로 분모를 임의로 채우면 공제가 과대해진다 — 「자동 안분 fallback 금지」.
      if (form.rcShowDividendDeduction) {
        const benefProfit = parseAmount(form.rcDistributableProfitStr);
        for (const [i, row] of form.rcShareholders.entries()) {
          if (row.isCorporate) continue;
          const div = parseAmount(row.dividendFromBeneficiaryStr);
          if (div > 0 && benefProfit <= 0)
            return "수혜법인의 배당가능이익을 입력하세요 — 상증령 §34의3⑮1호 계산식의 분모입니다";
          if (div > 0 && parseDecimal(row.directRatioPctStr) <= 0)
            return `${i + 1}번째 주주는 수혜법인 직접지분이 0이어서 §34의3⑮1호 공제가 성립하지 않습니다 (분모 = 배당가능이익 × 직접보유비율)`;
        }
        if (hasCorpShareholder) {
          for (const [i, row] of form.rcIntermediaryCorps.entries()) {
            const corpProfit = parseAmount(row.distributableProfitStr);
            for (const owner of row.owners) {
              const d = parseAmount(owner.dividendIncomeStr);
              if (d > 0 && corpProfit <= 0)
                return `${i + 1}번째 간접출자법인의 배당가능이익을 입력하세요 — 상증령 §34의3⑮2호 계산식의 분모입니다`;
            }
          }
        }
      }
      break;
    }
  }
  return null;
}
