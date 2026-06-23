"use client";

/**
 * 공부·고시 확인 외부 사이트 링크 배지.
 *
 * 입력값(공시지가·면적·구조·취득일·지분 등)을 사용자가 어디서 떠오는지
 * 출처 사이트를 새 탭 링크로 안내한다. 법령 조문 링크(LawArticleModal)와
 * 시각 스타일을 맞춘 작은 배지.
 *
 * 신규 부착 지점은 REFERENCE_SITES 상수에 사이트를 추가한 뒤 재사용한다.
 */

import { cn } from "@/lib/utils";

export interface ReferenceSite {
  /** 배지에 표시할 라벨 (사이트명 병기) */
  label: string;
  /** 외부 사이트 URL */
  url: string;
}

/** 공부·고시 확인 외부 사이트 (이미지 점검표 1·2순위) */
export const REFERENCE_SITES = {
  /** 개별공시지가 — 부동산공시가격알리미 */
  landPrice: {
    label: "공시지가 확인 (부동산공시가격알리미)",
    url: "https://www.realtyprice.kr",
  },
  /** 토지(임야)대장 — 정부24 (지목·면적·토지등급) */
  landRegister: {
    label: "토지대장 (정부24)",
    url: "https://www.gov.kr",
  },
  /** 일반·집합건축물대장 — 정부24 (구조·면적·용도·신축연도) */
  buildingRegister: {
    label: "건축물대장 (정부24)",
    url: "https://www.gov.kr",
  },
  /** 등기부등본 — 인터넷등기소 (소유권·공유지분·저당권) */
  realEstateRegister: {
    label: "등기부등본 (인터넷등기소)",
    url: "https://www.iros.go.kr",
  },
  /** 토지이용계획확인원 — 토지이음 (용도지역·지구) */
  landUsePlan: {
    label: "토지이용계획 확인 (토지이음)",
    url: "https://www.eum.go.kr",
  },
  /** 부동산 실거래가 — 국토교통부 실거래가 공개시스템 */
  realPrice: {
    label: "실거래가 조회 (국토교통부)",
    url: "https://rt.molit.go.kr",
  },
} satisfies Record<string, ReferenceSite>;

export function ReferenceSiteLinks({
  sites,
  className,
}: {
  sites: ReferenceSite[];
  className?: string;
}) {
  if (sites.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {sites.map((s) => (
        <a
          key={s.label}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/70 transition-colors hover:border-primary/50 hover:text-primary"
        >
          {s.label} ↗
        </a>
      ))}
    </div>
  );
}
