const AVATAR_COLORS = [
  '#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00', '#ccff00',
  '#88ff00', '#00ff00', '#00ff88', '#00ffcc', '#00ffff', '#00ccff',
  '#0088ff', '#0044ff', '#0000ff', '#4400ff', '#8800ff', '#cc00ff',
  '#ff00ff', '#ff00cc', '#ff0088', '#ff0044', '#ffffff', '#888888',
]

interface AvatarPickerProps {
  selectedColor: string
  onSelect: (color: string) => void
}

export default function AvatarPicker({ selectedColor, onSelect }: AvatarPickerProps) {
  return (
    <div className="avatar-picker">
      {AVATAR_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`avatar-option ${selectedColor === color ? 'selected' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
          aria-label={`Select ${color} avatar color`}
        />
      ))}
    </div>
  )
}
