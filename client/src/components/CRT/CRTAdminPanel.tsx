import { useCRT } from '../../context/CRTContext'
import '../../styles/crt.css'

export default function CRTAdminPanel() {
  const { settings, updateSettings, updateNestedSettings, resetToDefaults } = useCRT()

  return (
    <div className="crt-admin-panel">
      {/* Master Toggle */}
      <div className={`crt-master-toggle ${settings.enabled ? 'active' : ''}`}>
        <div className="crt-master-info">
          <h3>CRT Effect</h3>
          <span className="crt-master-status">
            {settings.enabled ? 'Effects are active' : 'Effects are disabled'}
          </span>
        </div>
        <div
          className={`crt-toggle ${settings.enabled ? 'active' : ''}`}
          onClick={() => updateSettings({ enabled: !settings.enabled })}
        />
      </div>

      {/* Scanlines */}
      <div className="crt-section">
        <h3>Scanlines</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${settings.scanlines.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('scanlines', { enabled: !settings.scanlines.enabled })}
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
                value={settings.scanlines.intensity}
                onChange={(e) => updateNestedSettings('scanlines', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.scanlines.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.scanlines.intensity * 100)}%</span>
            </div>
            <div className="crt-slider-group">
              <span className="crt-slider-label">Spacing</span>
              <input
                type="range"
                className="crt-slider"
                min="1"
                max="6"
                step="1"
                value={settings.scanlines.spacing}
                onChange={(e) => updateNestedSettings('scanlines', { spacing: parseInt(e.target.value) })}
                disabled={!settings.scanlines.enabled}
              />
              <span className="crt-slider-value">{settings.scanlines.spacing}px</span>
            </div>
          </div>
        </div>
      </div>

      {/* Glow */}
      <div className="crt-section">
        <h3>Screen Glow</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${settings.glow.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('glow', { enabled: !settings.glow.enabled })}
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
                value={settings.glow.intensity}
                onChange={(e) => updateNestedSettings('glow', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.glow.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.glow.intensity * 100)}%</span>
            </div>
            <input
              type="color"
              className="crt-color-picker"
              value={settings.glow.color}
              onChange={(e) => updateNestedSettings('glow', { color: e.target.value })}
              disabled={!settings.glow.enabled}
            />
          </div>
        </div>
      </div>

      {/* Vignette */}
      <div className="crt-section">
        <h3>Vignette</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${settings.vignette.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('vignette', { enabled: !settings.vignette.enabled })}
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
                value={settings.vignette.intensity}
                onChange={(e) => updateNestedSettings('vignette', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.vignette.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.vignette.intensity * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Noise */}
      <div className="crt-section">
        <h3>Static Noise</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${settings.noise.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('noise', { enabled: !settings.noise.enabled })}
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
                value={settings.noise.intensity}
                onChange={(e) => updateNestedSettings('noise', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.noise.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.noise.intensity * 100)}%</span>
            </div>
            <label className="crt-checkbox-label">
              <input
                type="checkbox"
                checked={settings.noise.animated}
                onChange={(e) => updateNestedSettings('noise', { animated: e.target.checked })}
                disabled={!settings.noise.enabled}
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
            className={`crt-toggle ${settings.curvature.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('curvature', { enabled: !settings.curvature.enabled })}
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
                value={settings.curvature.intensity}
                onChange={(e) => updateNestedSettings('curvature', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.curvature.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.curvature.intensity * 1000)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chromatic Aberration */}
      <div className="crt-section">
        <h3>Chromatic Aberration</h3>
        <div className="crt-effect-row">
          <div
            className={`crt-toggle ${settings.chromaticAberration.enabled ? 'active' : ''}`}
            onClick={() => updateNestedSettings('chromaticAberration', { enabled: !settings.chromaticAberration.enabled })}
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
                value={settings.chromaticAberration.intensity}
                onChange={(e) => updateNestedSettings('chromaticAberration', { intensity: parseFloat(e.target.value) })}
                disabled={!settings.chromaticAberration.enabled}
              />
              <span className="crt-slider-value">{Math.round(settings.chromaticAberration.intensity * 50)}%</span>
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
              <span>{Math.round(settings.brightness * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0.5"
              max="1.5"
              step="0.05"
              value={settings.brightness}
              onChange={(e) => updateSettings({ brightness: parseFloat(e.target.value) })}
            />
          </div>
          <div className="crt-adjustment-item">
            <div className="crt-adjustment-label">
              <span>Contrast</span>
              <span>{Math.round(settings.contrast * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0.5"
              max="1.5"
              step="0.05"
              value={settings.contrast}
              onChange={(e) => updateSettings({ contrast: parseFloat(e.target.value) })}
            />
          </div>
          <div className="crt-adjustment-item">
            <div className="crt-adjustment-label">
              <span>Saturation</span>
              <span>{Math.round(settings.saturation * 100)}%</span>
            </div>
            <input
              type="range"
              className="crt-slider"
              min="0"
              max="2"
              step="0.05"
              value={settings.saturation}
              onChange={(e) => updateSettings({ saturation: parseFloat(e.target.value) })}
            />
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <button className="crt-reset-btn" onClick={resetToDefaults}>
        Restore Defaults
      </button>
    </div>
  )
}
