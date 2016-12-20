import {Emitter} from "./events";
import {DataPacket, DataChannel, MutableDataPacket, Optional, DataStream, DataChannelDirection, DataChannelMediaType, PacketTypeCode, PacketRecievedEvent} from "./channels";
import {WrappedPacket} from "./packet";

export class WebsocketDataStream extends Emitter implements DataStream {
	socket : WebSocket;
	ackHandlers: {[index: number]: {success: (packet: DataPacket) => void, error: (packet: DataPacket) => void}} = {};
	channels: {[index: number]: DataChannel} = {};
	lastId: number = 1;
	static connect(options : {url : string, protocol? : string, protocols? : string[]}) : Promise<WebsocketDataStream> {
		var socket = new WebSocket(options.url, options.protocol || options.protocols);
		return new Promise((y,n)=>{
			var h1 = e=>{socket.removeEventListener('error', h2);y(e);};
			var h2 = e=>{socket.removeEventListener('open', h1);n(e);};
			socket.addEventListener('open', h1, {once: true});
			socket.addEventListener('error', h2, {once: true});
			if (socket.readyState == WebSocket.OPEN)
				socket.dispatchEvent(new Event('open'));
			else if (socket.readyState != WebSocket.CONNECTING)
				socket.dispatchEvent(new Event('error'));
		}).then(e=>(new WebsocketDataStream(socket)));
	}
	constructor(socket : WebSocket) {
		super();
		this.socket = socket;
		this.socket.binaryType = 'arraybuffer';
		this.socket.addEventListener('message', packet=>this._recvPacket(new WrappedPacket(packet.data)));
		this.channels[0] = new WebsocketDataChannel(this, {
			id: 0,
			name: "META",
			mediaType: DataChannelMediaType.META,
			direction: DataChannelDirection.BOTH
		});
	}
	getAvailableChannels(): Promise<DataChannel[]> {
		var packet = new WrappedPacket(0);
		packet.setTypeCode(PacketTypeCode.CHANNEL_ENUMERATION_REQUEST);
		//Send packet on meta channel
		return (<Promise<DataPacket>>this.channels[0].sendPacket(packet, true))
			.then(p2=> {
				var buf = p2.getDataView();
				var numChannels = buf.getUint16(0);
				var pos = 2;
				for (var i = 0; i < numChannels; i++) {
					var chIdv = buf.getUint16(pos);
					pos += 2;
					var chTyp = buf.getUint8(pos++);
					var chDir = buf.getUint8(pos++);
					if (chIdv in this.channels) {
						var current = this.channels[chIdv];
						if (current.getDirection() == chDir && current.getMediaType() == chTyp)
							continue;
						if (current.isSubscribed())
							current.unsubscribe();
					}
					var channel = new WebsocketDataChannel(this, {id: chIdv, name: '???', direction: chIdv, mediaType: chTyp});
					this.channels[chIdv] = channel;
				}
				//Parse packet
				return this.channels;
			});
	}
	protected _recvPacket(packet: DataPacket): void {
		console.log('recieved packet',packet, packet.getType());
		if (packet.getAckId() in this.ackHandlers) {
			var handler = this.ackHandlers[packet.getAckId()];
			if (packet.getTypeCode() == PacketTypeCode.ERROR)
				handler.error(packet);
			else
				handler.success(packet);
			delete this.ackHandlers[packet.getAckId()];
		}
		if (packet.getChannelId() in this.channels) {
			var channel = this.channels[packet.getChannelId()];
			//TODO check subscription status?
			channel.dispatchEvent(new PacketRecievedEvent(packet));
		} else {
			//TODO send error packet
		}
	}
	_sendPacket(packet: MutableDataPacket, expectResponse: boolean = false): Optional<Promise<DataPacket>> {
		packet.setId(++this.lastId);
		var result : Optional<Promise<DataPacket>> = undefined;
		if (!this.isConnected()) {
			if (expectResponse)
				return Promise.reject('Connection is closed');
			return;
		}
		if (expectResponse)
			result = new Promise<DataPacket>((yay, nay) => (this.ackHandlers[packet.getId()] = {success: yay, error: nay}));
		this.socket.send(packet.getArrayBuffer());
		return result;
	}
	isConnected() : boolean {
		return this.socket.readyState == WebSocket.OPEN;
	}
	close() : void {
		this.socket.close();
	}
}
class WebsocketDataChannel extends Emitter implements DataChannel {
	protected stream : WebsocketDataStream;
	protected id : number;
	protected name : string;
	protected direction : DataChannelDirection;
	protected mediaType : DataChannelMediaType;
	protected subscribed : boolean = false;
	constructor(stream : WebsocketDataStream, options:{id:number; name:string; direction?:DataChannelDirection; mediaType?:DataChannelMediaType}) {
		super();
		this.stream = stream;
		this.id = options.id;
		this.name = options.name;
		this.direction = options.direction;
		this.mediaType = options.mediaType;
	}
	getId(): number {
		return this.id;
	}
	getName() : string {
		return this.name;
	}
	getDirection() : DataChannelDirection {
		return this.direction;
	}
	getMediaType() : DataChannelMediaType {
		return this.mediaType;
	}
	subscribe() : Promise<DataChannel> {
		if (this.isSubscribed())
			return Promise.resolve(this);
		var packet = new WrappedPacket(4);
		packet.setTypeCode(PacketTypeCode.CHANNEL_SUBSCRIBE);
		var view = packet.getDataView();
		view.setUint16(0, 1);
		view.setUint16(2, this.getId());
		return (<Promise<DataPacket>>this.stream.channels[0].sendPacket(packet, true))
			.then(ack => {
				this.subscribed = true;
				return this;
			});
	}
	isSubscribed() : boolean {
		return this.subscribed;
	}
	getMetadata() : Promise<any> {
		var reqPacket = new WrappedPacket(2);
		reqPacket.setTypeCode(PacketTypeCode.CHANNEL_METADATA_REQUEST);
		reqPacket.getDataView().setUint16(0, this.getId());
		return (<Promise<DataPacket>>this.stream.channels[0].sendPacket(reqPacket, true))
			.then((packet: DataPacket) => {
				const data = packet.getDataView();
				const numEntries : number = data.getUint16(0);
				const decoder = new TextDecoder("utf8");
				var pos : number = 2;
				
				function readNext() {
					var len : number = data.getUint8(pos++);
					if (len == 0xFF) {
						len += data.getUint16(pos);
						pos += 2;
					}
					var view = new DataView(data.buffer, data.byteOffset + pos, len);
					pos += len;
					return decoder.decode(view);
				}
				
				var result = {};
				
				for (var i = 0; i < numEntries; i++) {
					var key = readNext();
					var value = readNext();
					var obj = result;
					var split;
					while ((split = key.indexOf('.')) > 0) {
						var tmp = key.substr(0, split);
						key = key.substr(split + 1);
						obj = obj[tmp] = obj[tmp] || {};
					}
					obj[key] = value;
				}
				return result;
			});
	}
	sendPacket(packet: MutableDataPacket, expectResponse: boolean = false): Optional<Promise<DataPacket>> {
		if (packet.getChannelId() != this.getId())
			packet.setChannelId(this.getId());
		return this.stream._sendPacket(packet, expectResponse);
	}
	unsubscribe() : Promise<DataChannel> {
		if (!this.isSubscribed())
			return Promise.resolve(this);
		var unsubPacket = new WrappedPacket(4);
		unsubPacket.setTypeCode(PacketTypeCode.CHANNEL_UNSUBSCRIBE);
		var view = unsubPacket.getDataView();
		view.setUint16(0, 1);
		view.setUint16(2, this.getId());
		return (<Promise<DataPacket>>this.stream.channels[0].sendPacket(unsubPacket, true))
			.then(ack => {
				this.subscribed = false;
				return this;
			});
	}
}
