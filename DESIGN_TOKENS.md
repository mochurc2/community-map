# Design Tokens Guide

This project uses **design tokens** - a centralized system for managing all design values (colors, spacing, typography, etc.). This ensures consistency across the app and makes it easy to update the design in one place.

## What Are Design Tokens?

Design tokens are the single source of truth for design decisions. Instead of hardcoding values like `#374151` or `0.5rem` throughout your code, you reference them from a central file.

## How to Use

### In React Components (JavaScript)

Import the tokens at the top of your file:

```javascript
import { tokens, helpers } from './styles/tokens'
```

Then use them in inline styles:

```jsx
// ✅ GOOD - Using tokens
<div style={{
  color: tokens.colors.text.secondary,
  fontSize: tokens.fontSize.base,
  margin: tokens.spacing.lg,
  borderRadius: tokens.radius.md,
}}>
  Hello World
</div>

// ❌ BAD - Hardcoded values
<div style={{
  color: '#374151',
  fontSize: '0.95rem',
  margin: '0.75rem',
  borderRadius: '16px',
}}>
  Hello World
</div>
```

### In CSS Files

CSS variables are automatically available:

```css
.my-component {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  margin: var(--spacing-lg);
  border-radius: var(--radius-md);
}
```

### Using Helper Functions

For common patterns, use the helper functions:

```jsx
import { helpers } from './styles/tokens'

// Card container
<div style={helpers.card}>
  Card content
</div>

// Flex layouts
<div style={helpers.flexRow()}>
  Items with default gap
</div>

<div style={helpers.flexRow('1rem')}>
  Items with custom gap
</div>

<div style={helpers.flexBetween()}>
  Space-between layout
</div>

// Detail text (common in cards)
<p style={helpers.detailText}>
  Detail information
</p>
```

## Available Tokens

### Colors

```javascript
// Primary brand colors
tokens.colors.primary           // #2563eb
tokens.colors.primaryDark       // #1d4ed8

// Text colors
tokens.colors.text.primary      // #0f172a (darkest)
tokens.colors.text.body         // #111827
tokens.colors.text.secondary    // #374151
tokens.colors.text.muted        // #6b7280 (lightest)

// Borders
tokens.colors.border.default    // #e5e7eb

// Backgrounds
tokens.colors.bg.primary        // #ffffff
tokens.colors.bg.secondary      // #f8fafc
tokens.colors.bg.muted          // #f9fafb

// Status colors
tokens.colors.status.success.text    // #16a34a
tokens.colors.status.error.text      // #b91c1c
tokens.colors.status.warning.text    // #d97706
tokens.colors.status.info.text       // #4f46e5
```

### Spacing

```javascript
tokens.spacing.xs       // 0.25rem (4px)
tokens.spacing.sm       // 0.35rem (5.6px)
tokens.spacing.md       // 0.5rem (8px)
tokens.spacing.lg       // 0.75rem (12px)
tokens.spacing.xl       // 1rem (16px)
tokens.spacing['2xl']   // 1.25rem (20px)
```

### Typography

```javascript
// Font sizes
tokens.fontSize.sm      // 0.9rem
tokens.fontSize.base    // 0.95rem
tokens.fontSize.lg      // 1rem
tokens.fontSize.xl      // 1.05rem

// Font weights
tokens.fontWeight.normal    // 400
tokens.fontWeight.medium    // 500
tokens.fontWeight.semibold  // 600
tokens.fontWeight.bold      // 700

// Font family
tokens.fontFamily.base      // "Inter", "Helvetica Neue", Arial, sans-serif
```

### Border Radius

```javascript
tokens.radius.sm        // 12px (buttons, inputs)
tokens.radius.md        // 16px (cards, panels)
tokens.radius.lg        // 18px (large containers)
tokens.radius.full      // 999px (pills, circles)
```

### Shadows

```javascript
tokens.shadow.sm        // Subtle shadow for cards
tokens.shadow.md        // Medium shadow
tokens.shadow.lg        // Large shadow for emphasis
tokens.shadow.focus     // Focus ring (blue)
```

## Common Patterns

### Card Component

```jsx
<div style={helpers.card}>
  <h3 style={{ margin: 0, fontWeight: tokens.fontWeight.bold }}>
    Card Title
  </h3>
  <p style={helpers.detailText}>
    Card description text
  </p>
</div>
```

### Button with Custom Color

```jsx
<button style={{
  background: tokens.colors.primary,
  color: tokens.colors.bg.primary,
  borderRadius: tokens.radius.sm,
  padding: `${tokens.spacing.lg} ${tokens.spacing.xl}`,
  fontWeight: tokens.fontWeight.semibold,
}}>
  Click Me
</button>
```

### Flex Layout

```jsx
<div style={helpers.flexBetween(tokens.spacing.md)}>
  <span>Left content</span>
  <span>Right content</span>
</div>
```

### Text with Status Color

```jsx
<p style={{
  color: tokens.colors.status.error.text,
  margin: 0
}}>
  Error message
</p>

<p style={{
  color: tokens.colors.status.success.text,
  fontWeight: tokens.fontWeight.bold
}}>
  Success!
</p>
```

## Migration Guide

### Before (Hardcoded)

```jsx
<div style={{
  color: '#374151',
  fontSize: '0.95rem',
  padding: '0.75rem',
  borderRadius: '16px',
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(15,23,42,0.05)',
}}>
  Content
</div>
```

### After (With Tokens)

```jsx
<div style={{
  ...helpers.card,  // Includes border, borderRadius, background, padding, boxShadow
  color: tokens.colors.text.secondary,
  fontSize: tokens.fontSize.base,
}}>
  Content
</div>

// Or even simpler if the card helper covers everything:
<div style={helpers.card}>
  Content
</div>
```

## Benefits

1. **Consistency**: All components use the same values
2. **Maintainability**: Change once, update everywhere
3. **Type Safety**: Import from one place, avoid typos
4. **Scalability**: Easy to add new tokens or adjust existing ones
5. **Theming**: Can swap entire token sets for dark mode, etc.

## Tips

- Always import tokens instead of hardcoding values
- Use helper functions for repeated patterns
- CSS variables are available for CSS-only styling
- Check `src/styles/tokens.js` for the full list of available tokens
- If you need a value that doesn't exist, add it to the tokens file first

## Examples in the Codebase

Check `src/ModerationPage.jsx` for real examples of token usage throughout the app.
