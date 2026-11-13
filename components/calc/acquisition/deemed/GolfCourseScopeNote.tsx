"use client";

/**
 * 간주취득 × 골프장 — 「지방세법」 §13⑤ 후단 적용 범위 안내
 *
 * §13⑤ 후단(현행 MST 282559 본문 대조, 2026-11-13):
 * 「이 경우 골프장은 그 시설을 갖추어 「체육시설의 설치ㆍ이용에 관한 법률」에 따라 체육시설업의
 * 등록(시설을 증설하여 변경등록하는 경우를 포함한다 …)을 하는 경우, 등록된 골프장업을 승계취득하는
 * 경우, 등록을 하지 아니하더라도 사실상 골프장으로 사용하는 경우 및 사실상 사용하는 그 골프장을
 * 승계취득하는 경우에 적용하며 …」
 *
 * 과점주주 간주취득이 이 네 경우 중 어디에 해당하는지 직접 판단한 해석례는 찾지 못했다
 * (계획서 `docs/00-pm/acquisition-deemed-15-2-proviso.plan.md` U-2 · 자료 검색 1998-0634 외 0건).
 * 엔진은 사용자가 고른 구분만 따르므로, 판단 근거가 없다는 사실을 화면에 적는다.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";

interface Props {
  /** 과점주주 간주취득이면 U-2 미확정 고지를 덧붙인다 */
  majorShareholder: boolean;
}

export function GolfCourseScopeNote({ majorShareholder }: Props) {
  return (
    <ToneCard tone="slate" title="골프장 중과 적용 범위 (지방세법 §13⑤ 후단)" bodyClassName="space-y-1.5">
      <div data-testid="deemed-golf-scope-note" className="space-y-1.5 text-xs leading-relaxed">
        <p>
          대상은 회원제 골프장용 부동산 중 구분등록 대상인 토지·건축물과 그 토지 위 입목입니다(§13⑤2호).
          중과는 다음 네 경우에 적용됩니다.
        </p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>시설을 갖추어 체육시설업 등록(증설에 따른 변경등록 포함)을 하는 경우</li>
          <li>등록된 골프장업을 승계취득하는 경우</li>
          <li>등록하지 않았더라도 사실상 골프장으로 사용하는 경우</li>
          <li>사실상 사용하는 그 골프장을 승계취득하는 경우</li>
        </ol>
        {majorShareholder && (
          <p data-testid="deemed-golf-scope-major-shareholder">
            과점주주 간주취득이 위 네 경우 중 어디에 해당하는지 직접 판단한 해석례·심판례는
            확인되지 않았습니다. 조심 1998-0634는 과점주주에게 골프장 중과를 적용한 처분을 전제로,
            골프장 안 물건별 해당 여부만 판단했습니다(수영장 해당, 테니스장·게이트볼장·골프연습장
            비해당). 해당 여부는 관할 지방자치단체에 확인하세요.
          </p>
        )}
      </div>
    </ToneCard>
  );
}
