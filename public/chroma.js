// WebGL chroma-key: turns a solid key colour in a <video> transparent and
// draws the result to a <canvas> with alpha. Adapted from the Agora
// "chroma key avatar over background" reference.
(function (global) {
  const VERT = `attribute vec2 a_position; attribute vec2 a_texCoord; varying vec2 v_texCoord;
    void main(){ gl_Position = vec4(a_position,0.0,1.0); v_texCoord = a_texCoord; }`;
  const FRAG = `precision mediump float;
    uniform sampler2D u_texture; uniform vec3 u_keyColor;
    uniform float u_similarity, u_smoothness, u_spill; varying vec2 v_texCoord;
    vec2 rgbToUV(vec3 rgb){
      return vec2(rgb.r*-0.169+rgb.g*-0.331+rgb.b*0.5+0.5, rgb.r*0.5+rgb.g*-0.419+rgb.b*-0.081+0.5); }
    void main(){
      vec4 rgba = texture2D(u_texture, v_texCoord);
      float d = distance(rgbToUV(rgba.rgb), rgbToUV(u_keyColor));
      float base = d - u_similarity;
      rgba.a = pow(clamp(base / u_smoothness, 0.0, 1.0), 1.5);
      float sv = pow(clamp(base / u_spill, 0.0, 1.0), 1.5);
      float g = clamp(rgba.r*0.2126+rgba.g*0.7152+rgba.b*0.0722, 0.0, 1.0);
      rgba.rgb = mix(vec3(g), rgba.rgb, sv);
      gl_FragColor = rgba; }`;

  class ChromaKeyRenderer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
      this.setKeyColor(opts.keyColor || "#6B9E82");
      this.similarity = opts.similarity ?? 0.12;
      this.smoothness = opts.smoothness ?? 0.08;
      this.spill = opts.spill ?? 0.10;
      this._running = false;
      const comp = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; };
      const p = this.program = gl.createProgram();
      gl.attachShader(p, comp(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, comp(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p); gl.useProgram(p);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,1, 1,-1,1,1, -1,1,0,0, 1,1,1,0]), gl.STATIC_DRAW);
      const aP = gl.getAttribLocation(p,"a_position"); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,2,gl.FLOAT,false,16,0);
      const aT = gl.getAttribLocation(p,"a_texCoord"); gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT,2,gl.FLOAT,false,16,8);
      this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.uK = gl.getUniformLocation(p,"u_keyColor");
      this.uSim = gl.getUniformLocation(p,"u_similarity");
      this.uSmo = gl.getUniformLocation(p,"u_smoothness");
      this.uSpi = gl.getUniformLocation(p,"u_spill");
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    start(v) {
      this.v = v; this._running = true;
      const go = () => { this.canvas.width = v.videoWidth||640; this.canvas.height = v.videoHeight||480;
        this.gl.viewport(0,0,this.canvas.width,this.canvas.height); this._loop(); };
      v.readyState >= 2 ? go() : v.addEventListener("canplay", go, { once: true });
    }
    _loop() {
      if (!this._running) return;
      if ("requestVideoFrameCallback" in this.v) this.v.requestVideoFrameCallback(() => { this._draw(); this._loop(); });
      else { this._draw(); requestAnimationFrame(() => this._loop()); }
    }
    _draw() {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.v);
      gl.uniform3fv(this.uK, this.keyColor);
      gl.uniform1f(this.uSim, this.similarity); gl.uniform1f(this.uSmo, this.smoothness); gl.uniform1f(this.uSpi, this.spill);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    stop() { this._running = false; }
    setKeyColor(hex) {
      hex = hex.replace(/^#/, "");
      this.keyColor = [parseInt(hex.slice(0,2),16)/255, parseInt(hex.slice(2,4),16)/255, parseInt(hex.slice(4,6),16)/255];
    }
  }
  global.ChromaKeyRenderer = ChromaKeyRenderer;
})(window);
