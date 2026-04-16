import TransferTaxCalculator from "./TransferTaxCalculator";

export const metadata = {
  title: "양도소득세 계산기",
  description:
    "양도소득세 자동 계산 — 1세대1주택 비과세, 장기보유특별공제, 다주택 중과세, 환산취득가액까지 한 번에 (소득세법 §89~§104)",
  openGraph: {
    title: "양도소득세 계산기",
    description:
      "양도소득세 자동 계산 — 1세대1주택 비과세, 장기보유특별공제, 다주택 중과세, 환산취득가액까지 한 번에 (소득세법 §89~§104)",
    type: "website",
  },
};

export default function TransferTaxPage() {
  return <TransferTaxCalculator />;
}
