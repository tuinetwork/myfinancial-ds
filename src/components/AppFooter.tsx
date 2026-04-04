export function AppFooter() {
  return (
    <>
      <footer className="hidden md:flex h-10 items-center justify-end border-t border-border px-4 bg-card/50 text-xs text-muted-foreground">
        Financial-DS By Sermsak Chusripet
      </footer>
      {/* Spacer so content doesn't hide behind mobile bottom navbar */}
      <div className="h-16 md:hidden" />
    </>
  );
}
