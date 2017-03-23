import {DataPacket} from "./channels";
import {Emitter} from "./events";
import {Rectangle, RendererState} from "./renderer";
import {VideoStreamRenderer} from "./video";

var colors : string[] = ['#F00','#0F0','#00F','#FF0','#F0F','#0FF','purple','orange','pink','grey','chartreuse'];

enum CrosshairType {
	INVISIBLE,
	PLUS,
	JOSH_S_EYE,
	PENTAGON,
	length
}

interface Crosshair extends Rectangle {
	color : number;
	type : CrosshairType;
}

export class OverlayRenderer extends Emitter implements VideoStreamRenderer {
	protected state : RendererState = RendererState.STOPPED;
	protected readonly ctx : CanvasRenderingContext2D;
	protected bounds : Rectangle;
	protected crosshairs : Crosshair[] = [];
	protected lastFoundRects : Rectangle[] = [];
	protected OverlayMessage : protobuf.Type;
	protected selectedOverlay : number = -1;
	constructor(bounds : Rectangle, canvas : HTMLCanvasElement) {
		super();
		this.ctx = canvas.getContext('2d');
		this.setBounds(bounds);
		this.loadState();
		document.addEventListener('keydown', this.__keypressHandler.bind(this));
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
		/*protobuf.load('overlay.proto', (err, root) => {
			if (err) {
				this.state = RendererState.DEAD;
				throw err;
			}
			this.OverlayMessage = <protobuf.Type>root.lookup('com.mopi.Overlay');
			this.state = RendererState.RUNNING;
			this.dispatchEvent(new CustomEvent('renderer.start', {detail:{renderer:this}}));
		});*/
		this.state = RendererState.RUNNING;
		this.dispatchEvent(new CustomEvent('renderer.start', {detail:{renderer:this}}));
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
		//redraw?
	}

	getState() : RendererState {
		return this.state;
	}

	offerPacket(packet : DataPacket) : void {
		if (this.state != RendererState.RUNNING)
			return;
		var data = packet.getDataView();
		var offset = 0;
		var numRectangles = data.getInt32(offset); offset += 4;
		var rectangles : Rectangle[] = [];
		for (var i = 0; i < numRectangles; i++) {
			var x = data.getFloat64(offset);
			var y = data.getFloat64(offset + 8);
			var w = data.getFloat64(offset + 16);
			var h = data.getFloat64(offset + 24);
			offset += 32;
			rectangles[i] = {top: y, left: x, width: w, height: h};
		}
		this.lastFoundRects = rectangles;
		
		var clobbered = this.refresh();
		this.dispatchEvent(new CustomEvent('renderer.clobber', {detail:{renderer:this,rect:clobbered}}));
	}
	protected reset() : void {
		this.crosshairs = [];
		for (var i = 0; i < 5; i++)
			this.crosshairs.push({top:.5,left:.5,width:.1,height:.1,type:i % CrosshairType.length,color:i});
	}
	
	protected __keypressHandler(e : KeyboardEvent) {
		if (this.selectedOverlay < 0 && e.key != 'l')//Locked
			return;
		var dx = 0, dy = 0, dw = 0, dh = 0;
		var dt = 0;
		switch (e.key) {
			case 'l':
				//Lock/unlock
				this.selectedOverlay = -this.selectedOverlay;
				break;
			case 'ArrowUp':
				dy--;
				break;
			case 'ArrowDown':
				dy++;
				break;
			case 'ArrowRight':
				dx++;
				break;
			case 'ArrowLeft':
				dx--;
				break;
			case 'w':
				dh++;
				break;
			case 's':
				dh--;
				break;
			case 'd':
				dw++;
				break;
			case 'a':
				dw--;
				break;
			case 'e': 
				dt++;
				break;
			case 'q':
				dt--;
				break;
			case 'c': {
				var crosshair = this.crosshairs[this.selectedOverlay - 1];
				crosshair.color = ((crosshair.color || 0) + 1) % colors.length;
				break;
			}
			case 'Tab':
				this.selectedOverlay = (this.selectedOverlay % this.crosshairs.length) + 1;
				break;
			case 'r':
				this.reset();
				break;
			default:
				return;
		}
		
		e.preventDefault();
		
		var step = 5;
		if (e.shiftKey)
			step /= 5;
		if (e.ctrlKey)
			step *= 5;
		
		dx *= step * 1/this.bounds.width;
		dy *= step * 1/this.bounds.height;
		dw *= step * 1/this.bounds.width;
		dh *= step * 1/this.bounds.height;
		if (this.selectedOverlay > 0) {
			var crosshair = this.crosshairs[this.selectedOverlay - 1];
			
			var type = (crosshair.type || 0) + dt;
			if (type < 0)
				type = CrosshairType.length - 1;
			else if (type >= CrosshairType.length)
				type = 0;
			crosshair.type = type;
			
			crosshair.left += dx;
			crosshair.top += dy;
			crosshair.width += dw;
			crosshair.height += dh;
			if (crosshair.left > 1)
				crosshair.left = 1;
			else if (crosshair.left < 0)
				crosshair.left = 0;
			if (crosshair.top > 1)
				crosshair.top = 1;
			else if (crosshair.top < 0)
				crosshair.top = 0;
			if (crosshair.width < 0)
				crosshair.width = 0;
			if (crosshair.height < 0)
				crosshair.height = 0;
		}
		this.saveState();
		this.dispatchEvent(new CustomEvent('renderer.clear', {detail:{renderer:this,rect:this.bounds}}));
		this.dispatchEvent(new CustomEvent('renderer.clobber', {detail:{renderer:this,rect:this.refresh()}}));
	}
	
	protected loadState() : void {
		if ('crosshairs' in localStorage)
			this.crosshairs = JSON.parse(localStorage['crosshairs']);
		else
			this.reset();
	}
	
	protected saveState() : void {
		localStorage['crosshairs'] = JSON.stringify(this.crosshairs);
	}
	
	protected drawPoly(ctx : CanvasRenderingContext2D, x : number, y : number, w : number, h : number, pts : number[][]) {
		ctx.beginPath();
		ctx.moveTo(x + 2 * w * (pts[0][0] - .5), y + 2 * h * (pts[0][1] - .5));
		for (var i = 0; i < pts.length; i++)
			ctx.lineTo(x + 2 * w * (pts[i][0] - .5), y + 2 * h * (pts[i][1] - .5));
		ctx.closePath();
		ctx.stroke();
	}
	
	refresh() : Rectangle | null {
		if (this.state != RendererState.RUNNING)
			return null;
		
		var ctx : CanvasRenderingContext2D = this.ctx;
		var bounds = this.bounds;
		ctx.setTransform(bounds.width, 0, 0, bounds.height, bounds.left, bounds.top);
		for (var i = 0; i < this.crosshairs.length; i++) {
			var crosshair = this.crosshairs[i];
			ctx.strokeStyle = colors[crosshair.color];
			var x = crosshair.left;
			var y = crosshair.top;
			var w = crosshair.width;
			var h = crosshair.height;
			
			switch (crosshair.type) {
				case CrosshairType.INVISIBLE:
					break;
				case CrosshairType.PLUS:
					ctx.beginPath();
					ctx.lineWidth = 2/bounds.width;
					ctx.moveTo(x, y - h);
					ctx.lineTo(x, y + h);
					ctx.stroke();
					
					ctx.beginPath();
					ctx.lineWidth = 2/bounds.height;
					ctx.moveTo(x - w, y);
					ctx.lineTo(x + w, y);
					ctx.stroke();
					break;
				case CrosshairType.JOSH_S_EYE:
					ctx.lineWidth = 2/bounds.width;
					var coords = [[0,0],[1,0],[1,.2],[.7,.2],[.7,.8],[1,.8],[1,1],[0,1],[0,.8],[.3,.8],[.3,.2],[0,.2]];
					this.drawPoly(ctx, x, y, w, h, coords);
					break;
				case CrosshairType.PENTAGON: {
					ctx.lineWidth = 2/bounds.width;
					var coords = [[.5,0],[1,.4],[.75,1],[.25,1],[0,.4]];
					this.drawPoly(ctx, x, y, w, h, coords);
					break;
				}
			}
			
			//This crosshair is selected, so draw an ellipse around it
			if (this.selectedOverlay - 1 == i) {
				ctx.beginPath();
				ctx.ellipse(x, y, w, h, 0, 0, 2 * Math.PI);
				ctx.stroke();
			}
		}
		
		for (var i = 0; i < this.lastFoundRects.length; i++) {
			var rect = this.lastFoundRects[i];
			ctx.strokeStyle = colors[i % colors.length];
			ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
		}
		ctx['resetTransform']();
		return this.bounds;
	}
}
