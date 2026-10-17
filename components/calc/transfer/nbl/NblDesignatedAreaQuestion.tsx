"use client";

/**
 * 「양도 당시 지정지역에 있는 토지인가」 질문 — 비사업용 토지이고 **양도일이 2009.3.16.~2015.12.31.**일 때만 뜬다.
 *
 * 비사업용 토지 토글을 켠 토지 말고도, 엔진이 **자동으로 비사업용 토지로 가르는 파트**(주택 배율초과 부수토지 · 주택 부수토지 컴패니언의 한도 초과분 ·
 * 일반건물 배율초과 토지)를 가진 자산에서 같은 질문을 한다 — 그 파트는 사용자가 «비사업용 토지» 토글을 켜지 않아 질문이 뜰 자리가 없었다.
 * 호출부가 «그 파트가 있을 때만» 렌더하고(`subject`로 무엇이 비사업용인지 밝힌다), 기간 판정은 이 컴포넌트가 한다.
 *
 * 이 기간에 양도하는 비사업용 토지는 §104①8호 중과(기본세율 +10%p)가 유예되는데(§104⑥ · 법률 제12169호 부칙 제20조),
 * **「소득세법」 §104의2②에 따른 지정지역에 있는 부동산은 유예에서 제외**된다. 지정 여부는 소재지·양도시점의 고시 이력이라
 * 코드가 가를 수 없어 사용자가 고른다(사용자 결정 2026-10-16). 고르지 않으면 엔진은 지정지역으로 보고(모름=불리) 중과를 유지하며 확인 필요를 낸다.
 *
 * 기간 판정은 엔진과 같은 함수(`isNblRateDeferralWindow`)를 쓴다 — 화면이 기간을 따로 유도하면 엔진과 어긋난다.
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  isNblRateDeferralWindow,
  NBL_RATE_DEFERRAL_FROM,
  NBL_RATE_DEFERRAL_TO,
} from "@/lib/tax-engine/data/nbl-rate-deferral-era";

const dot = (d: string) => `${d.split("-").map(Number).join(".")}.`; // 2009-03-16 → 2009.3.16.

interface Props {
  /** 양도일(YYYY-MM-DD). 비어 있거나 유예 기간 밖이면 렌더하지 않는다 */
  transferDate: string | undefined;
  value: boolean | undefined;
  onChange: (isDesignatedArea: boolean) => void;
  /** 비사업용 토지가 되는 부분 — 토글을 켠 토지는 기본값, 자동으로 갈린 파트는 «배율 초과 부수토지» 등으로 밝힌다 */
  subject?: string;
  /** 같은 화면에 여러 개가 뜰 수 있어 셀렉터·radio name을 가른다 */
  idSuffix: string;
}

export function NblDesignatedAreaQuestion({ transferDate, value, onChange, idSuffix, subject = "비사업용 토지" }: Props) {
  if (!transferDate || !isNblRateDeferralWindow(transferDate)) return null;
  return (
    <ToneCard tone="amber" title="양도 당시 지정지역에 있는 토지인가요?">
      <div data-testid={`nbl-designated-area-question-${idSuffix}`} className="space-y-2">
        <p className="text-xs leading-relaxed">
          양도일이 {dot(NBL_RATE_DEFERRAL_FROM)}~{dot(NBL_RATE_DEFERRAL_TO)}이면 {subject}의 §104①8호 중과(기본세율 +10%p)가 유예되어
          §104①1호 세율(보유 2년 미만이면 2·3호)이 적용됩니다. 다만 「소득세법」 §104의2②에 따른 <b>지정지역</b>에 있는 토지는 유예 대상이 아닙니다.
        </p>
        <RadioCardGroup
          name={`nbl-designated-area-${idSuffix}`}
          layout="inline"
          tone="amber"
          value={value === undefined ? "" : value ? "in" : "out"}
          onChange={(v) => onChange(v === "in")}
          options={[
            { value: "out", label: "지정지역 아님", testId: `nbl-designated-area-out-${idSuffix}` },
            { value: "in", label: "지정지역", testId: `nbl-designated-area-in-${idSuffix}` },
          ]}
        />
        <p className="text-caption text-muted-foreground">
          고르지 않으면 지정지역으로 보고 중과를 유지해 계산합니다(확인 필요).
        </p>
      </div>
    </ToneCard>
  );
}
