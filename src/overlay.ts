import {DataPacket} from "./channels";
import {Emitter} from "./events";
import {Rectangle, RendererState} from "./renderer";
import {VideoStreamRenderer} from "./video";
import * as protobuf from "./protobuf";

export class OverlayRenderer extends Emitter implements VideoStreamRenderer {
	protected state : RendererState = RendererState.STOPPED;
	protected readonly ctx : CanvasRenderingContext2D;
	protected bounds : Rectangle;
	protected lastFoundRects : Rectangle[];
	protected OverlayMessage : protobuf.Type;
	constructor(bounds : Rectangle, canvas : HTMLCanvasElement) {
		super();
		this.bounds = bounds;
		this.ctx = canvas.getContext('2d');
	}

	protected transition(origin : RendererState, dest : RendererState, name : string) : void {
		if (this.state != origin)
			return;
		this.state = dest;
		this.dispatchEvent(new CustomEvent(name, {detail:{renderer:this}}));
	}

	start() : void {
		if (this.state != RendererState.STOPPED)
			return;
		protobuf.load('overlay.proto', (err, root) => {
			if (err) {
				this.state = RendererState.DEAD;
				throw err;
			}
			this.OverlayMessage = <protobuf.Type>root.lookup('com.mopi.Overlay');
			this.state = RendererState.RUNNING;
			this.dispatchEvent(new CustomEvent('renderer.start', {detail:{renderer:this}}));
		});
	}

	pause() : void {
		this.transition(RendererState.RUNNING, RendererState.PAUSED, 'renderer.pause');
	}

	resume() : void {
		this.transition(RendererState.PAUSED, RendererState.RUNNING, 'renderer.resume');
	}

	stop() : void {
		this.state = RendererState.STOPPED;
		this.lastFoundRects = null;
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
		var message = this.OverlayMessage.decode(new Uint8Array(packet.getArrayBuffer(), packet.getDataView().byteOffset));
		var rectangles = message['rectangles'] as Rectangle[];
		this.lastFoundRects = rectangles;
	}

	refresh() : Rectangle | null {
		return null;
	}
}
