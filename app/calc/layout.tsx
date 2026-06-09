export default function CalcLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
    </div>
  );
}
