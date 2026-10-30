/**
 * 상속·증여 자산 취득가액 산정 Pure Engine
 *
 * 양도소득세 계산 시 상속·증여로 취득한 자산의 취득가액은 상속개시일(또는 증여일)
 * 현재 상증법상 평가가액으로 한다. 단, 의제취득일(1985.1.1.) 전 상속·증여 자산은
 * max(① 상증법 평가액, ② §164④~⑦ 의제취득일 기준시가, ③ 환산취득가)로 한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(원 단위).
 *
 * 근거 조문:
 *   - 소득세법 §97 — 양도소득 필요경비
 *   - 소득세법 시행령 §163 ⑨ — 상속·증여 자산 취득가액 의제 (의제취득일 이후 max①②)
 *   - 소득세법 시행령 §176조의2 ④·③ — 의제취득일 전 상속·증여: max(①,②,③)
 *     · 생산자물가상승률 방식(④2호)은 무상취득에 부적용(조심2023서0676·심사양도2012-0006)
 *     · 3자 max 근거: 상속증여세과-223(2013.6.17.) — 반대 자료는 calcPreDeemed 위 주석
 *   - 상증법 §60·§61 — 평가 원칙·부동산 보충적평가
 */

import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { TRANSFER, REDEVELOPMENT } from "./legal-codes";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
  PreDeemedSelectedMethod,
} from "./types/inheritance-acquisition.types";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";

export type {
  InheritanceAcquisitionInput,
  InheritanceAcquisitionResult,
  InheritanceAssetKind,
  InheritanceAcquisitionMethod,
  PreDeemedBreakdown,
} from "./types/inheritance-acquisition.types";

// ─── 진입점 ────────────────────────────────────────────────────────────────

export function calculateInheritanceAcquisitionPrice(
  input: InheritanceAcquisitionInput,
  /**
   * 재개발·재건축 종전자산이면 ③으로 쓸 §166③ 금액(엔진 내부 주입 — 와이어 필드 아님).
   * undefined = 재개발 아님(③ = §176조의2④) · null = 재개발이지만 §166③을 산출할 수 없음(③ = 0).
   */
  redevelopment166_3Price?: number | null,
): InheritanceAcquisitionResult {
  validateInput(input);

  const isPreDeemed =
    input.inheritanceDate.getTime() < DEEMED_ACQUISITION_DATE.getTime();

  const result = isPreDeemed ? calcPreDeemed(input, redevelopment166_3Price) : calcPostDeemed(input);
  return input.isGift ? { ...result, isGift: true } : result;
}

// ─── 입력 검증 ─────────────────────────────────────────────────────────────

function validateInput(input: InheritanceAcquisitionInput): void {
  if (!input.inheritanceDate) {
    throw new Error("inheritanceDate가 필수입니다");
  }
  if (input.publishedValueAtInheritance !== undefined && input.publishedValueAtInheritance < 0) {
    throw new Error("publishedValueAtInheritance는 0 이상이어야 합니다");
  }
  if (input.reportedValue !== undefined && input.reportedValue < 0) {
    throw new Error("reportedValue는 0 이상이어야 합니다");
  }
}

// ─── Case A: 의제취득일(1985.1.1.) 전 상속·증여 ───────────────────────────
//
// 취득가액 = **max(① 상증법 §60~66 평가액, ② §164④~⑦ 기준시가, ③ 환산취득가액)** — 3자 max.
//   ①② = 소령 §163⑨ 본문·1호·2호(법 §97①1호 가목 의제) / ③ = 소령 §163⑫ → §176조의2④·③3호(나목).
//   동점은 ① > ② > ③ — ①②를 채택하면 실가 경로(실제 필요경비), ③이면 추계(개산공제 §163⑥).
//   ⚠️ **비교 단위는 취득가액뿐이다**(사용자 결정 Q-7 a, 2026-10-22). 필요경비는 채택 경로를 따른다 —
//      그래서 실제 자본적지출이 큰 자산은 ③이 채택돼 개산공제·§97②2호 단서 swap으로 가면서
//      「가목 우선」보다 세액이 오를 수 있다(계획서 §4.1 P9·P11 — 의도된 결과).
//
// ■ 근거와 반대 자료 (2026-10-22 원문 대조 — 계획서
//   docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §3)
//   현행 체계(2008년 이후 양도)의 판단은 셋으로 갈린다. 사용자 결정 Q-1 = C(이 구현).
//   · C 3자 max — **상속증여세과-223**(2013.6.17.): 「의제취득일 이전 상속받은 토지의 실지취득가액은
//     소득세법 시행령 제163조 제9항 및 같은 영 제176조의2 제3항에 따라 평가한 가액 중 가장 큰 가액」.
//   · B 나목 전용(§163⑨ 적용 안 함) — **심사양도2012-0006**(2012.3.30., ③ 15,939,104 > ② 8,206,801 사안
//     ③ 채택, 「제163조 제9항을 적용할 것이 아니라 … 제176조 제2항 및 제4항을 적용」, 부동산거래관리과-214를
//     같은 뜻으로 인용) · **조심2023서0676**(「의제취득일 이전에 상속으로 취득한 쟁점토지의 경우에는 취득에 든
//     실지거래가액을 확인할 수 없는 경우에 해당하므로 … 나목」). 2007년 이전 체계: 서면4팀-456 · 심사양도2006-0101.
//   · A 가목 우선(#1089 `af74d907` ~ 이 변경 전) — **조심2010서1195**(신고 ③ 678,304천원 → 처분청 §163⑨
//     의제취득일 기준시가 824,048원, 기각). 단 청구인이 §176조의2④를 주장하지 않았고 심판원도 검토하지 않았다.
//     국심2003부0627·0626·2003서3266은 ③ < ①② 사안이라 결과로 A·C를 가르지 못한다(2007 이전 체계).
//   ⚠️ 국세청 해석 5건(서일46014-10547·10074·11134·서면5팀-151·부동산거래관리과-214)은 회신에서 §163⑨를
//      언급하지 않고 ①②↔③을 비교하지도 않는다 — 214의 「각 호의 가액 중 많은 것」은 ④1호↔④2호 비교다.
//      이 5건을 C의 근거로 인용하지 말 것.
//   ⇒ 독법을 다시 바꾸려면 위 자료를 먼저 반박할 것. 근거 없이 되돌리지 말 것.
//
// ※ ④2호(취득 당시 가액 × 생산자물가상승률)는 상속·증여 자산에 부적용
//   (조심2023서0676·심사양도2012-0006 — 상속 당시 가액이 확인되지 않으면 적용 여지 없음).
// ② 소령 §164④~⑦ 취득당시 기준시가 — **§163⑨1호·2호가 근거**(§176조의2④ 아님).
//    §163⑨은 「의제취득일」로 나뉘지 않고 조건이 **「기준시가 고시 전 상속·증여」**뿐이라,
//    1985년 이전 상속은 개별공시지가(1990)·건물 기준시가(2005) 둘 다 고시 전이라 당연히 해당한다.
//    ⭐ **시점은 pre/post가 갈린다**(B-1 · 2026-08-07 확정):
//       · post-deemed: §163⑨ 본문대로 **상속개시일 또는 증여일 현재**
//       · pre-deemed : **의제취득일(1985.1.1.) 현재** — 「소득세법」 부칙(법률 제4803호) §8이
//         "1984.12.31. 이전에 취득한 것은 **1985.1.1.에 취득한 것으로 본다**"고 **취득시기 자체**를
//         의제하므로 §164④~⑦의 「취득당시」도 그날이다(조 제목: 「양도자산의 **취득시기**에 관한 의제」).
//    ⚠️ **이 시점은 엔진이 강제하지 못한다.** 산식에 날짜 파라미터가 없고(probe 실증: `acquisitionDate`를
//       1974→1985로 바꿔도 `calculatePre1990LandValuation` 산출값 **동일**), 값은 사용자가 넣는
//       등급·단가로만 정해진다. ⇒ 통제점은 **UI 라벨**이다 — `sec164AcqTimePointLabel`
//       (`lib/calc/transfer-163-9-base-date.ts`)이 pre-deemed에서 「의제취득일(1985.1.1.)」을 요구한다.
//       계획서: docs/02-design/features/sec164-clause-a-deemed-date-timing-b1.plan.md
//    ⚠️ 같은 값이 ③의 **환산 분자**(standardPriceAtDeemedDate)로도 쓰이므로 **필드를 분리**한다(역할이 둘).
//    계획서: docs/02-design/features/inheritance-pre-deemed-164-max.plan.md
// ※ ①②가 둘 다 비면 ③만 남는다. 「①②를 빠뜨려 max 후보에서 빠지는」 오입력은 ⑧ E-1 선언 게이트
//   (`lib/calc/transfer-tax-validate-clause-a.ts`)가 막는다(Q-6 a — 게이트 유지).

function calcPreDeemed(
  input: InheritanceAcquisitionInput,
  redevelopment166_3Price: number | null | undefined,
): InheritanceAcquisitionResult {
  const warnings: string[] = [];
  const isRedevelopment = redevelopment166_3Price !== undefined;

  // ③ 환산취득가: 양도가 × (의제취득일 기준시가 ÷ 양도시 기준시가) — §176조의2④·③3호
  //   재개발·재건축 종전자산은 §166③ 금액(Q-8 a — 재개발 분기가 실제로 적용하는 산식). §176조의2④ 입력은 쓰지 않는다.
  let converted = 0;
  if (isRedevelopment) {
    converted = redevelopment166_3Price ?? 0;
  } else if (
    input.transferPrice &&
    input.standardPriceAtDeemedDate &&
    input.standardPriceAtTransfer &&
    input.standardPriceAtTransfer > 0
  ) {
    converted = calculateEstimatedAcquisitionPrice(
      input.transferPrice,
      input.standardPriceAtDeemedDate,
      input.standardPriceAtTransfer,
    );
  }

  // ① 상증법 §60~66 평가액 (상속세 신고가액)
  const reported =
    input.reportedValue !== undefined && input.reportedValue > 0
      ? Math.floor(input.reportedValue)
      : 0;

  // ② §164④~⑦ 취득당시 기준시가 — opt-in(payload 있을 때만 주입). 자산별 배타.
  //   토지 §164④ = §163⑨**1호**(개별공시지가 최초고시 1990-08-30 前 상속·증여)
  //   주택 §164⑦ · 상가 §164⑥ = §163⑨**2호**(건물 기준시가 고시 前)
  const sec164 =
    input.houseValuationStdPrice ??
    input.commercialValuationStdPrice ??
    input.landValuationStdPrice ??
    0;

  // §163⑨ 본문·1호·2호 → max(①, ②). 동점 시 ① 우선.
  const clauseA = Math.max(reported, sec164);

  // 3자 max(상속증여세과-223) — ①② vs ③, 동점은 ①② 우선(Q-5). 비교 단위는 취득가액뿐(Q-7 a).
  const clauseAWins = clauseA > 0 && clauseA >= converted;
  const acquisitionPrice = clauseAWins ? clauseA : converted;

  const selectedMethod: PreDeemedSelectedMethod = clauseAWins
    ? reported >= sec164
      ? "reported"
      : "sec164"
    : "converted";

  if (acquisitionPrice === 0) {
    warnings.push(
      "취득가액 산정 정보(상증법 평가액·환산취득가)가 모두 부족합니다. 취득가 = 0으로 처리됩니다.",
    );
  }

  const breakdown: PreDeemedBreakdown = {
    reportedAmount: reported > 0 ? reported : null,
    convertedAmount: converted,
    sec164Amount: sec164 > 0 ? sec164 : null,
    selectedMethod,
    ...(isRedevelopment && { convertedBasis: "redevelopment_166_3" as const }),
  };

  return {
    acquisitionPrice,
    method: "pre_deemed_max",
    legalBasis: isRedevelopment
      ? `${TRANSFER.INHERITED_BEFORE_DEEMED} · ${REDEVELOPMENT.CONVERTED_ACQ}`
      : `${TRANSFER.INHERITED_BEFORE_DEEMED} · ${TRANSFER.PRE1990_STD_PRICE_CONVERSION}`,
    formula: buildPreDeemedFormula(breakdown, acquisitionPrice, input.isGift === true),
    preDeemedBreakdown: breakdown,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function buildPreDeemedFormula(b: PreDeemedBreakdown, acquisitionPrice: number, isGift: boolean): string {
  const lines: string[] = [];
  const notSelected = " (미적용 — 더 작은 금액)";
  if (b.reportedAmount !== null) {
    lines.push(
      `① 상증법 평가액(${isGift ? "증여세" : "상속세"} 신고가액): ${b.reportedAmount.toLocaleString()}` +
        (b.selectedMethod === "reported" ? "" : notSelected),
    );
  }
  if (b.sec164Amount !== null) {
    lines.push(
      `② §164 취득당시 기준시가: ${b.sec164Amount.toLocaleString()}` +
        (b.selectedMethod === "sec164" ? "" : notSelected),
    );
  }
  const convertedLabel =
    b.convertedBasis === "redevelopment_166_3" ? "③ §166③ 재개발 환산취득가액" : "③ 환산취득가액";
  lines.push(
    `${convertedLabel}: ${b.convertedAmount.toLocaleString()}` +
      (b.selectedMethod === "converted" ? "" : notSelected),
  );

  const label =
    b.selectedMethod === "reported"
      ? "① 상증법 평가액"
      : b.selectedMethod === "sec164"
        ? "② §164 취득당시 기준시가"
        : convertedLabel;
  lines.push(`→ 적용 (①②③ 중 큰 금액, ${label}): ${acquisitionPrice.toLocaleString()}`);
  return lines.join("\n");
}

// ─── Case B: 의제취득일(1985.1.1.) 이후 상속 ─────────────────────────────

function calcPostDeemed(input: InheritanceAcquisitionInput): InheritanceAcquisitionResult {
  // 고시 前 상속·증여 자산(§163⑨): 취득가액 = max(① 상증법 평가액[reportedValue], ② §164 취득당시 기준시가).
  //   토지(개별공시지가 미공시, <1990.8.30) = §164④ landValuationStdPrice      ← §163⑨**1호**
  //   주택(개별주택가격 미공시, <2005.4.30) = §164⑦ houseValuationStdPrice     ← §163⑨**2호**
  //   상가(기준시가 미공시, <2005.1.1)      = §164⑥ commercialValuationStdPrice ← §163⑨**2호**
  // ⚠️ **1호는 「의제취득일」과 무관하다** — 조건이 「1990.8.30. 고시 前 상속·증여받은 토지」뿐이라
  //    의제취득일 이후(1985.1.1.~1990.8.30.) 상속 토지도 당연히 대상이다(2호가 pre/post 구분 없는 것과 같다).
  // 자산은 셋 중 하나만 주입(배타). ③(환산취득가/양도가 스케일) 적용 불가.
  // ①·② 실지거래가액 의제 → 개산공제 없음(추가 처리 없이 acquisitionPrice만 반환).
  const sec164Std =
    input.houseValuationStdPrice ?? input.commercialValuationStdPrice ?? input.landValuationStdPrice;
  if (sec164Std !== undefined && sec164Std > 0) {
    const kind: "house" | "commercial" | "land" =
      input.houseValuationStdPrice !== undefined
        ? "house"
        : input.commercialValuationStdPrice !== undefined
          ? "commercial"
          : "land";
    const reported =
      input.reportedValue !== undefined && input.reportedValue >= 0
        ? Math.floor(input.reportedValue)
        : 0;
    const std = Math.floor(sec164Std);
    const sec164Wins = std >= reported;
    const acquisitionPrice = sec164Wins ? std : reported;
    // 공동주택은 「국세청 고시 가액 없었음」일 때만 여기 온다 — 첫 가격이 국세청 고시면 §164⑥, 국토교통부 공시면 ⑦(계획서 Q-1).
    const apartAgency = kind === "house" && input.assetKind === "house_apart" ? input.apartFirstPriceAgency : undefined;
    const clause =
      kind === "house" ? (apartAgency === "nts" ? "§164⑥" : "§164⑦") : kind === "commercial" ? "§164⑥" : "§164④";
    const disclosureLabel =
      kind === "house"
        ? apartAgency === "nts"
          ? "국세청 공동주택 기준시가 미고시"
          : apartAgency === "molit"
            ? "공동주택가격 미공시"
            : "개별주택가격 미공시"
        : kind === "commercial"
          ? "상가 기준시가 미공시"
          : "개별공시지가 미공시";
    return {
      acquisitionPrice,
      method: "supplementary",
      legalBasis:
        kind === "house"
          ? apartAgency === "nts"
            ? TRANSFER.INHERITED_AFTER_DEEMED_APART_NTS_MAX
            : TRANSFER.INHERITED_AFTER_DEEMED_HOUSE_MAX
          : kind === "commercial"
            ? TRANSFER.INHERITED_AFTER_DEEMED_COMMERCIAL_MAX
            : TRANSFER.INHERITED_AFTER_DEEMED_LAND_MAX,
      formula:
        `상증법 평가액 ${reported.toLocaleString()}과 ` +
        `${clause} 취득당시 기준시가 ${std.toLocaleString()} 중 큰 금액 = ${acquisitionPrice.toLocaleString()} ` +
        `(${disclosureLabel} · ${sec164Wins ? `${clause} 채택` : "상증법 평가액 채택"})`,
    };
  }

  // 상속세 신고가액이 입력된 경우 그대로 취득가액으로 사용
  if (input.reportedValue !== undefined && input.reportedValue >= 0 && input.reportedMethod) {
    // 증여는 평가방법을 받지 않는다(④가 `supplementary`로 채운다) — 방법 이름·§61을 쓰지 않는다.
    if (input.isGift) {
      return {
        acquisitionPrice: Math.floor(input.reportedValue),
        method: input.reportedMethod,
        legalBasis: TRANSFER.INHERITED_AFTER_DEEMED,
        formula: `증여세 신고가액(증여일 현재 상증법 평가액) ${input.reportedValue.toLocaleString()} 적용`,
      };
    }
    return {
      acquisitionPrice: Math.floor(input.reportedValue),
      method: input.reportedMethod,
      legalBasis: resolvePostDeemedLegalBasis(input.reportedMethod),
      formula: resolvePostDeemedFormula(input.reportedMethod, input.reportedValue),
    };
  }

  // 신고가액 미입력 — 기존 우선순위(시가→감정→보충) fallback (하위호환)
  return legacyFallback(input);
}

function resolvePostDeemedLegalBasis(method: InheritanceAcquisitionMethod): string {
  switch (method) {
    case "market_value":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ①`;
    case "appraisal":           return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ⑤`;
    case "auction_public_sale": return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 §60 ② (수용·경매·공매)`;
    case "similar_sale":        return `${TRANSFER.INHERITED_AFTER_DEEMED} · 상증법 시행령 §49 (유사매매사례)`;
    case "supplementary":       return `${TRANSFER.INHERITED_AFTER_DEEMED} · ${TRANSFER.INHERITANCE_VALUATION_PRINCIPLE}`;
    default:                    return TRANSFER.INHERITED_AFTER_DEEMED;
  }
}

function resolvePostDeemedFormula(method: InheritanceAcquisitionMethod, value: number): string {
  const v = value.toLocaleString();
  switch (method) {
    case "market_value":        return `매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "appraisal":           return `감정평가액 ${v}원 (상속세 신고가액) 적용`;
    case "auction_public_sale": return `수용·경매·공매가액 ${v}원 (상속세 신고가액) 적용`;
    case "similar_sale":        return `유사매매사례가액 ${v}원 (상속세 신고가액) 적용`;
    case "supplementary":       return `보충적평가액 ${v}원 (상속세 신고가액) 적용`;
    default:                    return `상속세 신고가액 ${v}원 적용`;
  }
}

// ─── 기존 로직 fallback (하위호환) ────────────────────────────────────────

function legacyFallback(
  input: InheritanceAcquisitionInput,
): InheritanceAcquisitionResult {
  const { assetKind, landAreaM2, publishedValueAtInheritance, marketValue, appraisalAverage } = input;

  if (assetKind === "land" && (!landAreaM2 || landAreaM2 <= 0)) {
    throw new Error("토지는 landAreaM2(㎡)가 필수입니다");
  }

  // 우선순위 1: 시가
  if (marketValue !== undefined && marketValue > 0) {
    return {
      acquisitionPrice: Math.floor(marketValue),
      method: "market_value",
      legalBasis: "상증법 §60 ①",
      formula: `시가 ${marketValue.toLocaleString()} 적용`,
    };
  }

  // 우선순위 2: 감정가 평균
  if (appraisalAverage !== undefined && appraisalAverage > 0) {
    return {
      acquisitionPrice: Math.floor(appraisalAverage),
      method: "appraisal",
      legalBasis: "상증법 §60 ⑤",
      formula: `감정평가액 평균 ${appraisalAverage.toLocaleString()} 적용`,
    };
  }

  // 우선순위 3: 보충적평가액
  const supplementary = computeSupplementary(assetKind, publishedValueAtInheritance ?? 0, landAreaM2);
  return {
    acquisitionPrice: supplementary.amount,
    method: "supplementary",
    legalBasis: `${TRANSFER.ACQ_INHERITED_SUPPLEMENTARY} · 상증법 §61`,
    formula: supplementary.formula,
  };
}

// ─── 보충적평가 계산 ──────────────────────────────────────────────────────

function computeSupplementary(
  assetKind: InheritanceAssetKind,
  publishedValue: number,
  landAreaM2: number | undefined,
): { amount: number; formula: string } {
  if (assetKind === "land") {
    const area = landAreaM2 ?? 0;
    const amount = multiplyByArea(publishedValue, area);
    return {
      amount,
      formula: `개별공시지가 ${publishedValue.toLocaleString()}/㎡ × ${area}㎡ = ${amount.toLocaleString()}`,
    };
  }

  const amount = Math.floor(publishedValue);
  const label = assetKind === "house_individual" ? "개별주택가격" : "공동주택가격";
  return {
    amount,
    formula: `${label} ${amount.toLocaleString()} 적용`,
  };
}
