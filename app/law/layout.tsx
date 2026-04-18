export default function LawLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <footer className="border-t bg-muted/50 px-4 py-3 text-center text-xs text-muted-foreground">
        본 리서치 결과는 법제처 Open API를 통해 제공되며, 참고 목적 외 법적
        효력을 갖지 않습니다.
      </footer>
    </div>
  );
}
