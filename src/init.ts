import {WebsocketDataStream} from './websock';
import {DataChannel, DataChannelMediaType, PacketRecievedEvent, PacketTypeCode} from './channels';
import {MJPEGVideoStreamDecoder} from './video';
import {H264Renderer} from './h264';
import {Renderer, Rectangle, RenderPipeline} from "./renderer";

var wsAddr = 'ws://' + window.location.host + '/vdc.ws';
const wsProtocol = 'v0.moews';//'mjswds1.0-alpha';

enum State {
	INITIALIZING,
	WAITING,
	CONNECTING,
	LOADING,
	STREAMING,
	DISCONNECTED,
	ERROR
}

class BackgroundRenderer implements Renderer {
	protected readonly canvas : HTMLCanvasElement;
	protected readonly context : CanvasRenderingContext2D;
	protected __doRender : boolean;
	protected messages : string[] = [];
	protected mgr : StageManager;
	redraw : boolean = true;
	constructor(canvas : HTMLCanvasElement, context : CanvasRenderingContext2D, mgr : StageManager) {
		this.canvas = canvas;
		this.context = context;
		this.mgr = mgr;
		this.doRender = false;
		this.canvas.addEventListener('click', e=>this.__handleClick(e));
	}
	get doRender() : boolean {
		return this.__doRender;
	}
	set doRender(v : boolean) {
		var ud = v && !this.__doRender;
		this.__doRender = v;
		this.redraw = true;
		if (ud)
			this.render();
	}
	protected render() : void {
		if (this.redraw) {
			const ctx = this.context;
			const cvs = ctx.canvas;
			const w = cvs.width;
			const h = cvs.height;
			ctx.fillStyle = '#4CAF50';
			ctx.fillRect(0, 0, w, h);
			ctx.fillStyle = '#000';
			ctx.font = "100px Arial";
			ctx.textAlign = 'center';
			var titleWidth = ctx.measureText('MOE.js').width;
			var stateTextLeft = (w - titleWidth) / 2 + 5;
			ctx.fillText('MOE.js', w / 2, h * .3);
			
			ctx.font = '36px Arial';
			ctx.textAlign = 'left';
			ctx.fillText('[' + State[this.mgr.state].toLowerCase() + ']', stateTextLeft, h * .3 + 30);
			
			switch (this.mgr.state) {
				case State.WAITING:
					ctx.fillStyle = '#00E676';
					ctx.fillRect((w - titleWidth) / 2, h / 2, titleWidth, 100);
					ctx.textAlign = 'center';
					ctx.fillStyle = '#fff';
					ctx.font = '48px Courier';
					ctx.fillText('CONNECT', w / 2, h / 2 + 62);
					break;
			}
			
			ctx.fillStyle = 'rgba(0,0,0,.7)';
			ctx.font = '12px Courier';
			ctx.textAlign = 'left';
			for (var i = 0; i < this.messages.length; i++)
				ctx.fillText(this.messages[i], 10, i * 14 + 14);
			this.redraw = false;
		}
		if (this.doRender)
			window.setTimeout(x=>this.render(), 100);
	}
	log(msg : string) : void {
		this.messages.push(msg);
		if (this.messages.length > this.canvas.height / 24)
			this.messages.pop();
		this.redraw = true;
	}
	__handleClick(e) : void {
		switch (this.mgr.state) {
			case State.WAITING:
				this.mgr.state = State.CONNECTING;
				break;
		}
	}
}
export class StageManager {
	protected readonly canvas : HTMLCanvasElement;
	protected readonly ctx2d : CanvasRenderingContext2D;
	protected __state : State;
	protected renderer : DefaultRenderer;
	protected pipeline : RenderPipeline;
	protected stream : WebsocketDataStream;
	protected videoChannel : DataChannel;
	protected decoder : any;
	constructor(options: {canvas: HTMLCanvasElement}) {
		this.canvas = options.canvas;
		this.ctx2d = this.canvas.getContext('2d');
		this.pipeline = new RenderPipeline();
		
		this.renderer = new DefaultRenderer(this.canvas, this.ctx2d, this);
		window.addEventListener('resize', e=>{
			var rect = this.canvas.getClientRects()[0];
			this.canvas.width = rect.width;
			this.canvas.height = rect.height;
			this.renderer.redraw = true;	
		});
		this.pipeline.add(this.renderer, 0);
		window.dispatchEvent(new Event('resize'));
	}
	set state(s : State) {
		var oldState = this.__state;
		this.__state = s;
		if (oldState != s)
			this.renderer.doRender = true;
		switch (s) {
			case State.CONNECTING:
				this.doConnect();
				break;
		}
	}
	get state() : State {
		return this.__state;
	}
	ready() : Promise<StageManager> {
		return Promise.resolve(this);
	}
	log(msg : string) {
		this.renderer.log(msg);
	}
	start() {
		this.state = State.INITIALIZING;
		this.log('[STAGE] Starting default renderer');
		this.renderer.doRender = true;
		if (window.location.hash.indexOf('autoconnect=true') >= 0) {
			this.log('[AUTOCONNECT] Skipping waiting dialog');
			this.state = State.CONNECTING;
			return;
		}
		this.state = State.WAITING;
	}
	doConnect() {
		this.log('[WS] Attempting to connect to ' + wsAddr);
		this.log('[WS] Connecting with protocol ' + wsProtocol);
		WebsocketDataStream.connect({url: wsAddr, protocol: wsProtocol})
			.then(stream => {
				this.log('[WS] Successfully connected to ' + wsAddr);
				this.stream = stream;
				this.log('[WS] Querying channels');
				this.state = State.LOADING;
				return this.stream.getAvailableChannels();
			}, error => {
				this.log('[WS] Connection failed: ' + (error.message || 'could not connect'));
				console.error(error);
				this.state = State.WAITING;
				throw error;
			}).then(channels=>{
				this.log('[WS] Found ' + (<DataChannel[]>channels).length + ' channels');
				console.log(channels);
				var channel = null;
				for (var channelID in channels)
					if ((channel = channels[channelID]).getMediaType() == DataChannelMediaType.VIDEO)
						break;
				if (channel == null) {
					this.log('[WS] No video channels found');
					this.stream.close();
					this.state = State.INITIALIZING;
					throw null;
				}
				
				this.log('[WS] Subscribing to channel #' + channel.getId());
				return channel.subscribe();
			}).then(channel=>{
				this.videoChannel = channel;
				this.log('[WS] Subscribed to channel #' + channel.getId());
				this.log('[WS] =>Type: ' + DataChannelMediaType[channel.getMediaType()]);
				this.log('[WS] Looking up metadata...');
				return channel.getMetadata();
			}).then(metadata => {
				var videoData : {format?: string, width?: string, height?: string} = metadata['video'];
				this.log('[WS] Video format: ' + videoData.format);
				var rect = {
					top: 0,
					left: 0,
					width: Number.parseInt(videoData.width || '100'),
					height: Number.parseInt(videoData.height || '100'),
				};
				switch (videoData.format) {
					case 'MJPEG':
						this.decoder = new MJPEGVideoStreamDecoder({channel: this.videoChannel, ctx: this.ctx2d, rect: rect});
						break;
					case 'H.264':
					case 'H264':
						this.decoder = new H264Renderer({canvas: this.canvas, width: rect.width, height: rect.height, webgl: true, worker: true});
						this.videoChannel.addEventListener('packet', (e:PacketRecievedEvent)=>{
							if (e.packet.getTypeCode() === PacketTypeCode.STREAM_FRAME)
								this.decoder.draw({data: new Uint8Array(e.packet.getArrayBuffer()), byteOffset: e.packet.getDataView().byteOffset});
						});
						break;
					default:
						this.log('[ERROR] Unsupported video stream format.');
						this.state = State.INITIALIZING;
						this.videoChannel.unsubscribe().then(e=>this.stream.close());
						throw null;
				}
				this.state = State.STREAMING;
			});
	}
}