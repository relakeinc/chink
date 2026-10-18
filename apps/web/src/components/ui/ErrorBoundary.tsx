import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Límite global de errores de React. Evita la pantalla genérica y ofrece una
 * salida controlada con reintento cuando una ruta falla en render.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Se deja en consola para diagnóstico local; no se envía a terceros.
    console.error("Error de render en Chink SaaS:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-[24px] font-dm">
          <div className="w-full max-w-[460px] rounded-[10px] border border-edge bg-subtle p-[24px] text-ink">
            <h1 className="font-outfit text-[18px] font-semibold">Algo no se pudo mostrar</h1>
            <p className="mt-[8px] text-[12px] leading-[1.5] text-muted">
              Se produjo un error al dibujar esta pantalla. Puedes reintentar sin perder la sesión.
            </p>
            <div className="mt-[16px] flex justify-end gap-[8px]">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-[6px] border border-edge bg-canvas px-[12px] py-[8px] text-[12px] font-semibold transition-colors hover:bg-line"
              >
                Recargar
              </button>
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded-[6px] bg-coal px-[12px] py-[8px] text-[12px] font-semibold text-cream transition-opacity hover:opacity-90"
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
