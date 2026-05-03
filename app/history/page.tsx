import { HistoryClient } from "./HistoryClient";

export const metadata = {
  title: "계산 이력 | KoreanTaxCalc",
};

// 로컬 단계: IndexedDB는 클라이언트 전용 — Server Component는 레이아웃만 담당
export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">계산 이력</h1>
      </div>
      <HistoryClient />
    </div>
  );
}
