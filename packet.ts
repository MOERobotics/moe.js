import {DataPacket, MutableDataPacket} from "./channels";
export class WrappedPacket implements MutableDataPacket {
        protected buffer : ArrayBuffer;
        protected view : DataView;
        constructor(buffer? : ArrayBuffer | number) {
                if (buffer instanceof ArrayBuffer)
                        this.buffer = buffer;
                else if (typeof buffer === 'number') {
                        if (buffer < 16)
                                throw new RangeError("Buffer must be at least 16 bytes");
                        this.buffer = new ArrayBuffer(buffer);
                } else
                        this.buffer = new ArrayBuffer(16);

                this.view = new DataView(this.buffer);
                if (!(buffer instanceof ArrayBuffer)) {
                        this.setLength(this.buffer.byteLength);
                }
        }
        getLength() : number {
                return this.view.getUint32(0);
        }
        setLength(value:number) : void {
                this.view.setUint32(0, value);
        }
        getId() : number {
                return this.view.getUint32(4);
        }
        setId(value:number):void {
                this.view.setUint32(4, value);
        }
        getAckId() : number {
                return this.view.getUint32(8);
        }
        setAckId(value:number):void {
                this.view.setUint32(8, value);
        }
        getChannelId() : number {
                return this.view.getUint16(12);
        }
        setChannelId(value:number):void {
                this.view.setUint16(12, value);
        }
        getTypeCode() : number {
                return this.view.getUint16(14);
        }
        setTypeCode(value:number):void {
                this.view.setUint16(14, value);
        }
        getDataView() : DataView {
                return this.view
        }
        getArrayBuffer() : ArrayBuffer {
                return this.buffer;
        }
}
