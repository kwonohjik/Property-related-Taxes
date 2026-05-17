import StockTransferTaxCalculator from "./StockTransferTaxCalculator";

export const metadata = {
  title: "주식 양도소득세 계산기",
  description:
    "주식 양도소득세 자동 계산 — 상장 대주주, 취득 후 상장 환산취득가, 비상장·기타자산 (소득세법 §94①3·4, §104①11)",
  openGraph: {
    title: "주식 양도소득세 계산기",
    description:
      "주식 양도소득세 자동 계산 — 상장 대주주, 취득 후 상장 환산취득가, 비상장·기타자산 (소득세법 §94①3·4, §104①11)",
    type: "website",
  },
};

export default function StockTransferTaxPage() {
  return <StockTransferTaxCalculator />;
}
