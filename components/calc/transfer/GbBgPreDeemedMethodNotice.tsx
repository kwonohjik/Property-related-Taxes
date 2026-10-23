/**
 * 일반건물 × 부담부증여 · 시가 평가 — 의제취득일(1985.1.1.) 전 상속·증여 파트의 산정 기준 안내(PR-7b-6b · 사용자 결정 Q-28).
 * 그 파트는 산정방식 대신 ①②③ 중 큰 금액 × 채무비율이다. 두 파트 다면 산정방식이 없고(라디오를 숨긴다), 한 파트면 라디오는 다른 파트에만 쓴다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";

export function GbBgPreDeemedMethodNotice({
  parts,
  forOtherShares,
}: {
  parts: { land: boolean; building: boolean; all: boolean };
  forOtherShares: boolean;
}) {
  const label = parts.all ? "토지·건물" : parts.land ? "토지" : "건물";
  const other = parts.land ? "건물" : "토지";
  return (
    <ToneCard tone="violet">
      <p className="text-xs text-violet-900 dark:text-violet-200" data-testid="gb-bg-pre-deemed-method-notice">
        의제취득일(1985.1.1.) 전에 상속·증여받은 <b>{label}</b>의 취득가액은 산정방식과 관계없이 ① 상증법 평가액(취득 정보의 「① 상증법 평가액」 칸)·② 취득시(의제취득일)
        기준시가·③ 환산취득가액(그 파트 증여가액에 「취득시 기준시가를 양도시 기준시가로 나눈 비율」을 곱한 금액) 중 큰 금액에 채무비율을 곱합니다(소득세법 시행령 §159①1호·§176조의2④).{" "}
        {parts.all
          ? forOtherShares
            ? "아래 산정방식은 토지·건물이 모두 의제취득일 전이 아닌 다른 지분의 취득가액에만 씁니다."
            : "산정방식을 고르지 않습니다."
          : `아래 산정방식은 ${other}의 취득가액에만 씁니다.`}
      </p>
    </ToneCard>
  );
}
