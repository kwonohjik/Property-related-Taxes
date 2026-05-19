/**
 * 대주주 판정 보조 hint 카드 (Phase C — 2026-05-19)
 *
 * 교재 §3장 이미지 50·51 Check Point ④·⑧·⑨·⑩·⑪·⑫·⑬·⑭·⑮ 9건을
 * 3 그룹(시총 산정 / 발행주식총수 / 특수관계인 합산)으로 분류하여
 * collapsible UI(`<details>`)로 노출.
 *
 * - 엔진 자동 가산 없음 — 사용자가 본인·합산 시총·지분율에 사전 합산 입력 책임.
 * - 각 hint에 LawArticleModal 배지 연계 (조문/해석례 출처).
 * - 토글 신설은 메모리 [[feedback_no_silent_apportion_fallback]] 정신상 폐기
 *   (자동 가산 로직 없는 토글은 책임 소재만 모호하게 함).
 */

import { LawArticleModal } from "@/components/ui/law-article-modal";

// ────────────────────────────────────────────────────────────────
// Group A — 시총 산정 hint (sky tone)
// F-11 무상증자 · F-17 신주인수권 · F-18 콜옵션 · F-22 전환사채
// ────────────────────────────────────────────────────────────────

export function MarketCapHintsCard() {
  return (
    <details className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-sky-800">
        💡 시가총액 산정 시 포함/제외 항목 (4건)
      </summary>
      <ul className="mt-2 space-y-2 pl-2 text-sky-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">F-11 무상증자:</span>
          <span className="flex-1">
            당해 법인 증자로 취득한 신주(직전사업연도 종료일 현재 미상장)는 시총 산정에 <strong>포함</strong>
            <LawArticleModal legalBasis="서면4팀-716" label="서면4팀-716" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">F-17 신주인수권:</span>
          <span className="flex-1">
            시총 산정 시 신주인수권 <strong>포함</strong>
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157④" className="ml-1" />
            <LawArticleModal legalBasis="부동산거래-526" label="부동산거래-526" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">F-18 콜옵션·주식매수선택권:</span>
          <span className="flex-1">
            시총 산정에서 <strong>제외</strong>
            <LawArticleModal legalBasis="서면법령해석 재산 2014-22136" label="재산 2014-22136" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">F-22 전환사채:</span>
          <span className="flex-1">
            전환사채 가액은 시총 산정 시 <strong>제외</strong>
            <LawArticleModal legalBasis="법령해석 재산 2015-0434" label="재산 2015-0434" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-sky-100/70 px-2 py-1 text-[10px] text-sky-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목이 해당되면 시가총액 입력값에 사전 반영해 주세요.
      </p>
    </details>
  );
}

// ────────────────────────────────────────────────────────────────
// Group B — 발행주식총수 hint (emerald tone)
// F-19 자기주식 · F-20 우선주
// ────────────────────────────────────────────────────────────────

export function IssuedSharesHintsCard() {
  return (
    <details className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-emerald-800">
        💡 발행주식총수 산정 시 포함 항목 (2건)
      </summary>
      <ul className="mt-2 space-y-2 pl-2 text-emerald-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-emerald-700">F-19 자기주식:</span>
          <span className="flex-1">
            의결권 없는 자기주식도 발행주식총수에 <strong>포함</strong>
            <LawArticleModal legalBasis="법령해석 재산 2015-2137" label="재산 2015-2137" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-emerald-700">F-20 우선주:</span>
          <span className="flex-1">
            무의결권 우선주 <strong>포함</strong>
            <LawArticleModal legalBasis="서면부동산 2015-2562" label="서면부동산 2015-2562" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-emerald-100/70 px-2 py-1 text-[10px] text-emerald-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목을 포함한 총 발행주식수를 입력해 주세요.
      </p>
    </details>
  );
}

// ────────────────────────────────────────────────────────────────
// Group C — 특수관계인 합산 hint (amber tone)
// F-15 대차주식 · F-16 사모펀드 · F-21 비거주자
// ────────────────────────────────────────────────────────────────

export function CombinedShareHintsCard() {
  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-xs">
      <summary className="cursor-pointer select-none font-semibold text-amber-800">
        💡 특수관계인 합산 시 포함 항목 (3건)
      </summary>
      <ul className="mt-2 space-y-2 pl-2 text-amber-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">F-15 대차주식:</span>
          <span className="flex-1">
            2013.2.15. 이후 대차거래는 대여자 주식으로 보아 대주주 판정 (시총·지분율에 사전 합산 입력)
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157 (2013.2.15.)" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">F-16 사모펀드 간접소유:</span>
          <span className="flex-1">
            2013.2.15. 이후 사모펀드 간접소유 주식 합산 (시총·지분율에 사전 합산 입력)
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157 (2013.2.15.)" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">F-21 비거주자:</span>
          <span className="flex-1">
            특수관계 기타주주에 비거주자 <strong>포함</strong>
            <LawArticleModal legalBasis="부동산거래관리-866" label="부동산거래관리-866" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-amber-100/70 px-2 py-1 text-[10px] text-amber-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목 해당 시 합산 시총·지분율 입력값에 사전 반영해 주세요.
      </p>
    </details>
  );
}
