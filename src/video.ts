import {DataChannel, DataPacket, PacketRecievedEvent, PacketTypeCode} from "./channels";
export interface VideoStreamRenderer {
	
}
export interface Rectangle {
	top: number;
	left: number;
	width: number;
	height: number;
}
export class MJPEGVideoStreamDecoder {
	protected readonly channel : DataChannel;
	protected readonly ctx : CanvasRenderingContext2D;
	protected readonly rect : Rectangle;
	constructor(options: {channel: DataChannel, ctx: CanvasRenderingContext2D, rect?: Rectangle}) {
		this.channel = options.channel;
		this.ctx = options.ctx;
		this.rect = options.rect || {top: 0, left: 0, width: this.ctx.canvas.width, height: this.ctx.canvas.height};
		this.channel.addEventListener('packet', (e:PacketRecievedEvent)=>{
			if (e.packet.getTypeCode() === PacketTypeCode.STREAM_FRAME)
				this._renderFrameMJPEG(e.packet);
		});
	}
	_encodeFrame(data : Uint8Array) : string {
		//Thanks to stackoverflow.com/a/11092371/2759984, stackoverflow.com/a/9458996/2759984
		var binary : string = '';
		for (var i = 0; i < data.length; i++) {
			binary += String.fromCharCode(data[i]);
		}
		var output = window.btoa(binary);
		var url = "data:image/jpeg;base64," + output;
		return url;
	}
	_renderFrameMJPEG(packet : DataPacket) : void {
		var image = new Image();
		image.onload = e => this.ctx.drawImage(image, this.rect.top, this.rect.left);
		image.src = this._encodeFrame(new Uint8Array(packet.getArrayBuffer(), 12));
	}
}
