import {DataChannel, DataPacket} from "./channels";
import {WrappedPacket} from "./packet";

export class Property;

export class PropertyList {
	readonly channel : DataChannel;
	protected properties : Property[];
	
	constructor(channel : DataChannel) {
		this.channel = channel;
	}
	
	Promise<Property[]> getProperties() {
		var packet = new WrappedPacket(0);
		packet.setTypeCode(PacketTypeCode.PROPERTY_ENUMERATION_REQUEST);
		return (<Promise<DataPacket>>this.channel.sendPacket(packet, true))
			.then(ack -> {
				var data = ack.getDataView();
				var len : number = data.getUint16();
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
				for (var i = 0; i < len; i++) {
					var id : number = data.getUint16(pos); pos += 2;
					var type : number = data.getUint8(pos); pos++;
					var name : string = readNext();
					var prop : Property;
					if (id in this.properties)
						prop = this.properties[id];
					else
						prop = this.properties[id] = new Property(this, id);
					prop._type = type;
					prop._name = name;
				}
				return this.properties;
			});
	}
	update(prop : Property) : Promise<Property> {
		var packet = new WrappedPacket(4);
		packet.setTypeCode(PacketTypeCode.PROPERTY_VALUES_REQUEST);
		packet.getDataView()
			.setUint16(1)
			.setUint16(prop.id);
		return (<Promise<DataPacket>>this.channel.sendPacket(packet, true))
			.then(ack -> {
				//TODO finish
				return prop;
			});
	}
	set(prop : Property, value : number) : Promise<Property> {
		//TODO finish
		return null;
	}
}

class Property {
	protected readonly list : PropertyList;
	protected cached : boolean = false;
	protected readonly id : number;
	protected _min : number;
	protected _max : number;
	protected _step : number;
	protected _value : number;
	protected _values : string[];
	constructor(list : PropertyList, id : number) {
		this.list = list;
		this.id = id;
	}
	get min() : number {
		return this._min;
	}
	get max() : number {
		return this._max;
	}
	get step() : number {
		return this._step;
	}
	get values() : string[] {
		return this._values;
	}
	getValue(cached : boolean = false) : Promise<number> {
		if (cached && this.cached)
			return Promise.resolved(this._value);
		return list.update(this)
			.then(v->(this._value));
	}
	setValue(value : number | string) : Promise<Property> {
		var iValue : number;
		if (value instanceof string)
			iValue = this._values.indexOf(<string>value);
		else
			iValue = <number>value;
		this._value = iValue;
		return list.set(this, iValue);
	}
}