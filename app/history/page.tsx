import { HomeLink } from "@/components/ui/home-link";
import { HistoryClient } from "./HistoryClient";

export const metadata = {
  title: "계산 이력 | KoreanTaxCalc",
};

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-3">
        <HomeLink />
      </div>
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">계산 이력</h1>
      </div>
      <HistoryClient />
      <div className="mt-8 pt-6 border-t border-border">
        <HomeLink />
      </div>
    </div>
  );
}
