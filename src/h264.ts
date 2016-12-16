class H264Decoder {
	protected readonly _worker : Worker;
	onRenderFrame : (buf : Uint8Array, width : number, height : number) => void;
	constructor(options) {
		if ('onRenderFrame' in options)
			this.onRenderFrame = options.onRenderFrame;
		if (options.worker) {
			this._worker = new Worker("decoder.js");
			this._worker.addEventListener('message', e=>{
				var data = e.data;
				this.onPictureDecoded(new Uint8Array(data.buf, 0, data.length), data.width, data.height, data.infos);
			}, false);
			this._worker.postMessage({type: "Broadway.js - Worker init", options: {
				rgb: !options.webgl,
				memsize: this.memsize,
				reuseMemory: options.reuseMemory ? true : false
			}});
			var getWsBuffer;
			if (options.transferMemory) {
				// Send data to our worker.
				getWsBuffer = (data) => (data.buffer);
			} else {
				getWsBuffer = (data) => {
					var result = new Uint8Array(data.length);
					result.set(data.buffer, 0, data.length);
					return result;
				};
			}
			this.decode = (data, info) => {
				var buf = getWsBuffer(data);
				this._worker.postMessage({buf: buf, offset: data.byteOffset, length: data.length, info: info}, [buf]);
			};
			if (options.reuseMemory)
				this.recycleMemory = (arr) => (this._worker.postMessage({reuse: arr.buffer}, [arr.buffer]));
		} else {
			this.decoder = new Decoder({rgb: !options.webgl});
			this.decode = this.decoder.decode.bind(this.decoder);
			this.decoder.onPictureDecoded = this.onPictureDecoded;
		}
	}
	recycleMemory(arr) {
		// NOP
	}
	onPictureDecoded(buffer, width, height, info) {
		if (this.onRenderFrame)
			this.onRenderFrame(buffer, width, height);
		this.recycleMemory(buffer);
	}
}

export class H264Renderer {
	protected readonly canvas : HTMLCanvasElement;
	protected readonly width : number;
	protected readonly height : number;
	protected readonly webgl : boolean;
	protected readonly decoder : H264Decoder;
	protected readonly ctx : CanvasRenderingContext2D | WebGLRenderingContext;
	protected shaderProgram : WebGLProgram;
	protected texturePosBuffer : WebGLBuffer;
	protected uTexturePosBuffer : WebGLBuffer;
	protected vTexturePosBuffer : WebGLBuffer;
	constructor(options : {canvas: HTMLCanvasElement, width: number, height: number, webgl? : boolean, worker : boolean = true}) {
		this.canvas = options.canvas;
		this.width = options.width || options.canvas.width;
		this.height = options.height || options.canvas.height;
		options.canvas.width = this.width;
		options.canvas.height = this.height;
		this.webgl = false;
		if (options.webgl === true || typeof options.webgl !== 'boolean') {
			if ('WebGLRenderingContext' in window) {
				try {
					this.ctx = this.canvas.getContext('webgl');
					if (this.ctx)
						this.webgl = true;
				} catch (e) {}
			}
		}
		if (!this.ctx) {
			this.ctx = this.canvas.getContext('2d');
			this.imageData = this.ctx.createImageData(this.width, this.height);
		} else if (this.webgl) {
			this._initProgramWebGL();
			this._initBuffersWebGL();
		}
		this.decoder = new H264Decoder({
			onRenderFrame: this.webgl ? this._doRenderFrameWebGL.bind(this) : this._doRenderFrameRGB.bind(this),
			worker: options.worker,
			webgl: this.webgl
		});
	}
	/**
	 * Draw frame from raw (encoded) data
	 */
	draw(data) {
		this.decoder.decode(data);
	}
	_initProgramWebGL() {
		const YUV2RGB = [
			1.16438,  0.00000,  1.59603, -0.87079,
			1.16438, -0.39176, -0.81297,  0.52959,
			1.16438,  2.01723,  0.00000, -1.08139,
			0, 0, 0, 1
		];
		var vertexShaderScript = "\
			attribute vec4 vertexPos;\
			attribute vec4 texturePos;\
			attribute vec4 uTexturePos;\
			attribute vec4 vTexturePos;\
			varying vec2 textureCoord;\
			varying vec2 uTextureCoord;\
			varying vec2 vTextureCoord;\
			void main() {\
				gl_Position = vertexPos;\
				textureCoord = texturePos.xy;\
				uTextureCoord = uTexturePos.xy;\
				vTextureCoord = vTexturePos.xy;\
			}";
		var fragmentShaderScript = "\
			precision highp float;\
			varying highp vec2 textureCoord;\
			varying highp vec2 uTextureCoord;\
			varying highp vec2 vTextureCoord;\
			uniform sampler2D ySampler;\
			uniform sampler2D uSampler;\
			uniform sampler2D vSampler;\
			uniform mat4 YUV2RGB;\
			void main(void) {\
				highp float y = texture2D(ySampler,  textureCoord).r;\
				highp float u = texture2D(uSampler,  uTextureCoord).r;\
				highp float v = texture2D(vSampler,  vTextureCoord).r;\
				gl_FragColor = vec4(y, u, v, 1) * YUV2RGB;\
			}";
		const gl = this.ctx as WebGLRenderingContext;
		var vertexShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertexShader, vertexShaderScript);
		gl.compileShader(vertexShader);
		if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
			console.error('Vertex shader failed to compile: ' + gl.getShaderInfoLog(vertexShader));

		var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragmentShader, fragmentShaderScript);
		gl.compileShader(fragmentShader);
		if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
		console.error('Fragment shader failed to compile: ' + gl.getShaderInfoLog(fragmentShader));

		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		if(!gl.getProgramParameter(program, gl.LINK_STATUS))
			console.error('Program failed to compile: ' + gl.getProgramInfoLog(program));

		gl.useProgram(program);

		var YUV2RGBRef = gl.getUniformLocation(program, 'YUV2RGB');
		gl.uniformMatrix4fv(YUV2RGBRef, false, YUV2RGB);

		this.shaderProgram = program;
	}
	_initBuffersWebGL() {
		var gl = this.ctx as WebGLRenderingContext;
		var program = this.shaderProgram;
		var vertexPosBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW);
		
		var vertexPosRef = gl.getAttribLocation(program, 'vertexPos');
		gl.enableVertexAttribArray(vertexPosRef);
		gl.vertexAttribPointer(vertexPosRef, 2, gl.FLOAT, false, 0, 0);
		
		var texturePosBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, texturePosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

		var texturePosRef = gl.getAttribLocation(program, 'texturePos');
		gl.enableVertexAttribArray(texturePosRef);
		gl.vertexAttribPointer(texturePosRef, 2, gl.FLOAT, false, 0, 0);
		this.texturePosBuffer = texturePosBuffer;
		
		var uTexturePosBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, uTexturePosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

		var uTexturePosRef = gl.getAttribLocation(program, 'uTexturePos');
		gl.enableVertexAttribArray(uTexturePosRef);
		gl.vertexAttribPointer(uTexturePosRef, 2, gl.FLOAT, false, 0, 0);

		this.uTexturePosBuffer = uTexturePosBuffer;


		var vTexturePosBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vTexturePosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 0, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);

		var vTexturePosRef = gl.getAttribLocation(program, 'vTexturePos');
		gl.enableVertexAttribArray(vTexturePosRef);
		gl.vertexAttribPointer(vTexturePosRef, 2, gl.FLOAT, false, 0, 0);

		this.vTexturePosBuffer = vTexturePosBuffer;
	}
	_doRenderFrameWebGL(buffer : Uint8Array, width : number, height : number) {
		console.log('rendering frame webgl');
		const gl = this.ctx as WebGLRenderingContext;
		var texturePosBuffer = this.texturePosBuffer;
		var uTexturePosBuffer = this.uTexturePosBuffer;
		var vTexturePosBuffer = this.vTexturePosBuffer;
		
		var yLen = width * height;
		var uvLen = (width / 2) * (height / 2);

		var yData = buffer.subarray(0, yLen);
		var uData = buffer.subarray(yLen, yLen + uvLen);
		var vData = buffer.subarray(yLen + uvLen, yLen + 2 * uvLen);

		var yDataPerRow = width;
		var yRowCnt     = height;

		var uDataPerRow = (width / 2);
		var uRowCnt     = (height / 2);

		var vDataPerRow = uDataPerRow;
		var vRowCnt     = uRowCnt;

		gl.viewport(0, 0, width, height);

		var tTop = 0;
		var tLeft = 0;
		var tBottom = height / yRowCnt;
		var tRight = width / yDataPerRow;
		var texturePosValues = new Float32Array([tRight, tTop, tLeft, tTop, tRight, tBottom, tLeft, tBottom]);

		gl.bindBuffer(gl.ARRAY_BUFFER, texturePosBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, texturePosValues, gl.DYNAMIC_DRAW);
		console.log('done');
	}
	_doRenderFrameWebRGB(buffer, width, height) {
		console.log('rendering frame raw');
		const imageData = this.imageData;
		imageData.set(buffer);
		(this.ctx as CanvasRenderingContext2D).putImageData(imageData, 0, 0);
	}
}