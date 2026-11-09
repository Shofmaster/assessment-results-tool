import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import ConvexBackendSetupScreen from './ConvexBackendSetupScreen';
import { captureException } from '../services/sentry';

const FUNCTION_INVOCATION_FAILED = 'FUNCTION_INVOCATION_FAILED';

function isConvexBackendSetupError(error: Error): boolean {
  return error?.message?.includes(FUNCTION_INVOCATION_FAILED) ?? false;
}

interface Props {
  children: ReactNode;
  /** Optional fallback title override */
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Route the error happened on; leaving it clears the error. */
  errorPath: string | null;
}

function currentPath(): string | null {
  return typeof window === 'undefined' ? null : window.location.pathname;
}

/**
 * Error boundary that catches React errors in child components
 * and displays a recovery UI with a "Try Again" button.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorPath: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorPath: currentPath() };
  }

  /**
   * Every route renders its own <ErrorBoundary> at the same spot under
   * <Routes>, so React reuses ONE instance across navigation. Without this,
   * a crash on one page kept "Something went wrong" on every page after it
   * until a full reload, despite the message telling people to navigate away.
   */
  componentDidUpdate(): void {
    if (this.state.hasError && this.state.errorPath !== currentPath()) {
      this.setState({ hasError: false, error: null, errorPath: null });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    captureException(error, errorInfo.componentStack ?? undefined);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorPath: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (isConvexBackendSetupError(this.state.error)) {
        return <ConvexBackendSetupScreen />;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-400"
                aria-hidden
              >
                <FiAlertTriangle className="text-2xl" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">
                {this.props.fallbackTitle ?? 'Something went wrong'}
              </h2>
              <p className="text-sm text-white/70 mb-4">
                An unexpected error occurred. You can try again or navigate to another section.
              </p>
              {import.meta.env.DEV && (
                <pre className="text-left text-xs text-white/70 bg-navy-900/50 rounded-lg p-4 overflow-auto max-h-32 mb-4">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-6 py-2.5 rounded-lg bg-sky text-navy-900 font-medium hover:bg-sky-light transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
