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
}

export interface Renderer extends EventTarget {
	getBounds() : Rectangle;
	setBounds(bounds : Rectangle) : void;
	getState() : RendererState;
	start() : void;
	pause() : void;
	resume() : void;
	stop() : void;
	/**
	 * Optionally re-render. Called when an underlying layer redraws
	 * @return the area overwritten, else null if nothing changed
	 */
	refresh() : Rectangle | null;
}

function rectanglesIntersect(r1 : Rectangle, r2 : Rectangle) : boolean {
	return !(r2.left > r1.left + r1.width
		|| r2.left + r2.width < r1.left
		|| r2.top > r1.top + r1.height
		|| r2.top + r2.height < r1.top);
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
		renderer.addEventListener('renderer.clear', eh);
	}
	
	clobber(fromIndex : number, toIndex : number, rect : Rectangle) {
		var clobbered = rect;
		for (var i = fromIndex; i < toIndex; i++) {
			var renderer = this.renderers[i];
			if (renderer && rectanglesIntersect(clobbered, renderer.getBounds())) {
				var r = renderer.refresh();
				if (r)
					clobbered = rectanglesOuter(renderer.refresh(), clobbered);
			}
		}
	}
	protected doHandleEvent(idx : number, e : Event) {
		var self = this.eh[idx];
		var target : Renderer = (e as CustomEvent).detail.renderer;
		switch (e.type) {
			case 'renderer.start':
				//TODO: re-add self as handler
				break;
			case 'renderer.stop':
				target.removeEventListener('renderer.stop', self);
				target.removeEventListener('renderer.clobber', self);
				target.removeEventListener('renderer.clear', self);
				target.removeEventListener('renderer.pause', self);
				target.removeEventListener('renderer.resume', self);
				break;
			case 'renderer.clobber':
				this.clobber(idx + 1, this.renderers.length, (e as CustomEvent).detail.rect);
				break;
			case 'renderer.clear':
				//Can probably reduce redraws by walking the pipeline backwards
				this.clobber(0, idx, (e as CustomEvent).detail.rect);
				break;
		}
	}
}
