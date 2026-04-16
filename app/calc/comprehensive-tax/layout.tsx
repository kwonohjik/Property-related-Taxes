/**
 * 종합부동산세 계산기 레이아웃
 * page.tsx가 "use client"이므로 메타데이터를 이 서버 컴포넌트에서 선언
 */

export const metadata = {
  title: "종합부동산세 계산기",
  description:
    "종합부동산세 자동 계산 — 합산배제 14종, 1세대1주택 세액공제(최대 80%), 재산세 비율 안분 공제, 세부담 상한 (종부세법 §8~§15)",
  openGraph: {
    title: "종합부동산세 계산기",
    description:
      "종합부동산세 자동 계산 — 합산배제 14종, 1세대1주택 세액공제(최대 80%), 재산세 비율 안분 공제, 세부담 상한 (종부세법 §8~§15)",
    type: "website",
  },
};

export default function ComprehensiveTaxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
