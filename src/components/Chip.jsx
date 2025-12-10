/**
 * Chip Component
 *
 * A reusable chip/bubble component with multiple variants.
 * Used throughout the app for tags, filters, and interactive selections.
 *
 * @param {Object} props
 * @param {'default' | 'selected' | 'ghost' | 'static'} props.variant - Visual style variant
 * @param {boolean} props.selected - Whether the chip is selected (alternative to variant="selected")
 * @param {Function} props.onClick - Click handler (makes chip interactive)
 * @param {boolean} props.disabled - Disable interaction
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Chip content
 * @param {string} props.href - If provided, renders as a link
 * @param {Object} props.style - Additional inline styles
 */
export function Chip({
  variant = 'default',
  selected = false,
  onClick,
  disabled = false,
  className = '',
  children,
  href,
  style = {},
  ...props
}) {
  // Determine if chip is interactive
  const isInteractive = !!(onClick || href) && variant !== 'static';

  // Compute variant (selected prop overrides variant)
  const computedVariant = selected ? 'selected' : variant;

  // Build CSS classes
  const classes = [
    'bubble',
    computedVariant !== 'default' && computedVariant,
    className,
  ].filter(Boolean).join(' ');

  // Common props
  const commonProps = {
    className: classes,
    style,
    ...props,
  };

  // Render as link if href provided
  if (href) {
    return (
      <a
        {...commonProps}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </a>
    );
  }

  // Render as button if interactive
  if (isInteractive) {
    return (
      <button
        type="button"
        {...commonProps}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </button>
    );
  }

  // Render as span for static/display chips
  return (
    <span {...commonProps}>
      {children}
    </span>
  );
}

/**
 * ChipGroup Component
 *
 * Container for multiple chips with consistent spacing.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Chip elements
 * @param {string} props.className - Additional CSS classes
 * @param {'row' | 'grid'} props.layout - Layout style (default: 'row')
 */
export function ChipGroup({
  children,
  className = '',
  layout = 'row',
  ...props
}) {
  const classes = layout === 'grid'
    ? `bubble-grid ${className}`.trim()
    : `bubble-row ${className}`.trim();

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export default Chip;
