/**
 * EmojiSelector Component
 *
 * Grid of emoji buttons with optional skin tone variants.
 *
 * @param {Object} props
 * @param {Array<string>} props.emojis - Array of emoji options
 * @param {string} props.selectedIcon - Currently selected emoji
 * @param {string} props.selectedBaseEmoji - Base emoji (for highlighting)
 * @param {Function} props.onSelect - Callback when emoji is selected
 * @param {Array<string>} props.skinToneOptions - Optional skin tone variants
 * @param {boolean} props.hasSkinToneOptions - Whether skin tone panel should show
 * @param {string} props.label - Label text
 * @param {string} props.helper - Helper text
 */
export function EmojiSelector({
  emojis,
  selectedIcon,
  selectedBaseEmoji,
  onSelect,
  skinToneOptions,
  hasSkinToneOptions,
  label = "Icon",
  helper = "Required. Pick an emoji for your pin.",
}) {
  return (
    <div className="label">
      <div className="label-heading">
        <span>{label}</span>
      </div>
      <p className="helper-text label-helper">{helper}</p>
      <div className="emoji-scroll" role="listbox" aria-label="Pick an emoji">
        <div className="emoji-grid">
          {emojis.map((emoji) => {
            const isSelected = selectedBaseEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                className={`emoji-chip ${isSelected ? "selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </div>
      {hasSkinToneOptions && (
        <div className="emoji-tone-panel">
          <p className="helper-text label-helper">Choose a skin tone.</p>
          <div className="emoji-scroll" role="listbox" aria-label="Pick a skin tone">
            <div className="emoji-grid">
              {skinToneOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`emoji-chip ${selectedIcon === emoji ? "selected" : ""}`}
                  aria-pressed={selectedIcon === emoji}
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmojiSelector;
