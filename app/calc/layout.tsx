export default function CalcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <footer className="border-t bg-muted/50 px-4 py-3 text-center text-xs text-muted-foreground">
        본 계산 결과는 참고용이며 법적 효력이 없습니다. 정확한 세금 신고는
        세무 전문가와 상담하시기 바랍니다.
      </footer>
    </div>
  );
}
