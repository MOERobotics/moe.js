import {DataPacket} from "./channels";
import {Renderer} from "./renderer";

export interface VideoStreamRenderer extends Renderer {
	offerPacket(packet : DataPacket) : void;
}
