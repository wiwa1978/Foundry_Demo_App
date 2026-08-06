import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";


const AppWorkspace = lazy(() => import("@/app/AppWorkspace"));


export default function App() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<AppLoadingState />}>
        <AppWorkspace />
      </Suspense>
    </AppErrorBoundary>
  );
}


export function AppLoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700 dark:bg-[#303033] dark:text-slate-200">
      <p className="text-sm font-medium">Loading Foundry Demo...</p>
    </main>
  );
}


export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Foundry Demo failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-[#303033] dark:text-slate-50">
          <section className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-lg dark:border-red-500/40 dark:bg-[#39393d]">
            <h1 className="text-lg font-semibold">Foundry Demo could not start</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Refresh the page. If the problem continues, use the request logs to investigate.
            </p>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
