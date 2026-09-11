const TOOL_NAME = 'vision_analyze'
const ROW_SELECTOR = '[data-slot="tool-block"][data-tool-row]'
const ROW_KEY_ATTR = 'data-hermes-vision-preview-key'
const PREVIEW_BODY_ATTR = 'data-hermes-vision-preview-body'
const OVERLAY_ATTR = 'data-hermes-vision-preview-overlay'
const STYLE_ID = 'hermes-image-preview-styles'
const IMAGE_EXT_RE = /\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)(?:[?#]|$)/i
const IMAGE_KEYS = [
  'image_url',
  'image_path',
  'image',
  'file',
  'filepath',
  'file_path',
  'path',
  'url',
  'source'
]

const CSS = `
[${PREVIEW_BODY_ATTR}] {
  display: grid;
  gap: 0.375rem;
  max-width: min(100%, 48rem);
  padding: 0.375rem 0.375rem 0;
  contain: layout paint;
  overflow-anchor: none;
}

[${PREVIEW_BODY_ATTR}][hidden] {
  display: none !important;
}

[${PREVIEW_BODY_ATTR}] [data-hermes-vision-preview-frame] {
  display: grid;
  block-size: min(26rem, 55vh);
  min-block-size: 12rem;
  place-items: center;
  overflow: hidden;
  border-radius: 0.25rem;
  background: var(--ui-bg-secondary, transparent);
}

[${PREVIEW_BODY_ATTR}] img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  cursor: zoom-in;
  object-fit: contain;
}

[${PREVIEW_BODY_ATTR}] img:focus-visible {
  outline: 2px solid var(--ui-accent, #8ab4f8);
  outline-offset: -2px;
}

[${PREVIEW_BODY_ATTR}] [data-hermes-vision-preview-status] {
  color: var(--ui-text-tertiary);
  font-size: var(--conversation-caption-font-size, 0.6875rem);
  line-height: var(--conversation-caption-line-height, 1rem);
}

[${OVERLAY_ATTR}] {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  overflow: hidden;
  background: rgb(0 0 0 / 88%);
  cursor: zoom-out;
  touch-action: none;
  user-select: none;
}

[${OVERLAY_ATTR}][hidden] {
  display: none !important;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-image] {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  max-width: none;
  max-height: none;
  transform: translate(-50%, -50%) translate3d(var(--pan-x, 0), var(--pan-y, 0), 0) scale(var(--zoom, 1));
  transform-origin: center;
  cursor: grab;
  will-change: transform;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-image][data-dragging] {
  cursor: grabbing;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-controls] {
  position: absolute;
  bottom: 1.25rem;
  left: 50%;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.625rem;
  background: rgb(20 20 20 / 88%);
  box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 35%);
  transform: translateX(-50%);
  cursor: default;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-controls] button {
  min-width: 2.25rem;
  height: 2.25rem;
  padding: 0 0.625rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-controls] button:hover,
[${OVERLAY_ATTR}] [data-hermes-vision-overlay-controls] button:focus-visible {
  background: rgb(255 255 255 / 14%);
  outline: none;
}

[${OVERLAY_ATTR}] [data-hermes-vision-overlay-scale] {
  min-width: 4rem;
  color: #fff;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
`

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function parseRecord(value) {
  const direct = asRecord(value)
  if (direct) return direct
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    return asRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isInlineOrRemote(value) {
  return /^(?:data:image\/|https?:\/\/)/i.test(value)
}

function isLikelyImagePath(value, key) {
  if (!value) return false
  if (isInlineOrRemote(value)) return true
  if (/^file:/i.test(value) || IMAGE_EXT_RE.test(value)) return true
  return key === 'image_url' || key === 'image_path' || key === 'image'
}

function candidateFromValue(value, key) {
  const candidate = text(value)
  return isLikelyImagePath(candidate, key) ? candidate : ''
}

// Keep the extractor deliberately schema-tolerant. Older gateways used
// `arguments`/`input`, while newer ones send the full tool args in `args`.
function findImageCandidate(value, depth = 0, hint = '') {
  if (depth > 5 || value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const parsed = parseRecord(value)
    return parsed ? findImageCandidate(parsed, depth + 1, hint) : candidateFromValue(value, hint)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageCandidate(item, depth + 1, hint)
      if (found) return found
    }
    return ''
  }

  const record = asRecord(value)
  if (!record) return ''

  for (const key of IMAGE_KEYS) {
    const found = candidateFromValue(record[key], key)
    if (found) return found
  }

  for (const [key, nested] of Object.entries(record)) {
    const found = findImageCandidate(nested, depth + 1, key)
    if (found) return found
  }
  return ''
}

function toolArgs(payload) {
  const input = parseRecord(payload?.input)
  const functionRecord = asRecord(input?.function)
  const directFunction = asRecord(payload?.function)
  return [
    payload?.args,
    payload?.arguments,
    directFunction?.arguments,
    directFunction?.args,
    directFunction?.parameters,
    input?.args,
    input?.arguments,
    input?.parameters,
    input?.input,
    functionRecord?.arguments,
    functionRecord?.args,
    functionRecord?.parameters
  ]
}

function imageSourceFromPayload(payload) {
  for (const value of toolArgs(payload)) {
    const found = findImageCandidate(value)
    if (found) return found
  }
  return ''
}

function filePathFromUri(source) {
  if (!/^file:/i.test(source)) return source

  try {
    const uri = new URL(source)
    let pathname = decodeURIComponent(uri.pathname)
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) pathname = pathname.slice(1)
    if (uri.hostname && uri.hostname !== 'localhost') pathname = `\\\\${uri.hostname}${pathname}`
    return pathname
  } catch {
    return source
  }
}

async function resolveImageSource(source) {
  if (isInlineOrRemote(source)) return source

  const bridge = typeof window === 'undefined' ? null : window.hermesDesktop
  if (!bridge?.readFileDataUrl) throw new Error('ローカル画像の読み込み口がない')

  const dataUrl = await bridge.readFileDataUrl(filePathFromUri(source))
  if (!/^data:image\//i.test(text(dataUrl))) throw new Error('画像データではない')
  return dataUrl
}

function toolPartFromRow(row) {
  // ToolEntry owns the exact ToolPart for this row. Reading that nearest prop
  // keeps both the tool-name check and image source scoped to the same row.
  const fiberKey = Reflect.ownKeys(row).find(
    key => typeof key === 'string' && (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'))
  )
  let fiber = fiberKey ? row[fiberKey] : null
  let depth = 0

  while (fiber && depth++ < 64) {
    for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
      const part = asRecord(props?.part)
      if (part && text(part.toolName)) return part
    }
    fiber = fiber.return
  }
  return null
}

export default {
  id: 'hermes-image-preview',
  name: 'Image Preview',
  description: 'Previews images used by image analysis, with fullscreen zoom and pan.',

  register(ctx) {
    let destroyed = false
    let frame = 0
    let sequence = 0
    const assignedRows = new Map()
    const scrollHolds = new Map()
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    document.head?.appendChild(style)

    const overlay = document.createElement('div')
    overlay.setAttribute(OVERLAY_ATTR, '')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', '画像プレビュー')
    overlay.setAttribute('aria-modal', 'true')
    overlay.tabIndex = -1
    overlay.hidden = true

    const overlayImg = document.createElement('img')
    overlayImg.setAttribute('data-hermes-vision-overlay-image', '')
    overlayImg.alt = '画像分析の入力画像（拡大表示）'

    const overlayControls = document.createElement('div')
    overlayControls.setAttribute('data-hermes-vision-overlay-controls', '')
    const makeOverlayButton = (label, content) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', label)
      button.textContent = content
      return button
    }
    const zoomOutButton = makeOverlayButton('縮小', '−')
    const overlayScale = document.createElement('span')
    overlayScale.setAttribute('data-hermes-vision-overlay-scale', '')
    const zoomInButton = makeOverlayButton('拡大', '+')
    const resetZoomButton = makeOverlayButton('表示をリセット', 'リセット')
    const closeOverlayButton = makeOverlayButton('拡大表示を閉じる', '×')
    overlayControls.append(zoomOutButton, overlayScale, zoomInButton, resetZoomButton, closeOverlayButton)
    overlay.append(overlayImg, overlayControls)
    ;(document.body || document.documentElement).appendChild(overlay)

    const overlayState = {
      baseHeight: 0,
      baseWidth: 0,
      dragPointerId: null,
      dragStartPanX: 0,
      dragStartPanY: 0,
      dragStartX: 0,
      dragStartY: 0,
      owner: null,
      panX: 0,
      panY: 0,
      zoom: 1
    }

    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

    const clampOverlayPan = () => {
      const maxX = Math.max(0, (overlayState.baseWidth * overlayState.zoom - overlay.clientWidth) / 2)
      const maxY = Math.max(0, (overlayState.baseHeight * overlayState.zoom - overlay.clientHeight) / 2)
      overlayState.panX = clamp(overlayState.panX, -maxX, maxX)
      overlayState.panY = clamp(overlayState.panY, -maxY, maxY)
    }

    const renderOverlayTransform = () => {
      clampOverlayPan()
      overlayImg.style.setProperty('--pan-x', `${overlayState.panX}px`)
      overlayImg.style.setProperty('--pan-y', `${overlayState.panY}px`)
      overlayImg.style.setProperty('--zoom', String(overlayState.zoom))
      overlayScale.textContent = `${Math.round(overlayState.zoom * 100)}%`
    }

    const fitOverlayImage = () => {
      if (overlay.hidden || !overlayImg.naturalWidth || !overlayImg.naturalHeight) return
      const availableWidth = Math.max(1, overlay.clientWidth - 64)
      const availableHeight = Math.max(1, overlay.clientHeight - 112)
      const fit = Math.min(1, availableWidth / overlayImg.naturalWidth, availableHeight / overlayImg.naturalHeight)
      overlayState.baseWidth = Math.max(1, overlayImg.naturalWidth * fit)
      overlayState.baseHeight = Math.max(1, overlayImg.naturalHeight * fit)
      overlayImg.style.width = `${overlayState.baseWidth}px`
      overlayImg.style.height = `${overlayState.baseHeight}px`
      renderOverlayTransform()
    }

    const resetOverlayView = () => {
      overlayState.zoom = 1
      overlayState.panX = 0
      overlayState.panY = 0
      renderOverlayTransform()
    }

    const setOverlayZoom = (nextZoom, anchorX = overlay.clientWidth / 2, anchorY = overlay.clientHeight / 2) => {
      const previousZoom = overlayState.zoom
      const zoom = clamp(nextZoom, 0.25, 8)
      if (zoom === previousZoom) return

      const centerX = overlay.clientWidth / 2
      const centerY = overlay.clientHeight / 2
      const localX = (anchorX - centerX - overlayState.panX) / previousZoom
      const localY = (anchorY - centerY - overlayState.panY) / previousZoom
      overlayState.zoom = zoom
      overlayState.panX = zoom <= 1 ? 0 : anchorX - centerX - localX * zoom
      overlayState.panY = zoom <= 1 ? 0 : anchorY - centerY - localY * zoom
      renderOverlayTransform()
    }

    const closeOverlay = () => {
      if (overlay.hidden) return
      overlay.hidden = true
      overlayState.owner = null
      overlayState.dragPointerId = null
      overlayImg.removeAttribute('data-dragging')
    }

    const openOverlay = state => {
      const source = state.img.currentSrc || state.img.src
      if (!state.loadedSource || !source) return
      overlayState.owner = state
      overlayState.zoom = 1
      overlayState.panX = 0
      overlayState.panY = 0
      overlay.hidden = false
      if (overlayImg.src !== source) overlayImg.src = source
      if (overlayImg.complete) fitOverlayImage()
      overlay.focus({ preventScroll: true })
    }

    const onOverlayWheel = event => {
      if (overlay.hidden) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2
      setOverlayZoom(overlayState.zoom * factor, event.clientX, event.clientY)
    }
    const onOverlayKeyDown = event => {
      if (overlay.hidden) return
      if (event.key === 'Escape') closeOverlay()
      else if (event.key === '+' || event.key === '=') setOverlayZoom(overlayState.zoom * 1.2)
      else if (event.key === '-') setOverlayZoom(overlayState.zoom / 1.2)
      else if (event.key === '0') resetOverlayView()
      else return
      event.preventDefault()
    }
    const onOverlayPointerDown = event => {
      event.stopPropagation()
      if (overlayState.zoom <= 1) return
      overlayState.dragPointerId = event.pointerId
      overlayState.dragStartX = event.clientX
      overlayState.dragStartY = event.clientY
      overlayState.dragStartPanX = overlayState.panX
      overlayState.dragStartPanY = overlayState.panY
      overlayImg.setPointerCapture(event.pointerId)
      overlayImg.setAttribute('data-dragging', '')
    }
    const onOverlayPointerMove = event => {
      if (event.pointerId !== overlayState.dragPointerId) return
      overlayState.panX = overlayState.dragStartPanX + event.clientX - overlayState.dragStartX
      overlayState.panY = overlayState.dragStartPanY + event.clientY - overlayState.dragStartY
      renderOverlayTransform()
    }
    const onOverlayPointerUp = event => {
      if (event.pointerId !== overlayState.dragPointerId) return
      overlayState.dragPointerId = null
      overlayImg.removeAttribute('data-dragging')
      if (overlayImg.hasPointerCapture(event.pointerId)) overlayImg.releasePointerCapture(event.pointerId)
    }
    const onOverlayResize = () => fitOverlayImage()

    overlayImg.addEventListener('load', fitOverlayImage)
    overlayImg.addEventListener('click', event => event.stopPropagation())
    overlayImg.addEventListener('pointerdown', onOverlayPointerDown)
    overlayImg.addEventListener('pointermove', onOverlayPointerMove)
    overlayImg.addEventListener('pointerup', onOverlayPointerUp)
    overlayImg.addEventListener('pointercancel', onOverlayPointerUp)
    overlayControls.addEventListener('click', event => event.stopPropagation())
    overlay.addEventListener('click', closeOverlay)
    overlay.addEventListener('wheel', onOverlayWheel, { passive: false })
    window.addEventListener('keydown', onOverlayKeyDown, true)
    window.addEventListener('resize', onOverlayResize)
    zoomOutButton.addEventListener('click', () => setOverlayZoom(overlayState.zoom / 1.2))
    zoomInButton.addEventListener('click', () => setOverlayZoom(overlayState.zoom * 1.2))
    resetZoomButton.addEventListener('click', resetOverlayView)
    closeOverlayButton.addEventListener('click', closeOverlay)

    const removeRowDecoration = row => {
      const key = row.getAttribute(ROW_KEY_ATTR)
      if (key) assignedRows.delete(key)
      const body = row.querySelector(`[${PREVIEW_BODY_ATTR}]`)
      const state = body?._hermesVisionState
      if (state?.disclosureButton && state?.onDisclosureClick) {
        state.disclosureButton.removeEventListener('click', state.onDisclosureClick, true)
      }
      if (state?.img && state?.onImageClick) state.img.removeEventListener('click', state.onImageClick)
      if (state?.img && state?.onImageKeyDown) state.img.removeEventListener('keydown', state.onImageKeyDown)
      if (overlayState.owner === state) closeOverlay()
      if (state?.replayTimer) window.clearTimeout(state.replayTimer)
      if (state?.anchorReleaseTimer) window.clearTimeout(state.anchorReleaseTimer)
      if (state?.anchorRaf) window.cancelAnimationFrame(state.anchorRaf)
      state?.anchorObserver?.disconnect()
      if (state?.anchorViewport?.isConnected) {
        state.anchorViewport.style.overflowAnchor = state.priorOverflowAnchor
      }
      body?.remove()
      row.removeAttribute(ROW_KEY_ATTR)
    }

    const removeDecorations = () => {
      for (const row of document.querySelectorAll(`[${ROW_KEY_ATTR}]`)) {
        removeRowDecoration(row)
      }
      assignedRows.clear()
    }

    const renderState = state => {
      state.body.hidden = !state.open
      if (!state.open) return
      if (state.loading) state.status.textContent = '読み込み中…'
      else if (state.error) state.status.textContent = state.error
      else if (!state.loadedSource) state.status.textContent = ''
      else state.status.textContent = '入力画像'
    }

    const preserveViewport = (row, mutate, targetTop) => {
      const viewport = row.closest('[data-slot="aui_thread-viewport"]')
      if (!viewport) {
        mutate()
        return
      }

      let hold = scrollHolds.get(viewport)
      if (!hold) {
        hold = {
          raf: 0,
          top: targetTop ?? viewport.scrollTop
        }
        scrollHolds.set(viewport, hold)
      } else {
        if (hold.raf) window.cancelAnimationFrame(hold.raf)
      }

      mutate()

      let frames = 0
      let releasedFrames = 0
      const restore = () => {
        if (destroyed || !viewport.isConnected) {
          scrollHolds.delete(viewport)
          return
        }
        viewport.scrollTop = hold.top
        frames += 1
        releasedFrames = viewport.getAttribute('data-following') === 'false' ? releasedFrames + 1 : 0
        if (frames < 120 && releasedFrames < 3) {
          hold.raf = window.requestAnimationFrame(restore)
          return
        }
        hold.raf = 0
        scrollHolds.delete(viewport)
      }
      restore()
    }

    const loadPreview = async state => {
      if (destroyed || !state.open || state.loading || state.loadedSource === state.source) return
      if (!state.source) {
        state.error = '入力画像を取得できない'
        renderState(state)
        return
      }

      const token = ++state.loadToken
      state.loading = true
      state.error = ''
      state.img.removeAttribute('src')
      renderState(state)

      try {
        const resolved = await resolveImageSource(state.source)
        if (destroyed || token !== state.loadToken || !state.open) return
        state.img.onload = () => {
          if (token !== state.loadToken || destroyed || !state.open) return
          state.loadedSource = state.source
          state.loading = false
          state.error = ''
          renderState(state)
        }
        state.img.onerror = () => {
          if (token !== state.loadToken || destroyed) return
          state.loadedSource = ''
          state.loading = false
          state.error = '画像を読み込めなかった'
          renderState(state)
        }
        state.img.src = resolved
      } catch {
        if (destroyed || token !== state.loadToken) return
        state.loading = false
        state.error = '画像を読み込めなかった'
        renderState(state)
      }
    }

    const syncDisclosureState = (row, state) => {
      const open = row.hasAttribute('data-tool-open')
      if (state.open === open) return
      preserveViewport(row, () => {
        state.open = open
        if (!open && state.loading) {
          state.loadToken += 1
          state.loading = false
        }
        renderState(state)
      })
      if (open) void loadPreview(state)
    }

    const createDecoration = (row, entry) => {
      const body = document.createElement('div')
      body.setAttribute(PREVIEW_BODY_ATTR, '')
      body.hidden = true
      const frame = document.createElement('div')
      frame.setAttribute('data-hermes-vision-preview-frame', '')
      const img = document.createElement('img')
      img.alt = '画像分析の入力画像'
      img.setAttribute('aria-label', '画像を拡大表示')
      img.setAttribute('role', 'button')
      img.tabIndex = 0
      frame.appendChild(img)
      const status = document.createElement('span')
      status.setAttribute('data-hermes-vision-preview-status', '')
      body.append(frame, status)

      const disclosureButton = row.querySelector('button[aria-expanded]')
      const headerShell = disclosureButton
        ? [...row.children].find(child => child.contains(disclosureButton))
        : row.firstElementChild
      if (headerShell?.parentElement === row) row.insertBefore(body, headerShell.nextSibling)
      else row.appendChild(body)

      const state = {
        body,
        disclosureButton,
        error: '',
        img,
        loadToken: 0,
        loadedSource: '',
        loading: false,
        open: false,
        onDisclosureClick: null,
        onImageClick: null,
        onImageKeyDown: null,
        anchorObserver: null,
        anchorRaf: 0,
        anchorReleaseTimer: 0,
        anchorTop: 0,
        anchorViewport: null,
        priorOverflowAnchor: '',
        replayingDisclosure: false,
        replayTimer: 0,
        source: '',
        status
      }
      state.onImageClick = event => {
        event.preventDefault()
        event.stopPropagation()
        openOverlay(state)
      }
      state.onImageKeyDown = event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        openOverlay(state)
      }
      img.addEventListener('click', state.onImageClick)
      img.addEventListener('keydown', state.onImageKeyDown)
      if (disclosureButton) {
        state.onDisclosureClick = event => {
          if (state.replayingDisclosure) return
          const viewport = row.closest('[data-slot="aui_thread-viewport"]')
          if (!viewport) return

          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()

          const top = viewport.scrollTop
          if (!state.anchorReleaseTimer) {
            state.priorOverflowAnchor = viewport.style.overflowAnchor
          }
          state.anchorViewport = viewport
          state.anchorTop = top
          viewport.style.overflowAnchor = 'none'
          if (state.anchorReleaseTimer) window.clearTimeout(state.anchorReleaseTimer)
          if (state.anchorRaf) window.cancelAnimationFrame(state.anchorRaf)
          state.anchorObserver?.disconnect()
          const content = viewport.querySelector('[data-slot="aui_thread-content"]')
          state.anchorObserver = new ResizeObserver(() => {
            if (state.anchorRaf) window.cancelAnimationFrame(state.anchorRaf)
            state.anchorRaf = window.requestAnimationFrame(() => {
              state.anchorRaf = 0
              if (viewport.isConnected) viewport.scrollTop = state.anchorTop
            })
          })
          if (content) state.anchorObserver.observe(content)
          const priorOverflow = viewport.style.overflow
          viewport.style.overflow = 'auto'
          viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -1 }))
          viewport.style.overflow = priorOverflow

          state.replayTimer = window.setTimeout(() => {
            state.replayTimer = 0
            preserveViewport(row, () => {
              state.replayingDisclosure = true
              disclosureButton.click()
              state.replayingDisclosure = false
            }, top)
            state.anchorReleaseTimer = window.setTimeout(() => {
              state.anchorReleaseTimer = 0
              if (state.anchorRaf) window.cancelAnimationFrame(state.anchorRaf)
              state.anchorRaf = 0
              state.anchorObserver?.disconnect()
              state.anchorObserver = null
              if (viewport.isConnected) viewport.style.overflowAnchor = state.priorOverflowAnchor
              state.anchorViewport = null
              state.priorOverflowAnchor = ''
            }, 500)
          }, 8)
        }
        disclosureButton.addEventListener('click', state.onDisclosureClick, true)
      }
      body._hermesVisionState = state
      renderState(state)
      return { body, state }
    }

    const decorate = (row, entry) => {
      const priorKey = row.getAttribute(ROW_KEY_ATTR)
      if (priorKey && priorKey !== entry.key) {
        removeRowDecoration(row)
      }

      let body = row.querySelector(`[${PREVIEW_BODY_ATTR}]`)
      let state = body?._hermesVisionState
      if (!body || !state) {
        const created = createDecoration(row, entry)
        if (!created) return
        body = created.body
        state = created.state
      }

      row.setAttribute(ROW_KEY_ATTR, entry.key)
      assignedRows.set(entry.key, row)
      if (state.source !== entry.source) {
        if (overlayState.owner === state) closeOverlay()
        state.source = entry.source
        state.loadedSource = ''
        state.error = ''
        state.loading = false
        state.loadToken += 1
        state.img.removeAttribute('src')
        renderState(state)
      }
      syncDisclosureState(row, state)
      if (state.open) void loadPreview(state)
    }

    const reconcile = () => {
      if (destroyed) return
      const desired = new Map()

      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        if (row.closest('[data-pane-hidden]')) continue
        const part = toolPartFromRow(row)
        if (text(part?.toolName) !== TOOL_NAME) continue

        const key = row.getAttribute(ROW_KEY_ATTR) || `row:${++sequence}`
        const entry = { key, source: imageSourceFromPayload(part) }
        desired.set(key, { entry, row })
      }

      for (const row of document.querySelectorAll(`[${ROW_KEY_ATTR}]`)) {
        const key = row.getAttribute(ROW_KEY_ATTR)
        if (!key || !desired.has(key)) removeRowDecoration(row)
      }
      for (const [key, row] of assignedRows) {
        if (!row.isConnected || !desired.has(key)) assignedRows.delete(key)
      }
      for (const { entry, row } of desired.values()) decorate(row, entry)
    }

    const schedule = () => {
      if (destroyed || frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        reconcile()
      })
    }

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === 'attributes' || mutation.addedNodes.length || mutation.removedNodes.length)) schedule()
    })
    if (document.body) {
      observer.observe(document.body, {
        attributeFilter: ['data-tool-open'],
        attributes: true,
        childList: true,
        subtree: true
      })
    }

    schedule()

    ctx.onDispose(() => {
      destroyed = true
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onOverlayKeyDown, true)
      window.removeEventListener('resize', onOverlayResize)
      for (const [viewport, hold] of scrollHolds) {
        if (hold.raf) window.cancelAnimationFrame(hold.raf)
      }
      scrollHolds.clear()
      removeDecorations()
      closeOverlay()
      overlay.remove()
      style.remove()
    })
  }
}
