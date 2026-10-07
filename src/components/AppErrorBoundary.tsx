import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The application failed to render.", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-white px-6 text-ink">
          <div className="max-w-lg rounded-2xl border border-ink/10 p-8 shadow-sm">
            <h1 className="font-serif text-2xl text-plum-dark">The app couldn’t load</h1>
            <p className="mt-3 text-sm text-plum/70">
              A page error stopped the app from rendering. Reload to try again. If it continues,
              check the browser console for details.
            </p>
            <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
