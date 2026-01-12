import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'

interface ProfileModalProps {
  onClose: () => void
}

interface CropBox {
  x: number  // percentage 0-100
  y: number  // percentage 0-100
  size: number  // percentage of smaller dimension
}

const AVATAR_COLORS = [
  { value: '#ff0000', label: 'Red' },
  { value: '#ff4400', label: 'Orange Red' },
  { value: '#ff8800', label: 'Orange' },
  { value: '#ffcc00', label: 'Gold' },
  { value: '#ffff00', label: 'Yellow' },
  { value: '#ccff00', label: 'Lime' },
  { value: '#88ff00', label: 'Chartreuse' },
  { value: '#00ff00', label: 'Green' },
  { value: '#00ff88', label: 'Spring Green' },
  { value: '#00ffcc', label: 'Aquamarine' },
  { value: '#00ffff', label: 'Cyan' },
  { value: '#00ccff', label: 'Sky Blue' },
  { value: '#0088ff', label: 'Dodger Blue' },
  { value: '#0044ff', label: 'Blue' },
  { value: '#0000ff', label: 'Pure Blue' },
  { value: '#4400ff', label: 'Indigo' },
  { value: '#8800ff', label: 'Violet' },
  { value: '#cc00ff', label: 'Purple' },
  { value: '#ff00ff', label: 'Magenta' },
  { value: '#ff00cc', label: 'Hot Pink' },
  { value: '#ff0088', label: 'Deep Pink' },
  { value: '#ff0044', label: 'Crimson' },
  { value: '#ffffff', label: 'White' },
  { value: '#888888', label: 'Gray' },
]

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user, updateProfile, uploadAvatar, deleteAvatar } = useAuth()
  const [username, setUsername] = useState(user?.username || '')
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor || '#00ffff')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [avatarLimit, setAvatarLimit] = useState<{ changesRemaining: number; totalLimit: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [originalImageData, setOriginalImageData] = useState<{ width: number; height: number; dataUrl: string } | null>(null)
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, size: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cropContainerRef = useRef<HTMLDivElement>(null)

  // Fetch avatar change limit on mount
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    fetch('/api/auth/avatar-limit', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch limit')
        return res.json()
      })
      .then(data => {
        if (typeof data.changesRemaining === 'number' && typeof data.totalLimit === 'number') {
          setAvatarLimit({ changesRemaining: data.changesRemaining, totalLimit: data.totalLimit })
        }
      })
      .catch(err => console.error('Avatar limit fetch error:', err))
  }, [])

  const generatePreview = useCallback((imgDataUrl: string, imgWidth: number, imgHeight: number, crop: CropBox) => {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Pixelate: resize to 64x64, then scale up
      const pixelSize = 64
      const displaySize = 128

      // Create temp canvas for pixelation
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = pixelSize
      tempCanvas.height = pixelSize
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return

      // Calculate crop coordinates from percentages
      const smallerDim = Math.min(imgWidth, imgHeight)
      const cropSize = (crop.size / 100) * smallerDim
      const sx = (crop.x / 100) * imgWidth
      const sy = (crop.y / 100) * imgHeight

      // Draw image at 64x64 with crop
      tempCtx.imageSmoothingEnabled = true
      tempCtx.imageSmoothingQuality = 'high'
      tempCtx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, pixelSize, pixelSize)

      // Scale up with nearest-neighbor for pixel art effect
      canvas.width = displaySize
      canvas.height = displaySize
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tempCanvas, 0, 0, displaySize, displaySize)

      setPreviewUrl(canvas.toDataURL())
    }
    img.src = imgDataUrl
  }, [])

  // Update preview when crop changes
  useEffect(() => {
    if (originalImageData) {
      generatePreview(originalImageData.dataUrl, originalImageData.width, originalImageData.height, cropBox)
    }
  }, [cropBox, originalImageData, generatePreview])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB')
      return
    }

    setSelectedFile(file)
    setError('')

    // Load image to get dimensions
    const reader = new FileReader()
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string
      const img = new Image()
      img.onload = () => {
        const w = img.width
        const h = img.height
        setOriginalImageData({ width: w, height: h, dataUrl })

        // Initialize crop box - centered, max size square
        const smallerDim = Math.min(w, h)
        const size = 100 // 100% of smaller dimension
        const x = ((w - smallerDim) / 2 / w) * 100
        const y = ((h - smallerDim) / 2 / h) * 100
        setCropBox({ x, y, size })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cropContainerRef.current) return
    e.preventDefault()

    const rect = cropContainerRef.current.getBoundingClientRect()
    setIsDragging(true)
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      cropX: cropBox.x,
      cropY: cropBox.y
    })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !cropContainerRef.current || !originalImageData) return

    const rect = cropContainerRef.current.getBoundingClientRect()
    const containerWidth = rect.width
    const containerHeight = rect.height

    // Calculate how much the mouse moved in percentage
    const deltaX = ((e.clientX - rect.left - dragStart.x) / containerWidth) * 100
    const deltaY = ((e.clientY - rect.top - dragStart.y) / containerHeight) * 100

    // Calculate new position
    let newX = dragStart.cropX + deltaX
    let newY = dragStart.cropY + deltaY

    // Calculate max positions based on image aspect ratio and crop size
    const imgWidth = originalImageData.width
    const imgHeight = originalImageData.height
    const smallerDim = Math.min(imgWidth, imgHeight)
    const cropSizePixels = (cropBox.size / 100) * smallerDim

    const maxX = ((imgWidth - cropSizePixels) / imgWidth) * 100
    const maxY = ((imgHeight - cropSizePixels) / imgHeight) * 100

    // Clamp to bounds
    newX = Math.max(0, Math.min(maxX, newX))
    newY = Math.max(0, Math.min(maxY, newY))

    setCropBox(prev => ({ ...prev, x: newX, y: newY }))
  }, [isDragging, dragStart, cropBox.size, originalImageData])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const handleUploadAvatar = async () => {
    if (!selectedFile || !originalImageData) return

    setIsUploading(true)
    setError('')

    try {
      // Convert crop percentages to pixel coordinates for the server
      const imgWidth = originalImageData.width
      const imgHeight = originalImageData.height
      const smallerDim = Math.min(imgWidth, imgHeight)

      const cropData = {
        x: Math.round((cropBox.x / 100) * imgWidth),
        y: Math.round((cropBox.y / 100) * imgHeight),
        size: Math.round((cropBox.size / 100) * smallerDim)
      }

      const result = await uploadAvatar(selectedFile, JSON.stringify(cropData))
      setAvatarLimit(prev => prev ? { ...prev, changesRemaining: result.changesRemaining } : null)
      setSelectedFile(null)
      setPreviewUrl(null)
      setOriginalImageData(null)
      setCropBox({ x: 0, y: 0, size: 100 })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteAvatar = async () => {
    setIsUploading(true)
    setError('')

    try {
      await deleteAvatar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete avatar')
    } finally {
      setIsUploading(false)
    }
  }

  const handleCancelPreview = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setOriginalImageData(null)
    setCropBox({ x: 0, y: 0, size: 100 })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }
      await updateProfile(username, avatarColor)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const currentAvatarUrl = user?.avatarImage ? `/avatars/${user.avatarImage}` : null

  // Calculate crop box display position for the UI
  const getCropBoxStyle = () => {
    if (!originalImageData) return {}

    const imgWidth = originalImageData.width
    const imgHeight = originalImageData.height
    const smallerDim = Math.min(imgWidth, imgHeight)
    const cropSizePercent = (cropBox.size / 100) * (smallerDim / imgWidth) * 100
    const cropSizePercentH = (cropBox.size / 100) * (smallerDim / imgHeight) * 100

    return {
      left: `${cropBox.x}%`,
      top: `${cropBox.y}%`,
      width: `${cropSizePercent}%`,
      height: `${cropSizePercentH}%`,
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-profile" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        <h2>Profile Settings</h2>

        <form onSubmit={handleSubmit}>
          <div className="profile-section">
            <h3>Avatar</h3>

            <div className="avatar-upload-area">
              {/* Show crop interface when image is selected */}
              {originalImageData && originalImageData.width !== originalImageData.height ? (
                <div className="avatar-crop-container">
                  <div className="avatar-crop-preview-row">
                    {/* Original image with crop overlay */}
                    <div
                      ref={cropContainerRef}
                      className="avatar-crop-source"
                      style={{
                        aspectRatio: `${originalImageData.width} / ${originalImageData.height}`,
                        maxWidth: originalImageData.width > originalImageData.height ? '200px' : 'auto',
                        maxHeight: originalImageData.height > originalImageData.width ? '200px' : 'auto',
                      }}
                    >
                      <img src={originalImageData.dataUrl} alt="Original" className="avatar-crop-source-img" />
                      <div
                        className={`avatar-crop-box ${isDragging ? 'dragging' : ''}`}
                        style={getCropBoxStyle()}
                        onMouseDown={handleMouseDown}
                      />
                      <div className="avatar-crop-overlay" style={{
                        clipPath: `polygon(
                          0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                          ${cropBox.x}% ${cropBox.y}%,
                          ${cropBox.x}% ${cropBox.y + (cropBox.size / 100) * (Math.min(originalImageData.width, originalImageData.height) / originalImageData.height) * 100}%,
                          ${cropBox.x + (cropBox.size / 100) * (Math.min(originalImageData.width, originalImageData.height) / originalImageData.width) * 100}% ${cropBox.y + (cropBox.size / 100) * (Math.min(originalImageData.width, originalImageData.height) / originalImageData.height) * 100}%,
                          ${cropBox.x + (cropBox.size / 100) * (Math.min(originalImageData.width, originalImageData.height) / originalImageData.width) * 100}% ${cropBox.y}%,
                          ${cropBox.x}% ${cropBox.y}%
                        )`
                      }} />
                    </div>

                    {/* Pixel art preview */}
                    <div className="avatar-preview-container">
                      {previewUrl && (
                        <img src={previewUrl} alt="Preview" className="avatar-preview-image" />
                      )}
                    </div>
                  </div>
                  <div className="avatar-crop-hint">Drag the box to select crop area</div>
                </div>
              ) : (
                /* Current avatar or preview for square images */
                <div className="avatar-preview-container">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="avatar-preview-image" />
                  ) : currentAvatarUrl ? (
                    <img src={currentAvatarUrl} alt="Current avatar" className="avatar-preview-image" />
                  ) : (
                    <div
                      className="avatar-preview-color"
                      style={{ backgroundColor: avatarColor }}
                    />
                  )}
                </div>
              )}

              {/* Upload controls */}
              <div className="avatar-upload-controls">
                {selectedFile ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleUploadAvatar}
                      disabled={isUploading}
                    >
                      {isUploading ? 'Uploading...' : 'Save Avatar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCancelPreview}
                      disabled={isUploading}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarLimit?.changesRemaining === 0}
                    >
                      Upload Image
                    </button>
                    {currentAvatarUrl && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleDeleteAvatar}
                        disabled={isUploading}
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>

              {avatarLimit && avatarLimit.changesRemaining === 0 && (
                <div className="avatar-limit-info avatar-limit-warning">
                  Upload limit reached. Try again in 24 hours.
                </div>
              )}

              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            {/* Color picker (fallback/background color) */}
            <div className="avatar-color-section">
              <label>Fallback Color</label>
              <div className="avatar-color-picker">
                <div
                  className="avatar-color-preview"
                  style={{ backgroundColor: avatarColor }}
                />
                <select
                  value={avatarColor}
                  onChange={(e) => setAvatarColor(e.target.value)}
                  className="avatar-color-select"
                >
                  {AVATAR_COLORS.map(color => (
                    <option key={color.value} value={color.value}>
                      {color.label}
                    </option>
                  ))}
                </select>
              </div>
              <small className="form-hint">Used when no image is uploaded</small>
            </div>
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              required
              minLength={3}
              maxLength={20}
            />
            <small className="form-hint">3-20 characters. Case-sensitive. Can be changed once every 24 hours.</small>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
