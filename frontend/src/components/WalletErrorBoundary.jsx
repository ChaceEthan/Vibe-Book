import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

class WalletErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[wallet] UI boundary caught error", {
      message: error?.message || "Unknown wallet error",
      componentStack: info?.componentStack,
    });
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-navy">{this.props.title || "Wallet section paused"}</p>
            <p className="mt-1 text-xs font-bold text-amber-800">
              This wallet section hit a display issue. Your NEX Points are safe.
            </p>
            <button type="button" className="btn-secondary mt-3 gap-2 bg-white" onClick={this.retry}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }
}

export default WalletErrorBoundary;
