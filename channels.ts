/**
 * Interface definition
 */
export type Optional<T> = void | T;
export enum DataChannelDirection {
	DEFAULT = 0,
	SERVER_TO_CLIENT,
	CLIENT_TO_SERVER,
	BOTH
}
export enum DataChannelMediaType {
	META = 0,
	AUDIO,
	VIDEO,
	AUDIO_VIDEO,
	PROPERTY_ACCESS,
	TEXT_STREAM,
	OBJECT_STREAM
}
export enum PacketTypeCode {
	SERVER_HELLO = 0,
	CLIENT_HELLO,
	ERROR,
	ACK,
	CHANNEL_ENUMERATION_REQUEST,
	CHANNEL_ENUMERATION,
	CHANNEL_SUBSCRIBE,
	CHANNEL_UNSUBSCRIBE,
	CHANNEL_CLOSE,
	CHANNEL_METADATA_REQUEST,
	CHANNEL_METADATA,
	PROPERTY_ENUMERATION_REQUEST,
	PROPERTY_ENUMERATION,
	PROPERTY_VALUES_REQUEST,
	PROPERTY_VALUES,
	PROPERTY_VALUE_SET,
	STREAM_META,
	STREAM_FRAME
}
export interface DataPacket {
	getLength() : number;
	getId() : number;
	getAckId() : number;
	getChannelId() : number;
	getTypeCode() : number;
	getArrayBuffer() : ArrayBuffer;
}
export interface MutableDataPacket extends DataPacket {
	setId(value:number):void;
	setAckId(value:number):void;
	setChannelId(value:number):void;
	setTypeCode(value:number):void;
}
export interface DataChannel extends EventTarget {
	getId() : number;
	getName() : string;
	getDirection() : DataChannelDirection;
	getMediaType() : DataChannelMediaType;
	subscribe() : Promise<any>;
	isSubscribed() : boolean;
	getMetadata() : Promise<any>;
	sendPacket(packet:DataPacket, expectResponse?:boolean) : Optional<Promise<DataPacket>>;
	unsubscribe() : Promise<any>;
}
export interface DataStream extends EventTarget {
        getAvailableChannels(): Promise<DataChannel[]>;
        isConnected() : boolean;
	close() : void;
}
export interface PropertyAccessChannel extends DataChannel {
	getPropertyNames() : Promise<{[index:number]:string}>;
	getProperty(id : number) : Promise<any>;
	setProperty(id : number, value : any) : Promise<void>;
}
export class PacketRecievedEvent extends Event {
	readonly packet : DataPacket;
}
