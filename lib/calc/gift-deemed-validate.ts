/**
 * 증여로 보는 경우 — 입력 검증 (⑧ 동기화). Zod superRefine과 동일 fallback.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { CI_SHARES_LABEL } from "@/components/calc/deemed-gift/capital-forms-shared";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { validateDeemedPhase3 } from "./gift-deemed-validate-phase3";
import { validateActiveSameClauseRows } from "./gift-deemed-43-2";

export function validateDeemedInput(form: DeemedFormState): string | null {
  // 신탁이익(§33)은 공통 증여일 대신 원본·수익 증여시기를 분리 입력(§25①) → 공통 giftDate 검사 skip
  if (form.type !== "trust_benefit" && !form.giftDate) return "증여일을 입력하세요";
  if (!form.type) return "증여로 보는 경우 유형을 선택하세요";

  switch (form.type) {
    case "trust_benefit": {
      if (parseAmount(form.tbPropertyValue) <= 0) return "신탁재산(원본) 가액을 입력하세요";
      if (form.tbBeneficiaryType !== "diff_principal" && !form.tbIncomeGiftDate)
        return "수익권 증여시기를 입력하세요";
      if (form.tbBeneficiaryType !== "diff_income" && !form.tbPrincipalGiftDate)
        return "원본권 증여시기를 입력하세요";
      if (form.tbAnnuityType === "finite" && parseDecimal(form.tbInstallments) <= 0)
        return "수익 분할 횟수를 입력하세요";
      if (
        form.tbAnnuityType === "lifetime" &&
        parseDecimal(form.tbExpectedRemainingYears) <= 0 &&
        (!form.tbBeneficiaryGender || parseDecimal(form.tbBeneficiaryAge) <= 0)
      )
        return "종신정기금은 성별·연령 또는 기대여명을 입력하세요";
      break;
    }
    case "insurance":
      if (parseAmount(form.insTotalPremium) <= 0) return "납부보험료 총액을 입력하세요";
      if (parseAmount(form.insRelevantPremium) > parseAmount(form.insTotalPremium))
        return "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)";
      break;
    case "bargain_transfer":
      if (parseAmount(form.bargMarketValue) <= 0) return "시가를 입력하세요";
      /**
       * A16(2026-09-02): 거래대가가 검증되지 않아 **미입력이 0원으로 통과**하고 시가 전액이
       * 차액이 됐다(시가 10억·대가 공란 → 증여재산가액 700,000,000원 산출. 정상 대가 6억
       * 대비 +600,000,000원 과다산정). 결과 화면의 「증여세 마법사로」 버튼까지 렌더돼
       * 그 값이 다음 계산으로 연계된다.
       *
       * 같은 파일의 다른 유형은 이미 금액 필드를 차단한다 —
       * `insurance`(납부보험료 총액 > 0) · `debt_forgiveness`(채무액 > 0).
       * **유형 간 일관성**과 저장소의 「미입력은 검증 오류로 차단」 정책이 이 차단의 논거다.
       *
       * ⚠️ **명시 「0」은 막지 않는다**(사용자 결정 2026-09-02). 미입력과 명시 0은 ④ 이후
       *    완전히 동일한 wire(`transactionPrice: 0`)를 만들어 ⑫⑭·엔진 어디서도 구분되지
       *    않으므로, 구분이 가능한 유일한 지점인 여기서 **원문자열**로 가른다.
       *    무상이전(대가 0)은 「상속세 및 증여세법」 §4①1호 영역이라는 별개 논점이며,
       *    그것을 막으려면 §35 대상 범위 자체를 다루어야 한다(별건).
       */
      if (!form.bargPrice?.trim()) return "거래대가를 입력하세요";
      break;
    case "debt_forgiveness":
      if (parseAmount(form.debtForgiven) <= 0) return "면제·인수·변제 채무액을 입력하세요";
      break;
    case "free_realestate":
      if (form.freePeriods !== undefined) {
        // 다기간 모드 — 빈 배열 차단(자동 fallback 금지) + 각 window 필수값
        if (form.freePeriods.length === 0) return "기간을 1개 이상 추가하세요 (5년/1년 초과 다기간)";
        for (const [i, p] of form.freePeriods.entries()) {
          if (!p.startDate) return `${i + 1}번째 기간의 개시일을 입력하세요`;
          if (parseAmount(p.value) <= 0)
            return `${i + 1}번째 기간의 ${form.freeSubType === "free_use" ? "부동산 가액" : "차입금"}을 입력하세요`;
        }
      } else {
        if (form.freeSubType === "free_use" && parseAmount(form.freePropertyValue) <= 0)
          return "부동산 가액을 입력하세요";
        if (form.freeSubType === "collateral" && parseAmount(form.freeLoanAmount) <= 0)
          return "차입금을 입력하세요";
      }
      // 경정청구(무상사용·담보 공통) — 필수값
      if (form.freeRectOn) {
        if (parseAmount(form.freeRectTax) <= 0) return "경정청구: 증여세 산출세액을 입력하세요";
        if (!form.freeRectGiftDate) return "경정청구: 당초 증여일을 입력하세요";
        if (!form.freeRectTermDate) return "경정청구: 중단사유 발생일을 입력하세요";
      }
      break;
    case "free_loan":
      // §43² 다건 합산 모드 (loanLoans 토글 ON) — 빈 배열 차단(자동 fallback 금지) + 각 건 필수값
      if (form.loanLoans !== undefined) {
        if (form.loanLoans.length === 0) return "대출 건을 1건 이상 추가하세요";
        for (const [i, item] of form.loanLoans.entries()) {
          if (!item.loanDate) return `${i + 1}번째 대출의 대출일을 입력하세요`;
          if (parseAmount(item.amount) <= 0) return `${i + 1}번째 대출의 대출금액을 입력하세요`;
        }
        break;
      }
      // 단건 모드
      if (parseAmount(form.loanAmount) <= 0) return "대출금액을 입력하세요";
      // §41의4② 기간 입력 시 — 양끝 모두 필수 + start ≤ end (한쪽만 입력 차단, 자동 fallback 금지)
      if (form.loanStartDate || form.loanEndDate) {
        if (!form.loanStartDate) return "대출 시작일을 입력하세요";
        if (!form.loanEndDate) return "대출 종료일을 입력하세요";
        if (form.loanStartDate > form.loanEndDate) return "대출 종료일이 시작일보다 앞설 수 없습니다";
      }
      break;
    case "merger": {
      if (form.mrgCaseType === "non_stock") {
        if (parseAmount(form.mrgFaceValue) <= 0) return "액면가액을 입력하세요";
        if (parseAmount(form.mrgOvervaluedPrice) <= 0) return "합병당사법인 1주당 평가가액을 입력하세요";
        // 🔴 IG-017(형제 인스턴스): mergerNonStock도 1주당 이익에 majorShares를 곱한다.
        // 비면 증여재산가액이 0원이 되고 「이익이 기준금액(3억) 미만」이라는 틀린 사유가 뜬다.
        if (parseAmount(form.mrgMajorShares) <= 0) return "대주주등 주식수를 입력하세요";
        break;
      }
      // §28⑦ 분할합병(순자산비율)이면 과대평가 1주평가 대신 분할 3필드 필수
      const splitNet = form.mrgIsSplitMerger && form.mrgSplitMode === "net_asset_ratio";
      if (splitNet) {
        if (parseAmount(form.mrgSplitPrePrice) <= 0) return "분할법인 분할직전 1주당 평가가액을 입력하세요";
        if (parseAmount(form.mrgSplitBusinessNetAsset) <= 0) return "분할사업부문 순자산가액을 입력하세요";
        if (parseAmount(form.mrgSplitCompanyNetAsset) <= 0) return "분할법인 순자산가액을 입력하세요";
      } else if (parseAmount(form.mrgOvervaluedPrice) <= 0) {
        return "과대평가법인 1주당 평가가액을 입력하세요";
      }
      if (form.mrgUseShareholders) {
        // Phase B 주주 매트릭스 — auto 평가 + 주주 배열 필수
        if (parseAmount(form.mrgUnderSharePrice) <= 0) return "과소평가법인 1주당 평가가액을 입력하세요";
        if (parseAmount(form.mrgPostMergerTotalShares) <= 0) return "합병 후 존속법인 주식수를 입력하세요";
        if (parseAmount(form.mrgExchangeNumer) <= 0 || parseAmount(form.mrgExchangeDenom) <= 0)
          return "교부 환산비를 입력하세요";
        if (form.mrgOverShareholders.filter((s) => s.name.trim() && parseAmount(s.shares) > 0).length === 0)
          return "과대평가(이익측)법인 주주를 1명 이상 입력하세요";
        if (form.mrgUnderShareholders.filter((s) => s.name.trim() && parseAmount(s.shares) > 0).length === 0)
          return "과소평가(증여자측)법인 주주를 1명 이상 입력하세요";
      } else {
        if (parseAmount(form.mrgExchangedShares) <= 0) return "교부받은 주식수를 입력하세요";
        // 🔴 IG-017: 단일 대주주 모드에서 majorShares는 엔진 `mergerStock`이 1주당 이익에 곱하는
        // 유일한 수량이다(매트릭스 ON 경로는 ④가 0을 보내므로 무관). 같은 분기의 다른 수량 6개는
        // 전부 차단되는데 이것만 빠져 있어, 비면 증여재산가액이 0원이 되고
        // 「이익이 기준금액 미만」이라는 틀린 사유가 표시된다.
        if (parseAmount(form.mrgMajorShares) <= 0) return "대주주등 주식수를 입력하세요";
        if (form.mrgMergedPriceMode === "auto") {
          // §28⑤ 단순평균액 — 자동추정 금지, 명시 입력 필수
          if (parseAmount(form.mrgUnderSharePrice) <= 0) return "과소평가법인 1주당 평가가액을 입력하세요";
          if (parseAmount(form.mrgPreShares) <= 0) return "과대평가법인 합병 전 주식수를 입력하세요";
          if (parseAmount(form.mrgUnderPreShares) <= 0) return "과소평가법인 합병 전 주식수를 입력하세요";
          if (parseAmount(form.mrgPostMergerTotalShares) <= 0) return "합병 후 존속법인 주식수를 입력하세요";
          if (form.mrgIsListed && parseAmount(form.mrgListedPostAvgPrice) <= 0)
            return "합병등기일 후 2개월 종가평균을 입력하세요";
        } else if (parseAmount(form.mrgMergedPrice) <= 0) {
          return "합병 후 1주당 평가가액을 입력하세요";
        }
      }
      break;
    }
    case "capital_increase":
      // 「상증령」§29② 단서 축 — 증자 전 1주당 가액 **0은 정당한 평가액**이다(결손법인: 「상증령」§55①
      //   순자산 0원 하한 · §56① 순손익 음수→영). 0을 막으면 결손법인 고가증자가 계산되지 않는다
      //   (실측 1,800,000,000). 3-A 인수가와 같이 **원문자열로** 공란만 막는다.
      if (form.ciPrePrice.trim() === "") return "증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.ciPreShares) <= 0) return "증자 전 발행주식총수를 입력하세요";
      // 3-A — 「상증령」§29②1호 가목 산식의 **분자·분모 양쪽**에 들어가는 수량이다
      //   (「… + (신주 1주당 인수가액 × **증자에 의하여 증가한 주식수**)] ÷ (증자전의 발행주식
      //    총수 + **증자에 의하여 증가한 주식수**)」). 비면 ㉯가 증자전 평가가액 그대로가 되어
      //   1주당 이익이 부풀고 **과다과세**가 된다(실측 33,330,000 → 50,000,000).
      if (parseAmount(form.ciIssuedShares) <= 0) return "증자 주식수를 입력하세요";
      // 3-A — 같은 호 나목 「신주 1주당 인수가액」. ㉯의 분자이자 차감항이라 비면 2배가 된다
      //   (실측 33,330,000 → 66,660,000). 고가에서는 반대로 0원 + 거짓 제외사유가 된다.
      // ⚠️ **0은 막지 않는다** — 무상 배정은 법령상 성립하고 나목에 0을 금하는 문언이 없다.
      //   `parseAmount`는 ""과 "0"을 모두 0으로 만들므로 **원문자열로** 공란만 가른다.
      if (form.ciNewPrice.trim() === "") return "신주 1주당 인수가액을 입력하세요";
      // 🔴 IG-016: 엔진에서 1주당 이익에 곱해지는 유일한 수량이다
      // (`capital-increase.ts` — `base = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0`).
      // 비면 증여재산가액이 0이 되면서 「증자 후 1주가가 인수가 이하 — 이익 없음」이라는,
      // 1주당 이익이 실제로 양수인데도 거짓인 사유가 결과에 표시된다.
      if (parseAmount(form.ciForfeitedShares) <= 0)
        return `${CI_SHARES_LABEL[form.ciDirection][form.ciSubType]}을(를) 입력하세요`;
      // 1-A — 고가는 **전 subType**이 §29②3·4·5호 비율 가중이므로 분모가 필수다.
      //   가목(`forfeited_realloc`)이 빠져 있던 탓에 분모 미입력이 조용히 가중 1.0으로 통과했다.
      if (form.ciDirection === "high") {
        const denom = parseAmount(form.ciRatioDenomShares);
        if (denom <= 0) return "분모 신주수를 입력하세요";
        // 3-B — 분모만 필수화돼 있어 **분자**가 비면 엔진이 `?? 0`으로 0을 곱해 증여재산가액이
        //   0이 되고, 그러면서 「이익이 기준금액 미만」이라는 **사실과 다른** 사유가 붙었다
        //   (실측: 법정 60,003,000 → 0). IG-016이 이미 같은 실패 형태를 근거로 형제 칸을
        //   필수화해 놓고 같은 산식의 분자에는 적용하지 않았다.
        const numer = parseAmount(form.ciRelatedAcquiredShares);
        if (numer <= 0) return "특수관계인이 인수한 신주수를 입력하세요";
        // 3-B — 분수의 분자가 분모를 넘으면 가중이 1을 초과해 **증폭**이 된다. 세 호 전부
        //   「… 인수한 신주수 ÷ (그 신주수를 포함하는 총수)」 형태라 분자 ≤ 분모가 법문상 자명하다.
        if (numer > denom) return "특수관계인이 인수한 신주수가 분모 신주수를 초과합니다";
        // 3-B — **나목 한정** 하한. §29②4호의 분모는 「증자전의 지분비율대로 균등하게 증자하는
        //   경우의 증자 주식총수」라 실권주 소멸분을 포함하므로 실제 증가주식수 **이상**이다.
        //   ⚠️ 다·라목(§29②5호)에 걸면 안 된다 — 그 분모는 「주주가 아닌 자에게 배정된 신주 및
        //      … 초과하여 인수한 신주의 총수」로 증가주식수의 **부분집합**이라 더 작은 것이 정상이다
        //      (anchor `[CI-HIGH-TPE]`가 denom 40,000 < issued 50,000을 법정 정답으로 고정한다).
        if (form.ciSubType === "no_realloc" && denom < parseAmount(form.ciIssuedShares))
          return "분모(균등증자 가정 증자 주식총수)는 증자 주식수보다 작을 수 없습니다";
      }
      // 저가 나목 §29②2호 다목 — 세 인자 중 하나만 비어도 엔진이 종전(가중 없음) 동작으로
      //   되돌아가 **과다과세**가 되므로, 부분 입력을 통과시키지 않는다.
      if (form.ciDirection === "low" && form.ciSubType === "no_realloc") {
        // §29②2호 가목 — 미입력이면 엔진이 실제 증가주식수로 되돌아가 ㉯가 높게 잡히고,
        //   차액·30% 기준선·증여재산가액이 **한 방향으로** 치우친다(과다과세).
        if (parseAmount(form.ciEqualIssueShares) <= 0) return "균등증자 가정 증가주식수를 입력하세요";
        if (parseAmount(form.ciEqualIssueShares) < parseAmount(form.ciIssuedShares))
          return "균등증자 가정 증가주식수는 실제 증자 주식수보다 작을 수 없습니다";
        if (parseAmount(form.ciRelatedAcquiredShares) <= 0)
          return "신주인수자의 특수관계인의 실권주수를 입력하세요";
        if (parseAmount(form.ciPostHeldShares) <= 0) return "증자 후 신주인수자 보유주식수를 입력하세요";
        if (parseAmount(form.ciPostTotalShares) <= 0) return "증자 후 발행주식총수를 입력하세요";
        if (parseAmount(form.ciPostHeldShares) > parseAmount(form.ciPostTotalShares))
          return "증자 후 신주인수자 보유주식수가 발행주식총수를 초과할 수 없습니다";
      }
      // 상장 ON인데 평균액 미입력이면 엔진이 조용히 이론값으로 통과한다(§29②1가·3나 단서 미발동)
      // 3-D — 다만 **공모 배정**은 「상증법」§39① 괄호로 적용 자체가 제외되므로 이 칸이 세액에
      //   닿지 않는다(실측: 1·8,000·999,999,999 어느 값을 넣어도 0원). 요구를 단서가 실제로
      //   발동하는 경우로 좁힌다 — ⑫도 같은 술어로 맞춘다(3중 일치).
      //   ⚠️ 간주모집(`deemed_public_offering` · 「상증령」§29③)은 **제외가 취소**되어 과세되므로
      //      종전대로 요구한다. 두 값을 한 덩어리로 묶으면 과소과세가 된다.
      if (
        form.ciIsListed &&
        form.ciAllocationMethod !== "public_offering" &&
        parseAmount(form.ciListedMarketAvg) <= 0
      )
        return "증자 후 1주당 평가가액(상증법 §63①1가 종가평균)을 입력하세요";
      break;
    case "capital_increase_allocation": {
      // 단건(`capital_increase`)과 같다 — 증자 전 가액 0(결손법인)·인수가 0(무상 배정)은 법령상 성립한다.
      if (form.ciAllocPrePrice.trim() === "") return "증자 전 1주당 평가가액을 입력하세요";
      if (form.ciAllocNewPrice.trim() === "") return "신주 1주당 인수가액을 입력하세요";
      const rows = form.ciAllocRows;
      if (rows.length < 2) return "주주를 2명 이상 입력하세요";
      if (rows.some((r) => !r.name.trim())) return "각 주주의 이름을 입력하세요";
      if (rows.every((r) => parseAmount(r.subscribedShares) <= 0)) return "신주를 인수한 주주가 1명 이상 필요합니다";
      const ids = new Set(rows.map((r) => r.id));
      if (rows.some((r) => r.relatedTo.some((rid) => !ids.has(rid))))
        return "특수관계인 선택이 올바르지 않습니다";
      // 신주인수권을 포기하면 그 증자에서 더는 인수할 수 없다 ⇒ **포기와 재배정 수령은 병존 불가**.
      //   당초배정분 인수 = 실제인수 − 재배정분. 그것이 당초배정에 미달하면 「일부 포기」다.
      //   포기했는데 재배정까지 받은 입력은 현실에서 성립하지 않으므로 차단한다.
      for (const r of rows) {
        const realloc = parseAmount(r.reallocatedShares);
        if (realloc <= 0) continue;
        const ownSubscribed = parseAmount(r.subscribedShares) - realloc;
        if (ownSubscribed < parseAmount(r.entitledShares))
          return `${r.name.trim() || "주주"}: 당초 배정분을 포기한 주주는 실권주를 재배정받을 수 없습니다`;
      }
      break;
    }
    case "capital_decrease":
      if (form.cdMode === "multi") {
        if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
        if (parseAmount(form.cdPreTotalShares) <= 0) return "감자 전 발행주식총수를 입력하세요";
        if (form.cdShareholders.length < 2) return "주주를 2명 이상 입력하세요";
        for (const [i, row] of form.cdShareholders.entries()) {
          const n = i + 1;
          if (!row.name.trim()) return `${n}번째 주주 이름을 입력하세요`;
          if (parseAmount(row.preShares) <= 0) return `${n}번째 주주의 감자 전 주식수를 입력하세요`;
          if (parseAmount(row.redeemedShares) > 0 && parseAmount(row.redemptionPrice) <= 0)
            return `${n}번째 주주는 감자주주이므로 소각대가를 입력하세요`;
          // 자동 안분 fallback 금지: 특수관계 그룹 미입력 차단
          if (!row.relationGroup.trim())
            return `${n}번째 주주의 특수관계 그룹을 입력하세요 (비특수관계면 별도 구분값 입력)`;
        }
        const totalPre = form.cdShareholders.reduce((s, r) => s + parseAmount(r.preShares), 0);
        if (totalPre > parseAmount(form.cdPreTotalShares))
          return "주주별 감자 전 주식수 합계가 발행주식총수를 초과합니다";
      } else {
        if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
        if (form.cdCaseType === "high") {
          if (parseAmount(form.cdOwnRedeemedShares) <= 0) return "해당 주주등 감자 주식수를 입력하세요";
          // §29의2①2호 액면 게이트 — 미입력 시 엔진이 과세 제외(0원)하므로 필수 입력 요구
          if (parseAmount(form.cdFaceValue) <= 0) return "액면가액을 입력하세요 (고가소각 §29의2①2호 액면 게이트)";
        } else {
          if (parseAmount(form.cdTotalShares) <= 0) return "총감자 주식수를 입력하세요";
          // 🔴 IG-015: 엔진 `decreaseLow`의 이익 산식은 `diff × relatedRedeemedShares × majorPostRatio`다.
          // `totalRedeemedShares`는 표시용 breakdown 행에만 쓰인다 — 즉 ⑧이 지키던 칸은 산식에
          // 안 쓰이고, 실제 곱셈 인자 2개가 무방비였다. 하나만 비어도 증여재산가액이 0원이 되고
          // 「이익이 기준금액 미만」이라는 틀린 사유가 뜬다.
          if (parseDecimal(form.cdMajorRatioPct) <= 0)
            return "대주주등 감자후 지분비율을 입력하세요";
          if (parseAmount(form.cdRelatedShares) <= 0)
            return "대주주등 특수관계인 감자 주식수를 입력하세요";
        }
      }
      break;
    case "contribution":
      if (parseAmount(form.conPrePrice) <= 0) return "현물출자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.conPreShares) <= 0) return "현물출자 전 발행주식총수를 입력하세요";
      // §29②1가·3나 단서 — 상장 ON·평균액 미입력이면 엔진이 이론값으로 조용히 통과한다
      if (form.conIsListed && parseAmount(form.conListedMarketAvg) <= 0)
        return "현물출자 후 1주당 평가가액(상증법 §63①1가 종가평균)을 입력하세요";
      // 자본시장법 §165의6①3 일반공모 배정분 — 배정받은 신주수를 넘을 수 없다.
      // 상장 게이트는 엔진·API 변환과 동일하게 걸어 3중 일치(mirror-pattern) — 비상장에서 값이
      // 남아 있어도 엔진은 무시하므로 차단하면 UI 통과↔validate 차단 모순이 된다.
      if (form.conIsListed && parseAmount(form.conPublicOfferingShares) > parseAmount(form.conAllocatedShares))
        return "일반공모 배정 신주수가 배정받은 신주수를 초과합니다";
      // 당사자 명부 roster 3-state 검증 (자동 안분 fallback 금지)
      if (form.conParties !== undefined) {
        // ON 빈 배열 — 최소 1명 필요
        if (form.conParties.length === 0)
          return `${form.conCaseType === "high" ? "수증자" : "증여자"}를 1명 이상 추가하세요`;
        // 각 행: 주식수 > 0 필수
        for (const [i, p] of form.conParties.entries()) {
          if (parseAmount(p.shares) <= 0)
            return `${i + 1}번째 ${form.conCaseType === "high" ? "수증자" : "증여자"}의 주식수를 입력하세요`;
          // 3-E — 관계는 §53 증여재산공제 구분이자 §47② 동일인 합산 단위다. 비워 두면
          //   **차단되지 않은 채** 이관에서 조용히 빠진다:
          //   · 저가 — `gift-deemed-prefill.ts`가 `relation` 없는 행을 `simultaneousGifts`에서
          //     **필터로 버린다**. 동일인(부·모) 2명 roster 실측 2,909,418 → 969,418
          //     (**−1,940,000 과소과세**). 첫 행에 관계가 있으면 마법사 ⑧도 막지 않는다.
          //   · 고가 — 선택된 수증자의 관계가 비면 `donor: ""`로 이관돼 마법사 ⑧이 막는다.
          //     화면을 두 번 거친 뒤 막히는 것보다 입력 단계에서 막는 것이 맞다.
          //   ⚠️ 종전 `gift-deemed-prefill.ts:138` 주석은 「⑧이 이미 빈 값을 막는다」고 적었으나
          //      그 규칙은 §45의4 주주 roster(`:562`)의 것이고 이 roster에는 없었다 — 주석 정정 동반.
          if (!p.relation)
            return `${i + 1}번째 ${form.conCaseType === "high" ? "수증자" : "증여자"}의 관계를 선택하세요`;
        }
        // 합계 주식수 > 기준 주식수 차단
        const sumShares = form.conParties.reduce((acc, p) => acc + parseAmount(p.shares), 0);
        const baseShares = parseAmount(form.conPreShares);
        if (baseShares > 0 && sumShares > baseShares)
          return "당사자 주식수 합계가 현물출자 전 발행주식총수를 초과합니다";
      }
      break;
    case "convertible_stock":
      // 두 시점 모두 단건과 같다 — 증자 전 가액 0(결손법인)은 법령상 성립한다(공란만 막는다).
      if (form.csConvPrePrice.trim() === "") return "전환 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csConvPreShares) <= 0) return "전환 시점 증자 전 발행주식총수를 입력하세요";
      if (form.csIssuePrePrice.trim() === "") return "발행 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csIssuePreShares) <= 0) return "발행 시점 증자 전 발행주식총수를 입력하세요";
      // 3-A 대칭 — 전환주식은 「전환 시점 이익 − 발행 시점 이익」이라 한 시점만 비어도 결과가 뒤집힌다.
      if (parseAmount(form.csConvIssuedShares) <= 0) return "전환 시점 증자 주식수를 입력하세요";
      if (parseAmount(form.csIssueIssuedShares) <= 0) return "발행 시점 증자 주식수를 입력하세요";
      if (form.csConvNewPrice.trim() === "") return "전환 시점 신주 1주당 인수가액을 입력하세요";
      if (form.csIssueNewPrice.trim() === "") return "발행 시점 신주 1주당 인수가액을 입력하세요";
      // 3-D 대칭 — 공모 배정이면 종가평균이 세액에 닿지 않는다(§39① 괄호로 적용 제외).
      if (
        form.csConvIsListed &&
        form.csConvAllocationMethod !== "public_offering" &&
        parseAmount(form.csConvListedMarketAvg) <= 0
      )
        return "전환 시점 증자 후 1주당 평가가액(상증법 §63①1가 종가평균)을 입력하세요";
      if (
        form.csIssueIsListed &&
        form.csIssueAllocationMethod !== "public_offering" &&
        parseAmount(form.csIssueListedMarketAvg) <= 0
      )
        return "발행 시점 증자 후 1주당 평가가액(상증법 §63①1가 종가평균)을 입력하세요";
      // 🔴 IG-018: 고가발행 + (제3자 직접배정·초과배정) 경로에서 «분모 신주수»는 엔진이
      // `denom > 0 ? safeMultiplyThenDivide(...) : 0`으로 읽는다 — 0이면 조용히 0을 낸다.
      // 전환주식은 「전환 시점 − 발행 시점」이라 **한 시점만 비어도 결과가 뒤집힌다**.
      // 증자 §39는 같은 조건으로 이미 차단하고 있었다(capital_increase 분기) — 여기만 빠져 있었다.
      if (form.csDirection === "high" && form.csSubType !== "forfeited_realloc") {
        if (parseAmount(form.csConvRatioDenomShares) <= 0)
          return "전환 시점 분모 신주수를 입력하세요";
        if (parseAmount(form.csIssueRatioDenomShares) <= 0)
          return "발행 시점 분모 신주수를 입력하세요";
        // 3-B 대칭 — 분자가 비면 그 시점 이익이 0이 되어 「전환 − 발행」 차가 통째로 틀어진다.
        if (parseAmount(form.csConvRelatedAcquiredShares) <= 0)
          return "전환 시점 특수관계인이 인수한 신주수를 입력하세요";
        if (parseAmount(form.csIssueRelatedAcquiredShares) <= 0)
          return "발행 시점 특수관계인이 인수한 신주수를 입력하세요";
        if (parseAmount(form.csConvRelatedAcquiredShares) > parseAmount(form.csConvRatioDenomShares))
          return "전환 시점 특수관계인이 인수한 신주수가 분모 신주수를 초과합니다";
        if (parseAmount(form.csIssueRelatedAcquiredShares) > parseAmount(form.csIssueRatioDenomShares))
          return "발행 시점 특수관계인이 인수한 신주수가 분모 신주수를 초과합니다";
      }
      // #25 — 발행일은 §39①3호 적용 요건이다(「상증법」 법률 제14388호 부칙 §5② — 2017.1.1. 이후 발행분).
      //   엔진은 미입력을 「적용」으로 읽으므로(leaf 호환) UI 경로에서는 여기서 막아야 판정이 성립한다.
      if (!form.csIssuanceDate) return "전환주식 발행일을 입력하세요";
      break;
    case "acquisition_fund_presumption":
    case "nominee_trust":
    case "excess_dividend":
    case "listing_gain":
    case "property_service_use":
    case "org_change":
    case "value_increase":
    case "specific_corp":
    case "related_corp":
    {
      const phase3Err = validateDeemedPhase3(form);
      if (phase3Err) return phase3Err;
      break;
    }
    case "convertible_bond":
      if (form.cbCaseType === "conversion" || form.cbCaseType === "conversion_reverse") {
        if (parseAmount(form.cbPreConvPrice) <= 0) return "전환등 전 1주당 평가가액을 입력하세요";
        if (parseAmount(form.cbConversionPrice) <= 0) return "1주당 전환가액등을 입력하세요";
        if (parseAmount(form.cbIncreasedShares) <= 0) return "전환등 증가주식수를 입력하세요";
        // 상장 Min/Max 단서 — 종가평균 필요. creditedShares는 non-required(미입력=증가주식수)
        if (form.cbIsListed && parseAmount(form.cbListedMarketAvg) <= 0) return "전환일 전후 2개월 종가평균을 입력하세요";
      }
      if (form.cbCaseType === "conversion") {
        if (form.cbAutoExcess) {
          if (parseAmount(form.cbSubscribedShares) <= 0) return "인수(전환) 주식수를 입력하세요";
          if (parseAmount(form.cbTotalSubscribable) <= 0) return "총인수가능주식수를 입력하세요";
          if (parseDecimal(form.cbOwnPreRatioPct) <= 0) return "본인 전환전 지분율을 입력하세요";
        }
        if (form.cbAutoInterestLoss) {
          if (parseAmount(form.cbBondMaturity) <= 0) return "만기상환금액을 입력하세요";
          if (parseDecimal(form.cbCouponRatePct) <= 0) return "사채발행이율을 입력하세요";
          if (parseDecimal(form.cbPvFactorAppr) <= 0) return "적정할인율 현가계수를 입력하세요";
          if (parseDecimal(form.cbAnnuityFactorAppr) <= 0) return "적정할인율 연금현가계수를 입력하세요";
        }
      }
      if (form.cbCaseType === "conversion_reverse") {
        if (parseDecimal(form.cbRelatedPreRatioPct) <= 0) return "특수관계인 전환 전 지분비율을 입력하세요";
      }
      if (form.cbCaseType === "transfer") {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
        if (parseAmount(form.cbTransferPrice) <= 0) return "양도가액을 입력하세요";
      }
      if (form.cbCaseType === "acquisition") {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
      }
      break;
  }
  // §43² — 활성인 선행 이익 표만 검증한다(④·⑤와 같은 술어 · `gift-deemed-43-2.ts`)
  return validateActiveSameClauseRows(form);
}
