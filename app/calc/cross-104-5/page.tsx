import Cross1045Client from "./Cross1045Client";

export const metadata = {
  title: "§104⑤ 합산 계산 — 부동산 · 기타자산",
  description:
    "같은 과세기간에 부동산과 기타자산을 함께 양도한 경우의 양도소득 산출세액 비교과세 (소득세법 §104⑤)",
};

export default function Cross1045Page() {
  return <Cross1045Client />;
}
