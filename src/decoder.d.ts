export = Decoder;
declare class Decoder {
	constructor(options : {rgb? : boolean});
	decode();
	onPictureDecoded : (buffer : Uint8Array, width : number, height : number, info : any) => void
}
