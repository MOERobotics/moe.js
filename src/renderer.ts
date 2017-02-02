export interface Rectangle {
	top : number;
	left : number;
	width : number;
	height : number;
}

export enum RendererState {
	STOPPED,
	RUNNING,
	PAUSED,
	DEAD
};

export interface Renderer extends EventTarget {
	getBounds() : Rectangle;
	setBounds(bounds : Rectangle) : void;
	getState() : RendererState;
	start() : void;
	pause() : void;
	resume() : void;
	stop() : void;
	refresh() : Rectangle | null;
}

function rectanglesIntersect(r1 : Rectangle, r2 : Rectangle) : boolean {
	return !(r2.left > r1.left + r1.width
		|| r2.left + r2.width < r1.left
		|| r2.top > r1.top + r1.bottom
		|| r2.top + r2.bottom < r1.top);
}

function rectanglesOuter(a : Rectangle, b : Rectangle | null) : Rectangle {
	if (!b)
		return a;
	var top = Math.min(a.top, b.top);
	var left = Math.min(a.left, b.left);
	var right = Math.max(a.left + a.width, b.left + b.width);
	var bottom = Math.max(a.top + a.height, b.top + b.height);
	return {top: top, left: left, width: right - left, height : bottom - top};
}

export class RenderPipeline {
	protected renderers : Renderer[] = [];
	protected eh : ((e : Event) => void)[] = [];
	add(renderer : Renderer, index?: number) : void {
		var i : number = index || this.renderers.length;
		this.renderers[i] = renderer;
		var eh = this.eh[i] = this.doHandleEvent.bind(this, i);
		renderer.addEventListener('renderer.start', eh);
		renderer.addEventListener('renderer.stop', eh);
		renderer.addEventListener('renderer.clobber', eh);
	}
	
	clobber(index : number, rect : Rectangle) {
		var clobbered = rect;
		for (var i = index + 1; i < this.renderers.length; i++) {
			var renderer = this.renderers[i];
			if (rectanglesIntersect(clobbered, renderer.getBounds()))
				clobbered = rectanglesOuter(renderer.refresh(), clobbered);
		}
	}
	protected doHandleEvent(idx : number, e : Event) {
		var self = this.eh[idx];
		switch (e.type) {
			case 'renderer.start':
				//TODO: re-add self as handler
				break;
			case 'renderer.stop':
				renderer.removeEventListener('renderer.stop', self);
				renderer.removeEventListener('renderer.clobber', self);
				renderer.removeEventListener('renderer.pause', self);
				renderer.removeEventListener('renderer.resume', self);
				break;
			case 'renderer.clobber':
				this.clobber(idx, e.details.rect);
				break;
		}
	}
}