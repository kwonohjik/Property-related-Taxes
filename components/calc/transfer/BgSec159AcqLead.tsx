/**
 * ③ 취득정보 「취득가액 — 부담부증여 §159 자동 산정」 안내의 첫 문장(D-3m · 계획서 `bg-163-9-proviso-post-deemed.plan.md` Q-23 a).
 * 기준시가 평가(또는 시가 평가에서 담보평가가 이겨 취득시 기준시가가 강제되는 경우)만 「취득당시 기준시가 × 채무비율」이다.
 * 시가 평가는 ② 「부담부증여」 카드의 산정방식이 정하고, 실지면 그 카드 실지 칸의 평가액(소령 §163⑨ · 단서 구간이면 §164 가액과 큰 금액)이다.
 */
import type { BgSec163_9ProvisoKind } from "@/lib/calc/bg-163-9-proviso";

const SEC164_AT: Record<BgSec163_9ProvisoKind, string> = {
  land: "같은 카드의 §164④",
  house: "같은 카드의 §164⑦",
  commercial: "아래 「§164⑥ 취득당시 기준시가」 칸의",
  building: "아래 「§164⑤ 취득당시 건물 기준시가」 칸의",
};

interface Props {
  cause: "inheritance" | "gift";
  /** 취득가액이 취득시 기준시가 × 채무비율인가(기준시가 평가 · 담보 승) */
  stdBasis: boolean;
  /** §163⑨ 단서 구간(`bgSec163_9ProvisoKind`) */
  provisoKind: BgSec163_9ProvisoKind | null;
}

export function BgSec159AcqLead({ cause, stdBasis, provisoKind }: Props) {
  if (stdBasis) {
    return (
      <>
        부담부증여에서 <strong>양도로 보는 부분</strong>의 취득가액은 취득당시 기준시가에
        <strong> 채무비율</strong>을 곱해 산정합니다.{" "}
      </>
    );
  }
  const base = cause === "gift" ? "증여일" : "상속개시일";
  return (
    <>
      부담부증여에서 <strong>양도로 보는 부분</strong>의 취득가액은 ② 양도정보 &lsquo;부담부증여&rsquo; 카드에서 고른
      <strong> 산정방식</strong>으로 정하고 <strong>채무비율</strong>을 곱합니다. 실지취득가액이면 {base} 현재 상증법 평가액을 그 카드의
      실지취득가액 칸에 입력합니다(소득세법 시행령 §163⑨
      {provisoKind ? <> — 단서 구간이라 {SEC164_AT[provisoKind]} 가액과 큰 금액을 씁니다</> : null}).{" "}
    </>
  );
}
