import { AlertTriangle } from "lucide-react";

/**
 * Inline stack of error cards that sits beneath the title card.
 *
 * @param {Object} props
 * @param {Array<{id: string, source?: string, message: string}>} props.errors - Error messages to render
 */
export function ErrorStack({ errors = [] }) {
  const items = (errors || []).filter((error) => Boolean(error?.message));
  if (!items.length) return null;

  return (
    <div className="error-stack" role="alert" aria-live="polite">
      {items.map(({ id, source, message }) => (
        <div key={id} className="error-card">
          <div className="error-card__header">
            <AlertTriangle size={18} aria-hidden />
            <span className="error-card__title">{source || "Error"}</span>
          </div>
          <p className="error-card__message">{message}</p>
        </div>
      ))}
    </div>
  );
}

export default ErrorStack;
