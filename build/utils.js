exports = {};
function require() {
		return exports;
}
if(!ArrayBuffer.transfer) {
	ArrayBuffer.transfer = function (source, dest) {
		source = Object(source);
		dest = Object(dest);
		if(!(source instanceof ArrayBuffer) || !(dest instanceof ArrayBuffer)) {
			throw new TypeError("Source and destination must be ArrayBuffer instances");
		}
		if(dest.byteLength >= source.byteLength) {
			var nextOffset = 0;
			var leftBytes = source.byteLength;
			var wordSizes = [8, 4, 2, 1];
			wordSizes.forEach(_wordSize_ => {
				if (leftBytes >= _wordSize_) {
					var done = transferWith(_wordSize_, source, dest, nextOffset, leftBytes);
					nextOffset = done.nextOffset;
					leftBytes = done.leftBytes;
				}
			});
		}
		function transferWith(wordSize, source, dest, nextOffset, leftBytes) {
			var ViewClass = Uint8Array;
			switch (wordSize) {
				case 8:
					ViewClass = Float64Array;
					break;
				case 4:
					ViewClass = Float32Array;
					break;
				case 2:
					ViewClass = Uint16Array;
					break;
				case 1:
					ViewClass = Uint8Array;
					break;
				default:
					ViewClass = Uint8Array;
					break;
			}
			var view_source = new ViewClass(source, nextOffset, Math.trunc(leftBytes / wordSize));
			var view_dest = new ViewClass(dest, nextOffset, Math.trunc(leftBytes / wordSize));
			for(var i = 0; i < view_dest.length; i++)
				view_dest[i] = view_source[i];
			return {
				nextOffset : view_source.byteOffset + view_source.byteLength,
				leftBytes : source.byteLength - (view_source.byteOffset + view_source.byteLength)
			}
		}
	};
}