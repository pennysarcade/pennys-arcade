import { useState } from 'react'
import { useCRT } from '../../context/CRTContext'
import '../../styles/crt.css'

export default function CRTAdminPanel() {
  const {
    settings,
    localSettings,
    isPreviewMode,
    isLoading,
    updateLocalSettings,
    updateNestedLocalSettings,
    resetToDefaults,
    pushToAllUsers,
    setGlobalEnabled,
    setPreviewMode,
  } = useCRT()

  const [isPushing, setIsPushing] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

  const isGloballyEnabled = settings !== null

  const handleToggleGlobal = async () => {
    setIsToggling(true)
    try {
      await setGlobalEnabled(!isGloballyEnabled)
    } catch {
      alert('Failed to update CRT status')
    }
    setIsToggling(false)
  }

  const handlePushToAll = async () => {
    setIsPushing(true)
    try {
      await pushToAllUsers()
    } catch {
      alert('Failed to push settings')
    }
    setIsPushing(false)
  }

  if (isLoading) {
    return <div className="crt-admin-panel">Loading...</div>
  }

  return (
    <div className="crt-admin-panel">
      {/* Global Toggle */}
      <div className={`crt-master-toggle ${isGloballyEnabled ? 'active' : ''}`}>
        <div className="crt-master-info">
          <h3>CRT Effect (Global)</h3>
          <span className="crt-master-status">
            {isGloballyEnabled ? 'Enabled for all users' : 'Disabled for all users'}
          </span>
        </div>
        <button
          className={`btn ${isGloballyEnabled ? 'btn-danger' : 'btn-success'}`}
          onClick={handleToggleGlobal}
          disabled={isToggling}
        >
          {isToggling ? '...' : isGloballyEnabled ? 'Turn Off' : 'Turn On'}
        </button>
      </div>

      {/* Preview Mode Toggle */}
      <div className="crt-section">
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${isPreviewMode ? 'active' : ''}`}
            onClick={() => setPreviewMode(!isPreviewMode)}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Preview Mode</div>
            <div className="crt-effect-desc">See changes before pushing to all users</div>
          </div>
        </div>
      </div>

      {/* Scanlines */}
      <div className="crt-section">
        <h3>Scanlines</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.scanlines.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('scanlines', { enabled: !localSettings.scanlines.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Scanlines</div>
            <div className="crt-effect-desc">Horizontal CRT scan lines</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="0.5"
                step="0.01"
                value={localSettings.scanlines.intensity}
                onChange={(e) => updateNestedLocalSettings('scanlines', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.scanlines.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.scanlines.intensity * 100)}%</span>
            </div>
            <div className="crt-slider-group">
              <span className="crt-slider-label">Spacing</span>
              <input
                type="range"
                className="crt-slider"
                min="1"
                max="6"
                step="1"
                value={localSettings.scanlines.spacing}
                onChange={(e) => updateNestedLocalSettings('scanlines', { spacing: parseInt(e.target.value) })}
                disabled={!localSettings.scanlines.enabled}
              />
              <span className="crt-slider-value">{localSettings.scanlines.spacing}px</span>
            </div>
          </div>
        </div>
      </div>

      {/* Glow */}
      <div className="crt-section">
        <h3>Screen Glow</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.glow.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('glow', { enabled: !localSettings.glow.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Glow</div>
            <div className="crt-effect-desc">Inner screen glow effect</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.glow.intensity}
                onChange={(e) => updateNestedLocalSettings('glow', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.glow.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.glow.intensity * 100)}%</span>
            </div>
            <input
              type="color"
              className="crt-color-picker"
              value={localSettings.glow.color}
              onChange={(e) => updateNestedLocalSettings('glow', { color: e.target.value })}
              disabled={!localSettings.glow.enabled}
            />
          </div>
        </div>
      </div>

      {/* Vignette */}
      <div className="crt-section">
        <h3>Vignette</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.vignette.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('vignette', { enabled: !localSettings.vignette.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Vignette</div>
            <div className="crt-effect-desc">Dark edges around screen</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.vignette.intensity}
                onChange={(e) => updateNestedLocalSettings('vignette', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.vignette.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.vignette.intensity * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Noise */}
      <div className="crt-section">
        <h3>Static Noise</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.noise.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('noise', { enabled: !localSettings.noise.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Noise</div>
            <div className="crt-effect-desc">TV static effect</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="0.3"
                step="0.01"
                value={localSettings.noise.intensity}
                onChange={(e) => updateNestedLocalSettings('noise', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.noise.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.noise.intensity * 100)}%</span>
            </div>
            <label className="crt-checkbox-label">
              <input
                type="checkbox"
                checked={localSettings.noise.animated}
                onChange={(e) => updateNestedLocalSettings('noise', { animated: e.target.checked })}
                disabled={!localSettings.noise.enabled}
              />
              Animate
            </label>
          </div>
        </div>
      </div>

      {/* Curvature */}
      <div className="crt-section">
        <h3>Screen Curvature</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.curvature.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('curvature', { enabled: !localSettings.curvature.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Curvature</div>
            <div className="crt-effect-desc">Curved screen edges</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="0.1"
                step="0.005"
                value={localSettings.curvature.intensity}
                onChange={(e) => updateNestedLocalSettings('curvature', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.curvature.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.curvature.intensity * 1000)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chromatic Aberration */}
      <div className="crt-section">
        <h3>Chromatic Aberration</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${localSettings.chromaticAberration.enabled ? 'active' : ''}`}
            onClick={() => updateNestedLocalSettings('chromaticAberration', { enabled: !localSettings.chromaticAberration.enabled })}
          />
          <div className="crt-effect-info">
            <div className="crt-effect-name">Enable Aberration</div>
            <div className="crt-effect-desc">RGB color separation</div>
          </div>
          <div className="crt-effect-controls">
            <div className="crt-slider-group">
              <span className="crt-slider-label">Intensity</span>
              <input
                type="range"
                className="crt-slider"
                min="0"
                max="2"
                step="0.1"
                value={localSettings.chromaticAberration.intensity}
                onChange={(e) => updateNestedLocalSettings('chromaticAberration', { intensity: parseFloat(e.target.value) })}
                disabled={!localSettings.chromaticAberration.enabled}
              />
              <span className="crt-slider-value">{Math.round(localSettings.chromaticAberration.intensity * 50)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Color Adjustments */}
      <div className="crt-section">
        <h3>Color Adjustments</h3>
        <div className="crt-adjustments">
          <div className="crt-adjustment-item">
            <div className="crt-adjustment-label">
              <span>Brightness</span>
              <span>{Math.round(localSettings.brightness * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0.5"
              max="1.5"
              step="0.05"
              value={localSettings.brightness}
              onChange={(e) => updateLocalSettings({ brightness: parseFloat(e.target.value) })}
            />
          </div>
          <div className="crt-adjustment-item">
            <div className="crt-adjustment-label">
              <span>Contrast</span>
              <span>{Math.round(localSettings.contrast * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0.5"
              max="1.5"
              step="0.05"
              value={localSettings.contrast}
              onChange={(e) => updateLocalSettings({ contrast: parseFloat(e.target.value) })}
            />
          </div>
          <div className="crt-adjustment-item">
            <div className="crt-adjustment-label">
              <span>Saturation</span>
              <span>{Math.round(localSettings.saturation * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0"
              max="2"
              step="0.05"
              value={localSettings.saturation}
              onChange={(e) => updateLocalSettings({ saturation: parseFloat(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="crt-actions">
        <button
          className="btn btn-primary"
          onClick={handlePushToAll}
          disabled={isPushing}
        >
          {isPushing ? 'Pushing...' : 'Push to All Users'}
        </button>
        <button className="crt-reset-btn" onClick={resetToDefaults}>
          Restore Defaults
        </button>
      </div>
    </div>
  )
}
