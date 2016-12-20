import {DataPacket, PacketTypeCode, MutableDataPacket} from "./channels";
export class WrappedPacket implements MutableDataPacket {
		protected buffer : ArrayBuffer;
		protected view : DataView;
		protected length : number;
		constructor(buffer? : ArrayBuffer | number) {
			if (buffer instanceof ArrayBuffer)
				this.buffer = buffer;
			else if (typeof buffer === 'number') {
				if (buffer < 0)
					throw new RangeError("Data must be at least 0 bytes long");
				this.buffer = new ArrayBuffer(12 + buffer);
			} else
				this.buffer = new ArrayBuffer(16);

			this.length = this.buffer.byteLength;
			this.view = new DataView(this.buffer);
		}
		getLength() : number {
			return this.length;
		}
		setLength(value: number) : void {
			this.length = value;
		}
		getId() : number {
			return this.view.getUint32(4);
		}
		setId(value: number): void {
			this.view.setUint32(4, value);
		}
		getAckId(): number {
			return this.view.getUint32(8);
		}
		setAckId(value: number): void {
			return this.view.setUint32(8, value);
		}
		getChannelId(): number {
			return this.view.getUint16(0);
		}
		setChannelId(value: number): void {
			this.view.setUint16(0, value);
		}
		getTypeCode(): number {
			return this.view.getUint16(2);
		}
		getType(): string {
			return PacketTypeCode[this.getTypeCode()];
		}
		setTypeCode(value:number):void {
			this.view.setUint16(2, value);
		}
		getView() : DataView {
			return this.view
		}
		getDataView() : DataView {
			return new DataView(this.getArrayBuffer(), 12);
		}
		getArrayBuffer() : ArrayBuffer {
			return this.buffer;
		}
}
