import ParticleTextWorker from './ParticleText.worker'

const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

export class ParticleText extends HTMLElement {
  static observedAttributes = [
    'drawType',
    'backgroundColor',
    'fontColor',
    'fontFamily',
    'fontSize',
    'textAlign',
    'textBaseline',
    'message',
    'density',
    'glow',
    'pLerpAmt',
    'vLerpAmt',
    'mLerpAmt',
    'repelThreshold'
  ]

  constructor () {
    super()

    this.shadow = this.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = `
      <style media="screen">
        :host {
          cursor: pointer;
          display: block;
        }
      </style>
      <canvas></canvas>
    `
  }

  connectedCallback () {
    // Create the worker
    const blob = new Blob([ParticleTextWorker], { type: 'text/javascript' })

    this.worker = new Worker(window.URL.createObjectURL(blob))

    // Main rendering context, draws to screen
    this.canvas = this.shadow.querySelector('canvas')
    this.canvas.style.backgroundColor = this.backgroundColor

    // Offscreen canvas & context for pre-rendering before drawing to screen
    // OffscreenCanvas is better optimized than in-memory native canvas, but unavailable in some browsers
    this.osCanvas = this.canvas.transferControlToOffscreen()

    this.width = this.parentElement.clientWidth
    this.height = this.parentElement.clientHeight

    // ResizeObserver to detect changes to parent dimensions rather than listening to resize events on window
    this.resizeObserver = new ResizeObserver((changes) => {
      for (const change of changes) {
        if (change.contentRect.width !== this.width || change.contentRect.height !== this.height) {
          this.width = change.contentRect.width
          this.height = change.contentRect.height

          this.worker.postMessage({
            type: 'resize',
            width: this.width,
            height: this.height
          })
        }
      }
    }).observe(this.parentElement)

    // Initialize worker config
    this.worker.postMessage({
      canvas: this.osCanvas,
      config: {
        width: this.width,
        height: this.height,
        message: this.message,
        drawType: this.drawType,
        backgroundColor: this.backgroundColor,
        fontColor: this.fontColor,
        fontFamily: this.fontFamily,
        fontSize: this.fontSize,
        textAlign: this.textAlign,
        textBaseline: this.textBaseline,
        density: this.density,
        glow: this.glow,
        pLerpAmt: this.pLerpAmt,
        vLerpAmt: this.vLerpAmt,
        mLerpAmt: this.mLerpAmt,
        repelThreshold: this.repelThreshold
      }
    }, [this.osCanvas])

    // Events
    const onMouseMove = ({ offsetX, offsetY }) => {
      this.worker.postMessage({ type: 'mousemove', x: offsetX, y: offsetY })
    }

    const onMouseEnter = () => {
      this.worker.postMessage({ type: 'mouseenter' })
    }

    const onMouseLeave = () => {
      this.worker.postMessage({ type: 'mouseleave' })
    }

    this.canvas.addEventListener('mousemove', onMouseMove)
    this.canvas.addEventListener('mouseenter', onMouseEnter)
    this.canvas.addEventListener('mouseleave', onMouseLeave)
  }

  // Attribute getters
  get drawType () {
    return this.attributes.drawType?.value || 'stroke'
  }

  get backgroundColor () {
    return this.attributes.backgroundColor?.value || 'rgb(5, 15, 20)'
  }

  get fontColor () {
    return this.attributes.fontColor?.value || 'rgb(60, 200, 255)'
  }

  get fontSize () {
    return +this.attributes.fontSize?.value || 40
  }

  get fontFamily () {
    return this.attributes.fontFamily?.value || 'monospace'
  }

  get fontStyle () {
    return `${this.fontSize}px ${this.fontFamily}`
  }

  get textAlign () {
    return this.attributes.textAlign?.value || 'center'
  }

  get textBaseline () {
    return this.attributes.textBaseline?.value || 'middle'
  }

  get message () {
    return this.attributes.message?.value || 'NO MESSAGE'
  }

  get density () {
    return this.attributes.density
      ? clamp(+this.attributes.density.value | 0, 1, 4)
      : 3
  }

  get glow () {
    return this.attributes.glow?.value !== 'false'
  }

  get pLerpAmt () {
    return this.attributes.pLerpAmt
      ? clamp(+this.attributes.pLerpAmt.value, 0.05, 1)
      : 0.25
  }

  get vLerpAmt () {
    return this.attributes.vLerpAmt
      ? clamp(+this.attributes.vLerpAmt.value, 0.05, 1)
      : 0.1
  }

  get mLerpAmt () {
    return this.attributes.mLerpAmt
      ? clamp(+this.attributes.mLerpAmt.value, 0.05, 1)
      : 0.5
  }

  get repelThreshold () {
    return this.attributes.repelThreshold
      ? clamp(+this.attributes.repelThreshold.value, 20, 200)
      : 50
  }
}

customElements.define('particle-text', ParticleText)
