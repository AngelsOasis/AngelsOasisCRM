import { BrandLogo } from "./common/BrandLogo";

export default function LoadingScreen({ message = "Loading your workspace…" }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-6 text-plum" role="status" aria-live="polite">
      <BrandLogo size="lg" variant="horizontal" theme="light" />
      <span className="sr-only">{message}</span>
      <span aria-hidden="true" className="h-9 w-9 animate-spin rounded-full border-[3px] border-plum/15 border-t-forest" />
      <p aria-hidden="true" className="text-sm text-plum/65">{message}</p>
    </div>
  );
}
