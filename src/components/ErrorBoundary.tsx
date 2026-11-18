import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { CM_LOGO_PATH, APP_OFFICIAL_NAME } from '../types';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && parsed.error) {
          friendly = `Permission or sync issue (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        // plain string message
      }

      return (
        <div className="min-h-screen bg-[#FBF9F1] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center">
            <img
              src={CM_LOGO_PATH}
              alt={APP_OFFICIAL_NAME}
              className="w-16 h-16 rounded-2xl mx-auto mb-4 object-cover shadow-sm"
            />
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="mt-2 text-sm text-slate-600 break-words">{friendly}</p>
            <button
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="mt-5 w-full py-3 px-4 rounded-2xl bg-[#6A4CFF] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#5A3CE8] transition"
            >
              <RotateCcw className="w-4 h-4" />
              Reload {APP_OFFICIAL_NAME}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
