import {DataChannel, DataPacket, PacketRecievedEvent, PacketTypeCode} from "./channels";
import {Rectangle, RendererState} from "./renderer";
import {Emitter} from "./events";
import {VideoStreamRenderer} from "./video";

export class MJPEGVideoStreamDecoder extends Emitter implements VideoStreamRenderer {
	protected readonly ctx : CanvasRenderingContext2D;

	protected bounds : Rectangle;

	protected state : RendererState = RendererState.STOPPED;

	protected lastFrame : HTMLImageElement | null = null;

	constructor(options: {ctx: CanvasRenderingContext2D, bounds?: Rectangle}) {
		super();
		this.ctx = options.ctx;
		this.bounds = options.bounds || {top: 0, left: 0, width: this.ctx.canvas.width, height: this.ctx.canvas.height};
	}

	/**
	 * Encode data array to base64 URI
	 */
	protected _encodeFrame(data : Uint8Array) : string {
		//Thanks to stackoverflow.com/a/11092371/2759984, stackoverflow.com/a/9458996/2759984
		var binary : string = '';
		for (var i = 0; i < data.length; i++)
			binary += String.fromCharCode(data[i]);
		var output = window.btoa(binary);
		var url = "data:image/jpeg;base64," + output;
		return url;
	}

	protected transition(origin : RendererState, dest : RendererState, name : string) : void {
		if (this.state != origin)
			return;
		this.state = dest;
		this.dispatchEvent(new CustomEvent(name, {detail:{renderer:this}}));
	}

	start() : void {
		this.transition(RendererState.STOPPED, RendererState.RUNNING, 'renderer.start');
	}

	pause() : void {
		this.transition(RendererState.RUNNING, RendererState.PAUSED, 'renderer.pause');
	}

	resume() : void {
		this.transition(RendererState.PAUSED, RendererState.RUNNING, 'renderer.resume');
	}

	stop() : void {
		this.state = RendererState.STOPPED;
		this.lastFrame = null;
		this.dispatchEvent(new CustomEvent('renderer.stop', {detail:{renderer:this}}));
	}

	getBounds() : Rectangle {
		return this.bounds;
	}

	setBounds(bounds : Rectangle) : void {
		this.bounds = bounds;
	}

	getState() : RendererState {
		return this.state;
	}

	offerPacket(packet : DataPacket) : void {
		if (this.state != RendererState.RUNNING)
			return;
		var image = new Image();
		image.onload = e => {
			this.lastFrame = image;
			const rect = this.bounds;
			this.ctx.clearRect(rect.top, rect.left, rect.width, rect.height);
			this.ctx.drawImage(image, rect.top, rect.left, rect.width, rect.height);
			this.dispatchEvent(new CustomEvent('renderer.clobber', {detail:{renderer:this,rect:rect}}));
		};
		image.src = this._encodeFrame(new Uint8Array(packet.getArrayBuffer(), 12));
	}
	refresh() : Rectangle | null {
		if (this.lastFrame && this.state == RendererState.RUNNING) {
			const rect = this.bounds;
			this.ctx.clearRect(rect.top, rect.left, rect.width, rect.height);
			this.ctx.drawImage(this.lastFrame, rect.top, rect.left, rect.width, rect.height);
			return this.bounds;
		}
		return null;
	}
}
