"use client";

/**
 * 대주주 판정 보조 hint 카드 (Phase C — 2026-05-19)
 *
 * 교재 §3장 이미지 50·51 Check Point ④·⑧·⑨·⑩·⑪·⑫·⑬·⑭·⑮ 9건을
 * 3 그룹(시총 산정 / 발행주식총수 / 특수관계인 합산)으로 분류하여
 * 펼치기/접기 표준 토글(ExpandToggleButton)로 노출.
 *
 * - 엔진 자동 가산 없음 — 사용자가 본인·합산 시총·지분율에 사전 합산 입력 책임.
 * - 각 hint에 LawArticleModal 배지 연계 (조문/해석례 출처).
 * - 토글 표준: native <details> → useState + expandToggleClass (전 영역 토글 통일).
 */

import { useState, type ReactNode } from "react";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";

// 카드 외곽 tone 정적 매핑 (feedback_tailwind_static_tone_mapping — dynamic bg-${tone} 금지)
type HintTone = "sky" | "emerald" | "rose" | "amber";
const HINT_CARD_TONE: Record<HintTone, string> = {
  sky: "border-sky-200 bg-sky-50/40",
  emerald: "border-emerald-200 bg-emerald-50/40",
  rose: "border-rose-200 bg-rose-50/40",
  amber: "border-amber-200 bg-amber-50/40",
};

/** 공통 collapsible hint 카드 — native <details> 대체 표준 토글. */
function CollapsibleHintCard({
  tone,
  summary,
  children,
}: {
  tone: HintTone;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-3 text-xs ${HINT_CARD_TONE[tone]}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={expandToggleClass(tone)}
      >
        {expandToggleLabel(open)} · {summary}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Group A — 시총 산정 hint (sky tone)
// F-11 무상증자 · F-17 신주인수권 · F-18 콜옵션 · F-22 전환사채
// ────────────────────────────────────────────────────────────────

export function MarketCapHintsCard() {
  return (
    <CollapsibleHintCard tone="sky" summary="💡 시가총액 산정 시 포함/제외 항목 (4건)">
      <ul className="space-y-2 pl-2 text-sky-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">무상증자:</span>
          <span className="flex-1">
            당해 법인 증자로 취득한 신주(직전사업연도 종료일 현재 미상장)는 시총 산정에 <strong>포함</strong>
            <LawArticleModal legalBasis="서면4팀-716" label="서면4팀-716" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">신주인수권:</span>
          <span className="flex-1">
            시총 산정 시 신주인수권 <strong>포함</strong>
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157④" className="ml-1" />
            <LawArticleModal legalBasis="부동산거래-526" label="부동산거래-526" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">콜옵션·주식매수선택권:</span>
          <span className="flex-1">
            시총 산정에서 <strong>제외</strong>
            <LawArticleModal legalBasis="서면법령해석 재산 2014-22136" label="재산 2014-22136" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-sky-700">전환사채:</span>
          <span className="flex-1">
            전환사채 가액은 시총 산정 시 <strong>제외</strong>
            <LawArticleModal legalBasis="법령해석 재산 2015-0434" label="재산 2015-0434" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-sky-100/70 px-2 py-1 text-[10px] text-sky-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목이 해당되면 시가총액 입력값에 사전 반영해 주세요.
      </p>
    </CollapsibleHintCard>
  );
}

// ────────────────────────────────────────────────────────────────
// Group B — 발행주식총수 hint (emerald tone)
// F-19 자기주식 · F-20 우선주
// ────────────────────────────────────────────────────────────────

export function IssuedSharesHintsCard() {
  return (
    <CollapsibleHintCard tone="emerald" summary="💡 발행주식총수 산정 시 포함 항목 (2건)">
      <ul className="space-y-2 pl-2 text-emerald-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-emerald-700">자기주식:</span>
          <span className="flex-1">
            의결권 없는 자기주식도 발행주식총수에 <strong>포함</strong>
            <LawArticleModal legalBasis="법령해석 재산 2015-2137" label="재산 2015-2137" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-emerald-700">우선주:</span>
          <span className="flex-1">
            무의결권 우선주 <strong>포함</strong>
            <LawArticleModal legalBasis="서면부동산 2015-2562" label="서면부동산 2015-2562" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-emerald-100/70 px-2 py-1 text-[10px] text-emerald-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목을 포함한 총 발행주식수를 입력해 주세요.
      </p>
    </CollapsibleHintCard>
  );
}

// ────────────────────────────────────────────────────────────────
// Group D — 합병·분할·신설법인 hint (rose tone) — F-08·F-12·F-13
// ────────────────────────────────────────────────────────────────

export function SpecialEntityHintsCard() {
  return (
    <CollapsibleHintCard tone="rose" summary="💡 합병·분할·간접투자·세율 부칙 안내 (4건)">
      <ul className="space-y-2 pl-2 text-rose-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-rose-700">상장 전환:</span>
          <span className="flex-1">
            직전사업연도 종료일에 비상장이었던 법인이 양도시점 코스닥 상장이면 <strong>코스닥 임계 적용</strong>
            (양도일 임계 — 회신문 기획재정부재산-1483은 2009.9.21. 시점 100분의 5)
            <LawArticleModal legalBasis="기획재정부재산-1483" label="재산-1483" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-rose-700">§178 투자기구:</span>
          <span className="flex-1">
            자본시장법 §178 투자기구를 통한 간접투자 주식은 시총·지분율에 <strong>합산하지 않음</strong>
            <LawArticleModal legalBasis="재산-1237" label="재산-1237" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-rose-700">창업투자조합:</span>
          <span className="flex-1">
            중소기업창업투자조합의 주식양도차익은 <strong>조합원 기준</strong>으로 대주주 판정 (조합 합산 ❌)
            <LawArticleModal legalBasis="재재산-466" label="재재산-466" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-rose-700">세율 부칙:</span>
          <span className="flex-1">
            2016.1.1. 이후 양도분부터 중소기업 여부와 관계없이 대주주 양도 주식은 <strong>20% 단일</strong>
            (종전은 중소 10%). 2016.1.1. 현재 의무보호예수 중인 중소기업 대주주 주식을 보호예수 종료
            6개월 후 양도 시 개정 세율(20%) 적용. 본 앱은 누진세율(20%/25%) 통일 적용.
            <LawArticleModal legalBasis="소득세법 §104" label="§104①" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-rose-100/70 px-2 py-1 text-[10px] text-rose-700">
        ※ 위 케이스 해당 시 본인·합산 시총·지분율 입력값에 사전 반영해 주세요.
      </p>
    </CollapsibleHintCard>
  );
}

// ────────────────────────────────────────────────────────────────
// Group C — 특수관계인 합산 hint (amber tone)
// F-15 대차주식 · F-16 사모펀드 · F-21 비거주자
// ────────────────────────────────────────────────────────────────

export function CombinedShareHintsCard() {
  return (
    <CollapsibleHintCard tone="amber" summary="💡 특수관계인 합산 시 포함 항목 (3건)">
      <ul className="space-y-2 pl-2 text-amber-900">
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">대차주식:</span>
          <span className="flex-1">
            2013.2.15. 이후 대차거래는 대여자 주식으로 보아 대주주 판정 (시총·지분율에 사전 합산 입력)
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157 (2013.2.15.)" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">사모펀드 간접소유:</span>
          <span className="flex-1">
            2013.2.15. 이후 사모펀드 간접소유 주식 합산 (시총·지분율에 사전 합산 입력)
            <LawArticleModal legalBasis="소득세법 시행령 §157" label="§157 (2013.2.15.)" className="ml-1" />
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-medium text-amber-700">비거주자:</span>
          <span className="flex-1">
            특수관계 기타주주에 비거주자 <strong>포함</strong>
            <LawArticleModal legalBasis="부동산거래관리-866" label="부동산거래관리-866" className="ml-1" />
          </span>
        </li>
      </ul>
      <p className="mt-3 rounded-md bg-amber-100/70 px-2 py-1 text-[10px] text-amber-700">
        ※ 본 앱은 자동 가산하지 않습니다 — 위 항목 해당 시 합산 시총·지분율 입력값에 사전 반영해 주세요.
      </p>
    </CollapsibleHintCard>
  );
}
