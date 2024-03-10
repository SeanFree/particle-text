// stringified self-invoking function for worker code
export default `(${function () {
  /** @type {{ x: number, y: number }} mouse position */
  const mouse = { x: 0, y: 0 }
  /** @type {{ x: number, y: number }} repel target, interpolated from mouse position for smoothing */
  const repel = { x: 0, y: 0 }
  /** @type string[] */
  const particleProps = [
    'x',
    'y',
    'vx',
    'vy',
    'bx',
    'by'
  ]
  /** @type OffscreenCanvasRenderingContext2D */
  let buffer
  /** @type CanvasRenderingContext2D */
  let ctx
  /** @type boolean */
  let hover = false
  /** @type Record<string, string> */
  // @todo: add Config type
  let config
  /** @type number */
  let frame = 0 // requestAnimationFrame call ID
  /** @type PropsArray */
  let particles

  /** @type {{ x: number, y: number }} center of canvas */
  const center = {
    get x () {
      return 0.5 * config?.width
    },
    get y () {
      return 0.5 * config?.height
    }
  }

  // utils

  /**
   * Creates a local typed array that uses a sliding window technique
   * to set and modify groups of entries.
   *
   * Grouped entries can be returned in array or object format.
   * Object entries will have keys mapped from provided props array.
   *
   * @param {number} count
   * @param {string[]} props
   * @param {'float'|'int'} type
   */
  class PropsArray {
    constructor (count = 0, props = [], type = 'float') {
      /** @type BigInt */
      this.count = count
      /** @type string[] */
      this.props = props
      /** @type BigInt */
      this.spread = props.length // size of the window
      /** @type Float32Array | Uint32Array */
      this.values =
        type === 'float'
          ? new Float32Array(count * props.length)
          : new Uint32Array(count * props.length)
      /**
       * @param {BigInt} i index
       * @param {BigInt} spread window size
       */
      this.values.get = function (i = 0, spread = 0) {
        return this.slice(i, i + spread)
      }
    }

    get length () {
      return this.values.length
    }

    set (a = [], i = 0) {
      this.values.set(a, i)
    }

    setMap (o = {}, i = 0) {
      this.set(Object.values(o), i)
    }

    /** @returns Float32Array | Uint32Array */
    get (i = 0) {
      return this.values.get(i, this.spread)
    }

    /** @returns Record<string, number> */
    getMap (i = 0) {
      return this.get(i).reduce((r, v, i) => {
        r[this.props[i]] = v

        return r
      }, {})
    }

    forEach (cb) {
      let i = 0

      for (; i < this.length; i += this.spread) {
        cb(this.get(i), i, this)
      }
    }

    map (cb) {
      let i = 0

      for (; i < this.length; i += this.spread) {
        this.set(cb(this.get(i), i, this), i)
      }
    }
  }

  const { atan2, cos, pow, sin, sqrt } = Math
  const dist = (x1, y1, x2, y2) => sqrt(pow(x2 - x1, 2) + pow(y2 - y1, 2))
  const angle = (x1, y1, x2, y2) => atan2(y2 - y1, x2 - x1)
  const lerp = (a, b, t) => (1 - t) * a + t * b
  const debounce = (fn, wait = 200) => {
    let timeout

    return (...args) => {
      if (timeout) clearTimeout(timeout)

      timeout = setTimeout(() => fn(...args), wait)
    }
  }

  self.addEventListener('message', ({ data }) => {
    // debounce to avoid too many unecessary reset calls while screen is being resized
    const reset = debounce(start, 200)

    if (data.type) {
      switch (data.type) {
        case 'mousemove':
          onMouseMove({ x: data.x, y: data.y })
          break
        case 'mouseenter':
          onMouseEnter()
          break
        case 'mouseleave':
          onMouseLeave()
          break
        case 'resize':
          reset(data)
          break
        default:
          break
      }
    } else if (data.canvas) {
      config = Object.assign({
        get pixelDensity () {
          return (4 - this.density) * 4
        },

        get fontStyle () {
          return `${this.fontSize}px ${this.fontFamily}`
        }
      }, data.config)

      ctx = data.canvas.getContext('2d')

      buffer = new OffscreenCanvas(config.width, config.height).getContext('2d')
      ctx.canvas.width = config.width
      ctx.canvas.height = config.height

      start(config)
      run()
    }

    function start ({ width, height }) {
      onResize({ width, height })
      clearBuffer()
      setTextStyles()
      mapParticles()
    }

    // animation loop
    function run () {
      frame = requestAnimationFrame(run)

      try {
        update()
        render()
      } catch (e) {
        // stop the loop on error
        // this prevents lag or freezing if the loop errors
        stop()

        console.error('Error in render:', e)
      }
    }

    function update () {
      if (hover) {
        repel.x = lerp(repel.x, mouse.x, config.mLerpAmt)
        repel.y = lerp(repel.y, mouse.y, config.mLerpAmt)
      } else {
        repel.x = lerp(repel.x, center.x, config.mLerpAmt)
        repel.y = lerp(repel.y, center.y, config.mLerpAmt)
      }
    }

    function render () {
      clearBuffer()
      clearScreen()
      drawParticles()
      renderFrame()
    }

    function stop () {
      cancelAnimationFrame(frame)
    }

    function clearScreen () {
      ctx.clearRect(0, 0, config.width, config.height)
    }

    function clearBuffer () {
      buffer.clearRect(0, 0, config.width, config.height)
    }

    function setTextStyles () {
      buffer.font = config.fontStyle
      buffer.textAlign = config.textAlign
      buffer.textBaseline = config.textBaseline
    }

    function bufferMessage () {
      // e.g. buffer.strokeText(...)
      buffer[`${config.drawType}Text`](config.message, center.x, center.y)
    }

    function renderFrame () {
      // save context before setting filters
      ctx.save()

      ctx.fillStyle = config.backgroundColor
      ctx.fillRect(0, 0, config.width, config.height)

      // compose image onscreen for glow effect
      if (config.glow) {
        // blur + brighten creates a neon glow effect
        ctx.filter = 'blur(8px) brightness(200%)'
        // draw buffer to screen
        ctx.drawImage(buffer.canvas, 0, 0)

        // reset the filter
        ctx.filter = 'blur(0)'
        // set the composite operation to lighter to brighten the areas that overlap the backdrop glow
        ctx.globalCompositeOperation = 'lighter'
      }

      // draw buffer to screen
      ctx.drawImage(buffer.canvas, 0, 0)
      // restore previous context settings
      ctx.restore()
    }

    function updateParticleCoords (x, y, vx, vy, bx, by) {
      // repel distance
      const rd = dist(x, y, repel.x, repel.y)

      // angle to repel target
      const phi = angle(repel.x, repel.y, x, y)
      // force - amount of 'push' the repel target applies
      const f = (pow(config.repelThreshold, 2) / rd) * (rd / config.repelThreshold)

      // delta x, y - delta between base position and current position
      const dx = bx - x
      const dy = by - y

      // velocity
      vx = lerp(vx, dx + (cos(phi) * f), config.vLerpAmt)
      vy = lerp(vy, dy + (sin(phi) * f), config.vLerpAmt)

      // position
      x = lerp(x, x + vx, config.pLerpAmt)
      y = lerp(y, y + vy, config.pLerpAmt)

      return [x, y, vx, vy]
    }

    function drawParticles () {
      particles.forEach(([x, y, vx, vy, bx, by], index) => {
        if (!outOfBounds(x, y)) {
          buffer.fillStyle = config.fontColor
          buffer.fillRect(x, y, 1, 1)
        }

        particles.set(updateParticleCoords(x, y, vx, vy, bx, by), index)
      })
    }

    function mapParticles () {
      // write message to buffer
      bufferMessage(config.message)

      // grab the pixel data
      const pixelData = new Uint32Array(buffer.getImageData(0, 0, config.width, config.height).data)
      const pixels = []

      let i, x, y, bx, by, vx, vy

      // iterate over pixelData, increment by 4
      // pixelData is a flat array
      // each successive group of 4 represents the rgba channels at the current pixel
      for (i = 0; i < pixelData.length; i += 4) {
        // pixelData[i + 3] to grab the alpha channel at current pixel
        //   pixels without text will have an alpha value of 0 and are skipped
        // i % pixelDensity to skip pixels outside of density range
        if (pixelData[i + 3] && !(i % config.pixelDensity)) {
          // set current and base position to current pixel coords
          // divide current index by 4 to get normalized pixel index
          // modulus the normalized index by width to get x coord
          // divide by width and bitwise floor to get y coord
          x = bx = (i / 4) % config.width
          y = by = ((i / 4) / config.width) | 0
          // initialize velocity to 0
          vx = 0
          vy = 0

          pixels.push(x, y, vx, vy, bx, by)
        }
      }

      particles = new PropsArray(pixels.length / particleProps.length, particleProps)
      particles.set(pixels, 0)
    }

    function outOfBounds (x, y) {
      return x < 0 || x >= config.width || y < 0 || y >= config.height
    }

    function onResize ({ width, height }) {
      config.width = width
      config.height = height

      buffer.canvas.width = width
      buffer.canvas.height = height

      buffer.drawImage(ctx.canvas, 0, 0)

      ctx.canvas.width = width
      ctx.canvas.height = height

      ctx.drawImage(buffer.canvas, 0, 0)
    }

    function onMouseMove ({ x, y }) {
      mouse.x = x
      mouse.y = y
    }

    function onMouseEnter () {
      hover = true
    }

    function onMouseLeave () {
      hover = false
    }
  })
  // ---
}.toString()})()`
