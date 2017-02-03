/**
 * Implementation of EventTarget
 */
export class Emitter implements EventTarget {
	protected handlers: {[index:string]: EventListenerOrEventListenerObject[]} = {};
	addEventListener(type: string, listener?: EventListenerOrEventListenerObject, options?: boolean | {capture?: boolean, once?: boolean, passive?: boolean}): void {
		if (!(type in this.handlers))
			this.handlers[type] = [];
		this.handlers[type].push(listener);
	}
	removeEventListener(event: string, callback: EventListenerOrEventListenerObject) : boolean {
		if (!(event in this.handlers))
			return false;
		var toRemove : string[];
		let handlers = this.handlers[event];
		for (var i in handlers)
			if (handlers[i] == callback)
				toRemove.push(i);
		for (var i of toRemove)
			delete handlers[i];
		return toRemove.length > 0;
	}
	dispatchEvent(event: Event) : boolean {
		Object.defineProperty(event, 'target', {value: this});
		var handlers : EventListenerOrEventListenerObject[] = this.handlers[event.type];
		if (!handlers)
			return event.defaultPrevented;
		for (var handler of handlers) {
			if ((<EventListenerObject>handler).handleEvent)
				(<EventListenerObject>handler).handleEvent(event);
			else
				(<EventListener>handler)(event);
			if (event.defaultPrevented)
				return false;
		}
		return true;
	}
}
