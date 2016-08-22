import {DataChannel, DataPacket, PacketRecievedEvent, PacketTypeCode} from "./channels";
export class MJPEGVideoStreamDecoder {
        channel : DataChannel;
        ctx : CanvasRenderingContext2D;
        constructor(options : {channel:DataChannel, ctx : CanvasRenderingContext2D}) {
                this.channel = options.channel;
                this.ctx = options.ctx;
                this.channel.addEventListener('packet', (e:PacketRecievedEvent)=>{
                        if (e.packet.getTypeCode() !== PacketTypeCode.STREAM_FRAME)
                                return;
                        this._renderFrameMJPEG(e.packet);
                });
        }
        _encodeFrame(data : Uint8Array) : string {
                //Thanks to stackoverflow.com/a/11092371/2759984
                var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
                var output = "";
                var i : number = 0;

                while (i < data.length) {
                        var chr1 = data[i++];
                        var chr2 = i < data.length ? data[i++] : Number.NaN; // Not sure if the index
                        var chr3 = i < data.length ? data[i++] : Number.NaN; // checks are needed here

                        var enc1 = chr1 >> 2;
                        var enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                        var enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                        var enc4 = chr3 & 63;

                        if (isNaN(chr2))
                                enc3 = enc4 = 64;
                        else if (isNaN(chr3))
                                enc4 = 64;
                        output += keyStr.charAt(enc1) + keyStr.charAt(enc2) + keyStr.charAt(enc3) + keyStr.charAt(enc4);
                }
                return "data:image/jpg,base64;" + output;
        }
        _renderFrameMJPEG(packet : DataPacket) : void {
                var image = new Image();
                image.onload = (e)=> {
                        this.ctx.drawImage(image, 0, 0);
                };
                image.src = this._encodeFrame(new Uint8Array(packet.getArrayBuffer(), 16));
        }
}
